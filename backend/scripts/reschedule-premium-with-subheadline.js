import { db } from '../src/config/firebase.js';
import { cancelScheduledPost } from '../src/services/uploadPostService.js';
import { scheduleApprovedPost } from '../src/services/postService.js';
import { approveDraftPost } from '../src/services/contentGeneratorService.js';

// Posts premium já agendados no Upload-Post foram bakeados antes do compositor
// aprender a desenhar a subheadline. Este script cancela o job, devolve o post
// para rascunho (para que restore-premium-subheadlines.js possa re-bakear) e,
// opcionalmente, reagenda com a arte corrigida.
//
//   node scripts/reschedule-premium-with-subheadline.js --post=<id>            # dry-run
//   node scripts/reschedule-premium-with-subheadline.js --post=<id> --unschedule --apply
//   node scripts/reschedule-premium-with-subheadline.js --post=<id> --reschedule --apply

const applyChanges = process.argv.includes('--apply');
const doUnschedule = process.argv.includes('--unschedule');
const doReschedule = process.argv.includes('--reschedule');
const postArgs = process.argv.filter(arg => arg.startsWith('--post=')).map(arg => arg.slice('--post='.length));

if (postArgs.length === 0) {
    console.error('❌ Informe ao menos um --post=<postId>.');
    process.exit(1);
}
if (!doUnschedule && !doReschedule) {
    console.error('❌ Escolha --unschedule (cancelar e voltar a rascunho) ou --reschedule (reagendar).');
    process.exit(1);
}

async function unschedule(postId) {
    const ref = db.collection('posts').doc(postId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error(`Post ${postId} não encontrado.`);
    const post = snapshot.data();

    const profile = post.businessProfileId
        ? (await db.collection('businessProfiles').doc(post.businessProfileId).get()).data()
        : null;
    const apiKey = profile?.instagram?.uploadPostApiKey || null;

    console.log(`\n${postId} | status=${post.status} | job=${post.externalJobId || '-'}`);
    if (!applyChanges) {
        console.log('   (dry-run) cancelaria o job e devolveria o post para rascunho');
        return;
    }

    if (post.externalJobId) {
        const result = await cancelScheduledPost(post.externalJobId, apiKey);
        console.log('   cancelamento:', JSON.stringify(result));
    }

    await ref.update({
        status: 'draft',
        isDraft: true,
        externalScheduler: null,
        externalJobId: null,
        externalPayload: null,
        schedulingError: null,
        approvedAt: null,
        updatedAt: new Date()
    });
    console.log('   ✅ devolvido para rascunho');
}

async function reschedule(postId) {
    const ref = db.collection('posts').doc(postId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error(`Post ${postId} não encontrado.`);
    const post = snapshot.data();
    const accountId = post.accountId || post.businessProfileId;

    console.log(`\n${postId} | status=${post.status} | agendado para ${post.scheduledFor?.toDate?.()?.toISOString()}`);
    if (!applyChanges) {
        console.log('   (dry-run) aprovaria e reagendaria no Upload-Post');
        return;
    }

    await approveDraftPost(postId, accountId, { destination: 'schedule' });
    const result = await scheduleApprovedPost(postId, accountId);
    console.log(`   ✅ ${result.status} | job=${result.externalJobId || '-'}`);
}

async function main() {
    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        acao: doUnschedule ? 'unschedule' : 'reschedule',
        posts: postArgs
    }, null, 2));

    for (const postId of postArgs) {
        if (doUnschedule) await unschedule(postId);
        else await reschedule(postId);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha:', error.message);
        process.exit(1);
    });
