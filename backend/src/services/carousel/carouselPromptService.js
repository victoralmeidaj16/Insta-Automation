import OpenAI from 'openai';
import { isFitswapBrand, mergeBrandProfileDefaults, normalizeBrandKey } from '../../utils/brandProfiles.js';
import { buildBrandPromptSections } from './brandContextService.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Helper to construct the Editorial Mode System Prompt
 * Extracted for reuse in both Carousel and Single Image modes
 */
export function getEditorialSystemPrompt(description, count, context) {
    const isFitswapContext = isFitswapBrand(context);
    const premium = Boolean(context.isPremiumCarousel || context.overlayMode === 'premium');
    const brandSections = buildBrandPromptSections(context, { slideCount: count, format: 'carousel' })
        .compose(['identity', 'voice', 'narrative', 'visual', 'cta']);
    const outputFormat = isFitswapContext
        ? '[WHITE_OVERLAY] [BACKGROUND: {specific photorealistic scene in English, no text or logos}] [HEADLINE: {IMPACTFUL PORTUGUESE HEADLINE IN UPPERCASE}] [HIGHLIGHTS: {1 or 2 headline words}]'
        : premium
            ? '[PREMIUM_OVERLAY] [BACKGROUND: {specific photorealistic scene in English, no text or logos}] [HEADLINE: {IMPACTFUL PORTUGUESE HEADLINE IN UPPERCASE}] [SUBHEADLINE: {optional short support copy}] [HIGHLIGHTS: {1 or 2 headline words}]'
            : '[BACKGROUND: {specific photorealistic scene in English, no text or logos}] [HEADLINE: {IMPACTFUL PORTUGUESE HEADLINE IN UPPERCASE}] [SUBHEADLINE: {optional short support copy}] [HIGHLIGHTS: {1 or 2 headline words}]';

    return `Você é um Diretor de Arte e Copywriter Sênior especializado em carrosséis editoriais para Instagram.
Sua missão é gerar ${count} cards progressivos sobre: "${description}".

${brandSections}

PRINCÍPIO CENTRAL:
- Cada background é uma metáfora visual direta ou uma ilustração literal da mensagem do card; nunca decoração genérica.
- Primeiro defina mensagem, emoção e cena; depois descreva somente a cena fotográfica em inglês.
- Cada card conta uma micro-história visual diferente, com uma única ideia focal, luz editorial e contraste controlado.
- Quando houver pessoas, use microexpressões e linguagem corporal reais; nunca poses de stock sem contexto.

REGRAS TÉCNICAS:
- Não descreva texto, logos, tipografia ou UI legível na imagem.
- Reserve espaço negativo limpo para o overlay e não repita cena, ângulo ou composição entre os slides.
- Headlines em português, CAIXA ALTA, curtas e de alto impacto. Não repita nem parafraseie o tema recebido.
- Use um arquétipo de copy da marca; na ausência dele, use quebra de mito, revelação, transformação, contraste ou permissão.
- O tom é revelação e insight, não título de aula ou lista genérica.

REGRAS DE OUTPUT:
- A resposta da API é JSON estruturado; o sistema serializa cada slide para a gramática legada.
- O formato serializado preservado para cada card é: ${outputFormat}
- Preencha todos os campos do JSON. Use "" ou [] quando um campo não se aplicar.`;
}

export const CAROUSEL_SLIDES_SCHEMA = {
    name: 'carousel_slides',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['slides'],
        properties: {
            slides: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['background', 'headline', 'subheadline', 'highlights'],
                    properties: {
                        background: { type: 'string' },
                        headline: { type: 'string' },
                        subheadline: { type: 'string' },
                        highlights: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        }
    }
};

