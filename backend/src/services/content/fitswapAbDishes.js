/**
 * Rodízio de pratos do pilar "A ou B" da Fitswap.
 *
 * O piloto automático monta o tema a partir do pilar, e com a mesma descrição
 * toda semana a IA tende a escolher sempre o mesmo prato. Aqui o prato é
 * escolhido antes da geração: primeiro os que nunca saíram, depois o que saiu
 * há mais tempo. O prato fica gravado no tema do post ("Prato: …"), que é de
 * onde a próxima escolha lê o histórico.
 */

export const FITSWAP_AB_TEMPLATE_ID = 'fitswap-ab';

// Pratos do dia a dia brasileiro que têm uma versão leve crível (mesmo prato,
// trocas de ingrediente), incluindo os desejos clássicos que a marca promete
// transformar: pizza, hambúrguer e doces.
export const FITSWAP_AB_DISHES = [
    'lasanha à bolonhesa',
    'strogonoff de frango',
    'frango à parmegiana',
    'feijoada',
    'brigadeiro',
    'pizza de calabresa',
    'hambúrguer caseiro',
    'macarrão à carbonara',
    'escondidinho de carne seca',
    'coxinha',
    'bolo de chocolate',
    'pudim de leite',
    'panqueca de carne',
    'torta de frango',
    'yakisoba',
    'açaí na tigela',
    'arroz carreteiro',
    'baião de dois',
    'salpicão',
    'cachorro-quente',
    'misto-quente',
    'nhoque ao sugo',
    'risoto de cogumelos',
    'bolo de cenoura com chocolate',
    'pastel de carne',
    'mousse de maracujá',
    'moqueca de peixe',
    'cuscuz nordestino com ovo',
    'tapioca de frango com requeijão',
    'macarrão com salsicha'
];

const DISH_IN_TOPIC = /Prato:\s*([^.\n]+)/i;

export function isFitswapAbPillar(pillar = {}) {
    return pillar.preferredHtmlTemplate === FITSWAP_AB_TEMPLATE_ID;
}

export function buildFitswapAbTopic(pillar, dish) {
    return `${pillar.name} — Prato: ${dish}`;
}

function normalizeDish(value = '') {
    return String(value)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

/**
 * @param {Array<{ generationPrompt?: string, createdAt?: any }>} recentPosts - posts do pilar
 * @param {() => number} random - injetável para teste
 * @returns {string} prato escolhido
 */
export function pickFitswapAbDish(recentPosts = [], random = Math.random) {
    const lastUsed = new Map();
    for (const post of recentPosts) {
        const match = String(post?.generationPrompt || '').match(DISH_IN_TOPIC);
        if (!match) continue;
        const key = normalizeDish(match[1]);
        lastUsed.set(key, Math.max(lastUsed.get(key) || 0, toMillis(post.createdAt) || 1));
    }

    const never = FITSWAP_AB_DISHES.filter(dish => !lastUsed.has(normalizeDish(dish)));
    if (never.length > 0) return never[Math.floor(random() * never.length)];

    return [...FITSWAP_AB_DISHES]
        .sort((a, b) => lastUsed.get(normalizeDish(a)) - lastUsed.get(normalizeDish(b)))[0];
}

export const FITSWAP_AB_DISCLAIMER = '*Valores estimados por porção, com base na Tabela TACO e em rótulos médios.';

/** Garante o aviso de que as kcal são estimativas, antes do bloco de hashtags. */
export function appendFitswapAbDisclaimer(caption = '') {
    const text = String(caption || '').trim();
    if (!text || /\bTACO\b/i.test(text)) return text;

    const lines = text.split('\n');
    const hashtagStart = lines.findIndex(line => /^\s*#\S/.test(line));
    if (hashtagStart === -1) return `${text}\n\n${FITSWAP_AB_DISCLAIMER}`;

    const body = lines.slice(0, hashtagStart).join('\n').trimEnd();
    const tags = lines.slice(hashtagStart).join('\n');
    return `${body}\n\n${FITSWAP_AB_DISCLAIMER}\n\n${tags}`;
}
