import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isFitswapBrand } from '../../utils/brandProfiles.js';
import { buildBrandPromptSections } from './brandContextService.js';
import { generateImages } from '../image/imageGenerationService.js';
import { renderElevepicTemplate, ELEVEPIC_CONTENT_SCHEMAS, isElevepicTemplate } from '../carouselTemplateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '../../templates/elevepic');
const FALLBACK_IMAGE_COUNT = 3;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const VALID_LIBRARY_IMAGE_TREATMENTS = new Set(['auto', 'heavy', 'light']);
const AI_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

function logDebugPrompt(label, prompt) {
    if (process.env.DEBUG_PROMPTS === '1') {
        console.log(`\n[DEBUG_PROMPTS] ${label}\n${prompt}\n[/DEBUG_PROMPTS]\n`);
    }
}

function stripCodeFence(raw = '') {
    const text = String(raw || '').trim();
    if (!text.startsWith('```')) return text;
    return text.replace(/^```(?:json|html)?\n?/i, '').replace(/\n?```$/, '').trim();
}

function resolveLibraryImageTreatment(treatment = 'auto') {
    return treatment === 'light' ? 'light' : 'heavy';
}

/**
 * Conta somente elementos cujo token de classe seja exatamente "slide".
 * Classes auxiliares como "slide-nav" e "slide-dot" não entram na contagem.
 */