function sanitizeTagValue(value = '') {
    return String(value || '')
        .replace(/[\]|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSlide(slide = {}) {
    return {
        background: sanitizeTagValue(slide.background),
        headline: sanitizeTagValue(slide.headline),
        subheadline: sanitizeTagValue(slide.subheadline),
        highlights: Array.isArray(slide.highlights)
            ? slide.highlights.map(sanitizeTagValue).filter(Boolean)
            : []
    };
}

/** Serializes structured content back to the tag format consumed by current clients. */
export function serializeSlideToTagPrompt(slide, { premium = false, white = false } = {}) {
    const normalized = normalizeSlide(slide);
    const tags = [];

    if (white) tags.push('[WHITE_OVERLAY]');
    else if (premium) tags.push('[PREMIUM_OVERLAY]');
    if (normalized.background) tags.push(`[BACKGROUND: ${normalized.background}]`);
    if (normalized.headline) tags.push(`[HEADLINE: ${normalized.headline}]`);
    if (normalized.subheadline) tags.push(`[SUBHEADLINE: ${normalized.subheadline}]`);
    if (normalized.highlights.length) tags.push(`[HIGHLIGHTS: ${normalized.highlights.join(', ')}]`);

    return tags.join(' ');
}

function parseStructuredSlides(content) {
    if (!content) throw new Error('OpenAI retornou uma resposta vazia (sem conteúdo).');

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('OpenAI retornou JSON estruturado inválido para os slides.');
    }

    if (!Array.isArray(parsed.slides)) {
        throw new Error('A resposta estruturada não contém um array slides.');
    }

    return parsed.slides.map(normalizeSlide);
}

async function requestStructuredSlides({ systemPrompt, userPrompt, model = 'gpt-4o', maxTokens = 8000, temperature = 0.7 }) {
    const completion = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: CAROUSEL_SLIDES_SCHEMA }
    });

    return parseStructuredSlides(completion.choices?.[0]?.message?.content);
}

async function repairMissingSlides({ slides, count, systemPrompt, description, model }) {
    const missing = count - slides.length;
    if (missing <= 0) return slides.slice(0, count);

    const existing = JSON.stringify({ slides }, null, 2);
    const repaired = await requestStructuredSlides({
        systemPrompt,
        model,
        temperature: 0.35,
        userPrompt: `Você já gerou os slides abaixo para o tema "${description}". Gere APENAS os ${missing} slides faltantes, sem repetir cenas, hooks ou copy dos existentes. Retorne-os no mesmo schema JSON, no campo slides.\n\nSLIDES JÁ GERADOS:\n${existing}`
    });
    const combined = [...slides, ...repaired].slice(0, count);

    if (combined.length !== count) {
        throw new Error(`Falha ao gerar slides suficientes após repair: ${combined.length}/${count}`);
    }

    return combined;
}

/**
 * Refines background prompts for Premium Carousel (two-step art direction)
 */
