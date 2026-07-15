import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CONTENT_QA_SCHEMA = {
    name: 'content_qa',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'issues'],
        properties: {
            ok: { type: 'boolean' },
            issues: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['target', 'index', 'rule', 'detail'],
                    properties: {
                        target: { type: 'string', enum: ['slide', 'caption'] },
                        index: { type: ['integer', 'null'] },
                        rule: { type: 'string' },
                        detail: { type: 'string' }
                    }
                }
            }
        }
    }
};

const META_COPY_PATTERNS = [
    'tema central',
    'conteudo criado para',
    'conteudo estrategico',
    'alinhado ao tema principal',
    'a realidade',
    'a virada',
    'o processo',
    'o ponto central',
    'proximo passo'
];

export function normalizeQaText(value = '') {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function issueKey(issue) {
    return `${issue.target}:${issue.index ?? 'null'}:${issue.rule}:${normalizeQaText(issue.detail)}`;
}

function dedupeIssues(issues = []) {
    const seen = new Set();
    return issues.filter((issue) => {
        const key = issueKey(issue);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function scanText({ text, target, index, forbiddenWords }) {
    const normalized = normalizeQaText(text);
    if (!normalized) return [];
    const issues = [];

    forbiddenWords.forEach((word) => {
        const normalizedWord = normalizeQaText(word);
        if (normalizedWord && normalized.includes(normalizedWord)) {
            issues.push({
                target,
                index,
                rule: 'forbidden_word',
                detail: `Copy contém o termo proibido: "${word}".`
            });
        }
    });

    META_COPY_PATTERNS.forEach((placeholder) => {
        if (normalized.includes(placeholder)) {
            issues.push({
                target,
                index,
                rule: 'meta_copy',
                detail: `Copy contém placeholder/meta-copy: "${placeholder}".`
            });
        }
    });

    return issues;
}

export function reviewContentPlanLocal(plan = {}, context = {}) {
    const forbiddenWords = Array.isArray(context.brandKit?.forbiddenWords)
        ? context.brandKit.forbiddenWords.filter(Boolean)
        : [];
    const issues = [];

    (Array.isArray(plan.slides) ? plan.slides : []).forEach((slide, index) => {
        issues.push(...scanText({
            text: `${slide?.headline || ''}\n${slide?.subheadline || ''}`,
            target: 'slide',
            index,
            forbiddenWords
        }));
    });
    issues.push(...scanText({
        text: plan.caption,
        target: 'caption',
        index: null,
        forbiddenWords
    }));

    return dedupeIssues(issues);
}

function shouldUseLlmQa(context, localIssues) {
    const kit = context.brandKit || {};
    return localIssues.length > 0
        || (Array.isArray(kit.forbiddenWords) && kit.forbiddenWords.length > 0)
        || Boolean(kit.narrativeStructure?.description)
        || (Array.isArray(kit.narrativeStructure?.slideRoles) && kit.narrativeStructure.slideRoles.length > 0);
}

function normalizeLlmIssues(rawIssues, slideCount) {
    return (Array.isArray(rawIssues) ? rawIssues : [])
        .filter((issue) => issue && (issue.target === 'slide' || issue.target === 'caption'))
        .map((issue) => ({
            target: issue.target,
            index: issue.target === 'slide' && Number.isInteger(issue.index) && issue.index >= 0 && issue.index < slideCount
                ? issue.index
                : null,
            rule: String(issue.rule || 'brand_rule').trim(),
            detail: String(issue.detail || 'Violação de regra de marca.').trim()
        }))
        .filter((issue) => issue.target !== 'slide' || issue.index !== null);
}

export async function reviewContentPlan(plan, context = {}) {
    const localIssues = reviewContentPlanLocal(plan, context);
    if (!shouldUseLlmQa(context, localIssues)) {
        return { ok: localIssues.length === 0, issues: localIssues };
    }

    try {
        const kit = context.brandKit || {};
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Você revisa planos de conteúdo para aderência de marca. Retorne somente problemas reais e acionáveis.
Verifique: termos proibidos; menção prematura do produto em relação à estrutura narrativa; headline que apenas repete o tema; meta-copy ou placeholders. Índices de slides são zero-based.`
                },
                {
                    role: 'user',
                    content: `TEMA: ${context.contentDescription || ''}
MARCA: ${context.brandName || context.name || context.brandKey || ''}
TERMOS PROIBIDOS: ${JSON.stringify(kit.forbiddenWords || [])}
ESTRUTURA NARRATIVA: ${JSON.stringify(kit.narrativeStructure || {})}
PLANO: ${JSON.stringify(plan)}`
                }
            ],
            temperature: 0.1,
            max_tokens: 2000,
            response_format: { type: 'json_schema', json_schema: CONTENT_QA_SCHEMA }
        });
        const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
        const llmIssues = normalizeLlmIssues(parsed.issues, plan.slides?.length || 0);
        const issues = dedupeIssues([...localIssues, ...llmIssues]);
        return { ok: issues.length === 0, issues };
    } catch (error) {
        console.warn('⚠️ QA de conteúdo por LLM falhou; mantendo somente checks locais:', error.message);
        return { ok: localIssues.length === 0, issues: localIssues };
    }
}
