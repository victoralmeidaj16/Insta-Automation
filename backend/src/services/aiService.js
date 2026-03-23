import Replicate from 'replicate';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import sharp from 'sharp';
import { storage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import { createFitswapComposition } from './editorialCompositionService.js';
import { createFitswapWhiteComposition } from './fitswapWhiteCompositionService.js';
import { createPremiumComposition } from './premiumCompositionService.js';
import { createScientificComposition } from './scientificCompositionService.js';
import { getBrandPreset, getBrandReferenceImages, isFitswapBrand, mergeBrandProfileDefaults, normalizeBrandKey } from '../utils/brandProfiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Faz o upload de uma imagem Base64 para o Firebase Storage e retorna a URL pública.
 * Evita o limite de 1MB do Firestore e melhora performance global.
 */
async function uploadBase64ToFirebase(base64DataUri) {
    if (!base64DataUri || !base64DataUri.startsWith('data:image/')) return base64DataUri;

    try {
        console.log('☁️ Fazendo upload automático da imagem gerada para o Firebase Storage...');
        const uniqueId = uuidv4();
        
        const match = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return base64DataUri;
        
        const mimeType = match[1];
        const base64Data = match[2];
        const ext = mimeType.split('/')[1] || 'png';
        const buffer = Buffer.from(base64Data, 'base64');
        
        const fileName = `generated_images/${uniqueId}.${ext}`;
        const fileUpload = storage.file(fileName);
        
        await fileUpload.save(buffer, {
            metadata: {
                contentType: mimeType,
            },
        });
        
        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${storage.name}/${fileName}`;
        console.log('✅ Upload concluído. URL pública:', publicUrl);
        return publicUrl;
    } catch (err) {
        console.error('❌ Falha ao fazer upload da imagem gerada:', err);
        return base64DataUri; // Fallback to base64 if it fails
    }
}

/**
 * Superpõe uma logo imagem usando sharp
 * @param {string} sourceImageBase64Url - A imagem original (Base64 data URI ou HTTP URL)
 * @param {string} logoPath - Caminho físico absoluto da logo
 * @returns {Promise<string>} Base64 data URI da imagem com a logo composta
 */
async function compositeLogoOverlay(sourceImageBase64Url, logoPath) {
    try {
        console.log('🖼️ Iniciando compositing da logo com Sharp...');

        let imageBuffer;
        const isUrl = typeof sourceImageBase64Url === 'string' && sourceImageBase64Url.startsWith('http');
        
        if (isUrl) {
            const response = await axios.get(sourceImageBase64Url, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data);
        } else {
            const base64Str = String(sourceImageBase64Url || '');
            const base64Data = base64Str.replace(/^data:[^;]+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        }

        // 🔄 Usuário solicitou que toda imagem transformada na biblioteca seja 4:5 (1080x1350)
        console.log('📐 Redimensionando imagem de base para 1080x1350 (4:5) antes de aplicar a logo...');
        const resizedImageBuffer = await sharp(imageBuffer)
            .resize(1080, 1350, { fit: 'cover', position: 'center' })
            .toBuffer();

        const sourceImage = sharp(resizedImageBuffer);
        const metadata = await sourceImage.metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Logo configuration: ~12% of width so it's not too giant
        const logoTargetWidth = Math.round(width * 0.12);

        // Prepare logo: resize
        const logoBuffer = await sharp(logoPath)
            .resize({ width: logoTargetWidth, withoutEnlargement: true })
            .toBuffer();

        const logoMetadata = await sharp(logoBuffer).metadata();

        // Margin: ~4% from bottom and right edges
        const marginX = Math.round(width * 0.04);
        const marginY = Math.round(height * 0.04);

        const left = width - logoMetadata.width - marginX;
        const top = height - logoMetadata.height - marginY;

        // Composite using 'screen' blend to remove black background from the logo
        const compositedBuffer = await sourceImage
            .composite([
                {
                    input: logoBuffer,
                    top: Math.max(0, top),
                    left: Math.max(0, left),
                    blend: 'screen'
                }
            ])
            .toFormat('png')
            .toBuffer();

        console.log('✅ Compositing concluído com sucesso.');
        return `data:image/png;base64,${compositedBuffer.toString('base64')}`;
    } catch (error) {
        console.error('❌ Erro no compositing da logo:', error);
        // Fallback to original image if compositing fails
        return sourceImageBase64Url;
    }
}

// Ensure OpenAI client is initialized properly
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Initialize Seedream client
const seedreamReplicate = new Replicate({
    auth: process.env.SEEDREAM_API_TOKEN,
});




/**
 * Helper to construct the Editorial Mode System Prompt
 * Extracted for reuse in both Carousel and Single Image modes
 */
// Helper: convert hex to a descriptive color name for image prompts
function hexToColorName(hex) {
    const colorMap = {
        '#4C1D95': 'deep violet', '#8e44ad': 'rich purple', '#7c3aed': 'vivid purple',
        '#6d28d9': 'dark purple', '#a855f7': 'bright purple', '#9333ea': 'electric purple',
        '#3b82f6': 'royal blue', '#2563eb': 'deep blue', '#1d4ed8': 'navy blue',
        '#ef4444': 'red', '#dc2626': 'crimson', '#f97316': 'orange',
        '#22c55e': 'emerald green', '#10b981': 'teal green', '#14b8a6': 'teal',
        '#f59e0b': 'amber', '#eab308': 'gold', '#000000': 'black', '#ffffff': 'white',
    };
    const key = (hex || '').toLowerCase();
    if (colorMap[key]) return colorMap[key];
    // Fallback: describe by hue
    const r = parseInt(key.slice(1, 3), 16) || 0;
    const g = parseInt(key.slice(3, 5), 16) || 0;
    const b = parseInt(key.slice(5, 7), 16) || 0;
    if (r > g && r > b) return 'warm reddish tone';
    if (g > r && g > b) return 'green tone';
    if (b > r && b > g) return 'blue-purple tone';
    if (r > 200 && g > 200 && b > 200) return 'light neutral';
    return 'dark accent tone';
}

function buildFitswapBrandContext(context = {}) {
    const merged = mergeBrandProfileDefaults({
        brandKey: context.brandKey || normalizeBrandKey(context),
        brandName: context.brandName,
        name: context.brandName,
        description: context.profileDescription,
        brandContext: context.brandContext,
        contentStrategy: context.contentStrategy,
        targetAudience: context.targetAudience,
        productService: context.productService,
        branding: context.branding || {
            primaryColor: context.primaryColor,
            secondaryColor: context.secondaryColor,
            style: context.brandingStyle,
            guidelines: context.guidelines
        },
        brandKit: context.brandKit,
        aiPreferences: context.aiPreferences
    });

    return merged;
}

function parseStructuredFitswapPrompt(prompt = '') {
    const background = prompt.match(/\[BACKGROUND:\s*(.*?)\]/i)?.[1]?.trim() || '';
    const headline = prompt.match(/\[HEADLINE:\s*(.*?)\]/i)?.[1]?.trim() || '';
    const subheadline = prompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i)?.[1]?.trim() || '';
    const highlights = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i)?.[1]
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean) || [];
    const layout = prompt.match(/\[LAYOUT:\s*(.*?)\]/i)?.[1]?.trim() || 'hero';

    return {
        background,
        headline,
        subheadline,
        highlights,
        layout,
        isStructured: Boolean(background && headline)
    };
}

function enforceFitswapPromptGuardrails(prompt = '', context = {}) {
    if (!isFitswapBrand(context)) return prompt;

    const guardrails = [
        'Brand guardrails: white or very light neutral background dominant, 70-80% clean white space.',
        'Use Dark Gray (#111827) for strong structure and subtle Neon Lime (#A6F000) only for accents.',
        'No heavy shadows, no decorative fonts, no clutter, no influencer pose, no fitness clichés.',
        'Editorial premium wellness-tech, practical Brazilian kitchen or clean studio scene, soft daylight.',
        'If a smartphone appears, it should suggest the real Fitswap interface without readable text.'
    ];

    const currentPrompt = String(prompt || '');
    if (guardrails.every((rule) => currentPrompt.includes(rule))) {
        return currentPrompt;
    }

    return `${currentPrompt}\n\n${guardrails.join('\n')}`.trim();
}

function sanitizeBackgroundPromptForImageGeneration(prompt = '') {
    let sanitized = String(prompt || '');

    const removals = [
        /\bthe scene provides clear space for overlay text\b[,.]*/gi,
        /\bclear space for overlay text\b[,.]*/gi,
        /\bspace for overlay text\b[,.]*/gi,
        /\bcentral area for text placement\b[,.]*/gi,
        /\barea for text placement\b[,.]*/gi,
        /\btext placement\b[,.]*/gi,
        /\boverlay text\b[,.]*/gi,
        /\bheadline area\b[,.]*/gi,
        /\bcopy space\b[,.]*/gi,
        /\btext area\b[,.]*/gi,
        /\broom for typography\b[,.]*/gi,
        /\bspace for typography\b[,.]*/gi
    ];

    removals.forEach((pattern) => {
        sanitized = sanitized.replace(pattern, ' ');
    });

    sanitized = sanitized
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.])/g, '$1')
        .trim();

    const hardNegative = 'No text, no words, no letters, no typography, no captions, no labels, no signage, no logo, no watermark, no UI text, no readable characters.';

    if (!/no text, no words, no letters/i.test(sanitized)) {
        sanitized = `${sanitized}. ${hardNegative}`.trim();
    }

    return sanitized;
}

export function getEditorialSystemPrompt(description, count, context) {
    const {
        primaryColor = '#4C1D95',
        targetAudience = 'General Audience',
        productService = 'Professional Services',
        brandingStyle = 'Editorial cinematic, professional',
        brandName,
        aspectRatio = '4:5',
        profileDescription,
        guidelines,
        brandKit = {},
        branding = {}
    } = context;

    const dynamicBrand = brandName ? String(brandName).trim() : 'SUA MARCA AQUI';
    const truncate = (str, maxLength = 500) =>
        str && String(str).length > maxLength ? String(str).substring(0, maxLength) + "..." : (str ? String(str) : '');

    const colorName = hexToColorName(primaryColor);
    const isFitswapContext = isFitswapBrand({ brandName, brandKey: context.brandKey });

    // Dynamic Color Palette from brandKit
    let brandColorInstructions = '';
    if (brandKit.customColors && brandKit.customColors.length > 0) {
        brandColorInstructions = `
BRAND COLORS (STRICTLY ENFORCE THESE TONES):
${brandKit.customColors.map((color, i) => `- ${color}: Use for ${['shadows/depth', 'mid-tones', 'vibrant accents', 'highlights'][i] || 'accents'}.`).join('\n')}
- DO NOT use generic colors. USE THESE EXACT CODES to guide the color palette.
`;
    }

    // Dynamic Carousel Template logic
    let templateInstructions = '';
    if (brandKit.carouselTemplate) {
        const { name, stages } = brandKit.carouselTemplate;
        templateInstructions = `
SIGNATURE SEQUENCE: "${name}"
You must follow this specific emotional/narrative journey across the ${count} slides:
${stages.map((s, i) => `Slide ${i + 1}: ${s.name} (${s.goal})`).join('\n')}
If count > ${stages.length}, expand the middle stages. If count < ${stages.length}, condense starting stages but ALWAYS keep the final resolution/discovery stage.
`;
    }

    // PREMIUM OVERLAY MODE (Universal Premium Template)
    if (context.isPremiumCarousel || context.overlayMode === 'premium') {
        return `Você é um Diretor de Arte Sênior e Estrategista de Conteúdo focado em design minimalista de luxo e alta conversão.
Sua missão é gerar ${count} cards ESTRUTURADOS para um carrossel do Instagram sobre: "${description}".

MUDANÇA CRÍTICA: ESTA É UMA ABORDAGEM EM CAMADAS (LAYERED).
- O sistema aplicará um template PREMIUM por cima (gradiente branco, branding centralizado, títulos grandes com destaque).
- A IMAGEM DE FUNDO deve ser uma FOTOGRAFIA LIMPA, SEM NENHUM TEXTO, SEM NENHUMA TIPOGRAFIA, SEM NENHUM OVERLAY.
- TODO o texto será adicionado pelo template de overlay automaticamente. NÃO inclua texto no conceito visual.

REGRAS DE ARQUITETURA DA INFORMAÇÃO (MUITO IMPORTANTE):
O conteúdo NÃO PODE parecer uma aula acadêmica ou lista explicativa. DEVE parecer uma notícia, um insight chocante, uma descoberta ou um dado curioso ("news / insight style").
- NÃO USE estrutura de título + subtítulo explicativo.
- USE "curiosity hooks" (ganchos de curiosidade).
- USE frases curtas e de alto impacto (máximo 10 palavras por linha).
- O tom deve soar como uma revelação surpreendente, não como uma aula.
- Crie tensão e curiosidade em cada slide.
- Concentre-se no lado psicológico, científico ou em uma quebra de mito.

REGRAS DE OUTPUT:
Para cada card, retorne exatamente este formato em uma ÚNICA LINHA, sem quebras:
[PREMIUM_OVERLAY] [BACKGROUND: {CONCEITO_VISUAL_CURTO_EM_INGLES}] [TITLE: {HOOK OU REVELAÇÃO IMPACTANTE EM CAIXA ALTA, máx 10 a 15 palavras}] [HIGHLIGHTS: {1 ou 2 palavras do TITLE que a IA decidiu destacar}]

REGRAS DO BACKGROUND (CRÍTICO):
- Descreva APENAS a cena fotográfica (sem texto, sem tipografia, sem UI).
- Cada card deve ter um BACKGROUND DIFERENTE e VARIADO. NÃO repita a mesma cena.
- Use conceitos diversos e criativos: close-up de texturas, composições abstratas, paisagens urbanas, objetos do cotidiano, natureza, macro fotografia, flat lay, etc.
- NUNCA descreva "woman holding smartphone" em todos os cards. Varie os sujeitos, objetos e cenários.
- O backgroundserá gerado por IA de imagem, então descreva a CENA visual, não instruções de design.
- Exemplos bons: "Close-up of fresh berries on marble surface with soft daylight", "Abstract neural network visualization with soft blue glow", "Aerial view of organized meal prep containers", "Dramatic macro of water drops on a green leaf".
- Exemplos RUINS: "Woman in white kitchen holding phone", "Text overlay with headline" (NUNCA inclua texto no conceito).
- SEM TEXTO, SEM LOGOS, SEM TIPOGRAFIA na imagem.

Separe cada card com "---SEPARATOR---".
`;
    }

    // Fitswap gets a dedicated system prompt that uses [WHITE_OVERLAY] format
    if (isFitswapContext) {
        return `Você é um Diretor de Arte Sênior da Fitswap, marca de nutrição inteligente wellness-tech.
Sua missão é gerar ${count} prompts ESTRUTURADOS para um carrossel do Instagram sobre: "${description}".

CONTEXTO DA MARCA FITSWAP:
- Estilo: Minimalista premium. Brancos dominantes (70-80%), acentos em Neon Lime (#A6F000), tipografia Dark Gray (#111827).
- Mood: Wellness prático, editorial, cozinha brasileira real, lifestyle aspiracional.
- Público: Mulheres buscando excelência estética, busy achievers, entusiastas fitness.
- PROIBIDO: Clutter visual, sombras pesadas, fontes decorativas, clichês de fitness, UI legível na IA.
${guidelines ? `- Guidelines: "${truncate(guidelines, 400)}"` : ''}

PARA CADA CARD RETORNE EXATAMENTE ESTA ESTRUTURA (em uma linha, separada por |):
[WHITE_OVERLAY] [BACKGROUND: {Descreva em inglês uma cena fotorrealista premium, clean, relacionada ao conteúdo do card. SEM TEXTO, SEM LOGO.}] [HEADLINE: {TÍTULO EM CAIXA ALTA, máx 6 palavras, em português}] [HIGHLIGHTS: {1 ou 2 palavras da HEADLINE para destaque em verde-lima}]

REGRAS DO BACKGROUND (CRÍTICO):
- Cenas de cozinha clean, mesa de café, ingredientes frescos, smartphone com app Fitswap (sem texto legível).
- Luz natural suave, fundo branco ou neutro dominante, extrema qualidade fotográfica.
- Narrativa visual: a imagem deve ilustrar o conceito do card com metáforas visuais claras.
- SEM TEXTO, SEM LOGOS na imagem gerada.

Separe cada card com "---SEPARATOR---".

EXEMPLO DE OUTPUT PARA 2 CARDS:
[WHITE_OVERLAY] [BACKGROUND: Top-down editorial shot of a colorful healthy meal bowl on a white marble kitchen surface, fresh ingredients scattered around, soft natural daylight, ultra-photorealistic, no text] [HEADLINE: COMA SEM CULPA TODOS OS DIAS] [HIGHLIGHTS: CULPA]
---SEPARATOR---
[WHITE_OVERLAY] [BACKGROUND: Clean white kitchen counter with a smartphone showing a minimal app interface glow in neon lime, no readable text, soft bokeh, editorial lifestyle photography, ultra-realistic] [HEADLINE: IA QUE PLANEJA POR VOCÊ] [HIGHLIGHTS: IA, PLANEJA]
`;
    }

    return `Você é um Diretor de Arte Sênior especializado em design editorial e visual storytelling para a marca "${dynamicBrand}".
Sua missão é gerar ${count} prompts ESTRUTURADOS e PROGRESSIVOS para um carrossel sobre: "${description}".

MUDANÇA CRÍTICA: ESTA É UMA ABORDAGEM EM CAMADAS (LAYERED).
- A IA que lerá o seu prompt gerará SOMENTE O BACKGROUND / CENA BASE.
- Textos, logo e estrutura do post serão aplicados programaticamente pelo nosso sistema por cima dessa imagem.

CONTEXTO DA MARCA:
- Segmento: "${truncate(productService, 120)}"
- Personalidade: "${brandKit.personality || 'Profissional e Moderna'}"
- Estilo Visual: "${branding.style || brandingStyle}"
- Público-alvo: "${truncate(targetAudience, 200)}"
- Cor principal: ${colorName}
${brandColorInstructions}
${templateInstructions}
${profileDescription ? `- Descrição do perfil: "${truncate(profileDescription, 500)}"` : ''}
${guidelines ? `- Guidelines (OBRIGATÓRIO): "${truncate(guidelines, 800)}"` : ''}

PARA CADA CARD (SLIDE), VOCÊ DEVE RETORNAR EXATAMENTE ESTA ESTRUTURA:
[BACKGROUND: Uma descrição hiper-realista e fotográfica da cena descrevendo {DETALHES_DA_CENA}. ILUMINAÇÃO MACIA, PROFUNDIDADE DE CAMPO RASA, EXTREMA QUALIDADE. SEM TEXTO, SEM LOGOS, SEM NENHUM GRÁFICO.] | [HEADLINE: {TÍTULO_MUITO_CURTO_EM_CAIXA_ALTA_E_EM_PORTUGUÊS}] | [SUBHEADLINE: {FRASE_CURTA_DE_APOIO_EM_PORTUGUÊS}] | [HIGHLIGHTS: {1_OU_2_PALAVRAS_DO_HEADLINE_PARA_COR_DE_DESTAQUE}]

REGRAS DO BACKGROUND:
- FOTORREALISMO APENAS, premium, editorial, clean.
- ABSOLUTAMENTE NENHUM TEXTO, NENHUMA TIPOGRAFIA, NENHUM LOGO na imagem gerada.
- O visual deve casar perfeitamente com a headline e a narrativa do carrossel.
- Nada de clutter, evite sombras pesadas ou clichês corporativos/fitness se não especificado.
- A composição deve permitir a leitura clara de texto sobreposto (garantir espaços de "respiro" clean).

REGRAS DO HEADLINE e SUBHEADLINE:
- Devem estar em PORTUGUÊS.
- HEADLINE deve ser em CAIXA ALTA, bem curto e impactante (máx. 6 a 8 palavras).
- SUBHEADLINE deve agregar valor ou explicar brevemente o hook da headline.

REGRAS DE HIGHLIGHTS:
- 1 ou 2 palavras específicas da HEADLINE que devem ter uma cor de destaque.

FORMATO E MÚLTIPLOS CARDS:
- Separe cada card EXATAMENTE com "---SEPARATOR---".
- Cada card deve estar em uma ÚNICA LINHA contendo a estrutura completa.

EXEMPLO DE OUTPUT:
[BACKGROUND: A hyper-realistic close-up of a human eye with a galaxy reflecting in the pupil, cosmic lighting, clean minimal background.] | [HEADLINE: O MISTÉRIO DA VISÃO E DA MENTE] | [SUBHEADLINE: Entenda como o cérebro processa imagens reais] | [HIGHLIGHTS: MISTÉRIO, MENTE]
---SEPARATOR---
[BACKGROUND: A cinematic shot of a glowing neon neural pathway in a dark laboratory, shallow focus, ample dark space at the bottom.] | [HEADLINE: COMO O CÉREBRO APRENDE MAIS] | [SUBHEADLINE: A neurociência por trás da neuroplasticidade] | [HIGHLIGHTS: CÉREBRO, APRENDE]
`;
}


/**
 * Step 2 of the generation flow: Refines background concepts into high-quality, 
 * brand-aligned prompts for image generation.
 */
async function refineBackgroundPrompts(cards, context) {
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
        
        // Dynamic Brand Color Context
        const primaryColor = branding.primaryColor || '#8e44ad';
        const secondaryColor = branding.secondaryColor || '#e74c3c';
        const brandColors = `Primary Color: ${primaryColor}, Secondary Color: ${secondaryColor}`;

        const systemPrompt = `Você é um Diretor de Arte Sênior especializado em prompts de imagem (Midjourney/DALL-E).
Sua tarefa é ler um conjunto de planos de um carrossel e criar prompts de BACKGROUND fotorrealistas e metafóricos para cada um.

DIRETRIZES VISUAIS DA MARCA:
- Estilo de Arte: ${photoStyle}
- Cores da Marca: ${brandColors}
- O QUE EVITAR/PROIBIR: ${prohibited}
${guidelines ? `- DIRETRIZES EXTRAS: ${guidelines}` : ''}

REGRAS GERAIS PARA BACKGROUNDS:
1. NUNCA inclua texto, logos ou tipografia nas imagens.
2. Seja metáforico. Se o post é sobre "Foco", em vez de uma pessoa sentada, use algo como "A single sharp light beam cutting through a misty dark room".
3. Use linguagem técnica de fotografia (lighting, lens, focus, composition).
4. INCORPORE as cores da marca de forma sutil (ambient lighting, accents, props).
5. O output deve ser EM INGLÊS.

INPUT FORMAT:
Você receberá os cards no formato original: [PREMIUM_OVERLAY] [BACKGROUND: {Conceito Inicial}] [TITLE: {Conteúdo}] ...

OUTPUT FORMAT:
Retorne EXATAMENTE os mesmos cards mantendo a estrutura, mas substituindo o campo [BACKGROUND: ...] por um prompt rico e detalhado em inglês.
Mantenha a tag [PREMIUM_OVERLAY] e as outras tags intactas.`;

        const userPrompt = `Refine os backgrounds para estes ${cards.length} cards:

${cards.join('\n\n')}

IMPORTANTE: 
- Retorne exatamente ${cards.length} cards, um por linha.
- Não adicione numeração ou comentários.
- Use separador "---SEPARATOR---" entre eles.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Fast and good for expansion
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


/**
 * Analisa o estilo de uma imagem de referência usando Vision API
 * @param {string} base64Image - Imagem em base64
 * @returns {Promise<string>} - Descrição do estilo visual
 */
async function analyzeImageStyle(base64Image) {
    try {
        console.log('👁️ Analisando imagem de referência com Vision...');

        // Ensure base64 has prefix if missing
        const imagePart = base64Image.startsWith('data:') ? base64Image : `data: image / jpeg; base64, ${base64Image} `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Cost effective vision model
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
        return null; // Fail gracefully
    }
}

/**
 * Gera conceitos estruturados para cada slide do carrossel
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} count - Número de slides
 * @param {object} context - Contexto do perfil da marca
 * @returns {Promise<string[]>} - Array de conceitos formatados
 */
export async function generateCarouselSlideConcepts(carouselDescription, count, context = {}) {
    try {
        console.log(`🧠 Gerando conceitos de slides (Carrossel Premium): ${count} slides`);
        const brandKey = context.brandKey || "";
        const guidelinesText = context.guidelines ? `\nDIRETRIZES DA MARCA:\n${context.guidelines}` : "";
        
        const systemPrompt = `Você é um Estrategista de Conteúdo sênior para Instagram.
Sua tarefa é dividir a "Ideia/Tema central" em ${count} slides sequenciais (Hook, Contexto, Problema, Solução, CTA, etc.) formando um único carrossel fluido.

Para CADA slide, forneça a estrutura rigorosamente no formato exigido. ${guidelinesText}

FORMATO OBRIGATÓRIO PARA CADA SLIDE:
**TEMA / CONTEÚDO:** [Função do slide na narrativa. Ex: Slide 1 - O Gancho, Slide 2 - Contexto...]
**HEADLINE:** [O texto curto e instigante que deve ir na imagem]
**SUBHEADLINE:** [Uma frase complementar ou racional de apoio]
**FRASE DE PRODUTO:** [Conexão sutil com a marca/produto, se aplicável, senão omitir]
**FRASE IDENTITÁRIA:** [O tom de voz emocional ou conexão com os valores da marca]
**DESCRIÇÃO DA IMAGEM:** [Descreva os elementos da cena fotográfica para este slide]`;

        const cleanDescription = String(carouselDescription || '')
            .replace(/\*\*Número de Cards Sugerido:\*\*\s*\d+/gi, '')
            .replace(/\*\*Imagem de Fundo:\*\*\s*[^\n]+/gi, '')
            .trim();

        const userPrompt = `Crie a estrutura de conteúdo hiperfocada para ${count} slides de um ÚNICO carrossel seqüencial.
Ideia/Tema central: "${cleanDescription}"
Contexto do Negócio: ${context.profileDescription || context.brandContext || ""}

IMPORTANTE: 
Retorne APENAS os textos preenchidos dos slides, SEPARADOS EXATAMENTE PELA STRING "---SEPARATOR---".
A Ideia/Tema central pode conter texto introdutório. Ignore isso e foque em gerar exatamente ${count} cards com a estrutura OBRIGATÓRIA.
Não utilize numeração ou marcadores globais (como 1. 2. 3.) fora do conteúdo de cada card. Mínimo de 50 caracteres por slide.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        });

        const responseText = completion.choices[0].message.content;
        const concepts = responseText
            .replace(/```/g, '')
            .split("---SEPARATOR---")
            .map(c => c.trim())
            .filter(c => c.length > 20);

        if (concepts.length > count) return concepts.slice(0, count);

        // Fill remaining if GPT missed one or two separators
        while (concepts.length > 0 && concepts.length < count) {
            concepts.push(concepts[concepts.length - 1]);
        }

        return concepts;
    } catch (error) {
        console.error("❌ Erro ao gerar conceitos de slides do carrossel:", error);
        throw error;
    }
}

/**
 * Gera prompts individuais para cada card do carrossel usando OpenAI
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} count - Número de cards/imagens
 * @returns {Promise<string[]>} - Array de prompts individuais
 */
export async function generateCarouselPrompts(carouselDescription, count, context = {}) {
    try {
        console.log('🤖 Gerando prompts com OpenAI para carrossel...');
        
        // Ensure we work with fully populated brand data
        const brandKey = context.brandKey || normalizeBrandKey(context);
        const mergedContext = mergeBrandProfileDefaults({ ...context, brandKey });
        
        const { 
            profileDescription, 
            guidelines, 
            savedPrompts, 
            isEditorial, 
            brandName, 
            brandKit 
        } = mergedContext;

        const truncate = (str, maxLength = 2000) => str && str.length > maxLength ? str.substring(0, maxLength) + "..." : str;

        const isFitswap = isFitswapBrand({ brandKey, brandName });

        // ... rest of logic uses mergedContext ...

        // BATCHING LOGIC FOR EDITORIAL MODE (To prevent Timeouts)
        if (isEditorial && count > 5) {
            console.log(`⚠️ Editorial Mode: Splitting ${count} cards into batches to avoid timeout...`);
            const mid = Math.ceil(count / 2);
            
            // Re-use current function with merged context
            const firstBatch = await generateCarouselPrompts(carouselDescription, mid, { ...mergedContext });
            const secondBatch = await generateCarouselPrompts(carouselDescription, count - mid, { ...mergedContext });

            return [...firstBatch, ...secondBatch];
        }

        let systemContext = '';
        if (profileDescription) systemContext += `\n\nCONTEXTO DO PERFIL: \n${truncate(profileDescription)} `;
        if (guidelines) systemContext += `\n\nDIRETRIZES DA MARCA(GUIDELINES): \n${truncate(guidelines)} \nIMPORTANTE: Siga estas diretrizes estritamente.`;

        let savedPromptsContext = '';
        const promptReferences = isFitswap
            ? [...(savedPrompts || []), ...((brandKit?.referencePrompts || []).map((text, index) => ({ id: `fitswap-reference-${index}`, text })))]
            : (savedPrompts || []);

        if (promptReferences && promptReferences.length > 0) {
            // Limit to 5 examples to save tokens
            const recentPrompts = promptReferences.slice(0, 5);
            savedPromptsContext = `\n\nEXEMPLOS DE ESTILO(Prompts Salvos): \nAqui estão exemplos de prompts que o usuário gosta.Tente seguir um estilo similar: \n${recentPrompts.map(p => `"${p.text}"`).join('\n')} `;
        }

        let systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Sua tarefa é pegar uma descrição geral de um carrossel e criar prompts específicos para cada card / slide.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ser coerentes entre si, contando uma história ou apresentando um conceito de forma progressiva.
        ${systemContext}
${savedPromptsContext} `;

        // EDITORIAL MODE LOGIC
        if (isEditorial) {
            systemPrompt = getEditorialSystemPrompt(carouselDescription, count, mergedContext);
        }



        const cleanDescription = String(carouselDescription || '')
            .replace(/\*\*Número de Cards Sugerido:\*\*\s*\d+/gi, '')
            .replace(/\*\*Imagem de Fundo:\*\*\s*[^\n]+/gi, '')
            .trim();

        const userPrompt = `Crie ${count} prompts individuais para um carrossel do Instagram com a seguinte descrição:

    "${truncate(cleanDescription, 3000)}"

    IMPORTANTE:
    - O texto base não determina o número de cards. IGNORE as tags "**Número de Cards Sugerido:**" do texto base, gere ESTRITAMENTE ${count} prompts.
    - Generate exactly ${count} prompts
    - ${isEditorial ? 'Use ESTRITAMENTE o template fornecido no System Prompt para cada card.' : 'Each prompt must be detailed and visual'}
    - The prompts must have a narrative or logical sequence
    - Use descriptive language suitable for image generation
    - Return only the prompts, one per line, without numbering or bullets
    - DO NOT use Markdown headers(###), bold(**), or italics
    - ${isEditorial ? 'Não desvie do formato de template. O output DEVE ser o prompt completo pronto para ser enviado para a IA de imagem.' : 'Se as Diretrizes da Marca exigirem um estilo específico (ex: minimalista, cyberpunk, cores vibrantes), aplique-o em TODOS os prompts.'}
    - ${isEditorial ? '' : 'Use "TEXT OVERLAY: \'Your Text Here\'" explicitly in the prompt description to ensure text appears in the image if needed.'}

Retorne os prompts separados APENAS pela string "---SEPARATOR---"(sem aspas).
Garante que CADA prompt esteja completo antes de inserir o separador.`;

        const completion = await openai.chat.completions.create({
            model: isEditorial ? 'gpt-4o' : 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: isEditorial ? 16000 : 4096,
        });

        const response = completion.choices[0].message.content;
        console.log(`📡 OpenAI raw response type: ${typeof response}`);

        if (!response) {
            throw new Error('OpenAI retornou uma resposta vazia (sem conteúdo).');
        }

        const parsePrompts = (rawText) => {
            const cleaned = String(rawText || '').replace(/```/g, '').trim();

            // Handling for Editorial Mode (Multi-line prompts)
            if (isEditorial) {
                const parts = cleaned.split('---SEPARATOR---') // Split by unique separator
                console.log(`📡 parsePrompts results count: ${parts.length}`);
                return parts
                    .map(p => p.trim())
                    .filter(p => p.length > 50); // Editorial prompts are long; filter noise
            }

            // Standard Mode (Single line per prompt usually)
            return cleaned
                .split('\n')
                .map(p => p.trim())
                .filter(p => {
                    // Filter out empty lines, markdown headers (###), and separators (---)
                    return p.length > 0 && !p.startsWith('#') && !p.startsWith('-') && !p.startsWith('*');
                })
                // Remove numbering if present (e.g., "1. prompt")
                .map(p => p.replace(/^\d+[\.\)]\s*/, ''));
        };

        const results = parsePrompts(response);
        console.log(`📡 parsePrompts results type/count: ${Array.isArray(results) ? 'Array' : typeof results} | ${results.length}`);
        let prompts = results.slice(0, count);

        // Guarantee we return exactly `count` prompts (common failure: model returns fewer blocks)
        if (prompts.length !== count) {
            console.warn(`⚠️ OpenAI retornou ${prompts.length}/${count} prompts. Tentando corrigir...`);

            if (prompts.length > count) {
                prompts = prompts.slice(0, count);
            } else {
                const missing = count - prompts.length;
                const repairPrompt = isEditorial
                    ? `Você retornou ${prompts.length} prompts completos, mas eu preciso de EXATAMENTE ${count}.
Gere APENAS MAIS ${missing} prompts completos, seguindo o mesmo TEMPLATE.
Não repita os prompts já existentes.
Separe cada prompt APENAS pela string "---SEPARATOR---" (sem aspas).

PROMPTS JÁ GERADOS (NÃO REPETIR):
${prompts.map((p, i) => `--- PROMPT ${i + 1} ---\n${p}`).join('\n\n')}`
                    : `Você retornou ${prompts.length} prompts, mas eu preciso de EXATAMENTE ${count}.
Gere APENAS MAIS ${missing} prompts (um por linha), sem numeração, sem bullets, sem markdown.
Não repita os prompts já existentes.

PROMPTS JÁ GERADOS (NÃO REPETIR):
${prompts.map((p) => `- ${p}`).join('\n')}`;

                const repairCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: repairPrompt }
                    ],
                    temperature: 0.4,
                });

                const repairText = repairCompletion.choices?.[0]?.message?.content;
                const extra = parsePrompts(repairText);
                prompts = [...prompts, ...extra].slice(0, count);
            }
        }

        if (prompts.length === 0) {
            throw new Error('Falha ao processar os prompts gerados (formato inválido).');
        }
        // Accept if we got at least 80% of requested prompts, pad with last prompt if needed
        if (prompts.length < count) {
            const minAcceptable = Math.ceil(count * 0.8);
            if (prompts.length >= minAcceptable) {
                console.warn(`⚠️ Aceitando ${prompts.length}/${count} prompts (≥80%). Preenchendo o restante...`);
                while (prompts.length < count) {
                    prompts.push(prompts[prompts.length - 1]); // Duplicate last prompt as fallback
                }
            } else {
                throw new Error(`Falha ao gerar prompts suficientes: ${prompts.length}/${count}`);
            }
        }

        console.log(`✅ ${prompts.length} prompts gerados com sucesso!`);
        prompts.forEach((p, i) => console.log(`   ${i + 1}. ${p.substring(0, 60)}...`));

        // STEP 2: REFINE BACKGROUND PROMPTS (Two-Step Flow)
        if (isEditorial && (context.isPremiumCarousel || context.overlayMode === 'premium')) {
            console.log('🔮 Step 2: Refining background prompts with Art Direction...');
            return await refineBackgroundPrompts(prompts, mergedContext);
        }

        return prompts;

    } catch (error) {
        console.error('❌ Erro ao gerar prompts com OpenAI:', error);
        throw new Error(`Falha na geração de prompts: ${error.message} `);
    }
}

