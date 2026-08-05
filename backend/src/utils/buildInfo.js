import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Sem isto não há como saber qual commit está rodando em produção: o Render
// deploya a partir do GitHub e nada na resposta identificava a versão.
// Em produção o próprio Render injeta RENDER_GIT_COMMIT/RENDER_GIT_BRANCH.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readLocalGitCommit() {
    try {
        const head = readFileSync(join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
        const ref = head.match(/^ref:\s*(.+)$/)?.[1];
        if (!ref) return head; // HEAD destacado já contém o sha
        return readFileSync(join(REPO_ROOT, '.git', ref), 'utf8').trim();
    } catch {
        return null;
    }
}

function readLocalGitBranch() {
    try {
        const head = readFileSync(join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
        return head.match(/^ref:\s*refs\/heads\/(.+)$/)?.[1] || null;
    } catch {
        return null;
    }
}

// Resolvido uma vez: o commit não muda enquanto o processo vive.
const commit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || readLocalGitCommit();
const branch = process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || readLocalGitBranch();

export const buildInfo = Object.freeze({
    commit: commit || null,
    shortCommit: commit ? commit.slice(0, 7) : null,
    branch: branch || null,
    service: process.env.RENDER_SERVICE_NAME || null,
    environment: process.env.NODE_ENV || 'development',
    startedAt: new Date().toISOString(),
});
