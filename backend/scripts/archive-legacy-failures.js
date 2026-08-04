import { db } from '../src/config/firebase.js';

// Arquiva o passivo histórico de posts com falha. O status permanece 'error'
// para não perder o histórico; apenas marcamos archivedAt para que o banner de
// falhas do dashboard pare de somar erros de meses atrás.
//
//   node scripts/archive-legacy-failures.js                 # dry-run
//   node scripts/archive-legacy-failures.js --apply
//   node scripts/archive-legacy-failures.js --days=30 --apply

const applyChanges = process.argv.includes('--apply');
const daysArg = process.argv.find(arg => arg.startsWith('--days='));
const parsedDays = Number(daysArg?.slice('--days='.length));
// --days=0 arquiva todo o passivo existente; usado na limpeza inicial.
const olderThanDays = Number.isFinite(parsedDays) && parsedDays >= 0 ? parsedDays : 7;
const now = new Date();
const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);

function lastTouch(data) {
    return data.updatedAt?.toDate?.()
        || data.createdAt?.toDate?.()
        || null;
}

async function main() {
    const snapshot = await db.collection('posts')
        .where('status', 'in', ['error', 'failed'])
        .get();

    const stale = snapshot.docs.filter(doc => {
        const data = doc.data();
        if (data.archivedAt) return false;
        const touched = lastTouch(data);
        return touched && touched < cutoff;
    });

    const byMessage = {};
    for (const doc of stale) {
        const key = (doc.data().errorMessage || '(sem mensagem)').slice(0, 70);
        byMessage[key] = (byMessage[key] || 0) + 1;
    }

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        olderThanDays,
        cutoff: cutoff.toISOString(),
        totalComFalha: snapshot.size,
        aArquivar: stale.length,
        byMessage
    }, null, 2));

    if (!applyChanges || stale.length === 0) return;

    for (let offset = 0; offset < stale.length; offset += 400) {
        const batch = db.batch();
        for (const doc of stale.slice(offset, offset + 400)) {
            batch.update(doc.ref, {
                archivedAt: now,
                archiveReason: 'legacy-failure-triage'
            });
        }
        await batch.commit();
    }

    console.log(`✅ ${stale.length} falhas arquivadas. Status e mensagens preservados; nada foi apagado.`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao arquivar posts com erro:', error.message);
        process.exit(1);
    });