/**
 * Gera o PRÓXIMO prompt do carrossel progressivamente
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} totalCards - Número total de cards
 * @param {number} currentCardIndex - Índice do card atual (0-based)
 * @param {string[]} previousPrompts - Prompts já gerados
 * @returns {Promise<string>} - Prompt para o próximo card
 */
export async function generateNextCarouselPrompt(carouselDescription, totalCards, currentCardIndex, previousPrompts = [], context = {}) {
    try {
        console.log(`🤖 Gerando prompt para card ${currentCardIndex + 1}/${totalCards}...`);

        const { profileDescription, guidelines, savedPrompts } = context;

        let systemContext = '';
        if (profileDescription) systemContext += `\n\nCONTEXTO DO PERFIL:\n${profileDescription}`;
        if (guidelines) systemContext += `\n\nDIRETRIZES DA MARCA (GUIDELINES):\n${guidelines}\nIMPORTANTE: Siga estas diretrizes estritamente para manter a consistência visual.`;

        const systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Você está ajudando a criar um carrossel progressivamente, um card por vez.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ter uma narrativa coerente e progressiva.
${systemContext}`;

        let contextPrompts = '';
        if (previousPrompts.length > 0) {
            contextPrompts = `\n\nPrompts já criados para os cards anteriores:\n${previousPrompts.map((p, i) => `Card ${i + 1}: ${p}`).join('\n')}`;
        }

        const userPrompt = `Crie o prompt para o card ${currentCardIndex + 1} de ${totalCards} de um carrossel do Instagram.

Descrição geral do carrossel: "${carouselDescription}"
${contextPrompts}

IMPORTANTE:
- Este é o card ${currentCardIndex + 1} de ${totalCards}
- O prompt deve continuar a narrativa dos cards anteriores (se houver)
- Seja detalhado e visual
- Use linguagem descritiva adequada para geração de imagens
- Mantenha o estilo visual consistente com os cards anteriores e as Diretrizes da Marca
- Retorne APENAS o prompt, sem numeração ou explicações adicionais`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
        });

        const prompt = completion.choices[0].message.content.trim();
        console.log(`✅ Prompt gerado: ${prompt.substring(0, 60)}...`);

        return prompt;

    } catch (error) {
        console.error('❌ Erro ao gerar próximo prompt:', error);
        throw new Error(`Falha na geração do próximo prompt: ${error.message}`);
    }
}

/**
 * Gera UMA imagem usando Replicate Seedream 4.5
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @returns {Promise<string>} - URL da imagem gerada
 */

// Helper to generate image with Google Gemini (Imagen 3)
async function generateImageWithGemini(prompt, aspectRatio, referenceImage = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    // Map Aspect Ratio for Gemini
    // Supported: "1:1", "3:4", "4:3", "16:9", "9:16"
    const ratioMap = {
        '1:1': '1:1',
        '4:5': '3:4', // Best approximation
        '16:9': '16:9',
        '9:16': '9:16'
    };
    const geminiRatio = ratioMap[aspectRatio] || '1:1';

    console.log(`🤖 Gerando imagem com Gemini (Imagen 3)... Ratio: ${geminiRatio}`);

    // Gemini API translates prompts into internal tool arguments. If the user explicitly asks for "1080 x 1350" or "4:5", 
    // Gemini may try to inject aspect_ratio="1080:1350" or "4:5", which crashes the API with MALFORMED_FUNCTION_CALL 
    // because those aren't valid enum values for the tool (it only accepts 1:1, 3:4, 4:3, 9:16, 16:9).
    const portraitMsg = 'formato retrato vertical (aspect ratio 3:4)';
    const landscapeMsg = 'formato paisagem horizontal (aspect ratio 16:9)';
    const squareMsg = 'formato quadrado perfeito (aspect ratio 1:1)';

    let safePrompt = prompt
        .replace(/\b1080\s*x\s*1350\b|\b1080x1350\b|\b4:5\b/gi, 'TARGET_RATIO_TOKEN')
        .replace(/\b1920\s*x\s*1080\b|\b1920x1080\b/gi, 'TARGET_RATIO_TOKEN_LANDSCAPE')
        .replace(/\b1080\s*x\s*1080\b|\b1080x1080\b/gi, 'TARGET_RATIO_TOKEN_SQUARE')
        .replace(/TARGET_RATIO_TOKEN/g, portraitMsg)
        .replace(/TARGET_RATIO_TOKEN_LANDSCAPE/g, landscapeMsg)
        .replace(/TARGET_RATIO_TOKEN_SQUARE/g, squareMsg);

    // Enforcement: Explicitly prepend the target ratio to help the model internalize the dimension
    safePrompt = `[TARGET ASPECT RATIO: ${geminiRatio}]\n\n${safePrompt}`;

    // Using Gemini 3 Pro Image Preview (Nano Banana Pro)
    // Documentation: https://ai.google.dev/gemini-api/docs/image-generation
    const modelId = 'gemini-3-pro-image-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    // Build parts array — text prompt + optional reference image
    const parts = [{ text: safePrompt }];

    // Handle reference images (single or array)
    const imagesToAttach = Array.isArray(referenceImage) ? referenceImage : (referenceImage ? [referenceImage] : []);

    if (imagesToAttach.length > 0) {
        console.log(`📎 Anexando ${imagesToAttach.length} imagens de referência ao prompt Gemini para edição Image-to-Image...`);

        for (const img of imagesToAttach) {
            let base64Data = img;
            let mimeType = 'image/png';

            // If it's a URL, convert to base64 first
            if (typeof img === 'string' && img.startsWith('http')) {
                const converted = await imageUrlToBase64(img);
                if (converted) {
                    base64Data = converted;
                    // Extract mime type if possible from data URI
                    const mimeMatch = converted.match(/^data:([^;]+);base64,/);
                    if (mimeMatch) mimeType = mimeMatch[1];
                } else {
                    console.warn('⚠️ Base64 conversion failed for URL, skipping this image');
                    continue; // Don't add if conversion failed
                }
            } else {
                // If it's already a Data URI, extract mime type
                const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
                if (mimeMatch) mimeType = mimeMatch[1];
            }

            // Strip data URI prefix if present to get raw base64
            const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: rawBase64
                }
            });
        }
    }

    console.log('📝 Prompt final enviado ao Gemini:', parts[0].text);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
        const payload = {
            contents: [{
                parts: parts
            }],
            generationConfig: {
                // Using simpler config that is known to work with the preview
                temperature: 0.4
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMessage = `Gemini API Error (${response.status})`;
            try {
                const errorText = await response.text();
                // Parse JSON error if possible
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error && errorJson.error.message) {
                        errorMessage = `Gemini Error: ${errorJson.error.message}`;
                    } else {
                        errorMessage = `Gemini Error: ${errorText}`;
                    }
                } catch (e) {
                    errorMessage = `Gemini Error: ${errorText}`;
                }
            } catch (e) {
                errorMessage += ' (failed to read error text)';
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Optimized logging: Do not stringify the entire binary data
        const logData = {
            hasCandidates: !!(data.candidates && data.candidates.length > 0),
            candidateCount: data.candidates?.length,
            firstCandidateParts: data.candidates?.[0]?.content?.parts?.length
        };
        console.log('📦 Gemini API Response Metadata:', JSON.stringify(logData));

        if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];
            console.log(`📋 Gemini finishReason: ${candidate.finishReason || 'N/A'}`);
            if (candidate.safetyRatings) {
                console.log('🛡️ Safety Ratings:', JSON.stringify(candidate.safetyRatings));
            }
        }

        // Use the helper to extract image
        return extractImageFromGemini(data);

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: Gemini demorou muito para responder (>90s).');
        }
        throw error;
    }
}

/**
 * Helper to extract image data from Gemini API response
 */
function extractImageFromGemini(data) {
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
        console.error('❌ Resposta do Gemini em formato inesperado ou vazia:', JSON.stringify(data));

        // Check for specific rejection cases
        if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            throw new Error('Gemini recusou gerar a imagem por política de segurança (SAFETY).');
        }

        throw new Error('Resposta do Gemini em formato inesperado (sem partes)');
    }

    const parts = data.candidates[0].content.parts;
    console.log(`🔍 Analisando ${parts.length} partes da resposta do Gemini...`);

    // Support both camelCase (inlineData) and snake_case (inline_data) depending on API version/proxy
    const imagePart = parts.find(p => p.inlineData || p.inline_data);

    if (imagePart) {
        const inlineData = imagePart.inlineData || imagePart.inline_data;
        const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
        const base64 = inlineData.data;

        // Frontend exibe a imagem no card (não HTML)

/*
---

## Prevenção de Duplicados na Library

Foi implementado um sistema de segurança duplo para evitar arquivos repetidos:

1.  **Backend (Hash + Nome)**:
    *   O backend agora extrai e armazena o `originalName` de cada arquivo enviado.
    *   A verificação por conteúdo (MD5 hash) foi mantida para garantir que imagens identicas com nomes diferentes também sejam detectadas.

2.  **Frontend (Aviso Prévio)**:
    *   Tanto na página de **Library** quanto no **Gerenciador de Uploads**, o sistema agora verifica os nomes dos arquivos selecionados antes de iniciar o upload.
    *   Se um arquivo com o mesmo nome for detectado no perfil selecionado, um aviso aparece: *"As seguintes imagens já existem na biblioteca... Deseja carregar assim mesmo?"*
    *   O usuário pode optar por cancelar ou prosseguir com o upload.
*/
        console.log(`✅ Imagem extraída do Gemini (${mimeType}, len: ${base64?.length || 0})`);

        if (!base64) {
            console.error('❌ Parte de imagem encontrada mas sem dados (base64 vazio)');
            throw new Error('Gemini retornou um slot de imagem mas sem o conteúdo binário.');
        }

        return `data:${mimeType};base64,${base64}`;
    }

    // Fallback if no inline data found but text is present
    const textPart = parts.find(p => p.text);
    if (textPart) {
        console.warn('⚠️ Gemini retornou texto em vez de imagem:', textPart.text);
        throw new Error(`Gemini não gerou imagem. Resposta do texto: "${textPart.text.substring(0, 200)}..."`);
    }

    throw new Error('Nenhuma imagem ou texto válido encontrado na resposta do Gemini');
}



/**
 * Gera prompts similares baseados em um prompt de referência
 * @param {string} basePrompt - Prompt que o usuário gostou
 * @param {number} count - Quantidade de variações para gerar
 * @param {object} context - Contexto do Perfil de Negócio atual
 * @returns {Promise<string[]>} - Array de novos prompts
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

        const responseText = completion.choices[0].message.content;

        if (!responseText) {
            throw new Error('OpenAI retornou uma resposta vazia.');
        }

        let prompts = [];
        try {
            const parsed = JSON.parse(responseText.trim());
            if (parsed.prompts && Array.isArray(parsed.prompts)) {
                prompts = parsed.prompts.filter(p => typeof p === 'string' && p.length > 20);
            } else {
                throw new Error("Formato JSON retornado não contém a chave 'prompts'.");
            }
        } catch (e) {
            console.error('Falha ao dar parse no JSON de variaveis similares:', e);
            throw new Error("Falha ao interpretar resposta estruturada da IA.");
        }

        // Pad with duplicates if exactly count isn't generated
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

/**
 * Gera UMA imagem usando Google Gemini (Prioritário) ou Replicate (Fallback)
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @param {string} brandingStyle - Estilo visual da marca (opcional)
 * @param {boolean} isEditorial - Se verdadeiro, aplica a transformação de prompt editorial antes de gerar
 * @param {object} context - Contexto adicional (branding, etc) para o modo editorial
 * @param {string} model - Modelo de IA a ser utilizado ('gemini' ou 'seedream')
 * @returns {Promise<string>} - URL da imagem gerada (ou Data URI)
 */
async function generateImageWithSeedream(prompt, aspectRatio, referenceImage = null) {
    const apiKey = process.env.SEEDREAM_API_TOKEN;
    if (!apiKey) throw new Error('SEEDREAM_API_TOKEN não configurada');

    // Mapeamento de Aspect Ratio para Size (conforme docs: 2K ou 4K, ou dimensões específicas)
    // Docs Method 2: 2048x2048 default. Range [2560x1440, etc]
    // Vamos usar dimensões específicas recomendadas para garantir o AR correto
    const sizeMap = {
        '1:1': '2048x2048',
        '4:5': '1728x2160', // Adjusted to meet min 3,686,400 pixels (1728*2160 = 3,732,480)
        '16:9': '2560x1440',
        '9:16': '1440x2560'
    };

    // Fallback to "2K" if unknown, but forcing pixels is safer for AR
    const size = sizeMap[aspectRatio] || '2048x2048';

    // Seedream 4.5 Model ID from docs
    const modelId = 'seedream-4-5-251128';
    const url = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

    console.log(`🚀 Contacting BytePlus API for Seedream (${size})...`);

    // Generate random seed
    const seed = Math.floor(Math.random() * 2147483647);

    const payload = {
        model: modelId,
        prompt: prompt,
        size: size,
        watermark: false,
        seed: seed,
        sequential_image_generation: 'disabled',
        response_format: 'url',
        stream: false
    };

    // Handle Reference Image (Image-to-Image) if provided
    // Seedream 4.5 supports array of strings
    if (referenceImage) {
        // If referenceImage is array, use it. If string, wrap in array.
        // Also ensure they are valid URLs or Base64. 
        // Existing code passes Base64 mostly. Docs say: "Base64 encoding: The format must be data:image/<image format>;base64,<Base64 encoding>"
        if (Array.isArray(referenceImage) && referenceImage.length > 0) {
            payload.image = referenceImage;
        } else if (typeof referenceImage === 'string') {
            payload.image = [referenceImage];
        }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMessage = `BytePlus API Error (${response.status})`;
            try {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    if (errorData.error) {
                        if (errorData.error.code === 'ModelNotOpen') {
                            errorMessage = 'Modelo Seedream 4.5 não ativado na conta BytePlus. Ative no console ModelArk.';
                        } else if (errorData.error.message) {
                            errorMessage = errorData.error.message;
                        } else {
                            errorMessage = JSON.stringify(errorData.error);
                        }
                    } else {
                        errorMessage += ': ' + errorText;
                    }
                } catch (jsonError) {
                    errorMessage += ': ' + errorText;
                }
            } catch (e) {
                errorMessage += ' (failed to read error text)';
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Response format: { data: [ { url: "..." } ] }
        if (data.data && data.data.length > 0 && data.data[0].url) {
            return data.data[0].url;
        }

        throw new Error('Nenhuma URL de imagem retornada pela BytePlus API');

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: A geração da imagem demorou mais que 90 segundos.');
        }
        throw error;
    }
}

/**
 * Gera uma única imagem (Abstração principal)
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Proporção da tela
 * @param {string} brandingStyle - Estilo visual da marca
 * @param {boolean} isEditorial - Modo editorial
 * @param {object} context - Contexto do perfil
 * @param {string|string[]} referenceImage - Imagens de referência
 * @param {string} model - Modelo escolhido
 * @returns {Promise<string>} - URL da imagem
 */
export async function generateSingleImage(prompt, aspectRatio = '1:1', brandingStyle = '', isEditorial = false, context = {}, referenceImage = null, model = 'gemini') {
    let finalPrompt = prompt || '';
    const brandKey = context.brandKey || normalizeBrandKey(context);
    const isFitswap = isFitswapBrand({ brandKey, brandName: context.brandName, name: context.name });
    const fitswapProfile = isFitswap ? buildFitswapBrandContext({ ...context, brandKey }) : null;
    const skipLegacyOverlayComposition = Boolean(
        context.skipLegacyOverlayComposition ||
        context.isPremiumCarousel ||
        context.overlayMode === 'premium'
    );

    let enhancedReferenceImages = [
        ...(referenceImage ? (Array.isArray(referenceImage) ? referenceImage : [referenceImage]) : []),
        ...getBrandReferenceImages({
            ...(fitswapProfile || {}),
            brandName: context.brandName,
            name: context.brandName,
            brandKey
        })
    ].filter(Boolean);

    enhancedReferenceImages = [...new Set(enhancedReferenceImages)];

    const isViverMais = (context.brandName && context.brandName.toLowerCase().includes('viver mais')) ||
        finalPrompt.toLowerCase().includes('viver mais');

    if ((isEditorial || isViverMais) && isViverMais) {
        try {
            const logoPath = path.resolve(__dirname, '../assets/logo-viver-mais.png');
            if (fs.existsSync(logoPath)) {
                console.log('🏷️ Injetando logo "Viver Mais" como referência visual...');
                const logoBuffer = fs.readFileSync(logoPath);
                const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                enhancedReferenceImages.push(logoBase64);
            } else {
                console.warn(`⚠️ Logo Viver Mais não encontrado em: ${logoPath}`);
            }
        } catch (error) {
            console.error('⚠️ Erro ao carregar logo Viver Mais:', error);
        }
    }

    const fitswapStructured = parseStructuredFitswapPrompt(finalPrompt);
    const shouldUseFitswapComposition = isFitswap && fitswapStructured.isStructured;

    if (!isViverMais && !shouldUseFitswapComposition && finalPrompt) {
        finalPrompt = finalPrompt.replace(/#[0-9a-fA-F]{6}\b/g, '').replace(/#[0-9a-fA-F]{3}\b/g, '').trim();
    }

    let finalImageUrl = null;

    if (!finalPrompt && context.attachLogo && enhancedReferenceImages.length > 0) {
        console.log('⏭️ Prompt vazio mas attachLogo ativo. Pulando geração de IA e aplicando logo diretamente na imagem original.');
        finalImageUrl = enhancedReferenceImages[0];
    } else {
        if (shouldUseFitswapComposition) {
            console.log('🟢 Prompt Fitswap estruturado detectado. Gerando apenas o background antes da composição editorial.');
            finalPrompt = sanitizeBackgroundPromptForImageGeneration(fitswapStructured.background);
        } else if (finalPrompt.includes('[WHITE_OVERLAY]')) {
            // Extract background scene for the Fitswap white overlay mode
            const bgMatchWO = finalPrompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
            if (bgMatchWO) {
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(bgMatchWO[1].trim());
                console.log('🟢 Prompt WHITE_OVERLAY: extraído background para geração de imagem:', finalPrompt.substring(0, 80) + '...');
            } else {
                // Strip the [WHITE_OVERLAY] and other tags, leaving raw text
                finalPrompt = finalPrompt
                    .replace(/\[WHITE_OVERLAY\]/gi, '')
                    .replace(/\[HEADLINE:[^\]]*\]/gi, '')
                    .replace(/\[HIGHLIGHTS:[^\]]*\]/gi, '')
                    .trim();
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(finalPrompt);
            }
        } else if (finalPrompt.includes('[PREMIUM_OVERLAY]')) {
            // Extract background scene for the Premium overlay mode
            const bgMatchPO = finalPrompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
            if (bgMatchPO) {
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(bgMatchPO[1].trim());
                console.log('🟢 Prompt PREMIUM_OVERLAY: extraído background para geração de imagem:', finalPrompt.substring(0, 80) + '...');
            } else {
                finalPrompt = finalPrompt
                    .replace(/\[PREMIUM_OVERLAY\]/gi, '')
                    .replace(/\[TITLE:[^\]]*\]/gi, '')
                    .replace(/\[HIGHLIGHTS:[^\]]*\]/gi, '')
                    .trim();
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(finalPrompt);
            }
        }

        if (isEditorial && !shouldUseFitswapComposition) {
            console.log(`🎬 MODO EDITORIAL/CARROSSEL ATIVADO (Single Image): Transformando prompt via GPT...`);
            try {
                // Ensure we use the merged context for better results
                const mergedContext = mergeBrandProfileDefaults({ ...context, brandKey });

                const systemPrompt = getEditorialSystemPrompt(finalPrompt, 1, { ...mergedContext, brandingStyle, isEditorial: true });

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Gere o prompt para o card único sobre: "${finalPrompt}"` }
                    ],
                    temperature: 0.7,
                });

                let transformedPrompt = completion.choices[0].message.content.trim();
                transformedPrompt = transformedPrompt
                    .replace(/^```(text|json|markdown)?|```$/g, '')
                    .replace(/---SEPARATOR---/g, '')
                    .trim();

                finalPrompt = transformedPrompt.replace(/#[0-9a-fA-F]{6}\b/g, '').replace(/#[0-9a-fA-F]{3}\b/g, '').trim();
            } catch (error) {
                console.error('⚠️ Falha na transformação do prompt editorial, usando original:', error);
                finalPrompt = `${finalPrompt}\n\nVISUAL STYLE: ${brandingStyle}`;
            }
        } else if (!shouldUseFitswapComposition) {
            if (brandingStyle) {
                finalPrompt += `\n\nVISUAL STYLE: ${brandingStyle}`;
            }
        }

        // For Premium Carousel mode, sanitize any remaining text/overlay instructions
        // The background image must be clean — text is added via client-side canvas overlay
        if (skipLegacyOverlayComposition) {
            // Remove any "On-screen text" sections that GPT may have generated
            finalPrompt = finalPrompt
                .replace(/On-screen text\s*\(Overlay\)[\s\S]*?(?=\n\n|Background:|Visual effects:|$)/gi, '')
                .replace(/Main phrase:\s*"[^"]*"/gi, '')
                .replace(/Optional subtext:\s*"[^"]*"/gi, '')
                .replace(/Font:\s*Inter\s*(Medium|Bold|Regular)[.,]?\s*/gi, '')
                .replace(/Color:\s*Dark Gray\s*\([^)]*\)[.,]?\s*/gi, '')
                .trim();
            // Prepend a strong no-text directive
            finalPrompt = `[CRITICAL INSTRUCTION: Generate ONLY the photographic scene. DO NOT render any text, letters, words, headlines, typography, or UI elements on the image. The image must contain NO readable characters whatsoever.]\n\n${finalPrompt}`;
        }

        finalPrompt = finalPrompt.replace(/#[0-9a-fA-F]{6}\b/g, '').replace(/#[0-9a-fA-F]{3}\b/g, '').trim();
        finalPrompt = enforceFitswapPromptGuardrails(finalPrompt, { ...context, brandKey });

        if (context.attachLogo) {
            finalPrompt += `\n\n[INSTRUÇÃO DO SISTEMA]: A arte gerada NÃO PODE CONTER LOGOMARCAS, ASSINATURAS OU MARCAS D'ÁGUA ("Inner Boost" ou outras). A logomarca oficial do cliente será inserida eletronicamente pelo nosso sistema na imagem final, então mantenha os cantos inferiores limpos para encaixe perfeito. Foque absolutamente apenas no conceito criativo solicitado no prompt.`;
        }

        if (model === 'gemini' && process.env.GEMINI_API_KEY) {
            try {
                finalImageUrl = await generateImageWithGemini(finalPrompt, aspectRatio, enhancedReferenceImages);
                console.log(`📡 finalImageUrl após Gemini: type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 100) : 'NOT_A_STRING'}`);
            } catch (geminiError) {
                console.error('⚠️ Falha no Gemini, tentando Replicate (Fallback)...', geminiError.message);
            }
        } else if (model === 'seedream') {
            console.log('🤖 Usando modelo Seedream 4.5 (via BytePlus)...');
            try {
                finalImageUrl = await generateImageWithSeedream(finalPrompt, aspectRatio, enhancedReferenceImages.length > 0 ? enhancedReferenceImages : null);
                console.log(`📡 finalImageUrl após Seedream (BytePlus): type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 100) : 'NOT_A_STRING'}`);
            } catch (seedreamError) {
                console.error('⚠️ Falha no Seedream (BytePlus):', seedreamError.message);
                if (!process.env.REPLICATE_API_TOKEN) throw seedreamError;
            }
        }
    }

    console.log(`📡 finalImageUrl antes do Replicate Fallback: type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 50) : 'NOT_A_STRING'}`);

    // 2. Replicate (Fallback) if not generated yet
    if (!finalImageUrl) {
        // Seedream 4.5 only supports: "match_input_image", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"
        const aspectRatioMap = {
            '1:1': '1:1',
            '4:5': '3:4', // Map 4:5 to 3:4 for Seedream compatibility
            '16:9': '16:9',
            '9:16': '9:16'
        };

        const replicateAspectRatio = aspectRatioMap[aspectRatio] || '1:1';

        // Generate random seed to ensure variety
        const seed = Math.floor(Math.random() * 2147483647);
        console.log(`🎲 Seed gerada: ${seed}`);

        let input = {
            prompt: finalPrompt,
            aspect_ratio: replicateAspectRatio,
            seed: seed,
            disable_safety_checker: true,
            safety_tolerance: 5
        };
        // Default behavior for other aspect ratios (1:1, 16:9, 9:16)
        // input block is already set above correctly
        
        // 3. Fallback to Replicate (Flux/Other)
        if (!process.env.REPLICATE_API_TOKEN) {
            throw new Error('Todas as tentativas falharam e REPLICATE_API_TOKEN não está configurado.');
        }

        const client = replicate; // Always use default replicate client here as fallback

        console.log(`🚀 Enviando requisição para Replicate (Fallback/Default)...`);

        if (enhancedReferenceImages.length > 0) {
            input.image = enhancedReferenceImages;
        }

        const output = await client.run('bytedance/seedream-4.5', { input });

        if (output && output.length > 0) {
            // Replicate output[0] can be a string (URL) or an object with a .url property
            const rawOutput = typeof output[0] === 'string' ? output[0] : (output[0].url ? (typeof output[0].url === 'function' ? output[0].url() : output[0].url) : output[0]);
            finalImageUrl = String(rawOutput); // Force to string to prevent .startsWith( issues with URL objects
            console.log(`📡 finalImageUrl após Replicate (Fallback): type=${typeof finalImageUrl}, value=${finalImageUrl.substring(0, 100)}`);
        } else {
            throw new Error('Nenhuma imagem retornada pela API (Replicate e Gemini falharam)');
        }
    }

    console.log(`📡 finalImageUrl após toda geração: type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 50) : 'NOT_A_STRING'}`);

    // POST-PROCESSING: Composite Logo if requested
    if (finalImageUrl && context.attachLogo) {
        const logoBasename = brandKey === 'inner-boost' ? 'inner-boost-logo.png' : 
                             brandKey === 'viver-mais' ? 'logo-viver-mais.png' : 'logo.png';
        const logoPath = path.resolve(__dirname, `../assets/${logoBasename}`);
        
        if (fs.existsSync(logoPath)) {
            console.log(`🖼️ Aplicando logo ${logoBasename} pixel-perfect com Sharp...`);
            finalImageUrl = await compositeLogoOverlay(finalImageUrl, logoPath);
        } else {
            console.warn('⚠️ Não foi possível aplicar logo: arquivo não encontrado', logoPath);
        }
    }

    // [WHITE_OVERLAY] mode: Fitswap white gradient + lime highlight bar template
    const isWhiteOverlay = prompt && prompt.includes('[WHITE_OVERLAY]');

    // Detect if the prompt was a unified carousel template (BACKGROUND+HEADLINE structure)
    const isCarouselStructured = !isWhiteOverlay && prompt && prompt.includes('[BACKGROUND:') && prompt.includes('[HEADLINE:');

    if (finalImageUrl && isWhiteOverlay && !skipLegacyOverlayComposition) {
        console.log('🟢 Aplicando composição Fitswap White Overlay...');
        const hlMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
        const headline = hlMatch ? hlMatch[1].trim() : '';
        const highlights = hgMatch ? hgMatch[1].trim().split(',').map(s => s.trim().toUpperCase()) : [];
        const logoUrl = context.branding?.logoUrl || context.branding?.logo || null;
        finalImageUrl = await createFitswapWhiteComposition(finalImageUrl, {
            headline,
            highlights,
            brandName: context.brandName || context.name || 'Fitswap',
            logoUrl,
            options: { primaryColor: '#A6F000' }
        });
        console.log(`📡 finalImageUrl após createFitswapWhiteComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && isCarouselStructured && !skipLegacyOverlayComposition) {
        console.log('🧱 Aplicando composição editorial Carrossel (structured overlay)...');
        const bgMatch = prompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
        const hlMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
        const subMatch = prompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
        const headline = hlMatch ? hlMatch[1].trim() : '';
        const subheadline = subMatch ? subMatch[1].trim() : '';
        const highlights = hgMatch ? hgMatch[1].trim().split(',').map(s => s.trim().toUpperCase()) : [];
        const logoUrl = context.branding?.logoUrl || context.branding?.logo || null;
        finalImageUrl = await createScientificComposition(finalImageUrl, headline, subheadline, highlights, logoUrl, {
            primaryColor: context.branding?.primaryColor || context.primaryColor,
            brandName: context.brandName || context.name || 'Sua Marca'
        });
        console.log(`📡 finalImageUrl após createScientificComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && prompt && prompt.includes('[PREMIUM_OVERLAY]') && !skipLegacyOverlayComposition) {
        console.log('🟢 Aplicando composição Premium Overlay...');
        const titleMatch = prompt.match(/\[TITLE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const highlights = hgMatch ? hgMatch[1].trim().split(',').map(s => s.trim().toUpperCase()) : [];
        
        const logoUrl = context.branding?.logoUrl || context.branding?.logo || null;
        
        // Use brand icons if available
        let logoIcon = '🧠'; // Default
        if (context.brandKey === 'fitswap') logoIcon = '🍎';
        if (context.brandKey === 'viver-mais') logoIcon = '✨';

        finalImageUrl = await createPremiumComposition(finalImageUrl, {
            title,
            highlights,
            brandName: context.brandName || context.name || 'Empresa',
            logoUrl,
            primaryColor: context.branding?.primaryColor || context.primaryColor,
            logoIcon: context.branding?.logoIcon || logoIcon
        });
        console.log(`📡 finalImageUrl após createPremiumComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && shouldUseFitswapComposition && !skipLegacyOverlayComposition) {
        console.log('🧱 Aplicando composição editorial Fitswap...');
        finalImageUrl = await createFitswapComposition(finalImageUrl, {
            headline: fitswapStructured.headline,
            subheadline: fitswapStructured.subheadline,
            highlights: fitswapStructured.highlights,
            logoUrl: fitswapProfile?.branding?.logoUrl || fitswapProfile?.branding?.logo || null,
            aspectRatio,
            options: {
                primaryColor: fitswapProfile?.branding?.primaryColor || context.primaryColor,
                secondaryColor: fitswapProfile?.branding?.secondaryColor || context.secondaryColor,
                bodyColor: '#6B7280',
                brandName: fitswapProfile?.name || context.brandName || 'Fitswap'
            }
        });
        console.log(`📡 finalImageUrl após createFitswapComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && skipLegacyOverlayComposition) {
        console.log('⏭️ Composição legada ignorada. Retornando apenas o background bruto para overlay no cliente.');
    }

    // Convert Base64 payload (such as from Gemini or compositeLogoOverlay) into a public cloud storage URL 
    // to prevent Firestore crashes (1MB limit) when saving to user profile
    if (finalImageUrl && typeof finalImageUrl === 'string' && finalImageUrl.startsWith('data:image/')) {
        finalImageUrl = await uploadBase64ToFirebase(finalImageUrl);
    }

    if (finalImageUrl && typeof finalImageUrl !== 'string') {
        finalImageUrl = String(finalImageUrl);
    }
    
    return finalImageUrl;
}

/**
 * Gera imagens usando Replicate Seedream 4.5 (modo simples)
 * @param {boolean} isEditorial - Se verdadeiro, ativa o modo editorial
 * @param {object} context - Contexto adicional
 * @returns {Promise<string[]>} - URLs das imagens geradas
 */
export async function generateImages(prompt, aspectRatio = '1:1', count = 1, brandingStyle = '', isEditorial = false, context = {}, referenceImage = null, model = 'gemini') {
    try {
        console.log('🎨 Gerando imagens com Replicate (modo simples)...');
        console.log(`🖼️ PROMPT GERADO (Single Image):\n${prompt}`); // Explicit Log for Single Image Mode
        console.log(`Aspect Ratio: ${aspectRatio}`);
        console.log(`Count: ${count}`);

        const allImages = [];

        // Gerar imagens uma por vez com o mesmo prompt
        for (let i = 0; i < count; i++) {
            console.log(`Gerando imagem ${i + 1}/${count}...`);
            const imageUrl = await generateSingleImage(prompt, aspectRatio, brandingStyle, isEditorial, context, referenceImage, model);
            allImages.push(imageUrl);
            console.log(`✅ Imagem ${i + 1} gerada: ${imageUrl}`);
        }

        console.log(`🎉 Total de ${allImages.length} imagens geradas com sucesso!`);
        return allImages;

    } catch (error) {
        console.error('❌ Erro ao gerar imagens:', error);
        throw new Error(`Falha na geração de imagens: ${error.message}`);
    }
}

/**
 * Gera carrossel inteligente: usa OpenAI para criar prompts individuais e Replicate para gerar as imagens
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @param {number} count - Número de cards/imagens
 * @returns {Promise<{images: string[], prompts: string[]}>} - URLs das imagens e prompts usados
 */
export async function generateCarousel(promptsOrDescription, aspectRatio = '1:1', count = 1, brandingStyle = '', model = 'gemini', context = {}, businessProfileId = null) {
    try {
        console.log('🎪 Iniciando geração de carrossel inteligente...');
        
        let individualPrompts = [];
        const isArray = Array.isArray(promptsOrDescription);
        
        if (isArray) {
            individualPrompts = promptsOrDescription;
            console.log(`Utilizando ${individualPrompts.length} prompts fornecidos diretamente.`);
        } else {
            console.log(`Gerando ${count} prompts para a descrição: ${promptsOrDescription}`);
            individualPrompts = await generateCarouselPrompts(promptsOrDescription, count, { isEditorial: true });
        }

        if (!isArray && individualPrompts.length < count) {
            console.warn(`⚠️ OpenAI gerou apenas ${individualPrompts.length} prompts ao invés de ${count}`);
        }

        // Passo 2: Gerar cada imagem com seu próprio prompt
        const allImages = [];
        for (let i = 0; i < individualPrompts.length; i++) {
            const currentPrompt = individualPrompts[i];
            console.log(`\n📸 Gerando card ${i + 1}/${individualPrompts.length}...`);
            
            // Defesa adicional: garantir que o prompt enviado para geração seja uma string
            const safePrompt = String(currentPrompt || '');
            console.log(`📡 Prompt ${i + 1} type: ${typeof safePrompt}`);

            // Pass context and businessProfileId to generateSingleImage
            const imageUrl = await generateSingleImage(safePrompt, aspectRatio, brandingStyle, false, context, null, model, businessProfileId);
            allImages.push(imageUrl);

            console.log(`✅ Card ${i + 1} gerado com sucesso!`);
        }

        console.log(`\n🎉 Carrossel completo! ${allImages.length} imagens geradas.`);

        return {
            images: allImages,
            prompts: individualPrompts
        };
    } catch (error) {
        console.error('❌ Erro ao gerar carrossel:', error);
        throw error;
    }
}



/**
 * Gera legenda para imagem usando GPT-4o (Vision)
 * @param {string} imageUrl - URL da imagem
 * @param {string} profileName - Nome do perfil (para contexto)
 * @param {string} profileDescription - Descrição do perfil
 * @param {string} guidelines - Diretrizes da marca
 * @returns {Promise<string>} - Legenda gerada
 */
export async function generateImageCaption(imageUrl, profileName, profileDescription, guidelines) {
    try {
        console.log(`👁️ Analisando imagem para gerar legenda (Perfil: ${profileName})...`);

        // Detect brand for language and tone
        const brandKey = normalizeBrandKey({ brandName: profileName });
        const preset = getBrandPreset(brandKey);
        
        const language = preset?.brandKit?.preferredLanguage || 'Portuguese (Brazil)';
        const tone = preset?.brandKit?.personality || 'Engajador e profissional';

        const systemPrompt = `You are an expert Social Media Manager. your task is to write a caption for an Instagram post based on the image provided.
        
Context:
- Profile Name: ${profileName || 'Business Profile'}
- Profile Description: ${profileDescription || 'N/A'}
- Brand Guidelines: ${guidelines || 'N/A'}
- Target Language: ${language}
- Tone: ${tone}

Instructions:
1. Analyze the image visually.
2. Write a caption that relates the image content to the profile's niche.
3. Use the specified language (${language}) ONLY.
4. If Brand Guidelines are provided, strictly follow them.
5. Return ONLY the caption text. No "Here is the caption" or quotes.
6. The caption should be concise, engaging, and encourage interaction.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Write an amazing caption for this image." },
                        {
                            type: "image_url",
                            image_url: {
                                "url": imageUrl,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 300,
        });

        const caption = response.choices[0].message.content.trim();
        console.log('✅ Legenda gerada com sucesso');
        return caption;

    } catch (error) {
        console.error('❌ Erro ao gerar legenda com visão:', error);
        throw new Error(`Falha na geração de legenda: ${error.message}`);
    }
}

/**
 * Gera ideias de posts baseadas no perfil do negócio
 * @param {Object} context - Contexto do perfil (descrição, guidelines, etc)
 * @returns {Promise<Array>} - Array de ideias estruturadas
 */
export async function generatePostIdeas(context = {}) {
    try {
        console.log('💡 Gerando ideias de posts...');
        const { profileName, profileDescription, guidelines, recentPosts, brandContext, isBatchMode, count } = context;
        const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName: profileName || context.brandName });
        const brandDisplayName = isFitswap ? 'Fitswap' : (profileName || 'Negócio Genérico');

        let systemContext = `PERFIL: ${brandDisplayName}\nDESCRIÇÃO: ${profileDescription || 'Não informada'}`;
        if (brandContext) systemContext += `\nSOBRE A MARCA (CONTEXTO DETALHADO): ${brandContext}`;
        if (context.contentStrategy) systemContext += `\nESTRATÉGIA DE CONTEÚDO / PILARES: ${context.contentStrategy}`;
        if (guidelines) systemContext += `\nDIRETRIZES: ${guidelines}`;

        console.log(`🔍 [generatePostIdeas] DEBUG: isBatchMode=${isBatchMode} (type: ${typeof isBatchMode})`);

        let systemPrompt = '';
        let userPrompt = '';

        if (isBatchMode) {
            console.log('🔹 [generatePostIdeas] Using BATCH MODE (Single Posts)');
            systemPrompt = `Você é um copywriter sênior experiente.

Sua tarefa é transformar qualquer tema em ideias de POST ESTÁTICO (Imagem Única independentes) seguindo EXATAMENTE este template de alta conversão:

0) TEMA / CONTEÚDO (classificação clara em 1 linha)
1) HEADLINE (máx. 5 palavras, atrativa, sem hype excessivo)
2) SUBHEADLINE (benefício racional curto)
3) FRASE DE PRODUTO/MARCA (o que a marca/produto faz, direto)
4) FRASE IDENTITÁRIA (emocional, conectada aos valores da marca)
5) CTA (convite suave, interativo)
6) DESCRIÇÃO DA IMAGEM (guia visual para IA)

