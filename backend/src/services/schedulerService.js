import cron from 'node-cron';
import { db } from '../config/firebase.js';
import {
    getNextWeekStart,
    getScheduleClock,
    getScheduleWeekKey,
    normalizeScheduleConfig
} from '../utils/scheduleConfig.js';

let schedulerStarted = false;
let schedulerTickRunning = false;
let autoGenerationTickRunning = false;

const WEEKLY_RUN_LEASE_MS = 2 * 60 * 60 * 1000;

async function claimWeeklyRun(profileId, weekKey, now) {
    const runId = `weekly_${profileId}_${weekKey}`;
    const ref = db.collection('schedulerRuns').doc(runId);

    const claimed = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() : null;
        const leaseUntil = current?.leaseUntil?.toDate?.() || null;

        if (['completed', 'partial'].includes(current?.status)) return false;
        if (current?.status === 'running' && leaseUntil && leaseUntil > now) return false;

        transaction.set(ref, {
            kind: 'weekly-generation',
            profileId,
            weekKey,
            status: 'running',
            startedAt: now,
            updatedAt: now,
            leaseUntil: new Date(now.getTime() + WEEKLY_RUN_LEASE_MS),
            attempt: (current?.attempt || 0) + 1
        }, { merge: true });
        return true;
    });

    return claimed ? { id: runId, ref } : null;
}

async function finishWeeklyRun(run, result) {
    const failed = Number(result?.failed || 0);
    await run.ref.set({
        status: failed > 0 ? 'partial' : 'completed',
        generated: Number(result?.generated || 0),
        failed,
        errors: Array.isArray(result?.errors) ? result.errors.slice(0, 20) : [],
        finishedAt: new Date(),
        updatedAt: new Date(),
        leaseUntil: null
    }, { merge: true });
}

async function failWeeklyRun(run, error) {
    await run.ref.set({
        status: 'failed',
        error: error.message,
        failedAt: new Date(),
        updatedAt: new Date(),
        leaseUntil: null
    }, { merge: true });
}

/**
 * Inicia o scheduler para sincronizar jobs externos do Upload-Post
 * e disparar geração automática semanal de conteúdo.
 */
export function startScheduler() {
    if (schedulerStarted) {
        console.log('ℹ️ Scheduler já estava iniciado. Ignorando nova inicialização.');
        return;
    }

    schedulerStarted = true;
    console.log('⏰ Scheduler iniciado - sincronizando Upload-Post a cada minuto');

    // Executa a cada minuto — sincroniza jobs externos e roda auto-generate
    cron.schedule('* * * * *', async () => {
        if (schedulerTickRunning) {
            console.log('⏳ Scheduler anterior ainda em execução. Pulando este ciclo.');
            return;
        }

        schedulerTickRunning = true;
        try {
            // Sync posts agendados externamente
            const { syncScheduledPosts, getReadyPosts, executePost } = await import('./postService.js');
            await syncScheduledPosts();

            // Processar posts pendentes locais
            const readyPosts = await getReadyPosts();
            if (readyPosts.length > 0) {
                console.log(`⚡ Encontrados ${readyPosts.length} posts pendentes para publicar localmente!`);
                for (const post of readyPosts) {
                    console.log(`▶️ Iniciando post pendente ${post.id}`);
                    await executePost(post.id);
                }
            }

        } catch (error) {
            console.error('❌ Erro no scheduler:', error);
        } finally {
            schedulerTickRunning = false;
        }
    });

    // A geração de IA não bloqueia a sincronização/publicação que roda acima.
    cron.schedule('* * * * *', () => {
        runWeeklyAutoGeneration().catch(error => {
            console.error('❌ Erro no gerador semanal:', error);
        });
    });
}

/**
 * Busca todos os perfis com autoGenerate habilitado e gera o plano da semana
 */
async function runWeeklyAutoGeneration() {
    if (autoGenerationTickRunning) {
        return;
    }

    autoGenerationTickRunning = true;

    // Importação dinâmica para evitar dependência circular
    const { generateWeeklyPlan } = await import('./contentGeneratorService.js');

    try {
        const now = new Date();

        // Busca todos para manter compatibilidade com perfis que ainda não têm
        // autoGenerationEnabled persistido. A normalização traduz o modo legado.
        const snapshot = await db.collection('businessProfiles').get();

        if (snapshot.empty) {
            return;
        }

        for (const doc of snapshot.docs) {
            const profile = { id: doc.id, ...doc.data() };
            const schedule = normalizeScheduleConfig(profile.contentSchedule || {});
            if (!schedule.autoGenerationEnabled) continue;

            const { dayName: todayName, time: currentTime } = getScheduleClock(now, schedule.timezone);
            const currentWeekKey = getScheduleWeekKey(now, schedule.timezone);
            const autoDay = schedule.autoGenerateDay || 'sunday';
            const autoTime = schedule.autoGenerateTime || '20:00';
            const alreadyGeneratedThisWeek = schedule.lastAutoGeneratedWeek === currentWeekKey;

            if (autoDay !== todayName) continue;
            if (currentTime < autoTime) continue;
            if (alreadyGeneratedThisWeek) continue;

            const run = await claimWeeklyRun(doc.id, currentWeekKey, now);
            if (!run) continue;

            try {
                const nextWeekStartDate = getNextWeekStart(now, schedule.timezone);
                console.log(`🚀 [auto-generate] Gerando plano adiantado para "${profile.name}" (${doc.id}) a partir de: ${nextWeekStartDate.toLocaleDateString('pt-BR')}`);
                const result = await generateWeeklyPlan(doc.id, nextWeekStartDate, null, {}, null, {
                    generationRunId: run.id
                });
                await finishWeeklyRun(run, result);
                await db.collection('businessProfiles').doc(doc.id).update({
                    'contentSchedule.lastAutoGeneratedAt': now,
                    'contentSchedule.lastAutoGeneratedWeek': currentWeekKey,
                    'contentSchedule.lastAutoGenerationStatus': result.failed > 0 ? 'partial' : 'completed',
                    'contentSchedule.lastAutoGenerationStats': {
                        generated: result.generated,
                        failed: result.failed
                    },
                    updatedAt: now
                });
                console.log(`✅ [auto-generate] "${profile.name}": ${result.generated} gerados, ${result.failed} erros`);
            } catch (err) {
                await failWeeklyRun(run, err);
                console.error(`❌ [auto-generate] Erro em "${profile.name}": ${err.message}`);
            }
        }
    } finally {
        autoGenerationTickRunning = false;
    }
}
