// Inclui o pilar "A ou B" no perfil da Fitswap e reduz os outros pilares na
// mesma proporção, para o total continuar em 100%.
//
// Só rode com --apply depois que o template fitswap-ab estiver em produção:
// o perfil é o mesmo para o backend publicado, e um pilar que aponta para um
// template desconhecido gera posts no layout errado.
//
// Uso:
//   node scripts/add-fitswap-ab-pillar.js            # mostra o antes/depois
//   node scripts/add-fitswap-ab-pillar.js --apply    # grava no Firestore
import 'dotenv/config';
import { db } from '../src/config/firebase.js';
import { FITSWAP_AB_PILLAR, isFitswapBrand } from '../src/utils/brandProfiles.js';

const apply = process.argv.includes('--apply');

/** Reparte `total` entre os pilares proporcionalmente ao peso atual (maiores restos). */
export function rebalanceWeights(pillars, total) {
    const current = pillars.reduce((sum, p) => sum + (Number(p.weight) || 0), 0) || 1;
    const shares = pillars.map(p => ((Number(p.weight) || 0) / current) * total);
    const weights = shares.map(Math.floor);
    let missing = total - weights.reduce((a, b) => a + b, 0);
    shares
        .map((share, index) => ({ index, rest: share - Math.floor(share) }))
        .sort((a, b) => b.rest - a.rest)
        .forEach(({ index }) => { if (missing-- > 0) weights[index] += 1; });
    return pillars.map((p, i) => ({ ...p, weight: weights[i] }));
}

const snapshot = await db.collection('businessProfiles').get();
const profiles = snapshot.docs.filter(doc => isFitswapBrand(doc.data()));
if (profiles.length !== 1) {
    console.error(`Esperava 1 perfil Fitswap, encontrei ${profiles.length}. Nada foi alterado.`);
    process.exit(1);
}

const doc = profiles[0];
const pillars = doc.data().editorialPillars || [];
const others = pillars.filter(p => p.id !== FITSWAP_AB_PILLAR.id);
const next = [...rebalanceWeights(others, 100 - FITSWAP_AB_PILLAR.weight), { ...FITSWAP_AB_PILLAR }];

const show = list => list.map(p => `  ${String(p.weight).padStart(3)}%  ${p.name.trim()}${p.preferredHtmlTemplate ? `  [${p.preferredHtmlTemplate}]` : ''}`).join('\n');
console.log(`Perfil ${doc.id} (${doc.data().name})\n\nAntes:\n${show(pillars)}\n\nDepois:\n${show(next)}\n`);

if (!apply) {
    console.log('Simulação: nada foi gravado. Rode com --apply para salvar.');
    process.exit(0);
}

await doc.ref.update({ editorialPillars: next, updatedAt: new Date() });
console.log('Pilares atualizados.');
process.exit(0);
