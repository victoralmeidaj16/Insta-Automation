import { db } from '../src/config/firebase.js';
import { cancelScheduledPost } from '../src/services/uploadPostService.js';

const TARGET_PROFILE_NAME = 'fitswap';
const TARGET_DATE = '2026-04-30';
const APPLY = process.argv.includes('--apply');

function toDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value._seconds) return new Date(value._seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSaoPauloDate(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function formatSaoPauloDateTime(date) {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(date);
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

    if (matches.length === 0) {
        throw new Error('Perfil de negocio Fitswap nao encontrado.');
    }

    if (matches.length > 1) {
        console.log('Perfis Fitswap encontrados:');
        matches.forEach(profile => console.log(`- ${profile.id}: ${profile.name || '(sem nome)'}`));
        throw new Error('Mais de um perfil Fitswap encontrado. Ajuste o script para usar o ID correto.');
    }

    return matches[0];
}

async function main() {
    const profile = await findFitswapProfile();
    console.log(`Perfil alvo: ${profile.name} (${profile.id})`);
    console.log(`Data alvo: ${TARGET_DATE} America/Sao_Paulo`);
    console.log(`Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN'}`);

    const snapshot = await db.collection('posts')
        .where('businessProfileId', '==', profile.id)
        .get();

    const targetPosts = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        const relevantDate = toDate(data.postedAt || data.scheduledFor || data.createdAt);
        if (!relevantDate) return;
        if (formatSaoPauloDate(relevantDate) !== TARGET_DATE) return;
        if (!['scheduled', 'processing', 'success', 'pending', 'posted'].includes(data.status)) return;

        targetPosts.push({
            id: doc.id,
            ref: doc.ref,
            data,
            relevantDate,
        });
    });

    console.log(`Posts encontrados: ${targetPosts.length}`);

    if (targetPosts.length === 0) {
        return;
    }

    targetPosts.forEach(({ id, data, relevantDate }) => {
        console.log([
            `- ${id}`,
            `status=${data.status || '(sem status)'}`,
            `data=${formatSaoPauloDateTime(relevantDate)}`,
            `externalJobId=${data.externalJobId || '(sem job externo)'}`,
            `libraryItemId=${data.libraryItemId || '(sem vinculo)'}`,
            `caption=${String(data.caption || '').slice(0, 80).replace(/\s+/g, ' ')}`,
        ].join(' | '));
    });

    if (!APPLY) {
        console.log('\nNada foi alterado. Rode novamente com --apply para aplicar.');
        return;
    }

    for (const { id, data } of targetPosts) {
        if (data.externalScheduler === 'upload-post' && data.externalJobId) {
            console.log(`Cancelando job externo do post ${id}: ${data.externalJobId}`);
            await cancelScheduledPost(data.externalJobId, profile.instagram?.uploadPostApiKey);
        }
    }

    const batch = db.batch();
    const now = new Date();
    const updatedLibraryItems = new Set();

    for (const { ref, data } of targetPosts) {
        if (data.libraryItemId && !updatedLibraryItems.has(data.libraryItemId)) {
            const libraryRef = db.collection('library_items').doc(data.libraryItemId);
            batch.update(libraryRef, {
                tag: 'pronto',
                status: 'available',
                isScheduled: false,
                isPosted: false,
                scheduledPostId: null,
                scheduledFor: null,
                updatedAt: now,
            });
            updatedLibraryItems.add(data.libraryItemId);
        }

        batch.delete(ref);
    }

    await batch.commit();
    console.log(`Aplicado: ${targetPosts.length} posts removidos do calendario e itens vinculados marcados como pronto.`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
