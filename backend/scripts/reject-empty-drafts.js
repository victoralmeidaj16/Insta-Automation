import { db } from '../src/config/firebase.js';
import { rejectDraftPost } from '../src/services/contentGeneratorService.js';

// Rejeita rascunhos que ficaram sem nenhuma mídia — normalmente uma geração cujo
// export de imagem falhou. O auto-aprovador já os ignora, então eles apenas
// ocupam o slot no calendário até vencerem.
//
//   node scripts/reject-empty-drafts.js                       # dry-run (todos os perfis)
//   node scripts/reject-empty-drafts.js --profile=<id>
//   node scripts/reject-empty-drafts.js --profile=<id> --apply

const applyChanges = process.argv.includes('--apply');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
const profileId = profileArg?.slice('--profile='.length) || null;

async function main() {
    const snapshot = await db.collection('posts').where('status', '==', 'draft').get();

    const empty = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(post => !profileId || post.businessProfileId === profileId)
        .filter(post => !Array.isArray(post.mediaUrls) || post.mediaUrls.filter(Boolean).length === 0);

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        profileId: profileId || '(todos)',
        rascunhos: snapshot.size,
        semMidia: empty.length
    }, null, 2));

    for (const post of empty) {
        const slot = post.scheduledFor?.toDate?.()?.toISOString().slice(0, 16) || '-';
        console.log(`  ${post.id} | ${post.format || post.type} | slot ${slot} | pilar: ${post.pillarName || '-'}`);
    }

    if (!applyChanges || empty.length === 0) {
        if (!applyChanges && empty.length > 0) console.log('\nDry-run: nada foi alterado. Repita com --apply.');
        return;
    }

    for (const post of empty) {
        await rejectDraftPost(post.id);
    }

    console.log(`\n✅ ${empty.length} rascunho(s) sem mídia rejeitado(s). Nada foi apagado.`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao rejeitar rascunhos vazios:', error.message);
        process.exit(1);
    });