Na seção TEMA / CONTEÚDO:
- Indique a linha editorial e o objetivo do post (ex: autoridade, conversão, identificação emocional).
- Seja direto. Uma linha apenas.

Na seção DESCRIÇÃO DA IMAGEM:
- Descreva de forma objetiva o cenário visual (Ambiente, Pessoa, Ação, Estilo Fotográfico).
- Siga rigorosamente a paleta de cores e identidade descritas no contexto do cliente.
- O post deve comunicar clareza, funcionalidade ou emoção de acordo com a marca.

CONTEXTO DO CLIENTE:
${systemContext}

FORMATO DE SAÍDA (JSON Object):
{
  "ideas": [
    {
      "title": "Headline principal do post",
      "description": "Conteúdo completo formatado em Markdown seguindo o template abaixo",
      "type": "static",
      "slideCount": 1,
      "reason": "Por que esta ideia funciona para o público"
    }
  ]
}

REGRAS PARA 'description':
O campo 'description' deve conter TODO o conteúdo do post formatado em Markdown, seguindo ESTRITAMENTE este formato:

**TEMA / CONTEÚDO:**
[linha editorial + objetivo]

**HEADLINE:**
[texto curto]

**SUBHEADLINE:**
[texto racional]

**FRASE DE PRODUTO:**
[texto funcional]