async function legacyRefineBackgroundPrompts(cards, context) {
    try {
        const {
            aiPreferences = {},
            branding = {},
            brandName,
            brandKey,
            guidelines
        } = context;

        const photoStyle = aiPreferences.photographyStyle || branding.style || 'Premium editorial photography';
        const prohibited = aiPreferences.prohibitedElements || 'text, logos, watermarks, low quality';

        const primaryColor = branding.primaryColor || '#8e44ad';
        const secondaryColor = branding.secondaryColor || '#e74c3c';
        const brandColors = `Primary Color: ${primaryColor}, Secondary Color: ${secondaryColor}`;

        // Para cada card, alterna entre abordagem LITERAL e METAFÓRICA
        // distribui: 0=literal, 1=metáfora, 2=literal, 3=metáfora...
        const cardApproaches = cards.map((_, i) => i % 2 === 0 ? 'LITERAL' : 'METAPHOR');

        const systemPrompt = `Você é um Diretor de Arte Sênior especializado em prompts de imagem fotorrealista (Midjourney/DALL-E/Gemini).
Sua tarefa é criar prompts de BACKGROUND ricos e detalhados para cada slide de um carrossel premium do Instagram.

DIRETRIZES VISUAIS DA MARCA:
- Estilo de Arte: ${photoStyle}
- Cores da Marca: ${brandColors}
- O QUE EVITAR/PROIBIR: ${prohibited}
${guidelines ? `- DIRETRIZES EXTRAS: ${guidelines}` : ''}

DUAS ABORDAGENS VISUAIS (você receberá qual usar para cada card):

🎯 ABORDAGEM LITERAL — Ilustrar diretamente o conteúdo do headline:
- A cena mostra o ASSUNTO ou SITUAÇÃO descrita no texto.
- Ex: headline "SEU CÉREBRO ESQUECE 70% EM 24H" → close-up de uma pessoa estudando com expressão de confusão, livros abertos, ambiente real.
- Ex: headline "COMA SEM CULPA" → top-down de um prato colorido e saudável numa mesa bonita.
- Foco em pessoas reais, situações cotidianas, micro-expressões autênticas.
- A cena deve fazer o viewer dizer "é exatamente isso que acontece comigo".

🌀 ABORDAGEM METAFÓRICA — Representar a ESSÊNCIA do headline por analogia visual:
- A cena NÃO mostra o assunto literalmente, mas evoca a mesma emoção/mensagem.
- Ex: headline "SEU CÉREBRO ESQUECE 70% EM 24H" → água escorrendo por entre os dedos abertos, fundo escuro.
- Ex: headline "COMA SEM CULPA" → uma flor crescendo dentro de um prato vazio.
- Elemento principal único e poético, composição editorial minimalista.
- A cena deve fazer o viewer sentir algo antes de ler o texto.

REGRAS GERAIS (ambas abordagens):
1. NUNCA inclua texto, logos, tipografia ou UI legível nas imagens.
2. Use linguagem técnica de fotografia: lighting, lens, aperture, composition, color grade.
3. Incorpore as cores da marca de forma sutil (ambient lighting, accents, props).
4. Espaço negativo limpo na parte inferior (onde o overlay de texto ficará).
5. Output SEMPRE EM INGLÊS.
6. Cada card deve ter cena, ângulo e composição ÚNICOS — sem repetir.

INPUT FORMAT:
Cards no formato: [PREMIUM_OVERLAY] [BACKGROUND: {Conceito Inicial}] [TITLE: {Headline}] ...
ou: [WHITE_OVERLAY] [BACKGROUND: {Conceito}] [HEADLINE: {Headline}] ...

OUTPUT FORMAT:
Retorne EXATAMENTE os mesmos cards mantendo todas as tags, substituindo APENAS o conteúdo de [BACKGROUND: ...] por um prompt fotorrealista rico em inglês.`;

        // Injeta a abordagem no userPrompt para cada card
        const cardsWithApproach = cards.map((card, i) => {
            const approach = cardApproaches[i];
            const label = approach === 'LITERAL'
                ? '🎯 USE ABORDAGEM LITERAL (ilustre diretamente o conteúdo do headline)'
                : '🌀 USE ABORDAGEM METAFÓRICA (evoque a essência/emoção por analogia visual)';
            return `--- CARD ${i + 1} [${label}] ---\n${card}`;
        });

        const userPrompt = `Refine os backgrounds para estes ${cards.length} cards seguindo a abordagem indicada em cada um:

${cardsWithApproach.join('\n\n')}

IMPORTANTE:
- Retorne exatamente ${cards.length} cards refinados.
- Não adicione numeração ou comentários extras.
- Use separador "---SEPARATOR---" entre os cards.
- Mantenha todas as tags originais ([PREMIUM_OVERLAY], [TITLE:], [HEADLINE:], [HIGHLIGHTS:]) intactas.
- Substitua APENAS o conteúdo dentro de [BACKGROUND: ...]`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        });

        const refinedResponse = completion.choices[0].message.content;
        const refinedCards = refinedResponse
            .split('---SEPARATOR---')
            .map(c => c.trim())
            .filter(c => c.length > 20);

        if (refinedCards.length === cards.length) {
            console.log('✅ Background prompts refined successfully.');
            return refinedCards;
        }

        console.warn('⚠️ Refinement returned unexpected card count. Falling back to original.');
        return cards;
    } catch (error) {
        console.error('❌ Error refining backgrounds:', error);
        return cards;
    }
}

export async function refineBackgroundPrompts(slides, context) {
    if (!Array.isArray(slides) || slides.length === 0) return slides;

    try {
        const brandSections = buildBrandPromptSections(context, { slideCount: slides.length, format: 'carousel' })
            .compose(['identity', 'visual']);
        const systemPrompt = `Você é um Diretor de Arte Sênior especializado em prompts fotorrealistas para Instagram.
Refine somente o campo background de cada slide, preservando exatamente headline, subheadline e highlights.

${brandSections}

Regras: escreva os backgrounds em inglês; descreva apenas a imagem, sem texto, logos ou UI legível; mantenha espaço negativo para overlay; cada cena, ângulo e composição devem ser únicos.`;
        const refined = await requestStructuredSlides({
            systemPrompt,
            model: 'gpt-4o-mini',
            temperature: 0.5,
            userPrompt: `Refine os backgrounds destes ${slides.length} slides. Retorne exatamente a mesma quantidade, no mesmo schema JSON:\n${JSON.stringify({ slides }, null, 2)}`
        });

        if (refined.length !== slides.length) {
            console.warn('⚠️ Refinamento estruturado retornou quantidade inesperada; mantendo backgrounds originais.');
            return slides;
        }

        return refined.map((slide, index) => ({
            ...slides[index],
            background: slide.background || slides[index].background
        }));
    } catch (error) {
        console.error('❌ Error refining structured backgrounds:', error);
        return slides;
    }
}

