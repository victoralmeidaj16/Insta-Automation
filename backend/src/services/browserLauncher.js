import { execFile } from 'child_process';
import { promisify } from 'util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);

// O Render instala o Chromium no build (`npx playwright install chromium`).
// Quando esse passo não roda — build command não salvo, node_modules em cache
// pulando o postinstall, ou o playwright subindo de revisão e passando a exigir
// um browser que ninguém baixou — todo export de carrossel HTML morre com
// "Executable doesn't exist at .../chromium_headless_shell-XXXX/...".
//
// O sintoma é silencioso e caro: o post fica sem mídia, o auto-aprovador
// retenta para sempre e nada é publicado. Aqui o processo se conserta sozinho,
// baixando o browser sob demanda, para que a publicação não dependa de uma
// configuração de painel que ninguém revisita.
const MISSING_BROWSER = /Executable doesn't exist|please run the following command to download/i;

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

// Um único download por processo, mesmo com exports concorrentes: o segundo
// chamador espera o mesmo promise em vez de disparar outro `npx`.
let installPromise = null;

export function resetChromiumInstallCacheForTests() {
    installPromise = null;
}

async function runInstall() {
    console.log('⬇️ Chromium ausente — baixando sob demanda (pode levar ~1 min)...');
    const startedAt = Date.now();
    try {
        const { stdout } = await execFileAsync('npx', ['--yes', 'playwright', 'install', 'chromium'], {
            timeout: INSTALL_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024,
        });
        console.log(`✅ Chromium instalado em ${Math.round((Date.now() - startedAt) / 1000)}s.`);
        return stdout;
    } catch (error) {
        // Zerar o cache deixa a próxima exportação tentar de novo: uma falha de
        // rede momentânea não pode condenar o formato até o próximo deploy.
        installPromise = null;
        console.error('❌ Falha ao instalar o Chromium sob demanda:', error.message);
        throw new Error(
            `Chromium não está instalado e o download automático falhou (${error.message}). `
            + 'Defina o Build Command do Render como "npm install && npx playwright install chromium".'
        );
    }
}

export function ensureChromiumInstalled() {
    if (!installPromise) installPromise = runInstall();
    return installPromise;
}

/**
 * Abre o Chromium, baixando-o antes caso o binário não exista.
 * Substitui `chromium.launch()` direto em todos os caminhos de export.
 */
export async function launchChromium(options = {}) {
    const launchOptions = { headless: true, args: LAUNCH_ARGS, ...options };
    try {
        return await chromium.launch(launchOptions);
    } catch (error) {
        if (!MISSING_BROWSER.test(error.message || '')) throw error;
        await ensureChromiumInstalled();
        return chromium.launch(launchOptions);
    }
}