**FRASE IDENTITÁRIA:**
[texto emocional]

**CTA:**
[texto suave]

**DESCRIÇÃO DA IMAGEM:**
[descrição objetiva da cena e cores]`;

            userPrompt = `Gere ${count || 3} ideias de posts variados (posts estáticos/únicos) focados no contexto desta marca.`;

        } else {
            // --- MODO CARROSSEL (News / Insight Style) ---
            systemPrompt = `Você é um estrategista de conteúdo para Instagram experiente.
Sua tarefa é gerar ${count || 3} ideias de posts altamente engajadores e relevantes para o perfil fornecido.

CONTEXTO DO CLIENTE:
${systemContext}

OBJETIVO DA ARQUITETURA DE INFORMAÇÃO:
Criar ${count || 3} sugestões de carrosséis focados no estilo "news / insight".
A ESTRUTURA É RIGOROSA:
- NÃO USE estrutura de título + subtítulo explicativo.
- USE "curiosity hooks" (ganchos de curiosidade).
- O tom deve soar como uma revelação surpreendente, não como uma aula.
- Concentre-se no lado psicológico, científico ou em uma quebra de mito.
- Eles não parecem conteúdo educativo. Eles parecem descoberta científica, insight secreto ou informação privilegiada.`;

            userPrompt = `Gere ${count || 3} ideias de posts no formato JSON.