/**
 * Analisa o estilo de uma imagem de referência usando Vision API
 */
async function analyzeImageStyle(base64Image) {
    try {
        console.log('👁️ Analisando imagem de referência com Vision...');

        const imagePart = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analyze the visual style of this image for an AI image generator prompt. Focus on: Lighting, Color Palette, Composition, Textures, and Overall Vibe. Be concise and descriptive. Do NOT describe the subject matter (like 'a person holding a phone'), ONLY the aesthetic style." },
                        { type: "image_url", image_url: { url: imagePart } }
                    ],
                },
            ],
            max_tokens: 150,
        });

        const styleDescription = response.choices[0].message.content;
        console.log('👁️ Estilo extraído:', styleDescription);
        return styleDescription;
    } catch (error) {
        console.error('❌ Erro ao analisar imagem de referência:', error);
        return null;
    }
}

/**
 * Gera conceitos estruturados para cada slide do carrossel
 */
export async function generateCarouselSlideConcepts(carouselDescription, count, context = {}) {
    try {
        console.log(`🧠 Gerando conceitos de slides (Carrossel Premium): ${count} slides`);
        const mergedContext = mergeBrandProfileDefaults({
            ...context,
            brandKey: context.brandKey || normalizeBrandKey(context)
        });
        const systemPrompt = getEditorialSystemPrompt(carouselDescription, count, {
            ...mergedContext,
            isPremiumCarousel: true
        });
        const cleanDescription = String(carouselDescription || '').trim();
        let slides = await requestStructuredSlides({
            systemPrompt,
            model: 'gpt-4o',
            userPrompt: `Crie exatamente ${count} slides sequenciais para o tema: "${cleanDescription}". Retorne somente o objeto JSON no schema solicitado.`
        });

        if (slides.length > count) slides = slides.slice(0, count);
        slides = await repairMissingSlides({
            slides,
            count,
            systemPrompt,
            description: cleanDescription,
            model: 'gpt-4o'
        });

        const refinedSlides = await refineBackgroundPrompts(slides, mergedContext);
        return refinedSlides.map((slide) => serializeSlideToTagPrompt(slide, { premium: true }));
    } catch (error) {
        console.error("❌ Erro ao gerar conceitos de slides do carrossel:", error);
        throw error;
    }
}

/**
 * Gera prompts individuais para cada card do carrossel usando OpenAI
 */
export async function generateCarouselPrompts(carouselDescription, count, context = {}) {
    try {
        console.log('🤖 Gerando prompts estruturados para carrossel...');

        const brandKey = context.brandKey || normalizeBrandKey(context);
        const mergedContext = mergeBrandProfileDefaults({ ...context, brandKey });
        const isFitswap = isFitswapBrand(mergedContext);
        const premium = Boolean(mergedContext.isPremiumCarousel || mergedContext.overlayMode === 'premium');
        const cleanDescription = String(carouselDescription || '')
            .replace(/\*\*Número de Cards Sugerido:\*\*\s*\d+/gi, '')
            .replace(/\*\*Imagem de Fundo:\*\*\s*[^\n]+/gi, '')
            .trim();
        const systemPrompt = mergedContext.isEditorial
            ? getEditorialSystemPrompt(cleanDescription, count, mergedContext)
            : `Você cria slides estruturados de carrossel para Instagram. Gere uma sequência visual progressiva, com backgrounds em inglês, copy em português e sem texto/logos no background.\n\n${buildBrandPromptSections(mergedContext, { slideCount: count, format: 'carousel' }).compose(['identity', 'voice', 'narrative', 'visual', 'cta'])}\n\nRetorne todos os campos do schema; use "" ou [] quando não se aplicarem.`;

        if (process.env.DEBUG_PROMPTS === '1') {
            console.log(`\n[DEBUG_PROMPTS] generateCarouselPrompts\n${systemPrompt}\n[/DEBUG_PROMPTS]\n`);
        }

        let slides = await requestStructuredSlides({
            systemPrompt,
            model: mergedContext.isEditorial ? 'gpt-4o' : 'gpt-4o-mini',
            maxTokens: mergedContext.isEditorial ? 16000 : 4096,
            userPrompt: `Gere exatamente ${count} slides para o carrossel sobre: "${cleanDescription}". A sequência deve ter arco narrativo e backgrounds totalmente distintos.`
        });

        if (slides.length > count) slides = slides.slice(0, count);
        slides = await repairMissingSlides({
            slides,
            count,
            systemPrompt,
            description: cleanDescription,
            model: mergedContext.isEditorial ? 'gpt-4o' : 'gpt-4o-mini'
        });

        if (premium) {
            console.log('🔮 Refinando backgrounds estruturados com direção de arte...');
            slides = await refineBackgroundPrompts(slides, mergedContext);
        }

        const prompts = slides.map((slide) => serializeSlideToTagPrompt(slide, {
            premium,
            white: isFitswap
        }));
        console.log(`✅ ${prompts.length} prompts estruturados gerados com sucesso!`);
        return prompts;
    } catch (error) {
        console.error('❌ Erro ao gerar prompts com OpenAI:', error);
        throw new Error(`Falha na geração de prompts: ${error.message}`);
    }
}

