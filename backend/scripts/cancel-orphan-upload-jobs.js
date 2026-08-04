import { db } from '../src/config/firebase.js';
import { cancelScheduledPost, checkJobStatus } from '../src/services/uploadPostService.js';

// Cancela jobs do Upload-Post que ficaram órfãos: criados para um post que depois
// foi reagendado, de modo que o externalJobId local aponta para outro job. Sem
// cancelar, o job antigo publica a arte desatualizada na hora marcada.
//
//   node scripts/cancel-orphan-upload-jobs.js --profile=<id> --job=<jobId> [--job=...]
//   node scripts/cancel-orphan-upload-jobs.js --profile=<id> --job=<jobId> --apply

const applyChanges = process.argv.includes('--apply');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
const profileId = profileArg?.slice('--profile='.length) || null;
const jobIds = process.argv.filter(arg => arg.startsWith('--job=')).map(arg => arg.slice('--job='.length));

if (!profileId || jobIds.length === 0) {
    console.error('❌ Informe --profile=<businessProfileId> e ao menos um --job=<jobId>.');
    process.exit(1);
}

async function main() {
    const profile = (await db.collection('businessProfiles').doc(profileId).get()).data();
    if (!profile) throw new Error(`Perfil ${profileId} não encontrado.`);
    const apiKey = profile.instagram?.uploadPostApiKey || null;

    // Trava de segurança: nunca cancelar um job que ainda é o job vigente de um post.
    const postsSnapshot = await db.collection('posts').where('businessProfileId', '==', profileId).get();
    const activeJobIds = new Set(
        postsSnapshot.docs.map(doc => doc.data().externalJobId).filter(Boolean)
    );

    console.log(JSON.stringify({ mode: applyChanges ? 'apply' : 'dry-run', profileId, jobs: jobIds }, null, 2));

    for (const jobId of jobIds) {
        if (activeJobIds.has(jobId)) {
            console.log(`\n${jobId}\n   ⛔ é o job vigente de um post — NÃO será cancelado.`);
            continue;
        }

        const before = await checkJobStatus(jobId, apiKey);
        console.log(`\n${jobId}\n   status atual: ${JSON.stringify(before)}`);

        if (!applyChanges) {
            console.log('   (dry-run) seria cancelado');
            continue;
        }

        const result = await cancelScheduledPost(jobId, apiKey);
        console.log('   cancelamento:', JSON.stringify(result));
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha:', error.message);
        process.exit(1);
    });
