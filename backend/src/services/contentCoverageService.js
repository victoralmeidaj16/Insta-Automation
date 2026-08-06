import { db } from '../config/firebase.js';
import { normalizeScheduleConfig } from '../utils/scheduleConfig.js';

// Já entregue ao Upload-Post: publica mesmo que ninguém abra a plataforma.
const SCHEDULED_STATUSES = new Set(['scheduled']);
// Ainda depende de uma decisão — de uma pessoa ou do auto-aprovador.
const PENDING_STATUSES = new Set(['draft']);
const PUBLISHED_STATUSES = new Set(['success', 'published', 'posted']);

function asDate(value) {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && !isNaN(date.getTime()) ? date : null;
}

/**
 * Até quando cada perfil tem conteúdo garantido.
 *
 * Um rascunho conta como cobertura quando a auto-aprovação está ligada: nesse
 * caso o post vai ao ar mesmo sem ninguém revisar, então "agendado" e
 * "aguardando aprovação" são a mesma promessa. Com a auto-aprovação desligada
 * a diferença é real — o rascunho só publica se alguém aprovar — e os dois
 * números são devolvidos separados para a interface não prometer o que não
 * vai acontecer.
 */
export async function getContentCoverage(userId, profileId = null) {
    const [profilesSnapshot, postsSnapshot] = await Promise.all([
        db.collection('businessProfiles').where('userId', '==', userId).get(),
        db.collection('posts').where('userId', '==', userId).get(),
    ]);

    const profiles = profilesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(profile => !profileId || profile.id === profileId);

    const byProfile = new Map(profiles.map(profile => [profile.id, { scheduled: [], pending: [], published: [] }]));
    const now = Date.now();

    postsSnapshot.docs.forEach(doc => {
        const post = doc.data();
        const bucket = byProfile.get(post.businessProfileId);
        if (!bucket) return;

        const scheduledFor = asDate(post.scheduledFor);
        if (!scheduledFor) return;

        if (PUBLISHED_STATUSES.has(post.status)) {
            bucket.published.push(scheduledFor);
            return;
        }
        if (scheduledFor.getTime() <= now) return;
        if (SCHEDULED_STATUSES.has(post.status)) bucket.scheduled.push(scheduledFor);
        else if (PENDING_STATUSES.has(post.status)) bucket.pending.push(scheduledFor);
    });

    return profiles.map(profile => {
        const schedule = normalizeScheduleConfig(profile.contentSchedule || {});
        const { scheduled, pending, published } = byProfile.get(profile.id);
        const pendingCountsAsCovered = schedule.autoApproveFallbackEnabled;

        const guaranteed = pendingCountsAsCovered ? [...scheduled, ...pending] : scheduled;
        const coveredUntil = guaranteed.length ? new Date(Math.max(...guaranteed.map(date => date.getTime()))) : null;
        const allUpcoming = [...scheduled, ...pending];

        return {
            profileId: profile.id,
            profileName: profile.name,
            autoGenerationEnabled: schedule.autoGenerationEnabled,
            autoApproveEnabled: schedule.autoApproveFallbackEnabled,
            pendingCountsAsCovered,
            coveredUntil: coveredUntil ? coveredUntil.toISOString() : null,
            coverageHours: coveredUntil ? Math.round((coveredUntil.getTime() - now) / 3600000) : 0,
            scheduledCount: scheduled.length,
            pendingCount: pending.length,
            totalUpcoming: allUpcoming.length,
            nextPostAt: allUpcoming.length
                ? new Date(Math.min(...allUpcoming.map(date => date.getTime()))).toISOString()
                : null,
            // Sem auto-aprovação a fila pode ir além da cobertura garantida:
            // a interface usa isto para mostrar quanto está travado na revisão.
            pendingUntil: !pendingCountsAsCovered && pending.length
                ? new Date(Math.max(...pending.map(date => date.getTime()))).toISOString()
                : null,
            lastPublishedAt: published.length
                ? new Date(Math.max(...published.map(date => date.getTime()))).toISOString()
                : null,
        };
    });
}
