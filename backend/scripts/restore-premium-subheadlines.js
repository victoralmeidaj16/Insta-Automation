import { db } from '../src/config/firebase.js';
import { createPremiumComposition } from '../src/services/premiumCompositionService.js';
import { uploadImage } from '../src/services/historyService.js';

// Recupera a subheadline que a IA escreveu no generationPrompt e que nunca foi
// persistida nos layouts premium, depois re-bakeia as imagens a partir das
// originais (sourceMediaUrls) para que o texto apareça na arte publicada.
//
//   node scripts/restore-premium-subheadlines.js --profile=<id>                  # dry-run
//   node scripts/restore-premium-subheadlines.js --profile=<id> --apply
//   node scripts/restore-premium-subheadlines.js --profile=<id> --status=draft --apply
//   node scripts/restore-premium-subheadlines.js --post=<postId> --apply

const applyChanges = process.argv.includes('--apply');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
const statusArg = process.argv.find(arg => arg.startsWith('--status='));
const postArg = process.argv.find(arg => arg.startsWith('--post='));
const profileId = profileArg?.slice('--profile='.length) || null;
const postId = postArg?.slice('--post='.length) || null;
const statuses = statusArg
    ? statusArg.slice('--status='.length).split(',').map(s => s.trim()).filter(Boolean)
    : ['draft'];

if (!profileId && !postId) {
    console.error('❌ Informe --profile=<businessProfileId> ou --post=<postId>.');
    process.exit(1);
}

function splitPromptBlocks(prompt) {
    return String(prompt || '')
        .split(/\n?---SEPARATOR---\n?/g)
        .map(block => block.trim())
        .filter(Boolean);
}

function subheadlineFrom(block) {
    const match = String(block || '').match(/\[SUBHEADLINE:\s*(.*?)\]/i);
    return String(match?.[1] || '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}

// Só re-bakeia quando existe a imagem original, senão o overlay seria aplicado
// sobre uma arte que já tem overlay queimado.
function canRebake(post) {
    const hasSource = Array.isArray(post.sourceMediaUrls) && post.sourceMediaUrls.filter(Boolean).length > 0;
    return hasSource || !post.premiumOverlayBakedAt;
}

async function loadTargets() {
    if (postId) {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) throw new Error(`Post ${postId} não encontrado.`);
        return [{ id: doc.id, ...doc.data() }];
    }

    const snapshot = await db.collection('posts').where('businessProfileId', '==', profileId).get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(post => String(post.format || post.type || '').includes('premium'))
        .filter(post => statuses.includes(post.status));
}

async function main() {
    const targets = await loadTargets();
    const plan = [];

    for (const post of targets) {
        const blocks = splitPromptBlocks(post.generationPrompt);
        const slides = (Array.isArray(post.sourceMediaUrls) && post.sourceMediaUrls.filter(Boolean).length > 0
            ? post.sourceMediaUrls
            : post.mediaUrls || []).filter(Boolean);

        const subs = slides.map((_, index) => subheadlineFrom(blocks[index] || blocks[0] || post.generationPrompt));
        const recovered = subs.filter(Boolean).length;

        if (recovered === 0) {
            plan.push({ id: post.id, status: post.status, skip: 'sem subheadline no prompt' });
            continue;
        }
        if (!canRebake(post)) {
            plan.push({ id: post.id, status: post.status, skip: 'já bakeado e sem sourceMediaUrls (risco de overlay duplo)' });
            continue;
        }

        plan.push({ id: post.id, status: post.status, slides: slides.length, recovered, subs, post, sourceSlides: slides });
    }

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        statusesConsiderados: postId ? '(post único)' : statuses,
        alvos: targets.length,
        processar: plan.filter(item => !item.skip).length,
        pular: plan.filter(item => item.skip).length
    }, null, 2));

    for (const item of plan) {
        if (item.skip) {
            console.log(`  ⏭️  ${item.id} [${item.status}] — ${item.skip}`);
            continue;
        }
        console.log(`  ✏️  ${item.id} [${item.status}] — ${item.recovered}/${item.slides} slides`);
        item.subs.forEach((sub, index) => console.log(`        slide ${index}: ${sub ? JSON.stringify(sub) : '(vazio)'}`));
    }

    if (!applyChanges) {
        console.log('\nDry-run: nada foi alterado. Repita com --apply.');
        return;
    }

    for (const item of plan) {
        if (item.skip) continue;
        const { post, subs, sourceSlides } = item;

        const storedLayouts = Array.isArray(post.premiumLayouts) ? post.premiumLayouts : [];
        const layouts = sourceSlides.map((_, index) => ({
            ...(storedLayouts[index] || post.premiumLayout || {}),
            description: subs[index] || '',
            descriptionEnabled: Boolean(subs[index]),
            // Deixa o renderizador derivar a cor do tema; o cinza legado sumia no painel claro.
            descriptionColor: null,
            slideIndex: index,
            slideCount: sourceSlides.length
        }));

        console.log(`\n🎨 Re-bakeando ${post.id} (${sourceSlides.length} slides)...`);
        const bakedUrls = [];
        for (let index = 0; index < sourceSlides.length; index++) {
            const composed = await createPremiumComposition(sourceSlides[index], layouts[index]);
            bakedUrls.push(composed && composed !== sourceSlides[index] ? await uploadImage(composed) : sourceSlides[index]);
        }

        await db.collection('posts').doc(post.id).update({
            mediaUrls: bakedUrls,
            sourceMediaUrls: sourceSlides,
            premiumLayouts: layouts,
            premiumLayout: { ...(post.premiumLayout || {}), ...layouts[0] },
            overlayData: {
                ...(post.overlayData || {}),
                subheadline: subs[0] || ''
            },
            premiumOverlayBakedAt: new Date(),
            subheadlineRestoredAt: new Date(),
            updatedAt: new Date()
        });

        console.log(`✅ ${post.id} atualizado com subheadline visível.`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao restaurar subheadlines:', error.message);
        process.exit(1);
    });