Para cada ideia inclua:
- title: Título da Ideia
- description: Estrutura do post (Roteiro em Bullet points)
- type: 'carousel' ou 'static'
- slideCount: número sugerido de slides (entre 4 e 10 para carrosseis, 1 para static)
- reason: Por que essa ideia vai funcionar (1 frase curta)

    Retorne APENAS o JSON válido no formato:
    {
      "ideas": [
        { 
            "title": "...", 
            "description": "...", 
            "type": "carousel", 
            "slideCount": 8, 
            "reason": "..." 
        },
        ...
      ]
    }

    IMPORTANTE SOBRE O CAMPO 'description':
    - O campo 'description' deve descrever o roteiro do post usando Markdown.
    - O campo DEVE OBRIGATORIAMENTE conter:
       1) O número de cards sugerido.
       2) Uma descrição detalhada e breve da IMAGEM DE FUNDO mestre a ser gerada para toda a sequência (cenário visual, cores, mood).
       3) O texto EXATO que cada card (do 1 até o último) deve ter escrito.
    - O texto dos cards DEVE seguir a fórmula de News-Style Hook: CURIOSITY -> SURPRISING FACT -> BRAIN / SCIENCE ANGLE -> SHORT SENTENCES.
    
    EXEMPLO DE 'description' PARA CARROSSEL (News-Style):
        "**Número de Cards Sugerido:** 5\n\n**Imagem de Fundo:** Fotografia lifestyle vertical premium, fundo branco clean com iluminação natural suave, sem distrações.\n\n**Card 1:** A PROCRASTINAÇÃO NÃO É PREGUIÇA. É rejeição emocional.\n\n**Card 2:** Quando a tarefa é desconfortável, o cérebro busca um alívio imediato na dopamina barata.\n\n**Card 3:** Não é um problema de gestão de tempo, mas sim de incapacidade de gerir emoções.\n\n**Card 4:** A solução não é forçar mais disciplina. É diminuir radicalmente a resistência emocional inicial.\n\n**Card 5:** Ação: Comece ridiculamente pequeno. Sente na cadeira, apenas abra o arquivo e aguarde."
