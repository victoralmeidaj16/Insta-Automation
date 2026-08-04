import { db } from '../src/config/firebase.js';

// Libera posts presos em 'processing' sem job externo. Sem job_id o
// syncScheduledPosts nunca os alcança, então eles ficam para sempre gerando o
// alerta "Publicação presa em processamento" no dashboard.
//
//   node scripts/release-stuck-processing.js                 # dry-run
//   node scripts/release-stuck-processing.js --apply
//   node scripts/release-stuck-processing.js --hours=2 --apply

const applyChanges = process.argv.includes('--apply');
const hoursArg = process.argv.find(arg => arg.startsWith('--hours='));
const parsedHours = Number(hoursArg?.slice('--hours='.length));
const olderThanHours = Number.isFinite(parsedHours) && parsedHours >= 0 ? parsedHours : 1;
const now = new Date();
const cutoff = new Date(now.getTime() - olderThanHours * 60 * 60 * 1000);

const MESSAGE = 'Processamento interrompido antes de chegar ao Upload-Post. Reagende o conteúdo.';

async function main() {
    const snapshot = await db.collection('posts')
        .where('status', '==', 'processing')
        .get();

    const stuck = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (data.externalJobId) return false;
        const startedAt = data.processingStartedAt?.toDate?.()
            || data.updatedAt?.toDate?.()
            || data.createdAt?.toDate?.()
            || null;
        return startedAt && startedAt < cutoff;
    });

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        olderThanHours,
        emProcessing: snapshot.size,
        aLiberar: stuck.length,
        ids: stuck.map(doc => doc.id)
    }, null, 2));

    if (!applyChanges || stuck.length === 0) return;

    const batch = db.batch();
    for (const doc of stuck) {
        batch.update(doc.ref, {
            status: 'error',
            errorMessage: MESSAGE,
            archivedAt: now,
            archiveReason: 'stuck-processing-release',
            executionLeaseUntil: null,
            executionWorker: null,
            updatedAt: now
        });
    }
    await batch.commit();

    console.log(`✅ ${stuck.length} post(s) liberados de processing. Mídias e legendas preservadas.`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao liberar posts presos:', error.message);
        process.exit(1);
    });
