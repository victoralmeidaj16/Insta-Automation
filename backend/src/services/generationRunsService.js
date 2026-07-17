import { db } from '../config/firebase.js';

/**
 * Telemetria de gerações de conteúdo (collection `generation_runs`).
 *
 * Cada geração — manual ou do autopilot — grava um documento com resultado,
 * duração e metadados, permitindo auditar falhas silenciosas do scheduler,
 * medir quedas para o fluxo legado e acompanhar warnings de QA por perfil.
 *
 * O registro é fire-and-forget: nunca lança nem bloqueia a geração.
 */

function stripUndefined(input = {}) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined)
    );
}

/**
 * @param {object} run
 * @param {string}  run.kind            'draft-post' | 'weekly-plan' | 'content-plan'
 * @param {string}  [run.source]        'autopilot' | 'manual'
 * @param {string}  [run.businessProfileId]
 * @param {string}  [run.profileName]
 * @param {string}  [run.format]        static | carousel | carousel-premium | carousel-html | story...
 * @param {string}  run.outcome         'ok' | 'fallback' | 'error'
 * @param {boolean} [run.usedContentPlan]
 * @param {Array}   [run.qaWarnings]
 * @param {number}  [run.durationMs]
 * @param {string}  [run.error]
 * @param {object}  [run.stats]         contadores livres (ex.: { generated, failed })
 */
export async function recordGenerationRun(run = {}) {
    try {
        await db.collection('generation_runs').add(stripUndefined({
            kind: run.kind || 'draft-post',
            source: run.source,
            businessProfileId: run.businessProfileId,
            profileName: run.profileName,
            format: run.format,
            outcome: run.outcome || 'ok',
            usedContentPlan: run.usedContentPlan,
            qaWarnings: Array.isArray(run.qaWarnings) && run.qaWarnings.length > 0 ? run.qaWarnings : undefined,
            qaWarningCount: Array.isArray(run.qaWarnings) ? run.qaWarnings.length : undefined,
            durationMs: run.durationMs,
            error: run.error,
            stats: run.stats,
            createdAt: new Date()
        }));
    } catch (err) {
        console.warn('⚠️ [Telemetry] Falha ao registrar generation_run (não bloqueia):', err.message);
    }
}
