import axios from 'axios';
import { db } from '../config/firebase.js';
import { normalizeScheduleConfig } from '../utils/scheduleConfig.js';

const PROCESSING_STALE_MS = 20 * 60 * 1000;

// Abaixo disto o perfil fica sem conteúdo antes da próxima geração semanal
// conseguir repor a fila, e o feed abre um buraco sem ninguém ser avisado.
const COVERAGE_WARNING_HOURS = 72;

function asDate(value) {
    return value?.toDate?.() || (value ? new Date(value) : null);
}

async function getUploadPostProfile(profile, cache) {
    const apiKey = profile.instagram?.uploadPostApiKey?.trim();
    const username = (profile.instagram?.uploadPostUsername || profile.instagram?.username)?.trim();
    if (!apiKey || !username) return { connected: false, reason: 'missing-configuration' };

    const cacheKey = `${apiKey}:${username}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const request = axios.get('https://api.upload-post.com/api/uploadposts/users', {
        headers: { Authorization: `Apikey ${apiKey}` },
        timeout: 12000
    }).then(response => {
        const providerProfile = (response.data?.profiles || []).find(item => item.username === username);
        return {
            connected: Boolean(providerProfile?.social_accounts?.instagram),
            profileUsername: username,
            instagramHandle: providerProfile?.social_accounts?.instagram?.username
                || providerProfile?.social_accounts?.instagram?.display_name
                || null,
            reason: providerProfile ? 'instagram-not-connected' : 'profile-not-found'
        };
    }).catch(error => ({
        connected: false,
        profileUsername: username,
        reason: error.response?.status === 401 || error.response?.status === 403
            ? 'provider-auth-failed'
            : 'provider-unavailable'
    }));

    cache.set(cacheKey, request);
    return request;
}

export async function getOperationalAlerts(userId, profileId = null) {
    const [profilesSnapshot, postsSnapshot, cronSnapshot] = await Promise.all([
        db.collection('businessProfiles').where('userId', '==', userId).get(),
        db.collection('posts').where('userId', '==', userId).get(),
        db.collection('schedulerRuns').doc('uptimerobot_tick').get(),
    ]);

    const profiles = profilesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(profile => !profileId || profile.id === profileId);
    const alerts = [];
    const providerCache = new Map();

    for (const profile of profiles) {
        const state = await getUploadPostProfile(profile, providerCache);
        if (!state.connected) {
            alerts.push({
                id: `username-disconnected:${profile.id}`,
                kind: 'username_disconnected',
                severity: 'critical',
                profileId: profile.id,
                profileName: profile.name,
                title: 'Username desconectado',
                message: state.reason === 'profile-not-found'
                    ? `O perfil Upload-Post “${state.profileUsername}” não foi encontrado.`
                    : `A conta Instagram de “${profile.name}” não está conectada ao Upload-Post.`,
                action: 'Reconectar conta'
            });
        }
    }

    const now = Date.now();
    const cronHeartbeat = cronSnapshot.exists ? asDate(cronSnapshot.data().heartbeatAt) : null;
    if (!cronHeartbeat || now - cronHeartbeat.getTime() > 15 * 60 * 1000) {
        alerts.push({
            id: 'cron-heartbeat-stale',
            kind: 'cron_heartbeat_stale',
            severity: 'critical',
            title: 'Scheduler sem heartbeat',
            message: cronHeartbeat
                ? `O último tick externo ocorreu há ${Math.floor((now - cronHeartbeat.getTime()) / 60000)} min.`
                : 'O UptimeRobot ainda não registrou nenhum tick protegido.',
            action: 'Verificar UptimeRobot'
        });
    }

    // Fila futura por perfil — base para os alertas de cobertura e de colisão.
    const upcomingByProfile = new Map();
    postsSnapshot.docs.forEach(doc => {
        const post = doc.data();
        if (!['draft', 'scheduled'].includes(post.status)) return;
        const scheduledFor = asDate(post.scheduledFor);
        if (!scheduledFor || scheduledFor.getTime() <= now) return;
        const bucket = upcomingByProfile.get(post.businessProfileId) || [];
        bucket.push({ id: doc.id, scheduledFor, format: post.format || post.type, status: post.status });
        upcomingByProfile.set(post.businessProfileId, bucket);
    });

    for (const profile of profiles) {
        const schedule = normalizeScheduleConfig(profile.contentSchedule || {});
        if (!schedule.autoGenerationEnabled) continue;

        const upcoming = (upcomingByProfile.get(profile.id) || []).sort((a, b) => a.scheduledFor - b.scheduledFor);

        // Mesma regra de contentCoverageService: um rascunho só é cobertura
        // quando o auto-aprovador o publicaria sem ninguém revisar.
        const guaranteed = schedule.autoApproveFallbackEnabled
            ? upcoming
            : upcoming.filter(post => post.status === 'scheduled');
        const coverageHours = guaranteed.length
            ? (guaranteed.at(-1).scheduledFor.getTime() - now) / 3600000
            : 0;

        // O piloto ligado sem fila é a falha mais cara e mais silenciosa: nada
        // quebra, nada alerta, o perfil simplesmente para de publicar.
        if (coverageHours < COVERAGE_WARNING_HOURS) {
            const stuckInReview = upcoming.length - guaranteed.length;
            alerts.push({
                id: `coverage-gap:${profile.id}`,
                kind: 'coverage_gap',
                severity: guaranteed.length === 0 ? 'critical' : 'warning',
                profileId: profile.id,
                profileName: profile.name,
                title: guaranteed.length === 0 ? 'Sem conteúdo na fila' : 'Fila acabando',
                message: (guaranteed.length === 0
                    ? `O piloto automático está ligado, mas “${profile.name}” não tem nenhum post futuro garantido.`
                    : `${guaranteed.length === 1 ? 'Resta 1 post' : `Restam ${guaranteed.length} posts`} `
                        + `e a fila termina em ${Math.round(coverageHours)}h.`)
                    + (stuckInReview > 0
                        ? ` ${stuckInReview} ${stuckInReview === 1 ? 'rascunho aguarda' : 'rascunhos aguardam'} aprovação manual.`
                        : ''),
                action: guaranteed.length === 0 && stuckInReview > 0 ? 'Revisar conteúdo' : 'Gerar conteúdo'
            });
        }

        // Dois posts no mesmo instante viram duas publicações seguidas no
        // Instagram. O gerador semanal e a reprogramação manual não conversam,
        // então a sobreposição só aparece na hora em que o feed duplica.
        const bySlot = new Map();
        upcoming.forEach(post => {
            const key = post.scheduledFor.toISOString();
            bySlot.set(key, [...(bySlot.get(key) || []), post]);
        });
        for (const [slot, clashing] of bySlot) {
            if (clashing.length < 2) continue;
            alerts.push({
                id: `slot-collision:${profile.id}:${slot}`,
                kind: 'slot_collision',
                severity: 'warning',
                profileId: profile.id,
                profileName: profile.name,
                postId: clashing[0].id,
                title: 'Dois posts no mesmo horário',
                message: `${clashing.length} publicações (${clashing.map(item => item.format).join(', ')}) `
                    + `estão marcadas para ${new Date(slot).toLocaleString('pt-BR', { timeZone: schedule.timezone })}.`,
                action: 'Abrir calendário'
            });
        }
    }

    postsSnapshot.docs.forEach(doc => {
        const post = { id: doc.id, ...doc.data() };

        // Carrossel HTML só vira imagem no export. Falhando ele, o post fica sem
        // mídia e o auto-aprovador retenta em silêncio a cada tick até vencer.
        if (post.exportStatus === 'failed'
            && ['draft', 'scheduled'].includes(post.status)
            && (!profileId || post.businessProfileId === profileId)) {
            const profile = profiles.find(item => item.id === post.businessProfileId);
            alerts.push({
                id: `export-failed:${post.id}`,
                kind: 'export_failed',
                severity: 'critical',
                profileId: post.businessProfileId || null,
                profileName: profile?.name || 'Perfil não identificado',
                postId: post.id,
                title: 'Falha ao gerar as imagens',
                message: String(post.errorMessage || 'O carrossel HTML não pôde ser convertido em imagens.')
                    .split('\n')[0].slice(0, 200),
                action: 'Revisar conteúdo'
            });
        }

        if (post.status === 'schedule_error' && (!profileId || post.businessProfileId === profileId)) {
            const profile = profiles.find(item => item.id === post.businessProfileId);
            alerts.push({
                id: `schedule-error:${post.id}`,
                kind: 'schedule_error',
                severity: 'critical',
                profileId: post.businessProfileId || null,
                profileName: profile?.name || 'Perfil não identificado',
                postId: post.id,
                title: 'Falha no agendamento externo',
                message: post.schedulingError || 'O Upload-Post não confirmou o agendamento.',
                action: 'Reagendar publicação'
            });
        }

        if (post.status === 'draft' && (!profileId || post.businessProfileId === profileId)) {
            const scheduledFor = asDate(post.scheduledFor);
            if (scheduledFor && scheduledFor.getTime() > now && scheduledFor.getTime() - now <= 24 * 60 * 60 * 1000) {
                alerts.push({
                    id: `draft-near-deadline:${post.id}`,
                    kind: 'draft_near_deadline',
                    severity: 'warning',
                    profileId: post.businessProfileId || null,
                    postId: post.id,
                    title: 'Rascunho próximo do horário',
                    message: 'Este conteúdo ainda precisa de revisão e aprovação.',
                    action: 'Revisar conteúdo'
                });
            }
        }

        if (post.status !== 'processing') return;
        if (profileId && post.businessProfileId !== profileId) return;
        const startedAt = asDate(post.processingStartedAt)
            || asDate(post.updatedAt)
            || asDate(post.createdAt);
        if (!startedAt || now - startedAt.getTime() < PROCESSING_STALE_MS) return;

        const profile = profiles.find(item => item.id === post.businessProfileId);
        alerts.push({
            id: `processing-stuck:${post.id}`,
            kind: 'processing_stuck',
            severity: 'warning',
            profileId: post.businessProfileId || null,
            profileName: profile?.name || 'Perfil não identificado',
            postId: post.id,
            title: 'Publicação presa em processamento',
            message: `Este conteúdo está em processamento há ${Math.floor((now - startedAt.getTime()) / 60000)} min.`,
            action: 'Abrir calendário'
        });
    });

    return alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
}
