import OpenAI from 'openai';
import { mergeBrandProfileDefaults, normalizeBrandKey } from '../../utils/brandProfiles.js';
import { buildBrandPromptSections } from '../carousel/brandContextService.js';
import { refineBackgroundPrompts } from '../carousel/carouselPromptService.js';
import { reviewContentPlan, reviewContentPlanLocal } from './contentQaService.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CONTENT_PLAN_SLIDE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['background', 'headline', 'subheadline', 'highlights'],
    properties: {
        background: { type: 'string' },
        headline: { type: 'string' },
        subheadline: { type: 'string' },
        highlights: { type: 'array', items: { type: 'string' } }
    }
};

export const CONTENT_PLAN_SCHEMA = {
    name: 'content_plan',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['narrative', 'slides', 'caption', 'hashtags', 'cta'],
        properties: {
            narrative: { type: 'string' },
            slides: { type: 'array', items: CONTENT_PLAN_SLIDE_SCHEMA },
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            cta: { type: 'string' }
        }
    }
};

function cleanText(value = '') {
    return String(value || '').trim();
}

function normalizeSlide(slide = {}) {
    return {
        background: cleanText(slide.background),
        headline: cleanText(slide.headline),
        subheadline: cleanText(slide.subheadline),
        highlights: Array.isArray(slide.highlights)
            ? slide.highlights.map(cleanText).filter(Boolean)
            : []
    };
}

function normalizeHashtag(value = '') {
    const clean = cleanText(value).replace(/\s+/g, '');
    return clean ? (clean.startsWith('#') ? clean : `#${clean}`) : '';
}

function normalizePlan(plan = {}) {
    return {
        narrative: cleanText(plan.narrative),
        slides: Array.isArray(plan.slides) ? plan.slides.map(normalizeSlide) : [],
        caption: cleanText(plan.caption),
        hashtags: Array.isArray(plan.hashtags) ? plan.hashtags.map(normalizeHashtag).filter(Boolean) : [],
        cta: cleanText(plan.cta)
    };
}

function parsePlan(content) {
    if (!content) throw new Error('OpenAI retornou um plano de conteúdo vazio.');

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('OpenAI retornou JSON inválido para o plano de conteúdo.');
    }

    return normalizePlan(parsed);
}

export function buildContentPlanSystemPrompt({ description, count, context = {} } = {}) {
    const brandSections = buildBrandPromptSections(context, { slideCount: count, format: 'plan' }).compose();

    return `Você é um Estrategista de Conteúdo e Diretor de Arte Sênior.
Crie um plano unificado para um carrossel de ${count} slides sobre: "${cleanText(description)}".

${brandSections}

CONTRATO NARRATIVO:
- narrative resume o arco completo e orienta todos os slides.
- Cada slide avança o mesmo raciocínio; não crie cards independentes ou repetitivos.
- background é uma cena fotográfica específica em inglês, sem texto, logos ou UI legível.
- headline e subheadline são copy em português; highlights contém somente palavras presentes na headline.
- caption continua o arco dos slides, acrescenta contexto e não repete o carrossel mecanicamente.
- cta deve ser coerente com o último slide e obedecer às regras da marca.
- caption deve obedecer captionRules; hashtags deve obedecer hashtagStrategy.
- Retorne exatamente ${count} slides. Todos os campos do schema são obrigatórios; use "" ou [] quando algo não se aplicar.`;
}

async function requestContentPlan({ systemPrompt, userPrompt, temperature = 0.7 }) {
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: 16000,
        response_format: { type: 'json_schema', json_schema: CONTENT_PLAN_SCHEMA }
    });

    return parsePlan(completion.choices?.[0]?.message?.content);
}

