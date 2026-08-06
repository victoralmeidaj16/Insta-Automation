import { beforeEach, describe, expect, it, vi } from 'vitest';

const chromium = vi.hoisted(() => ({ launch: vi.fn() }));
const execFile = vi.hoisted(() => vi.fn());

vi.mock('playwright', () => ({ chromium }));
// promisify(execFile) só devolve um promise se a função tiver o símbolo custom;
// sem ele o util embrulha a versão de callback.
vi.mock('child_process', () => ({ execFile }));

const { launchChromium, resetChromiumInstallCacheForTests } = await import('../src/services/browserLauncher.js');

const MISSING = new Error(
    "browserType.launch: Executable doesn't exist at "
    + '/opt/render/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell'
);

beforeEach(() => {
    chromium.launch.mockReset();
    execFile.mockReset();
    execFile.mockImplementation((_cmd, _args, _opts, callback) => callback(null, '', ''));
    resetChromiumInstallCacheForTests();
});

describe('launchChromium', () => {
    it('launches directly when the browser is already installed', async () => {
        chromium.launch.mockResolvedValue('browser');

        await expect(launchChromium()).resolves.toBe('browser');
        expect(execFile).not.toHaveBeenCalled();
    });

    it('installs the browser and retries when the executable is missing', async () => {
        chromium.launch.mockRejectedValueOnce(MISSING).mockResolvedValueOnce('browser');

        await expect(launchChromium()).resolves.toBe('browser');
        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][1]).toEqual(['--yes', 'playwright', 'install', 'chromium']);
        expect(chromium.launch).toHaveBeenCalledTimes(2);
    });

    it('downloads only once when two exports race', async () => {
        chromium.launch.mockRejectedValueOnce(MISSING).mockRejectedValueOnce(MISSING).mockResolvedValue('browser');
        // Um download leva minutos; sem deduplicação o segundo export dispararia
        // outro `npx` sobre os mesmos arquivos.
        execFile.mockImplementation((_cmd, _args, _opts, callback) => setTimeout(() => callback(null, '', ''), 5));

        await expect(Promise.all([launchChromium(), launchChromium()])).resolves.toEqual(['browser', 'browser']);
        expect(execFile).toHaveBeenCalledTimes(1);
    });

    it('propagates unrelated launch failures without downloading anything', async () => {
        chromium.launch.mockRejectedValue(new Error('Target page, context or browser has been closed'));

        await expect(launchChromium()).rejects.toThrow(/has been closed/);
        expect(execFile).not.toHaveBeenCalled();
    });

    it('reports the manual fix when the download itself fails', async () => {
        chromium.launch.mockRejectedValue(MISSING);
        execFile.mockImplementation((_cmd, _args, _opts, callback) => callback(new Error('ENOTFOUND registry.npmjs.org')));

        await expect(launchChromium()).rejects.toThrow(/npx playwright install chromium/);
    });

    it('retries the download on the next export instead of giving up for good', async () => {
        chromium.launch.mockRejectedValue(MISSING);
        execFile.mockImplementationOnce((_cmd, _args, _opts, callback) => callback(new Error('rede caiu')));
        await expect(launchChromium()).rejects.toThrow(/rede caiu/);

        chromium.launch.mockRejectedValueOnce(MISSING).mockResolvedValueOnce('browser');
        execFile.mockImplementationOnce((_cmd, _args, _opts, callback) => callback(null, '', ''));
        await expect(launchChromium()).resolves.toBe('browser');
    });

    it('passes launch options through, keeping the sandbox flags Render needs', async () => {
        chromium.launch.mockResolvedValue('browser');

        await launchChromium({ timeout: 90000 });

        expect(chromium.launch).toHaveBeenCalledWith(expect.objectContaining({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 90000,
        }));
    });
});
