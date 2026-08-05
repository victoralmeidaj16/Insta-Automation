import { db } from '../src/config/firebase.js';
import { generateHtmlCarousel, countCarouselSlides } from '../src/services/aiService.js';
import { getBusinessProfile } from '../src/services/businessProfileService.js';
import { syncDraftToLibrary } from '../src/services/contentGeneratorService.js';

// Rascunhos de carrossel HTML gerados antes da correção do schema carregam
// apenas o texto de fallback do template. Este script regera o HTML no mesmo
// template e contagem de slides, mantendo tema, legenda e agendamento.
//
//   node scripts/refresh-html-carousel-copy.js --profile=<id>            # dry-run
//   node scripts/refresh-html-carousel-copy.js --profile=<id> --apply
//   node scripts/refresh-html-carousel-copy.js --post=<postId> --apply

const applyChanges = process.argv.includes('--apply');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
const postArg = process.argv.find(arg => arg.startsWith('--post='));
const profileId = profileArg?.slice('--profile='.length) || null;
const postId = postArg?.slice('--post='.length) || null;

if (!profileId && !postId) {
    console.error('❌ Informe --profile=<businessProfileId> ou --post=<postId>.');
    process.exit(1);
}

// Frases que só existem como fallback do template: se aparecem, a copy da IA
// não chegou ao HTML.
const FILLER_MARKERS = [
    'conectada ao que a marca entrega de verdade',
    'A diferença aparece quando a ideia encontra',
    'Uma sequência clara reduz esforço',
    'O conteúdo precisa virar uma ação simples',
    'O avanço começa quando o próximo passo fica óbvio',
];

function hasFillerCopy(html = '') {
    return FILLER_MARKERS.some(marker => html.includes(marker));
}

async function loadTargets() {
    if (postId) {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) throw new Error(`Post ${postId} não encontrado.`);
        return [{ id: doc.id, ...doc.data() }];
    }
    const snapshot = await db.collection('posts')
        .where('businessProfileId', '==', profileId)
        .where('status', '==', 'draft')
        .get();
    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(post => String(post.format || post.type || '') === 'carousel-html');
}

async function main() {
    const targets = await loadTargets();
    const stale = targets.filter(post => hasFillerCopy(post.htmlContent || post.htmlCode || ''));

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        candidatos: targets.length,
        comCopyDeTemplate: stale.length
    }, null, 2));

    for (const post of stale) {
        const slot = post.scheduledFor?.toDate?.()?.toISOString().slice(0, 16) || '-';
        console.log(`  ${post.id} | slot ${slot} | template ${post.extra?.carouselTemplateId || post.carouselTemplateId || '?'} | slides ${post.slideCount}`);
    }

    if (!applyChanges) {
        if (stale.length > 0) console.log('\nDry-run: nada foi alterado. Repita com --apply.');
        return;
    }

    for (const post of stale) {
        const profile = await getBusinessProfile(post.businessProfileId);
        const templateId = post.extra?.carouselTemplateId || post.carouselTemplateId;
        const topic = post.generationPrompt || post.pillarName;
        const slideTarget = countCarouselSlides(post.htmlContent || post.htmlCode || '') || undefined;

        console.log(`\n🔁 Regerando ${post.id} (${templateId})...`);
        const html = await generateHtmlCarousel(topic, {
            brandName: profile.name,
            brandKey: profile.brandKey,
            branding: profile.branding,
            targetAudience: profile.targetAudience,
            contentStrategy: profile.contentStrategy,
        }, templateId, slideTarget);

        if (!html) throw new Error(`HTML vazio retornado para ${post.id}`);
        if (hasFillerCopy(html)) {
            console.warn(`   ⚠️ ${post.id} ainda veio com texto de fallback — mantendo o anterior.`);
            continue;
        }

        await db.collection('posts').doc(post.id).update({
            htmlContent: html,
            slideCount: countCarouselSlides(html) || 1,
            exportStatus: 'not_exported',
            copyRefreshedAt: new Date(),
            updatedAt: new Date(),
        });
        await syncDraftToLibrary(post.id).catch(err =>
            console.warn(`   ⚠️ Falha ao sincronizar com a Library: ${err.message}`));

        console.log(`   ✅ ${post.id} atualizado — ${countCarouselSlides(html)} slides, copy real.`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao regerar copy dos carrosséis HTML:', error.message);
        process.exit(1);
    });