async function repairMissingPlanSlides({ plan, count, description, systemPrompt }) {
    const missing = count - plan.slides.length;
    if (missing <= 0) return { ...plan, slides: plan.slides.slice(0, count) };

    const repair = await requestContentPlan({
        systemPrompt,
        temperature: 0.35,
        userPrompt: `O plano abaixo tem ${plan.slides.length}/${count} slides. Gere APENAS os ${missing} slides faltantes no campo slides, sem repetir os existentes. Para os demais campos obrigatórios, retorne strings vazias e hashtags vazio.\n\nTEMA: ${description}\nPLANO EXISTENTE:\n${JSON.stringify(plan, null, 2)}`
    });
    const slides = [...plan.slides, ...repair.slides].slice(0, count);

    if (slides.length !== count) {
        throw new Error(`Falha ao gerar slides suficientes para o plano: ${slides.length}/${count}`);
    }

    return { ...plan, slides };
}

async function regenerateQaOffenders({ plan, issues, description, systemPrompt }) {
    const slideIndexes = new Set(
        issues
            .filter((issue) => issue.target === 'slide' && Number.isInteger(issue.index))
            .map((issue) => issue.index)
    );
    const regenerateCaption = issues.some((issue) => issue.target === 'caption');
    const regenerated = await requestContentPlan({
        systemPrompt,
        temperature: 0.3,
        userPrompt: `Corrija SOMENTE os slides e/ou caption apontados pelo QA. Preserve todo o restante exatamente como está. Retorne o plano completo no schema obrigatório.

TEMA: ${description}
ISSUES: ${JSON.stringify(issues, null, 2)}
PLANO ATUAL: ${JSON.stringify(plan, null, 2)}`
    });

    return {
        ...plan,
        slides: plan.slides.map((slide, index) => {
            if (!slideIndexes.has(index) || !regenerated.slides[index]) return slide;
            return {
                ...regenerated.slides[index],
                // QA corrige copy; preserve a direção de arte já refinada.
                background: slide.background
            };
        }),
        caption: regenerateCaption && regenerated.caption ? regenerated.caption : plan.caption
    };
}

export async function generateContentPlan({ description, count, context = {}, premium = true, qa = true } = {}) {
    const cleanDescription = cleanText(description);
    const slideCount = Number(count);
    if (!cleanDescription) throw new Error('Descrição do plano de conteúdo é obrigatória.');
    if (!Number.isInteger(slideCount) || slideCount < 1 || slideCount > 10) {
        throw new Error('Quantidade de slides deve estar entre 1 e 10.');
    }

    const mergedContext = mergeBrandProfileDefaults({
        ...context,
        brandKey: context.brandKey || normalizeBrandKey(context)
    });
    const systemPrompt = buildContentPlanSystemPrompt({
        description: cleanDescription,
        count: slideCount,
        context: mergedContext
    });

    if (process.env.DEBUG_PROMPTS === '1') {
        console.log(`\n[DEBUG_PROMPTS] generateContentPlan\n${systemPrompt}\n[/DEBUG_PROMPTS]\n`);
    }

    let plan = await requestContentPlan({
        systemPrompt,
        userPrompt: `Crie o plano unificado completo para "${cleanDescription}" com exatamente ${slideCount} slides.`
    });
    if (plan.slides.length > slideCount) {
        plan = { ...plan, slides: plan.slides.slice(0, slideCount) };
    }
    plan = await repairMissingPlanSlides({
        plan,
        count: slideCount,
        description: cleanDescription,
        systemPrompt
    });

    if (premium) {
        plan = {
            ...plan,
            slides: await refineBackgroundPrompts(plan.slides, mergedContext)
        };
    }

    let warnings = [];
    if (qa) {
        try {
            const qaContext = { ...mergedContext, contentDescription: cleanDescription };
            const review = await reviewContentPlan(plan, qaContext);
            if (review.issues.length > 0) {
                plan = await regenerateQaOffenders({
                    plan,
                    issues: review.issues,
                    description: cleanDescription,
                    systemPrompt
                });
                // The post-repair pass is intentionally local: no second QA LLM call.
                warnings = reviewContentPlanLocal(plan, qaContext);
            }
        } catch (error) {
            console.warn('⚠️ QA de marca falhou; plano será entregue sem warnings:', error.message);
            warnings = [];
        }
    }

    return { plan, warnings };
}