export function countCarouselSlides(html = '') {
    const markup = String(html || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const openingTagRegex = /<[a-z][\w:-]*\b[^>]*\bclass\s*=\s*["']([^"']*)["'][^>]*>/gi;
    let count = 0;
    let match;

    while ((match = openingTagRegex.exec(markup)) !== null) {
        const classes = match[1].trim().split(/\s+/).filter(Boolean);
        if (classes.includes('slide')) count += 1;
    }

    return count;
}

function makeSvgDataImage(label, primaryColor, index) {
    const safeLabel = String(label || 'ElevePic')
        .replace(/[<>&'"]/g, '')
        .slice(0, 28)
        .toUpperCase();
    const accent = String(primaryColor || '#3b82f6').replace(/[^#a-zA-Z0-9(),.%\s-]/g, '') || '#3b82f6';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1050" viewBox="0 0 840 1050">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#111111"/>
<stop offset="0.52" stop-color="${accent}"/>
<stop offset="1" stop-color="#f5f0e8"/>
</linearGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
</defs>
<rect width="840" height="1050" fill="url(#g)"/>
<rect width="840" height="1050" fill="#000" opacity="${index % 2 ? '0.28' : '0.18'}"/>
<rect x="70" y="96" width="700" height="858" rx="32" fill="none" stroke="#f5f0e8" stroke-opacity="0.55" stroke-width="3"/>
<circle cx="${index % 2 ? 650 : 190}" cy="240" r="120" fill="#f5f0e8" opacity="0.16"/>
<text x="420" y="515" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#f5f0e8" letter-spacing="5">${safeLabel}</text>
<text x="420" y="574" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#f5f0e8" opacity="0.76" letter-spacing="6">EDITORIAL MOODBOARD</text>
<rect width="840" height="1050" filter="url(#grain)" opacity="0.08"/>
</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildFallbackMoodboardContent(topic, brandName) {
    const cleanTopic = String(topic || 'sua imagem profissional').trim();
    const shortTopic = cleanTopic.length > 44 ? `${cleanTopic.slice(0, 44).trim()}...` : cleanTopic;
    return {
        brandName: brandName || 'ElevePic',
        slides: [
            { eyebrow: 'IMAGEM', headline: 'Sua presença<br><em>fala primeiro</em>', subtext: `Antes da proposta, o mercado lê ${shortTopic}.` },
            { eyebrow: 'CONTRASTE', headline: 'O comum<br>parece <em>barato</em>', subtext: 'Autoridade visual muda a percepção de valor.' },
            { eyebrow: 'POSIÇÃO', headline: 'Ser visto<br>como <em>referência</em>', subtext: 'Cada detalhe comunica preço, confiança e direção.' },
            { eyebrow: 'MÉTODO', headline: 'Estratégia<br>antes da <em>foto</em>', subtext: 'A estética precisa sustentar o posicionamento.' },
            { eyebrow: 'PROVA', headline: 'Quando parece<br>premium, <em>vende</em>', subtext: 'A imagem certa reduz fricção e aumenta desejo.' },
            { eyebrow: 'PRÓXIMO PASSO', headline: 'Eleve sua<br><em>imagem</em>', subtext: 'Transforme presença digital em percepção de autoridade.', ctaText: 'Elevar minha imagem' }
        ]
    };
}

async function generateMoodboardContentJson(topic, context, brandName) {
    const fallback = buildFallbackMoodboardContent(topic, brandName);
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return fallback;

    const systemPrompt = `You are a strategist for ${brandName || 'ElevePic'}.
Return ONLY valid JSON for a 6-slide vintage editorial Instagram moodboard.
Schema:
{
  "brandName": "${brandName || 'ElevePic'}",
  "slides": [
    { "eyebrow": "1-3 WORD LABEL", "headline": "4-8 words with optional <em>one word</em>", "subtext": "one short sentence up to 12 words", "ctaText": "optional only on last slide" }
  ]
}
Rules:
- Exactly 6 slides.
- Narrative: hook, contrast, insight, method, proof, CTA.
- Write in Portuguese do Brasil.
- Tone: premium, direct, authoritative.`;

    try {
        const url = `${GEMINI_URL}?key=${geminiApiKey}`;
        const response = await axios.post(url, {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: `Tema: ${topic}` }] }],
            generationConfig: { temperature: 0.65 }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        const raw = stripCodeFence(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
        if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) return fallback;
        return {
            brandName: parsed.brandName || fallback.brandName,
            slides: parsed.slides.slice(0, 6).map((slide, index) => ({
                eyebrow: slide.eyebrow || fallback.slides[index]?.eyebrow,
                headline: slide.headline || fallback.slides[index]?.headline,
                subtext: slide.subtext || fallback.slides[index]?.subtext,
                ctaText: slide.ctaText || fallback.slides[index]?.ctaText
            }))
        };
    } catch (error) {
        console.warn('⚠️ [Moodboard] Falha ao gerar texto via Gemini; usando fallback local:', error.message);
        return fallback;
    }
}

async function generateElevepicContentJson(templateId, topic, context, brandName) {
    // If it's moodboard specifically, use the legacy specific prompt if needed,
    // but the generic one should handle it as long as the schema provides good instructions.
    // For safety, we use a generalized prompt that reads the schema dynamically.
    const schema = ELEVEPIC_CONTENT_SCHEMAS[templateId];
    if (!schema) {
        // Fallback for moodboard if somehow schema not found
        if (templateId === 'moodboard') return generateMoodboardContentJson(topic, context, brandName);
        throw new Error(`Schema not found for template: ${templateId}`);
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente.');

    const schemaFieldsStr = Object.entries(schema.fields)
        .map(([k, v]) => `"${k}": ${v}`)
        .join(',\n  ');

    // For comparison template, enrich the prompt with brand context so Gemini picks the right image scenario
    const comparisonBrandContext = templateId === 'comparison' ? (() => {
        const desc = context.description || context.brandContext || '';
        const product = context.productService || context.product || '';
        const audience = context.targetAudience || '';
        const coreMsg = context.brandKit?.coreMessage || context.brandKit?.personality || '';
        const lines = [desc, product, audience, coreMsg].filter(Boolean);
        return lines.length > 0 ? `\nBrand Context (use to choose the correct image scenario — portrait/photography vs food/nutrition vs other):\n${lines.slice(0, 3).join(' | ')}` : '';
    })() : '';
    const brandPromptSections = buildBrandPromptSections(context, { format: 'html' })
        .compose(['identity', 'voice', 'visual', 'cta']);

    const systemPrompt = `You are an expert brand content strategist for ${brandName}.
Return ONLY valid JSON for a ${templateId} Instagram carousel.
Template Description: ${schema.description}${comparisonBrandContext}

## BRAND DIRECTION
${brandPromptSections}

Schema Structure (MUST strictly follow these keys and formats):
{
  ${schemaFieldsStr}
}

Rules:
- Content theme: ${topic}
- Follow the schema structure strictly.
- Write all copy in Portuguese do Brasil.
- Tone: premium, direct, engaging, authoritative.
- Do NOT use structural labels as visible copy, such as "Tema central", "A realidade", "A virada", "O processo", "O ponto central", "Conteúdo estratégico", "Próximo passo".
- Every headline, subtext, stat, label, and CTA must be concrete content about the brand, audience, product, and selected theme. Never output placeholder meta-copy like "Conteúdo criado para a marca" or "alinhado ao tema principal".
- IMPORTANT: Return ONLY valid JSON, without any markdown formatting blocks like \`\`\`json or \`\`\`.`;

    try {
        const url = `${GEMINI_URL}?key=${geminiApiKey}`;
        logDebugPrompt(`generateElevepicContentJson:${templateId}`, systemPrompt);
        const response = await axios.post(url, {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: `Tema: ${topic}` }] }],
            generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });

        const raw = stripCodeFence(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
        return parsed;
    } catch (error) {
        console.warn(`⚠️ [${templateId}] Falha ao gerar texto via Gemini:`, error.message);
        if (templateId === 'moodboard') return buildFallbackMoodboardContent(topic, brandName);
        throw new Error(`Falha na geração de conteúdo JSON para ${templateId}`);
    }
}

async function generateElevepicStructuredCarousel(templateId, topic, context = {}, libraryImages = []) {
    const brandName = context.brandName || context.name || 'Sua Marca';
    const branding = context.branding || {};
    const primaryColor = branding.primaryColor || context.primaryColor || '#3b82f6';
    const secondaryColor = branding.secondaryColor || context.secondaryColor || '#0f0d0b';

    console.log(`📋 [${templateId}] Gerando conteúdo textual via Gemini...`);
    const contentJson = await generateElevepicContentJson(templateId, topic, context, brandName);
    contentJson.__sourceTopic = topic;

    // For templates like moodboard or photo, they might need images from library
    const sourceImages = Array.isArray(libraryImages) ? libraryImages.filter(Boolean) : [];
    const images = sourceImages.length > 0
        ? sourceImages
        : (templateId === 'moodboard' || templateId === 'photo'
            ? Array.from({ length: FALLBACK_IMAGE_COUNT }, (_, index) => makeSvgDataImage(brandName, primaryColor, index))
            : []);

    console.log(`🎨 [${templateId}] Renderizando template ElevePic estruturado.`);
    let html = renderElevepicTemplate(templateId, contentJson, {
        ...context,
        brandName,
        primaryColor,
        secondaryColor,
        branding: {
            ...branding,
            primaryColor,
            secondaryColor
        }
    }, images);

    if (!html) throw new Error(`renderElevepicTemplate retornou HTML vazio para ${templateId}`);

    // Some templates like 'comparison' will output <img data-ai-prompt="..."> tags that need post-processing
    if (html.includes('data-ai-prompt')) {
        console.log(`⚙️ [${templateId}] Processando data-ai-prompts para imagens IA...`);
        html = await postProcessHtmlImages(html, context);
    }

    return html;
}

// Keeping the old one specifically for moodboard in case any old references rely on it directly.
async function generateElevepicMoodboardCarousel(topic, context = {}, libraryImages = []) {
    return generateElevepicStructuredCarousel('moodboard', topic, context, libraryImages);
}

/**
 * Gera um carrossel em HTML/CSS completo (pronto para captura de tela individual).
 * @param {string} topic O tema ou conceito
 * @param {object} context Informações da marca
 * @param {string} htmlTemplate Template a usar ('template1' ou outro)
 * @param {number} [requestedSlideCount] Número de slides solicitado
 * @param {string} [customTemplateHtml] HTML de um template customizado salvo pelo usuário
 * @param {'auto'|'heavy'|'light'} [libraryImageTreatment='auto'] Tratamento das imagens reais da biblioteca
 */
export async function generateHtmlCarousel(topic, context = {}, htmlTemplate = 'template1', requestedSlideCount, customTemplateHtml, libraryImageTreatment = 'auto') {
    try {
        console.log(`📠 Gerando Carrossel HTML para: "${topic.substring(0, 50)}..."`);

        const {
            brandName,
            brandKey,
            branding = {},
            targetAudience,
            contentStrategy,
            profileDescription,
            guidelines,
            libraryImages = [],
        } = context;

        const isFitswap = isFitswapBrand({ brandKey, brandName });
        const isMoodboardTemplate = typeof htmlTemplate === 'string' && htmlTemplate.toLowerCase().includes('moodboard');
        const primaryColor = branding.primaryColor || (isFitswap ? '#A6F000' : '#4C1D95');
        const secondaryColor = branding.secondaryColor || '#111827';
        const logoUrl = branding.logoUrl || branding.logo || null;
        const brandPromptSections = buildBrandPromptSections(context, { slideCount: requestedSlideCount, format: 'html' })
            .compose(['identity', 'voice', 'visual', 'cta']);

        // Build library images instruction if images are available
        const hasLibraryImages = Array.isArray(libraryImages) && libraryImages.length > 0;
        const resolvedImageTreatment = resolveLibraryImageTreatment(
            VALID_LIBRARY_IMAGE_TREATMENTS.has(libraryImageTreatment) ? libraryImageTreatment : 'auto'
        );

        if (isElevepicTemplate(htmlTemplate)) {
            return await generateElevepicStructuredCarousel(htmlTemplate, topic, context, libraryImages);
        }

        let libraryImagesBlock = '';
        if (hasLibraryImages && !isMoodboardTemplate) {
            const treatmentInstruction = resolvedImageTreatment === 'light'
                ? `Use a subtle scrim over each image with exactly \`background-color: rgba(0, 0, 0, 0.35)\`. Do NOT blur the image. Preserve its visibility while maintaining readable foreground text.`
                : `Apply a HEAVY DARKENING OVERLAY (for example \`background-color: rgba(0, 0, 0, 0.7)\` or a strong dark gradient) so baked-in text becomes almost invisible. You may instead use \`filter: blur(8px) brightness(0.4)\` on the background image container.`;

            libraryImagesBlock = `

## REAL BRAND IMAGES (USE THESE — mandatory):
The following are REAL images from this brand's library.
CRITICAL INSTRUCTION: These images ALREADY HAVE TEXT baked into them. Therefore, you MUST NOT use them as simple <img> tags where the old text would compete with the new HTML text.
Use them strictly as full-slide BACKGROUND IMAGES (using CSS \`background-image\`).
${treatmentInstruction}

These are the ONLY external image URLs you should use:

${libraryImages.map((url, i) => `Image ${i + 1}: ${url}`).join('\n')}

If there are more slides than images, reuse the images or create pure CSS slides (brand-color gradients and geometric shapes) for the remaining slides. Never invent or reference any other external image URL.
`;
        }

        const systemPrompt = `You are an Instagram carousel design system. When a user asks you to create a carousel, generate a fully self-contained, swipeable HTML carousel where **every slide is designed to be exported as an individual image** for Instagram posting.

## Brand Details
- **Brand name**: ${brandName || 'Sua Marca'}
- **Primary brand color**: ${primaryColor}
- **Secondary brand color**: ${secondaryColor}
- **Tone/Guidelines**: ${guidelines || 'Professional and engaging'}
- **Context**: ${profileDescription || 'Instagram carousel post'}
${contentStrategy ? `- **Strategy**: ${contentStrategy}` : ''}
${logoUrl ? `- **Brand logo URL**: ${logoUrl} — MUST use this exact URL as the avatar <img> src in the ig-header. Do not replace it with another external image or a placeholder.` : '- **Brand logo**: No logo provided — use brand initials or a colored circle as avatar.'}

## BRAND VOICE AND VISUAL DIRECTION
${brandPromptSections}

## IMPORTANT DESIGN INSTRUCTIONS (AESTHETICS & LAYOUT):
- Derive the full Color System from the primary color (BRAND_PRIMARY, BRAND_LIGHT, BRAND_DARK, LIGHT_BG, LIGHT_BORDER, DARK_BG).
- Use modern, premium typography. Load a high-end Google Font (e.g., 'Inter', 'Outfit', or 'Plus Jakarta Sans').
- Establish a strict Visual Hierarchy: massive bold headlines (h1), clear legible body text (p), and subtle micro-copy (e.g., "@username" on top/bottom).
- Apply modern UI aesthetics: use soft shadows (\`box-shadow: 0 10px 30px rgba(0,0,0,0.05)\`), subtle gradients (\`linear-gradient\`), or glassmorphism (\`backdrop-filter: blur(10px); background: rgba(255,255,255,0.8)\` for text cards over images/dark backgrounds).
- Avoid plain flat designs unless the brand strictly demands it. Incorporate interesting abstract shapes, geometric accents, or pill-shaped tags to make the slides look like professional Instagram Carousel posts from top-tier agencies.
- Aspect ratio is 4:5 (Instagram carousel standard). Built for a 420x525 preview wrapper.
- DO NOT use \`position: absolute\` for badges or tags (they easily break layout). Instead, use regular flexbox layout with \`align-self: flex-start\` or \`margin-bottom\`.
- If using CSS Grids (like a 2x2 layout), ensure text is concise and font-sizes are small (e.g. 12px-14px) so it does not overflow the 420x525 container.
- Use flex or grid with safe gaps to prevent overlapping text.
- To make it swipable in a web view, MUST set \`.carousel\` to \`display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth;\`. Hide scrollbars with \`::-webkit-scrollbar { display: none; }\`.
- MUST set \`.slide\` to \`flex-shrink: 0; width: 420px; height: 525px; scroll-snap-align: start; position: relative; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;\`.
- Use flexbox or grid to perfectly align content in each slide (e.g., center text, or pin user handle to the top and progress bar to the bottom).
- Alternate LIGHT_BG and DARK_BG backgrounds or use a continuous flowing gradient/pattern across slides to encourage swiping.
- End with a striking CTA slide on a Brand gradient background.
- Never reference external image URLs, except the exact brand logo and library URLs explicitly supplied above.
- If a real image materially improves a slide, use an <img> with \`src="${AI_IMAGE_PLACEHOLDER}"\` and \`data-ai-prompt="..."\`. The prompt must be a detailed, descriptive English prompt for the AI image generator.
- If no image is applicable, use pure CSS with brand-color gradients and geometric shapes. Never invent a remote image URL or use an image-placeholder service.

## CRITICAL NAVIGATION RULES — MUST FOLLOW ON EVERY SLIDE:
- EVERY slide MUST have a navigation bar at EXACTLY the same position: \`position: absolute; bottom: 0; left: 0; right: 0; height: 48px;\`
- This nav bar contains: dots on the left and a swipe arrow on the right (omit arrow on last slide only)
- Use this EXACT HTML structure inside every slide:
  \`<div class="slide-nav"><div class="slide-dots"><!-- dots --></div><span class="slide-arrow">DESLIZE →</span></div>\`
- Add to CSS: \`.slide-nav { position:absolute; bottom:0; left:0; right:0; height:48px; display:flex; align-items:center; justify-content:space-between; padding:0 20px; z-index:10; }\`
- Add to CSS: \`.slide-dots { display:flex; gap:5px; align-items:center; }\`
- Add to CSS: \`.slide-dot { width:6px; height:6px; border-radius:50%; opacity:0.4; }\`
- Add to CSS: \`.slide-dot.active { width:18px; border-radius:3px; opacity:1; }\`
- Add to CSS: \`.slide-arrow { font-size:11px; font-weight:700; letter-spacing:0.05em; opacity:0.6; }\`
- The main content area of every slide MUST use: \`position:absolute; top:0; left:0; right:0; bottom:48px; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:32px 28px;\`
- NEVER put navigation dots outside this nav bar. NEVER put content below bottom:48px.

## CRITICAL CONTENT RULES — MUST FOLLOW:
- Never use structural placeholders as visible copy: "Tema central", "A realidade", "A virada", "O processo", "O ponto central", "Conteúdo estratégico", "Conteúdo criado para...", or similar.
- Each slide must contain concrete, useful content adapted to the brand and topic, not labels describing the slide role.

Generate ONLY the raw HTML code containing the full carousel layout, ready to be previewed and exported. Do not wrap in markdown \`\`\`html tags.`;

        const slideCountInstruction = requestedSlideCount
            ? `\n\n## SLIDE COUNT: Generate EXACTLY ${requestedSlideCount} slides (no more, no less).`
            : '';

        let templatePrompt = '';
        if (customTemplateHtml) {
            templatePrompt = `

## CUSTOM TEMPLATE INSTRUCTION:
The user has saved a custom HTML carousel template they want you to replicate. MUST strictly follow its exact HTML layout, CSS classes, and visual structure. Only change the text content (headlines, paragraphs, topics) to match the new requested topic. Keep all visual design choices (colors, fonts, layout, animations) identical to the template.
Here is the custom template to strictly follow:

${customTemplateHtml}
`;
        } else if (htmlTemplate === 'template1') {
            templatePrompt = `

## TEMPLATE INSTRUCTION:
MUST strictly follow this exact HTML layout and CSS structure. Only change the text content (headlines, paragraphs), adapt the colors to the primary brand color, and use AI images through \`data-ai-prompt\` only when materially useful. Otherwise use pure CSS brand gradients and geometric shapes. DO NOT change the CSS classes or the DOM tree structure. Produce multiple slides (at least 3-5) following this structure.
Here is the template to strictly follow:

<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carousel (Bold Overlay)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #0d0d0d;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px 16px;
}
.ig-frame {
  width: 420px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7);
  background: #111;
}
.ig-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  background: #111827;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ig-avatar { width:34px;height:34px;border-radius:50%;overflow:hidden;border:2px solid ${primaryColor}; }
.ig-handle { font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:#fff; }
.ig-sub { font-family:'Inter',sans-serif;font-size:11px;color:rgba(255,255,255,0.4); }
.ig-more { margin-left:auto;color:rgba(255,255,255,0.4);font-size:20px;line-height:1; }
.carousel-viewport { width:420px;aspect-ratio:4/5;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;display:flex; }
.carousel-viewport::-webkit-scrollbar { display:none; }
.carousel-track { display:flex;height:100%; }
.slide { flex-shrink:0;width:420px;height:525px;scroll-snap-align:start;position:relative;overflow:hidden; }
.slide-nav { position:absolute;bottom:0;left:0;right:0;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:10; }
.slide-dots { display:flex;gap:5px;align-items:center; }
.slide-dot { width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.3);transition:background 0.3s,width 0.3s; }
.slide-dot.active { background:${primaryColor};width:18px;border-radius:3px;opacity:1; }
.slide-arrow { font-family:'Inter',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.05em;color:rgba(255,255,255,0.6); }
.ig-actions { display:flex;align-items:center;gap:16px;padding:12px 16px 8px;background:#111827; }
.ig-save { margin-left:auto; }
.ig-caption { padding:6px 16px 14px;background:#111827;font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.5; }
.ig-caption strong { color:#fff;font-weight:700; }
</style>
</head>
<body>
<div class="ig-frame">
  <div class="ig-header">
    <div class="ig-avatar">${logoUrl
        ? `<img src="${logoUrl}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${primaryColor};color:#fff;font-family:'Inter',sans-serif;font-size:13px;font-weight:800;">${(brandName || 'SM').replace(/\s+/g,'').substring(0,2).toUpperCase()}</div>`
    }</div>
    <div>
      <div class="ig-handle">${brandName || 'Sua Marca'}</div>
      <div class="ig-sub">Conteúdo de valor</div>
    </div>
    <div class="ig-more">···</div>
  </div>
  <div class="carousel-viewport" id="viewport">
    <div class="carousel-track" id="track">
      <!-- SLIDE 1 -->
      <div class="slide">
        <div style="position:absolute;inset:0;background:linear-gradient(135deg,#0a0f1e 0%,#0d1a35 40%,#091428 100%);"></div>
        <div style="position:absolute;top:0;left:0;right:0;bottom:48px;z-index:5;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;text-align:center;padding:0 28px 28px;">
          <h1 style="font-family:'Inter',sans-serif;font-size:36px;font-weight:900;color:#fff;line-height:1.1;letter-spacing:-1px;margin-bottom:16px;text-transform:uppercase;">
            SUA HEADLINE <span style="color:${primaryColor};">AQUI</span>
          </h1>
          <p style="font-family:'Inter',sans-serif;font-size:16px;color:rgba(255,255,255,0.7);line-height:1.5;max-width:320px;">
            Subtítulo criativo.
          </p>
        </div>
        <div class="slide-nav">
          <div class="slide-dots">
            <div class="slide-dot active"></div>
            <div class="slide-dot"></div>
            <div class="slide-dot"></div>
          </div>
          <span class="slide-arrow">DESLIZE →</span>
        </div>
      </div>
      <!-- SLIDE 2 -->
      <div class="slide">
        <div style="position:absolute;inset:0;">
          <img src="${AI_IMAGE_PLACEHOLDER}" data-ai-prompt="Editorial photograph illustrating the carousel topic, premium art direction, cinematic lighting, no text, vertical 4:5 composition" style="width:100%;height:100%;object-fit:cover;opacity:0.4;">
        </div>
        <div style="position:absolute;inset:0;background:linear-gradient(135deg,#0a0f1e 0%,#0d1a35 40%,#091428 100%);opacity:0.8;"></div>
        <div style="position:absolute;top:0;left:0;right:0;bottom:48px;z-index:5;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:32px 28px;">
          <h2 style="font-family:'Inter',sans-serif;font-size:28px;font-weight:800;color:#fff;margin-bottom:20px;">Segundo Ponto</h2>
          <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.8);line-height:1.6;">
            Texto de explicação detalhada para este slide.
          </p>
        </div>
        <div class="slide-nav">
          <div class="slide-dots">
            <div class="slide-dot"></div>
            <div class="slide-dot active"></div>
            <div class="slide-dot"></div>
          </div>
          <span class="slide-arrow">DESLIZE →</span>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>
`;
        } else {
            // Generic file-based templates (tudy, bold, editorial, etc.)
            const tplFile = join(TEMPLATES_DIR, `${htmlTemplate}.html`);
            if (existsSync(tplFile)) {
                const tplHtml = readFileSync(tplFile, 'utf-8');
                const hasDaiPrompts = tplHtml.includes('data-ai-prompt');
                templatePrompt = `

## TEMPLATE INSTRUCTION:
MUST strictly follow this exact HTML layout, CSS classes, and visual structure. Only adapt:
- Text content (headlines, paragraphs, badges, list items, CTA copy) to match the new topic
- Brand name, handle, avatar initials, and primary color to match the brand details above
${hasDaiPrompts ? `- CRITICAL: DO NOT remove or replace \`data-ai-prompt\` attributes on <img> elements. Keep them exactly as-is — they will be processed separately to generate real images. Only update the text content around the frames.
- DO NOT add external image URLs to any \`src\` attributes that currently have a placeholder like "data:image/gif;base64,...". Keep the placeholder src.` : '- Library images injected via LIBRARY_IMAGE_N placeholders (replace only with real URLs explicitly provided above)'}
DO NOT change fonts, layout structure, slide types, or CSS class names.
Here is the template to strictly follow:

${tplHtml}
`;
            }
        }

        const finalSystemPrompt = systemPrompt + templatePrompt + libraryImagesBlock + slideCountInstruction;

        if (hasLibraryImages) {
            console.log(`🖼️ Injetando ${libraryImages.length} imagens da library no prompt do HTML Carousel.`);
        }

        const userPrompt = `Make me a carousel about: "${topic}"`;

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY não está configurada no ambiente.');
        }

        console.log(`🤖 Chamando Gemini (${GEMINI_MODEL}) para gerar HTML do Carrossel...`);

        const url = `${GEMINI_URL}?key=${geminiApiKey}`;

        logDebugPrompt('generateHtmlCarousel', finalSystemPrompt);
        const response = await axios.post(url, {
            system_instruction: {
                parts: [{ text: finalSystemPrompt }]
            },
            contents: [{
                role: 'user',
                parts: [{ text: userPrompt }]
            }],
            generationConfig: { temperature: 0.7 }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000
        });

        const candidate = response.data?.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            throw new Error('O Gemini não retornou nenhum texto/HTML.');
        }

        let html = candidate.content.parts[0].text.trim();

        // Remove markdown formatting if the AI still adds it
        if (html.startsWith('```html')) {
            html = html.replace(/^```html\n/, '').replace(/\n```$/, '');
        } else if (html.startsWith('```')) {
            html = html.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        // data-ai-prompt is supported for every brand.
        if (html.includes('data-ai-prompt')) {
            html = await postProcessHtmlImages(html, context);
        }

        return html;

    } catch (error) {
        console.error('❌ Erro ao gerar HTML Carousel:', error?.response?.data || error);
        throw new Error(`Falha na geração de HTML Carousel: ${error.message}`);
    }
}

/**
 * Corrige / ajusta um carrossel HTML existente com base nas instruções do usuário.
 * @param {string} html O HTML atual do carrossel
 * @param {string} instruction A instrução do usuário descrevendo o que deve ser corrigido
 */
export async function fixHtmlCarousel(html, instruction) {
    try {
        console.log(`🔧 Corrigindo HTML Carousel com instrução: "${instruction.substring(0, 80)}..."`);

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY não está configurada no ambiente.');
        }

        const expectedSlideCount = countCarouselSlides(html);
        if (expectedSlideCount === 0) {
            const error = new Error('Não foi possível identificar nenhum container com class="slide" no HTML enviado.');
            error.statusCode = 422;
            error.code = 'HTML_SLIDE_COUNT_INVALID';
            throw error;
        }

        const systemPrompt = `You are an expert HTML/CSS carousel editor for Instagram posts.
You will receive an existing HTML carousel and a user instruction describing what needs to be fixed or changed.
Your job is to apply ONLY the requested changes while preserving everything else exactly as it is.

RULES:
- Apply only the changes described in the instruction
- Keep exactly ${expectedSlideCount} elements whose class list contains the exact token "slide"
- Keep all existing slide content, styles, and structure intact unless the instruction says to change them
- Maintain the same overall design language (colors, fonts, layout)
- Return ONLY the complete, raw HTML — no markdown, no explanation, no code fences
- The output must be a fully self-contained, valid HTML document ready to preview in a browser`;

        const url = `${GEMINI_URL}?key=${geminiApiKey}`;

        const requestFix = async (sourceHtml, retryInstruction = '') => {
            const userPrompt = `Here is the current HTML carousel:

${sourceHtml}

USER INSTRUCTION (apply this change):
${instruction}
${retryInstruction}

Return the updated HTML with ONLY the requested changes applied.`;

            const response = await axios.post(url, {
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { temperature: 0.3 }
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const candidate = response.data?.candidates?.[0];
            if (!candidate?.content?.parts?.length) {
                throw new Error('O Gemini não retornou HTML corrigido.');
            }

            return stripCodeFence(candidate.content.parts[0].text);
        };

        let fixedHtml = await requestFix(html);
        let actualSlideCount = countCarouselSlides(fixedHtml);

        if (actualSlideCount !== expectedSlideCount) {
            console.warn(`⚠️ Reparo alterou slides (${expectedSlideCount} → ${actualSlideCount}); tentando corrigir uma vez.`);
            fixedHtml = await requestFix(html, `

MANDATORY RETRY CONSTRAINT: The previous output has ${actualSlideCount} slides, but the output MUST contain exactly ${expectedSlideCount} slide containers. A slide container is an element whose class list contains the exact token "slide". Restore or remove containers as needed without changing the requested edit.`);
            actualSlideCount = countCarouselSlides(fixedHtml);
        }

        if (actualSlideCount !== expectedSlideCount) {
            const error = new Error(`O reparo não preservou a quantidade de slides: esperado ${expectedSlideCount}, recebido ${actualSlideCount}.`);
            error.statusCode = 422;
            error.code = 'HTML_SLIDE_COUNT_MISMATCH';
            throw error;
        }

        return fixedHtml;

    } catch (error) {
        console.error('❌ Erro ao corrigir HTML Carousel:', error?.response?.data || error);
        if (error?.statusCode === 422) throw error;
        throw new Error(`Falha ao corrigir HTML Carousel: ${error.message}`);
    }
}

/**
 * Pós-processa o HTML para encontrar tags com data-ai-prompt, gera as imagens via IA
 * e insere as URLs reais no atributo src.
 */
async function postProcessHtmlImages(html, context) {
    // Procura por todas as instâncias de data-ai-prompt="..."
    // e extrai o prompt
    const regex = /<img[^>]*data-ai-prompt=["']([^"']+)["'][^>]*>/gi;
    let match;
    const matches = [];

    while ((match = regex.exec(html)) !== null) {
        matches.push({
            fullTag: match[0],
            prompt: match[1]
        });
    }

    if (matches.length === 0) return html;

    console.log(`🖼️ [PostProcess] Encontradas ${matches.length} imagens para gerar via IA no carrossel HTML.`);

    let processedHtml = html;

    // Dispara a geração de imagens em paralelo
    const generationPromises = matches.map(async (m) => {
        try {
            console.log(`   🎨 Gerando imagem para prompt: "${m.prompt.substring(0, 40)}..."`);
            const images = await generateImages(m.prompt, '4:5', 1, '', true, context, null, 'gemini');

            if (images && images.length > 0 && images[0]) {
                const imageUrl = images[0];
                // Remove o atributo data-ai-prompt e substitui/adiciona o src com a imagem gerada
                let newTag = m.fullTag.replace(/data-ai-prompt=["'][^"']+["']/i, '');

                if (/src=["'][^"']*["']/i.test(newTag)) {
                    newTag = newTag.replace(/src=["'][^"']*["']/i, `src="${imageUrl}"`);
                } else {
                    newTag = newTag.replace('>', ` src="${imageUrl}">`);
                }

                return { oldTag: m.fullTag, newTag };
            }
        } catch (err) {
            console.error(`   ❌ Falha ao gerar imagem para prompt "${m.prompt}":`, err.message);
        }
        return { oldTag: m.fullTag, newTag: m.fullTag }; // Em caso de falha, mantém a tag antiga (placeholder)
    });

    const results = await Promise.all(generationPromises);

    // Aplica as substituições no HTML final
    for (const res of results) {
        processedHtml = processedHtml.replace(res.oldTag, res.newTag);
    }

    console.log(`✅ [PostProcess] Substituição de imagens concluída.`);
    return processedHtml;
}