/**
 * Gera prompts similares baseados em um prompt de referência
 */
export async function generateSimilarPrompts(basePrompt, count = 3, context = {}) {
    try {
        console.log(`🤖 Gerando ${count} prompts similares para: `, basePrompt.substring(0, 50));

        const {
            profileDescription,
            guidelines,
            brandingStyle,
            brandName,
            targetAudience,
            primaryColor,
            contentStrategy,
            brandContext
        } = context;

        let systemContext = '';
        if (brandName) systemContext += `\nMARCA: ${brandName}`;
        if (profileDescription) systemContext += `\nCONTEXTO DO PERFIL:\n${profileDescription}`;
        if (brandContext) systemContext += `\nCONTEXTO DA MARCA (MISSÃO/VISÃO):\n${brandContext}`;
        if (contentStrategy) systemContext += `\nESTRATÉGIA DE CONTEÚDO / PILARES:\n${contentStrategy}`;
        if (targetAudience) systemContext += `\nPÚBLICO-ALVO:\n${targetAudience}`;
        if (brandingStyle) systemContext += `\nESTILO VISUAL:\n${brandingStyle}`;
        if (primaryColor) systemContext += `\nCOR PRINCIPAL: ${primaryColor}`;
        if (guidelines) systemContext += `\nDIRETRIZES DA MARCA:\n${guidelines}`;

        const systemPrompt = `Você é um Diretor de Arte Sênior e Especialista em IA para geração de imagens (Midjourney/DALL-E/Stable Diffusion).
Sua tarefa é analisar um prompt de imagem fornecido pelo usuário e gerar novas variações exclusivas que sigam a mesma 'vibe', estrutura e iluminação, mas adaptadas ESPECIFICAMENTE para a marca atual.

${systemContext}

REGRAS OBRIGATÓRIAS:
- Gere EXATAMENTE ${count} prompts.
- Os prompts devem preservar o ângulo de câmera, estilo de iluminação e renderização do original.
- Mude o sujeito, os objetos ou o cenário apenas o suficiente para criar uma imagem nova, mas mantendo a estética.
- ADAPTE os elementos para fazer sentido com o "Contexto do Perfil" e a "Marca".
- Seu retorno DEVE OBRIGATORIAMENTE ser um objeto JSON rigoroso com a chave "prompts" contendo um array de strings. Cada string é uma variação completa do prompt.
- NÃO use markdown fora do objeto JSON. APENAS retorne código JSON válido e estruturado. Mantenha o idioma do prompt original na geração.`;

        const userPrompt = `PROMPT DE REFERÊNCIA ORIGINAL:
"${basePrompt}"

Gere ${count} variações similares inspiradas neste prompt, adaptadas para a minha marca. Retorne apenas o Objeto JSON.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.8,
            max_tokens: 3000,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content;

        let parsed;
        try {
            parsed = JSON.parse(responseContent);
        } catch (e) {
            throw new Error("Falha ao interpretar resposta estruturada da IA.");
        }

        let prompts = [];
        if (parsed.prompts && Array.isArray(parsed.prompts)) {
            prompts = parsed.prompts;
        } else {
            throw new Error("Formato JSON retornado não contém a chave 'prompts'.");
        }

        if (prompts.length < count) {
            while (prompts.length < count && prompts.length > 0) {
                prompts.push(prompts[prompts.length - 1]);
            }
        }

        return prompts.slice(0, count);

    } catch (error) {
        console.error('❌ Erro ao gerar prompts similares:', error);
        throw new Error(`Falha na geração de prompts similares: ${error.message}`);
    }
}
