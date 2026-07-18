import { db } from '../src/config/firebase.js';

const applyChanges = process.argv.includes('--apply');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
const profileId = profileArg?.slice('--profile='.length) || null;
const now = new Date();

async function main() {
    const snapshot = await db.collection('posts')
        .where('isDraft', '==', true)
        .where('status', '==', 'draft')
        .get();

    const overdue = snapshot.docs.filter(doc => {
        const draft = doc.data();
        if (profileId && draft.businessProfileId !== profileId) return false;
        const scheduledFor = draft.scheduledFor?.toDate?.()
            || (draft.scheduledFor ? new Date(draft.scheduledFor) : null);
        return scheduledFor && !Number.isNaN(scheduledFor.getTime()) && scheduledFor < now;
    });

    const byProfile = {};
    for (const doc of overdue) {
        const key = doc.data().businessProfileId || 'sem-perfil';
        byProfile[key] = (byProfile[key] || 0) + 1;
    }

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        overdue: overdue.length,
        byProfile
    }, null, 2));

    if (!applyChanges || overdue.length === 0) return;

    for (let offset = 0; offset < overdue.length; offset += 400) {
        const batch = db.batch();
        for (const doc of overdue.slice(offset, offset + 400)) {
            batch.update(doc.ref, {
                status: 'expired',
                expiredAt: now,
                expirationReason: 'scheduled-time-passed-before-approval',
                updatedAt: now
            });
        }
        await batch.commit();
    }

    console.log(`✅ ${overdue.length} rascunhos marcados como expired. Nenhum documento foi apagado.`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao inspecionar/expirar rascunhos:', error.message);
        process.exit(1);
    });