`;
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        const parsed = JSON.parse(content);
        const ideas = parsed.ideas || parsed;

        console.log(`✅ ${ideas.length} ideias geradas com sucesso!`);
        return ideas;

    } catch (error) {
        console.error('❌ Erro ao gerar ideias:', error);
        throw new Error(`Falha na geração de ideias: ${error.message} `);
    }
}

/**
 * Helper to fetch an image from a URL and convert it to a base64 Data URI
 */
async function imageUrlToBase64(url) {
    try {
        if (!url || !url.startsWith('http')) return url;
        console.log('🌐 Fetching image for base64 conversion:', url.substring(0, 50) + '...');

        // Use a custom agent to skip SSL verification if needed (common in local dev/proxy issues)
        const https = await import('https');
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            httpsAgent: httpsAgent
        });

        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/png';
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error('❌ Failed to convert image URL to base64:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data (truncated):', error.response.data?.toString().substring(0, 100));
        }
        return null;
    }
}

/**
 * Extrai o estilo visual de um prompt existente
 * @param {string} prompt - O prompt de referência
 * @returns {Promise<string>} - Lista de palavras-chave do estilo
 */
export async function extractStyleFromPrompt(prompt) {
    try {
        console.log('🎨 Extraindo estilo do prompt...');

        const systemPrompt = `Você é um especialista em direção de arte e engenharia de prompt para IA.
