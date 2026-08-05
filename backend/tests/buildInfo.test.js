import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RENDER_VARS = ['RENDER_GIT_COMMIT', 'RENDER_GIT_BRANCH', 'RENDER_SERVICE_NAME', 'GIT_COMMIT', 'GIT_BRANCH'];
let saved;

async function loadBuildInfo() {
    vi.resetModules();
    return (await import('../src/utils/buildInfo.js')).buildInfo;
}

beforeEach(() => {
    saved = Object.fromEntries(RENDER_VARS.map(key => [key, process.env[key]]));
    RENDER_VARS.forEach(key => delete process.env[key]);
});

afterEach(() => {
    RENDER_VARS.forEach(key => {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    });
});

describe('buildInfo', () => {
    it('reports the commit Render injected at deploy time', async () => {
        process.env.RENDER_GIT_COMMIT = 'abcdef1234567890';
        process.env.RENDER_GIT_BRANCH = 'main';
        process.env.RENDER_SERVICE_NAME = 'insta-automation-backend';

        const info = await loadBuildInfo();
        expect(info.commit).toBe('abcdef1234567890');
        expect(info.shortCommit).toBe('abcdef1');
        expect(info.branch).toBe('main');
        expect(info.service).toBe('insta-automation-backend');
    });

    it('accepts a generic GIT_COMMIT for hosts other than Render', async () => {
        process.env.GIT_COMMIT = '0123456789abcdef';
        expect((await loadBuildInfo()).shortCommit).toBe('0123456');
    });

    it('prefers the Render value over the generic one', async () => {
        process.env.RENDER_GIT_COMMIT = 'aaaaaaa000';
        process.env.GIT_COMMIT = 'bbbbbbb111';
        expect((await loadBuildInfo()).commit).toBe('aaaaaaa000');
    });

    it('falls back to the local checkout when no deploy variable is set', async () => {
        const info = await loadBuildInfo();
        // O repo está presente ao rodar os testes, então o sha vem do .git.
        expect(info.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(info.shortCommit).toHaveLength(7);
    });

    it('exposes an immutable snapshot', async () => {
        const info = await loadBuildInfo();
        expect(Object.isFrozen(info)).toBe(true);
    });
});
