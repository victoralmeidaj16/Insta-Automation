import { db } from '../src/config/firebase.js';
import { getBusinessProfile } from '../src/services/businessProfileService.js';
import { checkJobStatus } from '../src/services/uploadPostService.js';

const TARGET_PROFILE_NAME = 'fitswap';
const APPLY = process.argv.includes('--apply');

function toDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value._seconds) return new Date(value._seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compactStatus(jobStatus) {
    if (!jobStatus || typeof jobStatus !== 'object') return String(jobStatus);
    return JSON.stringify({
        success: jobStatus.success,
        status: jobStatus.status,
        scheduler_status: jobStatus.scheduler_status,
        job_id: jobStatus.job_id,
        request_id: jobStatus.request_id,
        scheduled_time: jobStatus.scheduled_time,
        scheduled_for: jobStatus.scheduled_for,
        last_update: jobStatus.last_update,
        error: jobStatus.error,
    });
}

function isExternallyScheduled(jobStatus) {
    if (!jobStatus || jobStatus.success === false) return false;
    const status = String(jobStatus.status || '').toLowerCase();
    const schedulerStatus = String(jobStatus.scheduler_status || '').toLowerCase();
    return ['scheduled', 'queued', 'pending', 'processing'].includes(status)
        || ['scheduled', 'queued', 'pending', 'processing'].includes(schedulerStatus);
}

async function findFitswapProfile() {
    const snapshot = await db.collection('businessProfiles').get();
    const matches = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const profileText = [
            data.name,
            data.brandKey,
            data.type,
            data.instagram?.username,
        ].filter(Boolean).join(' ').toLowerCase();

        if (profileText.includes(TARGET_PROFILE_NAME)) {
            matches.push({ id: doc.id, ...data });
        }
    });

    if (matches.length !== 1) {
        throw new Error(`Esperava 1 perfil Fitswap, encontrei ${matches.length}.`);
    }

    return matches[0];
}

async function main() {
    const profile = await findFitswapProfile();
    const fullProfile = await getBusinessProfile(profile.id);
    const apiKey = fullProfile?.instagram?.uploadPostApiKey;

    console.log(`Perfil alvo: ${profile.name} (${profile.id})`);
    console.log(`Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN'}`);

    const snapshot = await db.collection('posts')
        .where('businessProfileId', '==', profile.id)
        .where('status', '==', 'processing')
        .get();

    const posts = snapshot.docs
        .map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
        .filter(post => post.externalScheduler === 'upload-post' && post.externalJobId);

    console.log(`Posts processing com job externo: ${posts.length}`);

    let updated = 0;
    for (const post of posts) {
        const scheduledFor = toDate(post.scheduledFor);
        const jobStatus = await checkJobStatus(post.externalJobId, apiKey);
        const shouldMarkScheduled = isExternallyScheduled(jobStatus) && scheduledFor && scheduledFor > new Date();

        console.log([
            `- ${post.id}`,
            `scheduledFor=${scheduledFor ? scheduledFor.toISOString() : '(sem data)'}`,
            `job=${post.externalJobId}`,
            `marcar=${shouldMarkScheduled ? 'scheduled' : 'manter'}`,
            `retorno=${compactStatus(jobStatus)}`,
        ].join(' | '));

        if (APPLY && shouldMarkScheduled) {
            await post.ref.update({
                status: 'scheduled',
                updatedAt: new Date(),
            });

            if (post.libraryItemId) {
                await db.collection('library_items').doc(post.libraryItemId).update({
                    isScheduled: true,
                    isPosted: false,
                    status: 'scheduled',
                    scheduledPostId: post.id,
                    scheduledFor: post.scheduledFor || null,
                    updatedAt: new Date(),
                });
            }

            updated++;
        }
    }

    console.log(`Atualizados: ${updated}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