Sua tarefa é analisar um prompt de geração de imagem e extrair APENAS os elementos que definem o ESTILO VISUAL.

            Ignore: O sujeito da imagem(quem / o quê está na cena).
Foque em:
        - Estilo artístico(ex: Cyberpunk, Minimalista, Pintura a óleo)
            - Iluminação(ex: Neon light, Natural lighting, Golden hour)
            - Paleta de cores(ex: Pastel tones, Dark moody colors)
                - Renderização / Mídia(ex: 3D render, Octane render, Photography, 8k)
                - Vibe / Atmosfera(ex: Futuristic, Melancholic, Cheerful)

Retorne APENAS uma lista de palavras - chave separadas por vírgula em INGLÊS(pois funciona melhor para geração de imagens).`;

        const userPrompt = `Extraia o estilo visual deste prompt:
        "${prompt}"

Retorne APENAS as keywords de estilo.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.5,
        });

        const style = completion.choices[0].message.content.trim();
        console.log(`✅ Estilo extraído: ${style} `);
        return style;

    } catch (error) {
        console.error('❌ Erro ao extrair estilo:', error);
        throw new Error(`Falha na extração de estilo: ${error.message} `);
    }
}


/**
 * Gera variações de conceitos de post baseados em uma ideia central e contexto da marca
 * @param {string} baseIdea - Ideia central ou tópico
 * @param {number} count - Número de variações
 * @param {object} context - Contexto da marca (brandContext, etc)
 * @returns {Promise<Array<{headline: string, visualConcept: string, captionDraft: string}>>}
 */
export async function generateVariations(baseIdea, count, context = {}) {
    try {
        console.log(`🧠 Gerando ${count} variações para a ideia: "${baseIdea}"...`);

        const { brandName, brandContext, targetAudience, tone, guidelines, contentStrategy } = context;
        const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName });

        const systemPrompt = `Você é um copywriter sênior da marca ${isFitswap ? 'Fitswap' : (brandName || 'Marca')}.

Sua tarefa é expandir uma "Ideia Central" em ${count} posts completíssimos, seguindo ESTRITAMENTE o "TEMPLATE FIXO ${isFitswap ? 'FITSWAP' : 'DA MARCA'}":

0) TEMA / CONTEÚDO (classificação clara em 1 linha)
1) HEADLINE (máx. 5 palavras, sem hype)
2) SUBHEADLINE (benefício racional curto)
3) FRASE DE PRODUTO (o que o app faz, direto)
4) FRASE IDENTITÁRIA (emocional, humana)
5) CTA (convite suave, sem pressão)
6) DESCRIÇÃO DA IMAGEM (guia para design/IA)

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Sobre: ${brandContext || 'Não informado'}
- Público: ${targetAudience || 'Geral'}
- Tom: ${tone || 'Profissional e Engajador'}
${contentStrategy ? `- Estratégia/Pilares: ${contentStrategy}` : ''}
${guidelines ? `- Diretrizes de Marca: ${guidelines}` : ''}

FORMATO DE SAÍDA (JSON array):
[
    {
        "headline": "MARKDOWN COMPLETO DO POST, seguindo o template abaixo",
        "visualConcept": "PROMPT DE IMAGEM COMPLETO EM INGLÊS",
        "captionDraft": "Resumo da legenda"
    }
]

REGRAS PARA 'headline':
O campo 'headline' deve conter TODO o conteúdo do post formatado em Markdown, seguindo ESTRITAMENTE este formato:

**TEMA / CONTEÚDO:**
[linha editorial + objetivo]

**HEADLINE:**
[texto curto]

**SUBHEADLINE:**
[texto racional]

**FRASE DE PRODUTO:**
[texto funcional]

**FRASE IDENTITÁRIA:**
[texto emocional]

**CTA:**
[texto suave]

**DESCRIÇÃO DA IMAGEM:**
[descrição objetiva da cena]

---

REGRAS PARA 'visualConcept' (Prompt de Imagem):
O campo 'visualConcept' deve ser o PROMPT FINAL PARA A IA DE IMAGEM (em Inglês), seguindo este modelo:

"A premium editorial lifestyle photo (4:5, 1080x1350), soft natural light, clean modern kitchen, calm atmosphere. A realistic person (25-40y) holding a smartphone with subtle Neon Lime glow. Expression: confidence. TEXT OVERLAY: '[HEADLINE DO POST]'. Typography: Modern, Bold, High Contrast."`;



        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Ideia Central: "${baseIdea}"\nQuantidade: ${count} ` }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content;
        const parsed = JSON.parse(responseContent);

        // Handle inconsistent JSON structures (some models wrap in a key like "variations")
        const variations = Array.isArray(parsed) ? parsed : (parsed.variations || parsed.posts || []);

        return variations.slice(0, count);

    } catch (error) {
        console.error('❌ Erro ao gerar variações:', error);
        throw new Error(`Falha na geração de variações: ${error.message} `);
    }
}

export async function generateRelatedIdeas(baseIdea, count, context = {}) {
    try {
        console.log(`🧠 Gerando ${count} ideias relacionadas à base: \"${baseIdea}\"...`);

        const { brandName, brandContext, targetAudience, tone } = context;
        const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName });

        const systemPrompt = `Você é um copywriter sênior da marca ${isFitswap ? 'Fitswap' : (brandName || 'Marca')}.

Sua tarefa é expandir uma "Ideia Semente" em ${count} ideias de POSTS ESTÁTICOS NOVOS, seguindo EXATAMENTE este template:

0) TEMA / CONTEÚDO (classificação clara em 1 linha)
1) HEADLINE (máx. 5 palavras, sem hype)
2) SUBHEADLINE (benefício racional curto)
3) FRASE DE PRODUTO (o que o app faz, direto)
4) FRASE IDENTITÁRIA (emocional, humana)
5) CTA (convite suave, sem pressão)
6) DESCRIÇÃO DA IMAGEM (guia para design/IA)

IDEIA SEMENTE (BASE):
"${baseIdea}"

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Sobre: ${brandContext || 'Não informado'}
- Público: ${targetAudience || 'Geral'}
- Tom: ${tone || 'Profissional e Engajador'}

FORMATO DE SAÍDA (JSON Object):
{
  "ideas": [
    {
      "title": "Headline do Post",
      "description": "Conteúdo completo formatado em Markdown seguindo o template abaixo",
      "reason": "Por que esse ângulo funciona"
    }
  ]
}

REGRAS PARA 'description':
O campo 'description' deve conter TODO o conteúdo do post formatado em Markdown, seguindo ESTRITAMENTE este formato:

**TEMA / CONTEÚDO:**
[linha editorial + objetivo]

**HEADLINE:**
[texto curto]

**SUBHEADLINE:**
[texto racional]

**FRASE DE PRODUTO:**
[texto funcional]

**FRASE IDENTITÁRIA:**
[texto emocional]

**CTA:**
[texto suave]

**DESCRIÇÃO DA IMAGEM:**
[descrição objetiva da cena]`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Ideia Semente: \"${baseIdea}\"\nQuantidade: ${count}` }
            ],
            temperature: 0.8, // Slightly higher temperature for creativity
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content;

        let parsed;
        try {
            parsed = JSON.parse(responseContent);
        } catch (e) {
            // Try to extract JSON from markdown
            const match = responseContent.match(/```json\n([\s\S]*?)\n```/) || responseContent.match(/```\n([\s\S]*?)\n```/);
            if (match) {
                try {
                    parsed = JSON.parse(match[1]);
                } catch (e2) {
                    console.error('Failed to parse extracted JSON:', match[1]);
                    throw new Error('Invalid JSON format from AI');
                }
            } else {
                throw new Error('Could not parse AI response as JSON');
            }
        }

        const ideas = Array.isArray(parsed) ? parsed : (parsed.ideas || parsed.posts || parsed.variations || []);

        return ideas.slice(0, count);

    } catch (error) {
        console.error('❌ Erro ao gerar ideias relacionadas:', error);
        throw new Error(`Falha na geração de ideias relacionadas: ${error.message}`);
    }
}

export async function generateImagePrompt(concept, context = {}) {
    try {
        console.log(`🎨 Gerando prompt de imagem para conceito: \"${concept.substring(0, 50)}...\"`);

        const { brandName, brandContext, brandingStyle, savedPrompts, contentStrategy } = context;
        const guidelines = context.branding?.guidelines || '';

        // Limit saved prompts to 3 examples
        const recentPrompts = savedPrompts && Array.isArray(savedPrompts) ? savedPrompts.slice(0, 3) : [];
        const savedPromptsText = recentPrompts.length > 0
            ? `\nEXAMPLES OF STYLE (Follow these): \n${recentPrompts.map(p => `"${p.text || p}"`).join('\n')}`
            : '';

        // Tenta extrair Headline e Subheadline do markdown para garantir o overlay
        let extractedHeadline = '';
        let extractedSubheadline = '';

        try {
            const lines = concept.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                // Procura por # Headline ou **Headline**
                if (!extractedHeadline && (trimmed.startsWith('# ') || trimmed.startsWith('**'))) {
                    extractedHeadline = trimmed.replace(/^#\s*/, '').replace(/\*\*/g, '').replace(':', '').trim();
                }
                // Procura por ### Subheadline ou apenas texto logo abaixo
                else if (!extractedSubheadline && trimmed.length > 10 && !trimmed.startsWith('#') && !trimmed.startsWith('**')) {
                    // Check se é uma linha de conteúdo relevante (não separador)
                    extractedSubheadline = trimmed.replace(/\*\*/g, '').trim();
                }
                // Se achou subheadline com marcardor específico
                if (trimmed.includes('🔹 SUBHEADLINE')) {
                    // A próxima linha provavelmente é a subheadline
                    const index = lines.indexOf(line);
                    if (lines[index + 1]) {
                        extractedSubheadline = lines[index + 1].trim().replace(/\*\*/g, '');
                    }
                }
            }
        } catch (e) {
            console.warn('Falha ao extrair headline/subheadline manualmente:', e);
        }

        const overlayInstruction = extractedHeadline
            ? `Overlay text (color: ${context.branding?.primaryColor || 'White'} or contrasting): "${extractedHeadline.toUpperCase()}"\n"${extractedSubheadline}"`
            : `Overlay text (color: ${context.branding?.primaryColor || 'White'} or contrasting): [HEADLINE]\n[SUBHEADLINE]`;

        // Check if there is a specific reference style to adapt
        const referencePrompt = context.referenceStyle || (savedPrompts && savedPrompts.length > 0 ? (savedPrompts[0].text || savedPrompts[0]) : null);

        let systemPrompt = '';

        if (isFitswapBrand({ brandKey: context.brandKey, brandName })) {
            console.log('💎 Using EXCLUSIVE FITSWAP MASTER TEMPLATE');

            systemPrompt = `Você é um Diretor de Arte Sênior da Fitswap.
Sua missão é converter o "Conceito Visual" em um PROMPT DE IMAGEM seguindo RIGOROSAMENTE o "MODELO-MESTRE FITSWAP".

NUNCA desvie da estrutura. NUNCA invente estilos fora do guideline.

DIRETRIZES FITSWAP:
- Cena Visual: DEVE VARIAR dependendo do conceito. Pode ser um ambiente clean, um close-up, uma textura, ou um sujeito. Não repita sempre "mulher na cozinha".
- Background: ultra-clean premium environment with soft daylight, organized surfaces, no clutter.
- Palette: White (#FFFFFF), Dark Gray (#111827), Medium Gray (#6B7280), Neon Lime (#A6F000).
- Textures: natural skin, matte ceramic, polished glass, soft fabric, smartphone glass (if applicable).
- Fonts: Inter / SF Pro. Títulos Bold/ExtraBold, apoio Medium.
- Produto: tecnologia que resolve alimentação sem esforço.

ESTRUTURA OBRIGATÓRIA DO PROMPT (Preencha os [] com base no conceito):

"A premium vertical lifestyle photo (Ratio 4:5, 1080×1350), shot with soft directional daylight. Captured Shot on Canon EOS R5, 50mm f/2.0.
The camera is positioned [ÂNGULO], creating [SENSAÇÃO VISUAL].

At the center: [CENA OU SUJEITO PRINCIPAL. Varie enormemente. Pode ser um objeto, pessoa, comida, ou textura abstrata. Extraia do conceito].

The scene represents a moment of [NARRATIVA].
Supporting elements: [OBJETOS RELACIONADOS].

[OPCIONAL - MAS SÓ SE FIZER SENTIDO PARA O CONCEITO: The smartphone emits a subtle glow in Neon Lime (#A6F000), suggesting the Fitswap interface (no readable text).]

${!context.isPremiumCarousel ? `On-screen text (Overlay):
Position: Top Left or Top Right (Clean negative space).
Font: Inter Medium.
Color: Dark Gray (#111827).
Main phrase: "${extractedHeadline ? extractedHeadline.toUpperCase() : '[INSERIR HEADLINE CURTA DO CONCEITO]'}"
Optional subtext: "${extractedSubheadline || '[INSERIR SUBHEADLINE]'}"` : `[CRITICAL RULE: DO NOT GENERATE ANY READABLE TEXT, LETTERS, OR WORDS ON THE IMAGE. NO TEXT IN BACKGROUND. TEXT WILL BE ADDED VIA OVERLAY LATER.]`}

Background: [CENÁRIO DE FUNDO EXTRAÍDO DO CONCEITO - ultra-clean with matte surfaces, soft shadows, no clutter].
Palette: White (#FFFFFF) primary, Dark Gray (#111827) secondary, Neon Lime (#A6F000) accents.
Textures: [TEXTURAS RELEVANTES].

Visual effects: soft bloom, micro grain, selective focus, subtle bokeh.

The image conveys: [EMOÇÕES-CHAVE].
Brand perception: Modern wellness-tech solving real-life food friction with calm elegance."

SAÍDA:
Retorne APENAS o texto do prompt final em INGLÊS, preenchido e polido.`;

        } else if ((brandName || '').toLowerCase().includes('inner boost')) {
            console.log('🧠 Using EXCLUSIVE INNER BOOST MASTER TEMPLATE');

            systemPrompt = `Você é um Diretor de Arte Sênior da Inner Boost.
Sua missão é criar um PROMPT VISUAL seguindo a "BRAND BIBLE INNER BOOST" (v1.0).

CONCEITO CENTRAL: "Espelho Mental Brutal".
Se a imagem conforta -> está errada. Tem que incomodar com elegância.

DIRETRIZES VISUAIS (BÍBLIA):
- Paleta: Black (#0B0B0D), Dark Gray (#111111), Neon Blue (#00C2FF), Neon Green (#00F5A0).
- Proibido: Luz quente, sol, sorrisos, "cozy".
- Mood: Dark, Heavy, Introspective.
- Assinatura: Floating 3D thought cards.

ESTRUTURA OBRIGATÓRIA DO PROMPT (Preencha os []):

"Create a dark, minimalist, emotionally intense vertical image in Inner Boost’s modern style (4:5, 1080×1350).

Background: [Tipo: Abstract Void / Dark Bedroom / Night Desk / Psychological Background], with subtle texture, particles, and soft haze.
Color palette: Black (#0B0B0D) dominant, Neon Blue (#00C2FF), Neon Green (#00F5A0).

Main subject: [DESCRIBE A SCENE based on the Concept. Do not just copy the text. Create a visual metaphor or literal scene], expressing [Anxiety/Guilt/Overwhelm/Frustration].
Add floating 3D thought cards with white text and subtle blue/green glow.

${!context.isPremiumCarousel ? `Main text (Overlay):
Position: Top/Center/Bottom (Clean negative space).
Font: Bold Modern Sans.
Color: White with neon glow.
Text: "${extractedHeadline ? extractedHeadline.toUpperCase() : '[HEADLINE]'}"` : `[CRITICAL RULE: DO NOT GENERATE ANY READABLE TEXT, LETTERS, OR WORDS ON THE IMAGE. NO TEXT IN BACKGROUND. TEXT WILL BE ADDED VIA OVERLAY LATER.]`}

Textures: digital noise, soft grain, light haze, neon reflections.
Lighting: dramatic, high contrast, cinematic.
Atmosphere: heavy, introspective, uncomfortable, relatable.
"

SAÍDA:
Retorne APENAS o texto do prompt final em INGLÊS.`;

        } else if (referencePrompt) {
            console.log('🎨 Using Style Transfer Mode with reference:', referencePrompt.substring(0, 50) + '...');

            systemPrompt = `Você é um diretor de arte de IA sênior especializado em "Style Transfer" e estética editorial.
Sua missão é criar um NOVO prompt de imagem para um NOVO conceito, mas MANTENDO ESTRITAMENTE o estilo visual (câmera, luz, cores, vibe) de um "Prompt de Referência".

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Estilo: ${brandingStyle || 'Premium editorial lifestyle'}

---

PROMPT DE REFERÊNCIA (ESTILO A SEGUIR):
"${referencePrompt}"

---

NOVO CONCEITO (AÇÃO/SUJEITO A CRIAR):
"${concept}"

---

REGRAS DE ADAPTAÇÃO:
1. MANTENHA O ESTILO: Use a mesma iluminação, ângulo de câmera, tipo de lente, grão, cores e atmosfera do Reference Prompt.
2. MUDE O SUJEITO/AÇÃO: Descreva a cena baseada no "NOVO CONCEITO". Se o conceito é "Cozinhar", o sujeito deve estar coziando, não segurando um celular (a menos que o conceito peça).
3. ELEMENTOS OBRIGATÓRIOS DA MARCA:
   - Se o Reference Prompt tiver "Neon Lime glow", mantenha.
   - Se houver referência de UI do Fitswap, tente incorporar se fizer sentido (ex: celular na bancada).
4. TEXT OVERLAY OBRIGATÓRIO:
   ${overlayInstruction}

SAÍDA:
Retorne APENAS o texto do novo prompt em INGLÊS. O prompt deve ser detalhado e fluido, pronto para o DALL-E 3.`;

        } else {
            // Dynamic Branding Logic
            const primaryColor = context.branding?.primaryColor || 'Neon Lime';
            const secondaryColor = context.branding?.secondaryColor || 'Deep Black';
            const brandStyle = brandingStyle || 'Premium editorial lifestyle';

            systemPrompt = `Você é um diretor de arte de IA sênior especializado em estética editorial e identidade visual de marca.
Sua missão é transformar um "Conceito de Post" em um prompt de geração de imagem altamente detalhado, SEGUINDO RIGOROSAMENTE AS DIRETRIZES DA MARCA.

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Estilo: ${brandStyle}
- Cor Primária: ${primaryColor}
- Nome: ${brandName || 'Marca'}
- Estilo: ${brandStyle}
- Cor Primária: ${primaryColor}
- Cor Secundária: ${secondaryColor}
${guidelines ? `- DIRETRIZES DA MARCA: ${guidelines}` : ''}

REGRAS VISUAIS:
1. **ESTILO E ILUMINAÇÃO:**
   - Use o estilo definido: "${brandStyle}".
   - Incorpore as Diretrizes da Marca (${guidelines || 'N/A'}) se fornecidas.
   - Iluminação e atmosfera devem seguir a identidade visual da marca.
   - Detalhes sutis na Cor Primária (${primaryColor}) para branding.

2. **COMPOSIÇÃO E LEITURA:**
   - A imagem deve ser composta de forma profissional.
   - IMPORTANTE: Garanta espaço negativo limpo (clean negative space) suficiente para inserção de texto (headline), preferencialmente no topo ou lateral.
   - O sujeito principal deve estar em destaque.

3. **CORES:**
   - Use a Cor Secundária (${secondaryColor}) para fundos ou elementos de contraste.
   - Use a Cor Primária (${primaryColor}) para destaques (accents).

REGRAS OBRIGATÓRIAS (Prompt Base):
Crie um prompt detalhado, criativo e de alta qualidade para o DALL-E 3 baseado no conceito: "${concept}".
Integre o estilo "${brandStyle}" de forma natural.

${overlayInstruction}

Retorne APENAS o texto do prompt final, em INGLÊS. SEJA CRIATIVO e EVITE repetições robóticas de templates.`;
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Conceito Visual: \"${concept}\"` }
            ],
            temperature: 0.7,
        });

        return completion.choices[0].message.content.trim();

    } catch (error) {
        console.error('❌ Erro ao gerar prompt de imagem:', error);
        throw new Error(`Falha na geração de prompt de imagem: ${error.message}`);
    }
}
