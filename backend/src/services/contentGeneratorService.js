import axios from 'axios';
import { db } from '../config/firebase.js';
import { getBusinessProfile, getAccountsByProfile } from './businessProfileService.js';
import { generateImages, generateCarousel, generateImageCaption, generateImagePrompt, generateHtmlCarousel, generateSingleImage, generateContentPlan, serializeSlideToTagPrompt } from './aiService.js';
import { renderElevepicTemplate } from './carouselTemplateService.js';
import { createPost } from './postService.js';
import {
    createFeedPostDraftRecord,
    createHtmlCarouselDraftRecord,
    createLibraryItemRecord,
    createReelDraftRecord,
    createStoryDraftRecord,
    normalizeStoredPostRecord
} from '../domain/contentModels.js';
import {
    getAspectRatioForFormat,
    getBaseTypeForFormat,
    isHtmlFormat,
    isStoryFormat,
    normalizeFormat
} from '../domain/formatRules.js';
import { mergeBrandProfileDefaults } from '../utils/brandProfiles.js';
import { createPremiumComposition } from './premiumCompositionService.js';
import { uploadImage } from './historyService.js';

const FORMAT_SLIDE_LIMITS = {
    carousel: { min: 4, max: 10, fallback: 5 },
    'carousel-premium': { min: 4, max: 10, fallback: 5 },
    'carousel-html': { min: 3, max: 7, fallback: 5 }
};

const REVIEW_MODE_PREMIUM_CAROUSEL_SLIDE_COUNT = 5;

const HTML_TEMPLATE_SLIDE_LIMITS = {
    bold: { min: 7, max: 7, fallback: 7 },
    editorial: { min: 7, max: 7, fallback: 7 },

    'editorial-sci': { min: 3, max: 7, fallback: 5 },
    photo: { min: 7, max: 7, fallback: 7 },
    moodboard: { min: 6, max: 6, fallback: 6 },
    instagram: { min: 5, max: 5, fallback: 5 }
};

// ---------------------------------------------------------------------------
// Análise de posts recentes
// ---------------------------------------------------------------------------

/**
 * Retorna quantos posts de cada pilar foram criados nos últimos N dias
 */
async function analyzeRecentPosts(businessProfileId, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Filtra só por businessProfileId para evitar índice composto;
    // o filtro de data é feito em JavaScript
    const snapshot = await db.collection('posts')
        .where('businessProfileId', '==', businessProfileId)
        .get();

    const byPilar = {};
    const byFormat = {};
    const byTemplate = {};
    let total = 0;

    snapshot.forEach(doc => {
        const post = doc.data();
        const createdAt = post.createdAt?.toDate?.() || new Date(post.createdAt || 0);
        if (createdAt < since) return; // ignora posts mais antigos que N dias

        const pilarId = post.pillarId || 'unknown';
        const format = post.type || 'static';
        byPilar[pilarId] = (byPilar[pilarId] || 0) + 1;
        byFormat[format] = (byFormat[format] || 0) + 1;
        if (post.extra?.carouselTemplateId) {
            const tpl = post.extra.carouselTemplateId;
            byTemplate[tpl] = (byTemplate[tpl] || 0) + 1;
        }
        total++;
    });

    return { byPilar, byFormat, byTemplate, total };
}

const ELEVEPIC_TEMPLATE_ROTATION = ['bold', 'editorial', 'instagram', 'photo', 'moodboard', 'editorial-sci'];

/**
 * Selects the least-recently-used ElevePic template for a business profile,
 * respecting pillar.preferredHtmlTemplate if set.
 */
function selectHtmlTemplate(pillar = {}, recentActivity = {}) {
    if (pillar.preferredHtmlTemplate) return pillar.preferredHtmlTemplate;
    const byTemplate = recentActivity.byTemplate || {};
    // Pick the template that has been used the least
    let minCount = Infinity;
    let chosen = ELEVEPIC_TEMPLATE_ROTATION[0];
    for (const tplId of ELEVEPIC_TEMPLATE_ROTATION) {
        const count = byTemplate[tplId] || 0;
        if (count < minCount) {
            minCount = count;
            chosen = tplId;
        }
    }
    return chosen;
}

function clampSlideCount(value, limits = {}) {
    const min = Number(limits.min || 1);
    const max = Number(limits.max || min);
    const fallback = Number(limits.fallback || min);
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? numeric : fallback;
    return Math.min(max, Math.max(min, Math.round(safe)));
}

function extractExplicitSlideCount(text = '') {
    const source = String(text || '');
    const patterns = [
        /\*\*n[uú]mero de (?:cards?|slides?) sugerido:\*\*\s*(\d+)/i,
        /n[uú]mero de (?:cards?|slides?)\s*:?\s*(\d+)/i,
        /(?:exactamente|exatamente|gere|crie|com)\s+(\d+)\s+(?:cards?|slides?)/i
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match?.[1]) return Number(match[1]);
    }

    return null;
}

function extractStructuredSlideCount(text = '') {
    const source = String(text || '');
    const numberedMatches = Array.from(source.matchAll(/(?:card|slide|slid|c[aá]rd)\s*(\d+)\s*[:)\].-]/gi));
    const uniqueIndexes = Array.from(new Set(numberedMatches
        .map(match => Number(match[1]))
        .filter(Number.isFinite)));

    if (uniqueIndexes.length >= 2) {
        return uniqueIndexes.length;
    }

    const lines = source
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*•]\s*/, '').trim());

    if (lines.length >= 3 && lines.length <= 10 && lines.every(line => line.length <= 180)) {
        return lines.length;
    }

    return null;
}

function resolveRequestedSlideCount(format, options = {}) {
    const limits = FORMAT_SLIDE_LIMITS[format];
    if (!limits) return 0;

    const explicit = clampSlideCount(
        options.slideCount
        ?? extractExplicitSlideCount(options.customBriefing || '')
        ?? extractExplicitSlideCount(options.customTopic || '')
        ?? extractStructuredSlideCount(options.customBriefing || '')
        ?? extractStructuredSlideCount(options.customTopic || ''),
        limits
    );

    return explicit;
}

function getReviewModeSlideCount(format, requestedCount = 0) {
    if (format === 'carousel-premium') {
        return REVIEW_MODE_PREMIUM_CAROUSEL_SLIDE_COUNT;
    }

    return requestedCount || 0;
}

function resolveHtmlTemplateSlideCount(templateId, requestedCount = null) {
    const limits = HTML_TEMPLATE_SLIDE_LIMITS[templateId] || FORMAT_SLIDE_LIMITS['carousel-html'];
    return clampSlideCount(requestedCount, limits);
}

function inferHtmlSlideCount(html = '') {
    const matches = String(html || '').match(/class=(["'])[^"']*\bslide\b[^"']*\1/gi);
    return matches?.length || 1;
}

function splitPremiumPromptBlocks(prompt = '') {
    return String(prompt || '')
        .split(/\n?---SEPARATOR---\n?/g)
        .map(block => block.trim())
        .filter(Boolean);
}

function normalizeMemoryValue(value = '') {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/[*#_[\]"]/g, '')
        .trim()
        .toLowerCase();
}

function toTitleCase(value = '') {
    return String(value || '')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function extractHeadlineSignal(post = {}) {
    const prompt = String(post.generationPrompt || '');
    const caption = String(post.caption || '');

    const candidates = [
        prompt.match(/\[TITLE:\s*(.*?)\]/i)?.[1],
        prompt.match(/\[HEADLINE:\s*(.*?)\]/i)?.[1],
        prompt.match(/\*\*HEADLINE:\*\*\s*([^\n]+)/i)?.[1],
        prompt.match(/^#\s+([^\n]+)/m)?.[1],
        caption.split(/\n|[.!?]/).map(item => item.trim()).find(Boolean)
    ].filter(Boolean);

    const headline = String(candidates[0] || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);

    return headline || null;
}

function extractCtaSignal(post = {}) {
    const caption = String(post.caption || '').toLowerCase();
    const ctaPatterns = [
        /salve(?: este| esse| agora| para depois)?/i,
        /salvar(?: este| esse| agora)?/i,
        /comente(?: aqui| abaixo)?/i,
        /comentar(?: aqui| abaixo)?/i,
        /siga(?: para mais)?/i,
        /seguir(?: para mais)?/i,
        /baixe(?: o app| agora)?/i,
        /teste(?: grátis| gratis| agora)?/i,
        /link no perfil/i,
        /link na bio/i,
        /compartilhe/i,
        /envie para/i
    ];

    for (const pattern of ctaPatterns) {
        const match = caption.match(pattern);
        if (match) return match[0];
    }

    return null;
}

function extractAngleSignal(post = {}) {
    const prompt = String(post.generationPrompt || '').toLowerCase();
    const angleMap = [
        ['top-down', ['top-down', 'overhead']],
        ['low-angle', ['low-angle', 'low angle', 'tilted-up', 'tilt-up']],
        ['high-angle', ['high-angle', 'high angle']],
        ['eye-level', ['eye-level', 'eye level']],
        ['close-up', ['close-up', 'close up']],
        ['macro', ['macro', 'extreme close-up', 'super macro']],
        ['side-profile', ['side profile', 'profile view']],
        ['diagonal', ['diagonal angle', 'diagonal tilt']]
    ];

    for (const [label, keywords] of angleMap) {
        if (keywords.some(keyword => prompt.includes(keyword))) {
            return label;
        }
    }

    return null;
}

function extractVisualStructureSignal(post = {}) {
    const prompt = String(post.generationPrompt || '').toLowerCase();
    const html = String(post.htmlContent || '').toLowerCase();

    if (prompt.includes('[premium_overlay]')) return 'premium-overlay';
    if (prompt.includes('[white_overlay]')) return 'white-overlay';
    if (html.includes('carousel-track') || html.includes('carousel-viewport')) return 'html-carousel';
    if (prompt.includes('floating 3d thought cards') || prompt.includes('floating cards')) return 'floating-cards';
    if (prompt.includes('split composition') || prompt.includes('diptych')) return 'split-composition';
    if (prompt.includes('top-down')) return 'top-down-editorial';
    if (prompt.includes('smartphone') || prompt.includes('phone')) return 'human-plus-phone';
    if (prompt.includes('close-up') || prompt.includes('macro')) return 'close-up-hero';
    if (prompt.includes('gradient')) return 'gradient-overlay';

    return post.format || post.type || null;
}

async function analyzeRecentEditorialMemory(businessProfileId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshot = await db.collection('posts')
        .where('businessProfileId', '==', businessProfileId)
        .get();

    const memory = {
        headlines: [],
        ctas: [],
        angles: [],
        visualStructures: []
    };

    snapshot.forEach(doc => {
        const post = doc.data();
        const createdAt = post.createdAt?.toDate?.() || new Date(post.createdAt || 0);
        if (createdAt < since) return;

        const headline = extractHeadlineSignal(post);
        const cta = extractCtaSignal(post);
        const angle = extractAngleSignal(post);
        const visualStructure = extractVisualStructureSignal(post);

        if (headline) memory.headlines.push(headline);
        if (cta) memory.ctas.push(cta);
        if (angle) memory.angles.push(angle);
        if (visualStructure) memory.visualStructures.push(visualStructure);
    });

    const unique = (values, limit = 5, formatter = value => value) => {
        const normalizedMap = new Map();
        values.forEach(value => {
            const key = normalizeMemoryValue(value);
            if (!key || normalizedMap.has(key)) return;
            normalizedMap.set(key, formatter(value));
        });
        return Array.from(normalizedMap.values()).slice(0, limit);
    };

    const recentHeadlines = unique(memory.headlines, 6);
    const recentCtas = unique(memory.ctas, 6, value => value.toUpperCase());
    const recentAngles = unique(memory.angles, 5, value => toTitleCase(value));
    const recentVisualStructures = unique(memory.visualStructures, 6, value => toTitleCase(value.replace(/-/g, ' ')));

    const avoidInstructions = [
        recentHeadlines.length > 0 ? `Avoid repeating these recent hooks/headlines: ${recentHeadlines.map(item => `"${item}"`).join(', ')}.` : '',
        recentCtas.length > 0 ? `Avoid repeating these recent CTA patterns: ${recentCtas.join(', ')}.` : '',
        recentAngles.length > 0 ? `Avoid these recently overused camera angles/compositions: ${recentAngles.join(', ')}.` : '',
        recentVisualStructures.length > 0 ? `Avoid these recently used visual structures: ${recentVisualStructures.join(', ')}.` : '',
        'Create a materially different hook, CTA, camera approach, and visual composition from the recent content history.'
    ].filter(Boolean);

    return {
        recentHeadlines,
        recentCtas,
        recentAngles,
        recentVisualStructures,
        avoidInstructions,
        summary: avoidInstructions.join(' ')
    };
}

// ---------------------------------------------------------------------------
// Seleção de pilar e formato
// ---------------------------------------------------------------------------

/**
 * Escolhe o pilar com maior déficit em relação ao seu peso-alvo
 */
function choosePillar(pillars, recentActivity, totalTarget, slotKind = 'post') {
    const enabled = pillars.filter(p => p.enabled !== false && supportsSlotKind(p, slotKind));
    if (enabled.length === 0) return null;

    const withDeficit = enabled.map(pillar => {
        const targetCount = Math.round((pillar.weight / 100) * totalTarget);
        const actualCount = recentActivity.byPilar[pillar.id] || 0;
        return { ...pillar, targetCount, actualCount, deficit: targetCount - actualCount };
    });

    // Maior déficit primeiro; em empate, maior peso
    withDeficit.sort((a, b) => b.deficit - a.deficit || b.weight - a.weight);
    return withDeficit[0];
}

// ---------------------------------------------------------------------------
// Reutilização de stories da biblioteca
// ---------------------------------------------------------------------------

/**
 * Busca um story elegível da biblioteca para reutilizar num slot.
 * Regras:
 *   - Formato story com mediaUrls
 *   - lastScheduledAt ausente OU mais antigo que minDaysGap dias atrás
 *   - ID não pode estar na lista de exclusão (já usados neste lote)
 *   - Prioriza o menos usado recentemente (LRU)
 */
async function selectStoryFromLibrary(businessProfileId, excludeIds = [], minDaysGap = 2) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDaysGap);

    const snapshot = await db.collection('library_items')
        .where('businessProfileId', '==', businessProfileId)
        .get();

    const eligible = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
            const fmt = item.format || item.type || '';
            if (!isStoryFormat(fmt)) return false;
            if (!item.mediaUrls?.length) return false;
            if (excludeIds.includes(item.id)) return false;
            if (item.lastScheduledAt) {
                const last = item.lastScheduledAt.toDate
                    ? item.lastScheduledAt.toDate()
                    : new Date(item.lastScheduledAt);
                if (last > cutoff) return false;
            }
            return true;
        })
        .sort((a, b) => {
            const toMs = v => v ? (v.toDate ? v.toDate().getTime() : new Date(v).getTime()) : 0;
            return toMs(a.lastScheduledAt) - toMs(b.lastScheduledAt);
        });

    return eligible[0] || null;
}

/**
 * Cria um rascunho de story reutilizando um item da biblioteca já existente.
 * Marca lastScheduledAt no item para controle de cooldown.
 */
async function createDraftFromLibraryStory(libraryItem, slotDate, businessProfileId, pillarId, pillarName, userId) {
    const postDoc = createStoryDraftRecord({
        userId,
        businessProfileId,
        mediaUrls: libraryItem.mediaUrls,
        caption: '',
        scheduledFor: slotDate || null,
        pillarId,
        pillarName,
        generatedBy: 'library-reuse',
        generationPrompt: '',
        libraryItemId: libraryItem.id,
        needsAccount: true,
        extra: {
            frameCount: libraryItem.mediaUrls.length,
            reusedFromLibrary: true
        }
    });

    const ref = await db.collection('posts').add(postDoc);

    await db.collection('library_items').doc(libraryItem.id).update({
        lastScheduledAt: new Date(),
        isScheduled: true
    });

    return { id: ref.id, ...postDoc };
}

/**
 * Escolhe um formato dos preferidos do pilar
 */
function chooseFormat(pillar, slotKind = 'post') {
    const formats = pillar.formats?.length > 0 ? pillar.formats : ['static'];
    if (slotKind === 'story') {
        return formats.includes('story') ? 'story' : null;
    }
    // Por enquanto, não incluir reels no Content Autopilot
    const filteredFormats = formats.filter(f => f !== 'reel' && f !== 'story');
    if (filteredFormats.length === 0) return 'static';
    return filteredFormats[Math.floor(Math.random() * filteredFormats.length)];
}

// ---------------------------------------------------------------------------
// Geração de slots de horário
// ---------------------------------------------------------------------------

const DAY_MAP = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
};
const ALL_DAYS = Object.keys(DAY_MAP);

function normalizeTimeString(time, fallback = '09:00') {
    const value = typeof time === 'string' ? time.trim() : '';
    if (!/^\d{2}:\d{2}$/.test(value)) return fallback;
    return value;
}

function supportsSlotKind(pillar, slotKind) {
    const formats = pillar.formats?.length > 0 ? pillar.formats : ['static'];
    if (slotKind === 'story') return formats.includes('story');
    return formats.some(format => format !== 'story' && format !== 'reel');
}

/**
 * Retorna os próximos N slots futuros baseados em contentSchedule.
 * Varre os próximos 14 dias para garantir que sempre haja slots disponíveis,
 * independente de quantos dias da semana atual já passaram.
 */
function buildSlots({ days, times, count, startDate, slotKind, lookaheadDays = 14 }) {
    const normalizedDays = (Array.isArray(days) && days.length > 0 ? days : ALL_DAYS)
        .filter(day => day in DAY_MAP);
    const normalizedTimes = (Array.isArray(times) && times.length > 0 ? times : ['09:00'])
        .map(time => normalizeTimeString(time))
        .filter(Boolean);

    const slots = [];
    for (let daysAhead = 0; daysAhead <= lookaheadDays && slots.length < count; daysAhead++) {
        const candidate = new Date(startDate);
        candidate.setDate(startDate.getDate() + daysAhead);

        const dayName = ALL_DAYS[candidate.getDay()];
        if (!normalizedDays.includes(dayName)) continue;

        for (const time of normalizedTimes) {
            if (slots.length >= count) break;
            const [h, m] = time.split(':').map(Number);
            const slot = new Date(candidate);
            slot.setHours(h, m, 0, 0);
            if (slot >= startDate) {
                slots.push({ date: slot, kind: slotKind });
            }
        }
    }

    return slots;
}

function getWeeklySlots(contentSchedule, weekStartDate = new Date()) {
    const now = new Date();
    const startDate = weekStartDate > now ? new Date(weekStartDate) : now;
    const preferredDays = contentSchedule.preferredDays || ['tuesday', 'thursday', 'saturday'];
    const preferredTimes = contentSchedule.preferredTimes || ['09:00', '18:00'];
    const storyPreferredDays = contentSchedule.storyPreferredDays || ALL_DAYS;
    const storyPreferredTimes = contentSchedule.storyPreferredTimes || [preferredTimes[0] || '12:00'];
    const postsPerWeek = Math.max(0, Number(contentSchedule.postsPerWeek || 0));
    const storiesPerWeek = Math.max(0, Number(contentSchedule.storiesPerWeek || 0));

    const postSlots = buildSlots({
        days: preferredDays,
        times: preferredTimes,
        count: postsPerWeek,
        startDate,
        slotKind: 'post'
    });

    const storySlots = buildSlots({
        days: storyPreferredDays,
        times: storyPreferredTimes,
        count: storiesPerWeek,
        startDate,
        slotKind: 'story'
    });

    return [...postSlots, ...storySlots].sort((a, b) => a.date - b.date);
}

// ---------------------------------------------------------------------------
// Contexto para IA
// ---------------------------------------------------------------------------

function buildGenerationContext(profile, pillar, editorialMemory = null) {
    // generateImagePrompt expects: { brandName, brandContext, brandingStyle, contentStrategy, branding, savedPrompts }
    return {
        brandName: profile.name,
        brandKey: profile.brandKey || '',
        profileDescription: profile.brandContext || profile.description || '',
        guidelines: profile.branding?.guidelines || profile.aiPreferences?.guidelines || '',
        brandContext: profile.brandContext || '',
        brandingStyle: profile.aiPreferences?.style || profile.branding?.style || '',
        contentStrategy: `Pilar: "${pillar.name}". ${pillar.description}. Tom: ${pillar.captionStyle || ''}. ${profile.contentStrategy || ''}`,
        targetAudience: profile.targetAudience || '',
        productService: profile.productService || '',
        branding: profile.branding,
        aiPreferences: profile.aiPreferences,
        brandKit: profile.brandKit,
        savedPrompts: profile.aiPreferences?.favoritePrompts || [],
        editorialMemory
    };
}

function applyGenerationContextOverrides(profile, overrides = {}) {
    const branding = { ...(profile.branding || {}) };

    if (Object.prototype.hasOwnProperty.call(overrides, 'brandingGuidelines')) {
        branding.guidelines = overrides.brandingGuidelines || '';
    }

    return {
        ...profile,
        brandContext: Object.prototype.hasOwnProperty.call(overrides, 'brandContext')
            ? (overrides.brandContext || '')
            : (profile.brandContext || ''),
        contentStrategy: Object.prototype.hasOwnProperty.call(overrides, 'contentStrategy')
            ? (overrides.contentStrategy || '')
            : (profile.contentStrategy || ''),
        targetAudience: Object.prototype.hasOwnProperty.call(overrides, 'targetAudience')
            ? (overrides.targetAudience || '')
            : (profile.targetAudience || ''),
        productService: Object.prototype.hasOwnProperty.call(overrides, 'productService')
            ? (overrides.productService || '')
            : (profile.productService || ''),
        branding,
        generationAdditionalInstructions: Object.prototype.hasOwnProperty.call(overrides, 'additionalInstructions')
            ? (overrides.additionalInstructions || '')
            : ''
    };
}

function buildSlotGenerationSeed(pillar, options = {}) {
    const customTopic = String(options.customTopic || '').trim();
    const customBriefing = String(options.customBriefing || '').trim();
    const base = customTopic || `${pillar.name}: ${pillar.description}`;

    if (!customBriefing) return base;
    return `${base}. Briefing específico: ${customBriefing}`;
}

function enrichContextForSlot(context, options = {}) {
    const additions = [
        options.customTopic ? `Tema específico aprovado pelo usuário: ${options.customTopic}.` : '',
        options.customBriefing ? `Briefing adicional obrigatório para este conteúdo: ${options.customBriefing}.` : '',
        options.additionalInstructions ? `Instruções globais adicionais do perfil para esta geração: ${options.additionalInstructions}.` : ''
    ].filter(Boolean);

    if (additions.length === 0) return context;

    return {
        ...context,
        contentStrategy: [context.contentStrategy, ...additions].filter(Boolean).join(' ')
    };
}

// ---------------------------------------------------------------------------
// ElevePic Moodboard — geração com imagens IA
// ---------------------------------------------------------------------------

/**
 * Gera conteúdo textual JSON para o template moodboard ElevePic via Gemini.
 * Retorna { brandName, slides: [{eyebrow, headline, subtext}x6] }
 */
async function generateMoodboardTextContent(topic, brandContext) {
    const brandName = brandContext.brandName || brandContext.name || 'ElevePic';
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY não configurada');

    const systemPrompt = `You are a brand content strategist for ${brandName}.
Generate concise, impactful text for a 6-slide vintage editorial moodboard Instagram carousel.
Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
{
  "brandName": "${brandName}",
  "slides": [
    { "eyebrow": "SHORT LABEL", "headline": "Title with optional <em>one italic word</em>", "subtext": "One supporting sentence max 12 words" },
    ... 6 total
  ]
}
Rules:
- Content theme: ${topic}
- Eyebrows: 1-3 word uppercase labels (e.g. "THE TRUTH", "THE GAP", "THE SHIFT")
- Headlines: 4-8 words, can use <em> around ONE word for elegance
- Subtext: 1 short sentence, max 12 words
- Slides should build a narrative arc: hook → tension → insight → method → proof → CTA
- Tone: premium, sophisticated, authoritative (elevepic brand voice)
- Write in Portuguese (Brazil)`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const response = await axios.post(url, {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: `Create moodboard carousel content for: "${topic}"` }] }],
        generationConfig: { temperature: 0.7 }
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

    const raw = String(response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}').trim();
    const cleaned = raw.startsWith('```') ? raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '') : raw;
    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Falha ao parsear JSON de conteúdo moodboard');
    }
}

/**
 * Builds image generation prompts for ElevePic moodboard polaroid/film frames.
 */
function buildMoodboardImagePrompts(topic, profile, count = 3) {
    const style = profile.aiPreferences?.style
        || 'Dramatic cinematic lighting, luxury corporate aesthetic, high-status environments, editorial photography';
    const angles = [
        'wide establishing shot with dramatic depth of field',
        'medium close-up portrait with cinematic lighting',
        'detail shot, high contrast, artistic composition'
    ];
    return Array.from({ length: count }, (_, i) =>
        `${topic}, ${angles[i % angles.length]}, ${style}, no text overlay, no logos, photorealistic, film grain, moody atmosphere, 4:5 aspect ratio`
    );
}

/**
 * Gera o HTML do moodboard ElevePic usando o template real + imagens geradas por IA.
 * Usado pelo modo autopilot/revisão para o perfil elevepic.
 */
async function generateElevepicMoodboardHtml(topic, profile) {
    const brandContext = {
        brandName: profile.name,
        primaryColor: profile.branding?.primaryColor || '#3542ed',
        secondaryColor: profile.branding?.secondaryColor || '#0c0e1c',
        branding: profile.branding || {},
    };

    console.log('📋 [Moodboard] Gerando conteúdo textual via Gemini...');
    const contentJson = await generateMoodboardTextContent(topic, brandContext);

    console.log('🖼️ [Moodboard] Gerando imagens IA (3x) com estética ElevePic...');
    const imagePrompts = buildMoodboardImagePrompts(topic, profile, 3);
    const generatedImages = [];
    for (const prompt of imagePrompts) {
        const url = await generateSingleImage(
            prompt, '4:5', '', false,
            { ...profile, skipLegacyOverlayComposition: true, isPremiumCarousel: true }
        ).catch(err => { console.warn('⚠️ [Moodboard] Imagem falhou:', err.message); return null; });
        if (url) generatedImages.push(url);
    }

    console.log(`🎨 [Moodboard] Renderizando template com ${generatedImages.length} imagens...`);
    const html = renderElevepicTemplate('moodboard', contentJson, brandContext, generatedImages);
    if (!html) throw new Error('renderElevepicTemplate retornou HTML vazio');
    return html;
}

// ---------------------------------------------------------------------------
// Geração de um único post rascunho
// ---------------------------------------------------------------------------

/**
 * Gera um post rascunho para o pilar e formato indicados
 */
export async function generateDraftPost(businessProfileId, pillarId, format, scheduledFor, accountId, options = {}) {
    const profile = await getBusinessProfile(businessProfileId);
    const merged = mergeBrandProfileDefaults(profile);
    const resolvedProfile = applyGenerationContextOverrides(merged, options.generationContextOverrides || {});
    const resolvedFormat = normalizeFormat(format, 'static');

    const pillar = resolvedProfile.editorialPillars?.find(p => p.id === pillarId);
    if (!pillar) throw new Error(`Pilar "${pillarId}" não encontrado no perfil.`);

    const editorialMemory = await analyzeRecentEditorialMemory(businessProfileId, 30);
    const generationSeed = buildSlotGenerationSeed(pillar, options);
    const context = enrichContextForSlot(
        buildGenerationContext(resolvedProfile, pillar, editorialMemory),
        {
            customTopic: options.customTopic || '',
            customBriefing: options.customBriefing || '',
            additionalInstructions: resolvedProfile.generationAdditionalInstructions || ''
        }
    );
    const aspectRatio = getAspectRatioForFormat(
        resolvedFormat,
        resolvedProfile.aiPreferences?.defaultAspectRatio || '4:5'
    );
    const brandingStyle = resolvedProfile.aiPreferences?.style || resolvedProfile.branding?.style || '';
    const requestedSlideCount = resolveRequestedSlideCount(resolvedFormat, options);

    let mediaUrls = [];
    let caption = '';
    let generationPrompt = '';
    let premiumLayout = null;
    let premiumLayouts = null;
    let sourceMediaUrls = null;
    let overlayData = null;
    let premiumOverlayBakedAt = null;
    let libraryItemId = null;

    if (isHtmlFormat(resolvedFormat)) {
        // HTML/CSS carousel — gera HTML puro, sem imagens
        const topic = generationSeed;
        const htmlContext = {
            ...context,
            brandName: resolvedProfile.name,
            brandKey: resolvedProfile.brandKey,
            branding: resolvedProfile.branding,
            targetAudience: resolvedProfile.targetAudience,
            contentStrategy: context.contentStrategy
        };
        const recentActivityForTemplate = await analyzeRecentPosts(businessProfileId, 14).catch(() => ({}));
        const chosenTemplate = selectHtmlTemplate(pillar, recentActivityForTemplate);
        const templateSlideCount = resolveHtmlTemplateSlideCount(chosenTemplate, requestedSlideCount);

        // ElevePic moodboard: usar template real com imagens geradas por IA
        let html = null;
        if (chosenTemplate === 'moodboard' && resolvedProfile.brandKey === 'elevepic') {
            html = await generateElevepicMoodboardHtml(topic, resolvedProfile).catch(err => {
                console.warn('⚠️ [Autopilot] Moodboard IA falhou, usando fallback generateHtmlCarousel:', err.message);
                return null;
            });
        }
        if (!html) {
            html = await generateHtmlCarousel(topic, htmlContext, chosenTemplate, templateSlideCount);
        }

        generationPrompt = topic;
        // Para drafts HTML, armazenamos o HTML como dado especial (sem mediaUrls)
        if (!html) throw new Error('HTML carousel vazio retornado pela IA.');
        const htmlSlideCount = inferHtmlSlideCount(html);

        // Generate caption automatically for HTML carousels
        try {
            const htmlWithoutScriptsStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            const rawText = htmlWithoutScriptsStyles.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
            const contentText = rawText.substring(0, 800) || topic || 'marketing';
            
            const profileContext = `Sobre o perfil: ${resolvedProfile.name}. ${resolvedProfile.brandContext || resolvedProfile.description || ''}\nTom: ${pillar.captionStyle || ''}\nDiretrizes: ${resolvedProfile.branding?.guidelines || ''}\nATENÇÃO: NUNCA invente funcionalidades ou serviços que não estão descritos aqui (ex: se for sobre alimentação, não fale de app de treino).`;
            const captionPrompt = `Crie uma legenda para um post de carrossel.\nAssunto do carrossel: "${contentText}"\n${profileContext}`;
            
            const { default: OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'Você é um especialista em criar captions para Instagram. Crie uma caption envolvente (2-4 linhas), adicione 5-8 hashtags relevantes no final. NÃO invente informações falsas sobre a marca.' },
                    { role: 'user', content: captionPrompt }
                ],
                max_tokens: 300,
                temperature: 0.8,
            });
            caption = completion.choices[0].message.content.trim();
            console.log('✅ Caption auto-gerada para carrossel HTML');
        } catch (err) {
            console.warn('⚠️ Falha ao gerar caption para carrossel HTML:', err.message);
        }

        try {
            const libraryItem = createLibraryItemRecord({
                userId: profile.userId,
                businessProfileId,
                type: resolvedFormat,
                htmlCode: html,
                caption: caption || '',
                tag: 'auto',
                extra: {
                    slideCount: htmlSlideCount,
                    pillarId: pillar.id,
                    pillarName: pillar.name,
                    generatedBy: 'auto',
                    carouselTemplateId: chosenTemplate,
                    requestedSlideCount: templateSlideCount,
                    generationInput: {
                        customTopic: options.customTopic || '',
                        customBriefing: options.customBriefing || '',
                        generationContextOverrides: options.generationContextOverrides || {},
                        slideCount: templateSlideCount
                    }
                }
            });
            const libraryRef = await db.collection('library_items').add(libraryItem);
            libraryItemId = libraryRef.id;
        } catch (libErr) {
            console.warn('⚠️ Falha ao salvar carrossel HTML na biblioteca (não bloqueia geração):', libErr.message);
        }

        const postDoc = createHtmlCarouselDraftRecord({
            userId: profile.userId,
            accountId: accountId || null,
            businessProfileId,
            htmlContent: html,
            caption,
            scheduledFor: scheduledFor || null,
            needsAccount: !accountId,
            pillarId: pillar.id,
            pillarName: pillar.name,
            generatedBy: 'auto',
            generationPrompt,
            slideCount: htmlSlideCount,
            theme: resolvedProfile.brandKey || null,
            libraryItemId,
            extra: {
                carouselTemplateId: chosenTemplate,
                requestedSlideCount: templateSlideCount,
                generationInput: {
                    customTopic: options.customTopic || '',
                    customBriefing: options.customBriefing || '',
                    generationContextOverrides: options.generationContextOverrides || {},
                    slideCount: templateSlideCount
                }
            }
        });
        const ref = await db.collection('posts').add(postDoc);
        return { id: ref.id, ...postDoc };

    } else if (resolvedFormat === 'carousel-premium') {
        // Carrossel com overlay premium — plano de conteúdo unificado (slides + legenda + CTA coerentes)
        const description = generationSeed;
        const premiumContext = { ...context, isPremiumCarousel: true, overlayMode: 'premium' };

        // 1 chamada gera narrativa, copy dos slides e legenda alinhadas; em falha, cai no fluxo legado
        let planTagPrompts = null;
        try {
            const { plan, warnings } = await generateContentPlan({
                description,
                count: requestedSlideCount,
                context: premiumContext,
                premium: true
            });
            planTagPrompts = plan.slides.map(slide => serializeSlideToTagPrompt(slide, { premium: true }));
            caption = [plan.caption, (plan.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
            if (warnings?.length) {
                console.warn(`⚠️ [Autopilot] QA do plano retornou ${warnings.length} warning(s):`, warnings.map(w => w.rule || w.detail).join(' | '));
            }
        } catch (planErr) {
            console.warn('⚠️ [Autopilot] Content plan falhou; usando geração legada de prompts:', planErr.message);
        }

        const result = await generateCarousel(
            planTagPrompts || description,
            aspectRatio,
            requestedSlideCount,
            brandingStyle,
            'gemini',
            premiumContext,
            businessProfileId
        );
        mediaUrls = (result.images || []).filter(Boolean);
        generationPrompt = Array.isArray(result.prompts) && result.prompts.length > 0
            ? result.prompts.join('\n---SEPARATOR---\n')
            : description;

    } else if (resolvedFormat === 'carousel') {
        const description = generationSeed;
        const result = await generateCarousel(
            description,
            aspectRatio,
            requestedSlideCount,
            brandingStyle,
            'gemini',
            context,
            businessProfileId
        );
        mediaUrls = (result.images || []).filter(Boolean);

    } else {
        // static, story, reel
        const concept = generationSeed;
        const prompt = await generateImagePrompt(concept, context);
        const images = await generateImages(prompt, aspectRatio, 1, brandingStyle, false, context);
        mediaUrls = (images || []).filter(Boolean);
        generationPrompt = prompt;
    }

    if (!caption && mediaUrls.length > 0 && !isStoryFormat(resolvedFormat)) {
        caption = await generateImageCaption(
            mediaUrls[0],
            resolvedProfile.name,
            `${pillar.description}. ${pillar.captionStyle || ''}`,
            resolvedProfile.branding?.guidelines || '',
            editorialMemory,
            resolvedProfile
        );
    }

    if (resolvedFormat === 'carousel-premium' && mediaUrls.length > 0) {
        sourceMediaUrls = [...mediaUrls];
        premiumLayouts = buildPremiumLayoutsFromPrompt(
            generationPrompt || generationSeed,
            resolvedProfile,
            caption || generationSeed,
            mediaUrls.length
        );
        premiumLayout = premiumLayouts[0] || normalizePremiumLayout(
            extractPremiumLayoutFromPrompt(
                generationPrompt || generationSeed,
                resolvedProfile,
                caption || generationSeed
            ),
            resolvedProfile,
            caption || generationSeed
        );
        overlayData = buildOverlayDataFromPremiumLayout(premiumLayout);

        try {
            const baked = await bakePremiumDraftMedia({
                businessProfileId,
                mediaUrls,
                premiumLayout,
                premiumLayouts,
                generationPrompt,
                caption
            });
            if (baked.baked) {
                mediaUrls = baked.mediaUrls;
                premiumLayout = baked.premiumLayout || premiumLayout;
                premiumLayouts = baked.premiumLayouts || premiumLayouts;
                premiumOverlayBakedAt = new Date();
            }
        } catch (premiumBakeErr) {
            console.error(`⚠️ Erro ao assar overlay premium na geração: ${premiumBakeErr.message}`);
        }
    }

    if (mediaUrls.length === 0) {
        throw new Error('Nenhuma mídia gerada para o post.');
    }

    const baseType = getBaseTypeForFormat(resolvedFormat);
    const generatedSlideCount = mediaUrls.length;

    // Save generated images to library so they can be reused
    try {
        const libraryItem = createLibraryItemRecord({
            userId: profile.userId,
            businessProfileId,
            type: resolvedFormat,
            mediaUrls,
            caption: caption || '',
            tag: 'auto',
            extra: {
                slideCount: generatedSlideCount,
                pillarId: pillar.id,
                pillarName: pillar.name,
                generatedBy: 'auto',
                sourceMediaUrls,
                premiumLayout,
                premiumLayouts,
                overlayData,
                premiumOverlayBakedAt,
                generationInput: {
                    customTopic: options.customTopic || '',
                    customBriefing: options.customBriefing || '',
                    generationContextOverrides: options.generationContextOverrides || {},
                    slideCount: requestedSlideCount || generatedSlideCount
                }
            }
        });
        const libraryRef = await db.collection('library_items').add(libraryItem);
        libraryItemId = libraryRef.id;
    } catch (libErr) {
        console.warn('⚠️ Falha ao salvar na biblioteca (não bloqueia geração):', libErr.message);
    }

    let post;

    if (accountId) {
        // Conta vinculada: usa o fluxo normal (createPost lida com scheduling externo)
        post = await createPost(profile.userId, accountId, {
            type: baseType,
            format: resolvedFormat,
            mediaUrls,
            caption,
            scheduledFor: scheduledFor || null,
            isDraft: true,
            pillarId: pillar.id,
            pillarName: pillar.name,
            generatedBy: 'auto',
            generationPrompt,
            libraryItemId,
            extra: {
                slideCount: generatedSlideCount,
                sourceMediaUrls,
                premiumLayout,
                premiumLayouts,
                overlayData,
                premiumOverlayBakedAt,
                generationInput: {
                    customTopic: options.customTopic || '',
                    customBriefing: options.customBriefing || '',
                    generationContextOverrides: options.generationContextOverrides || {},
                    slideCount: requestedSlideCount || generatedSlideCount
                }
            }
        });
    } else {
        // Sem conta vinculada: salva draft diretamente — conta será definida na aprovação
        const commonDraftInput = {
            userId: profile.userId,
            accountId: null,
            businessProfileId,
            mediaUrls,
            caption,
            scheduledFor: scheduledFor || null,
            pillarId: pillar.id,
            pillarName: pillar.name,
            generatedBy: 'auto',
            generationPrompt,
            libraryItemId,
            needsAccount: true,
            format: resolvedFormat,
            extra: {
                slideCount: generatedSlideCount,
                sourceMediaUrls,
                premiumLayout,
                premiumLayouts,
                overlayData,
                premiumOverlayBakedAt,
                generationInput: {
                    customTopic: options.customTopic || '',
                    customBriefing: options.customBriefing || '',
                    generationContextOverrides: options.generationContextOverrides || {},
                    slideCount: requestedSlideCount || generatedSlideCount
                }
            }
        };
        const postDoc = resolvedFormat === 'story'
            ? createStoryDraftRecord(commonDraftInput)
            : resolvedFormat === 'reel'
                ? createReelDraftRecord({
                    ...commonDraftInput,
                    videoUrl: mediaUrls[0] || null,
                    thumbnailUrl: mediaUrls[1] || mediaUrls[0] || null
                })
                : createFeedPostDraftRecord(commonDraftInput);
        const ref = await db.collection('posts').add(postDoc);
        post = { id: ref.id, ...postDoc };
    }

    return post;
}

// ---------------------------------------------------------------------------
// Preview do plano (sem gerar conteúdo — só calcula o que seria gerado)
// ---------------------------------------------------------------------------

/**
 * Retorna um preview do plano semanal sem chamar nenhuma IA.
 * Usado para o usuário visualizar e confirmar antes de gerar.
 */
export async function previewWeeklyPlan(businessProfileId, weekStartDate = new Date()) {
    const profile = await getBusinessProfile(businessProfileId);
    const merged = mergeBrandProfileDefaults(profile);

    const pillars = merged.editorialPillars || [];
    const schedule = merged.contentSchedule || {};
    const accounts = await getAccountsByProfile(businessProfileId);

    // Health checks
    const checks = {
        hasPillars: pillars.filter(p => p.enabled !== false).length > 0,
        hasAccount: accounts.length > 0,
        hasSchedule: ((schedule.postsPerWeek || 0) + (schedule.storiesPerWeek || 0)) > 0,
        pillarWeightOk: pillars.reduce((s, p) => s + (p.weight || 0), 0) === 100,
        autonomyMode: schedule.autonomyMode || 'manual'
    };

    const slots = getWeeklySlots(schedule, weekStartDate);
    const recentActivity = accounts.length > 0
        ? await analyzeRecentPosts(businessProfileId, 7)
        : { byPilar: {}, byFormat: {}, total: 0 };

    // Simula a seleção de pilares para cada slot.
    // No modo de revisão, o objetivo é refletir o mix configurado no perfil
    // para a semana atual, sem puxar a distribuição para compensar o histórico
    // recente. O histórico continua sendo retornado apenas como referência.
    const plan = [];
    const simActivity = {
        byPilar: {},
        byFormat: {},
        byTemplate: {},
        total: 0
    };

    const totalPostSlots = slots.filter(slot => slot.kind === 'post').length;
    const totalStorySlots = slots.filter(slot => slot.kind === 'story').length;

    for (const slot of slots) {
        const totalTarget = slot.kind === 'story' ? totalStorySlots : totalPostSlots;
        const pillar = choosePillar(pillars, simActivity, totalTarget || slots.length, slot.kind);
        if (!pillar) break;
        const format = chooseFormat(pillar, slot.kind);
        if (!format) continue;

        plan.push({
            slot: slot.date.toISOString(),
            slotLabel: slot.date.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            pillarId: pillar.id,
            pillarName: pillar.name,
            pillarColor: null, // será definido no frontend
            format,
            slideCount: getReviewModeSlideCount(format),
            weight: pillar.weight,
            slotKind: slot.kind
        });

        simActivity.byPilar[pillar.id] = (simActivity.byPilar[pillar.id] || 0) + 1;
        simActivity.total++;
    }

    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Build rich pillar descriptions map
        const pillarDescMap = {};
        for (const p of pillars) {
            pillarDescMap[p.id] = {
                name: p.name,
                description: p.description || '',
                captionStyle: p.captionStyle || '',
                formats: (p.formats || []).join(', ')
            };
        }

        // Rich brand context block
        const brandBlock = [
            `Marca: ${merged.name}`,
            merged.brandContext ? `Sobre a marca: ${merged.brandContext}` : '',
            merged.targetAudience ? `Público-alvo: ${merged.targetAudience}` : '',
            merged.productService ? `Produto/Serviço: ${merged.productService}` : '',
            merged.contentStrategy ? `Estratégia de conteúdo: ${merged.contentStrategy}` : '',
            merged.branding?.guidelines ? `Diretrizes da marca: ${merged.branding.guidelines}` : '',
        ].filter(Boolean).join('\n');

        // Slots descriptions with full pillar context per slot
        const slotsBlock = plan.map((p, i) => {
            const pd = pillarDescMap[p.pillarId] || {};
            return [
                `Slot ${i + 1}:`,
                `  Pilar: ${pd.name || p.pillarName}`,
                pd.description ? `  Descrição do pilar: ${pd.description}` : '',
                pd.captionStyle ? `  Tom/Estilo: ${pd.captionStyle}` : '',
                pd.formats ? `  Formatos disponíveis: ${pd.formats}` : '',
                `  Formato escolhido: ${p.format}`,
            ].filter(Boolean).join('\n');
        }).join('\n\n');

        const systemPrompt = `Você é o estrategista sênior de conteúdo responsável pela marca abaixo. Sua tarefa é definir temas e briefings específicos e relevantes para cada slot de postagem da semana.

CONTEXTO DA MARCA:
${brandBlock}

PILARES E SLOTS DA SEMANA:
${slotsBlock}

INSTRUÇÕES:
- Cada tema ("topic") deve ser uma ideia de conteúdo DIRETAMENTE relacionada ao pilar e à marca. Máximo 7 palavras.
- O briefing ("briefing") deve ser um direcional criativo de 1 linha que guia a produção daquele post específico.
- NUNCA sugira temas genéricos ou de outras marcas/categorias (ex: moda, viagem, etc.) se a marca não for desse segmento.
- O tema deve ser algo que um seguidor desta marca reconheceria como conteúdo do perfil.
- Varie os ângulos entre os slots do mesmo pilar para não repetir o mesmo tipo de post.

Retorne SOMENTE um JSON válido com a chave "topics" contendo um array de ${plan.length} objetos, cada um com "topic" e "briefing".`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: systemPrompt }],
            response_format: { type: 'json_object' },
            temperature: 0.75
        });

        const topicsArray = JSON.parse(completion.choices[0].message.content).topics || [];
        topicsArray.forEach((t, i) => {
            if (plan[i]) {
                plan[i].customTopic = t.topic || '';
                plan[i].customBriefing = t.briefing || '';
            }
        });
    } catch (e) {
        console.warn('⚠️ Falha ao pré-gerar tópicos para o preview:', e.message);
    }

    return {
        profile: { id: businessProfileId, name: merged.name, brandKey: merged.brandKey },
        account: accounts[0] || null,
        checks,
        plan,
        pillars: pillars.filter(p => p.enabled !== false),
        schedule,
        recentActivity
    };
}

// ---------------------------------------------------------------------------
// Geração do plano semanal completo
// ---------------------------------------------------------------------------

/**
 * Gera todos os posts rascunho da semana para um perfil de negócio
 */
export async function generateWeeklyPlan(businessProfileId, weekStartDate = new Date(), customPlan = null, generationContextOverrides = {}, onProgress = null) {
    const profile = await getBusinessProfile(businessProfileId);
    const merged = mergeBrandProfileDefaults(profile);

    const pillars = merged.editorialPillars || [];
    const schedule = merged.contentSchedule || {};

    if (pillars.length === 0) {
        throw new Error('Nenhum pilar editorial configurado para este perfil.');
    }

    const accounts = await getAccountsByProfile(businessProfileId);
    const accountId = accounts.length > 0 ? accounts[0].id : null;

    const recentActivity = await analyzeRecentPosts(businessProfileId, 7);

    // If user provided a custom plan (edited on frontend), use it directly
    if (customPlan && Array.isArray(customPlan) && customPlan.length > 0) {
        console.log(`🗓️ Usando plano personalizado com ${customPlan.length} slots para "${merged.name}"`);

        const results = [];
        const errors = [];
        const completedItems = [];

        onProgress?.({ totalPosts: customPlan.length, currentIndex: -1, completedItems });

        for (let i = 0; i < customPlan.length; i++) {
            const slotItem = customPlan[i];
            const slotDate = slotItem.slot ? new Date(slotItem.slot) : new Date();
            const pillar = pillars.find(p => p.id === slotItem.pillarId) || pillars[0];
            const format = slotItem.format;
            const slideCount = getReviewModeSlideCount(format, slotItem.slideCount);
            const title = slotItem.customTopic || pillar.name;

            onProgress?.({ currentIndex: i, currentPostTitle: title });

            try {
                console.log(`  [${i + 1}/${customPlan.length}] Pilar: "${pillar.name}" | Formato: ${format} | Slot: ${slotDate.toLocaleString('pt-BR')}`);
                const post = await generateDraftPost(businessProfileId, pillar.id, format, slotDate, accountId, {
                    customTopic: slotItem.customTopic || '',
                    customBriefing: slotItem.customBriefing || '',
                    slideCount,
                    generationContextOverrides
                });
                results.push(post);
                completedItems.push({ index: i, title, format, status: 'done' });
                onProgress?.({ completedItems: [...completedItems] });
            } catch (err) {
                console.error(`  ❌ Erro no post ${i + 1}: ${err.message}`);
                errors.push({ slot: slotDate.toISOString(), error: err.message });
                completedItems.push({ index: i, title, format, status: 'error' });
                onProgress?.({ completedItems: [...completedItems] });
            }
        }

        console.log(`✅ Plano personalizado concluído: ${results.length} gerados, ${errors.length} erros`);
        return { generated: results.length, failed: errors.length, posts: results, errors, week: weekStartDate.toISOString() };
    }

    // Default: auto-calculate slots from profile schedule
    const slots = getWeeklySlots(schedule, weekStartDate);

    if (slots.length === 0) {
        throw new Error('Nenhum slot disponível para a semana (todos os horários já passaram ou nenhum configurado).');
    }

    console.log(`🗓️ Gerando ${slots.length} posts para "${merged.name}" — semana de ${weekStartDate.toLocaleDateString('pt-BR')}`);

    const results = [];
    const errors = [];
    const completedItems = [];
    const totalPostSlots = slots.filter(slot => slot.kind === 'post').length;
    const totalStorySlots = slots.filter(slot => slot.kind === 'story').length;
    const usedStoryLibraryIds = []; // tracks IDs reused this batch to avoid duplicates

    onProgress?.({ totalPosts: slots.length, currentIndex: -1, completedItems });

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        let title = 'Post';
        let actFormat = 'static';

        try {
            const totalTarget = slot.kind === 'story' ? totalStorySlots : totalPostSlots;
            const pillar = choosePillar(pillars, recentActivity, totalTarget || slots.length, slot.kind);
            if (!pillar) break;

            const format = chooseFormat(pillar, slot.kind);
            if (!format) continue;

            title = pillar.name;
            actFormat = format;
            onProgress?.({ currentIndex: i, currentPostTitle: title });

            console.log(`  [${i + 1}/${slots.length}] Tipo: ${slot.kind} | Pilar: "${pillar.name}" | Formato: ${format} | Slot: ${slot.date.toLocaleString('pt-BR')}`);

            let post;

            // Stories: try to reuse an eligible library item first (cooldown: 2 days)
            if (slot.kind === 'story') {
                const libraryStory = await selectStoryFromLibrary(businessProfileId, usedStoryLibraryIds, 2);
                if (libraryStory) {
                    usedStoryLibraryIds.push(libraryStory.id);
                    console.log(`    ♻️ Reutilizando story da biblioteca: ${libraryStory.id}`);
                    post = await createDraftFromLibraryStory(libraryStory, slot.date, businessProfileId, pillar.id, pillar.name, profile.userId);
                }
            }

            if (!post) {
                post = await generateDraftPost(businessProfileId, pillar.id, format, slot.date, accountId, {
                    slideCount: getReviewModeSlideCount(format),
                    generationContextOverrides
                });
            }

            results.push(post);

            completedItems.push({ index: i, title, format: actFormat, status: 'done' });
            onProgress?.({ completedItems: [...completedItems] });

            recentActivity.byPilar[pillar.id] = (recentActivity.byPilar[pillar.id] || 0) + 1;
            recentActivity.total++;

        } catch (err) {
            console.error(`  ❌ Erro no post ${i + 1}: ${err.message}`);
            errors.push({ slot: slot.date.toISOString(), error: err.message });
            completedItems.push({ index: i, title, format: actFormat, status: 'error' });
            onProgress?.({ completedItems: [...completedItems] });
        }
    }

    console.log(`✅ Plano semanal concluído: ${results.length} gerados, ${errors.length} erros`);

    return {
        generated: results.length,
        failed: errors.length,
        posts: results,
        errors,
        week: weekStartDate.toISOString()
    };
}

// ---------------------------------------------------------------------------
// Gerenciamento de rascunhos (para página de revisão)
// ---------------------------------------------------------------------------

/**
 * Retorna todos os posts rascunho de um usuário, ordenados por data de agendamento
 */
export async function getDraftPosts(userId) {
    const snapshot = await db.collection('posts')
        .where('userId', '==', userId)
        .where('status', '==', 'draft')
        .get();

    const drafts = [];
    snapshot.forEach(doc => {
        drafts.push({ id: doc.id, ...normalizeStoredPostRecord(doc.data()) });
    });

    drafts.sort((a, b) => {
        const dateA = a.scheduledFor?.toDate?.() || new Date(a.scheduledFor || 0);
        const dateB = b.scheduledFor?.toDate?.() || new Date(b.scheduledFor || 0);
        return dateA - dateB;
    });

    return drafts;
}

function extractPremiumLayoutFromPrompt(prompt = '', profile = {}, fallbackText = '') {
    const safePrompt = String(prompt || '');
    const safeFallback = String(fallbackText || '');

    const titleMatch = safePrompt.match(/\[TITLE:\s*(.*?)\]/i);
    const headlineMatch = safePrompt.match(/\[HEADLINE:\s*(.*?)\]/i);
    const descriptionMatch = safePrompt.match(/\[DESCRIPTION:\s*(.*?)\]/i);
    const highlightsMatch = safePrompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
    const mainPhraseMatch = safePrompt.match(/Main phrase:\s*"?([^\n"]+)"?/i);

    let rawTitle = titleMatch?.[1]?.trim()
        || headlineMatch?.[1]?.trim()
        || mainPhraseMatch?.[1]?.trim()
        || descriptionMatch?.[1]?.trim()
        || safeFallback.split(/\n|[.!?]/).map(item => item.trim()).find(Boolean)
        || '';

    const braceHighlights = Array.from(rawTitle.matchAll(/\{([^}]+)\}/g))
        .map(match => match[1]?.trim().toUpperCase())
        .filter(Boolean);

    let title = rawTitle
        .replace(/[{}]/g, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
        .toUpperCase();

    let highlights = highlightsMatch?.[1]
        ? highlightsMatch[1]
            .split(',')
            .map(item => item.trim().toUpperCase())
            .filter(Boolean)
        : braceHighlights;

    if (highlights.length === 0 && title) {
        highlights = title
            .split(/\s+/)
            .map(word => word.replace(/[^\p{L}\p{N}]/gu, ''))
            .filter(word => word.length >= 6)
            .slice(0, 2);
    }

    const brandName = profile.name || 'Sua Marca';
    const brandKey = String(profile.brandKey || '').toLowerCase();
    const normalizedName = String(brandName || '').toLowerCase();
    const isFitswap = brandKey.includes('fitswap') || normalizedName.includes('fitswap');
    const isViverMais = brandKey.includes('viver-mais') || normalizedName.includes('viver mais');

    let logoIcon = '🧠';
    if (isFitswap) logoIcon = '🍎';
    if (isViverMais) logoIcon = '✨';

    return {
        title,
        highlights,
        brandName,
        logoUrl: profile.branding?.logoUrl || profile.branding?.logo || null,
        primaryColor: profile.branding?.primaryColor || (isFitswap ? '#6F9800' : '#4C1D95'),
        logoIcon: profile.branding?.logoIcon || logoIcon
    };
}

function buildPremiumLayoutsFromPrompt(prompt = '', profile = {}, fallbackText = '', slideCount = 0) {
    const promptBlocks = splitPremiumPromptBlocks(prompt);
    const sourceBlocks = promptBlocks.length > 0 ? promptBlocks : [String(prompt || '')];
    const targetCount = Math.max(Number(slideCount || 0), sourceBlocks.length, 1);

    const layouts = [];
    for (let index = 0; index < targetCount; index++) {
        const sourcePrompt = sourceBlocks[index] || sourceBlocks[sourceBlocks.length - 1] || '';
        layouts.push(
            normalizePremiumLayout(
                extractPremiumLayoutFromPrompt(sourcePrompt, profile, fallbackText),
                profile,
                fallbackText
            )
        );
    }

    return layouts;
}

function buildOverlayDataFromPremiumLayout(layout = {}) {
    const headline = String(layout.title || '').trim();
    const highlights = String(layout.highlightText || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    if (!headline && highlights.length === 0) {
        return null;
    }

    return {
        headline,
        subheadline: '',
        highlights,
        layout: 'premium'
    };
}

function stripUndefinedValues(input = {}) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined)
    );
}

function getDraftLibraryMediaUrls(data = {}) {
    return Array.isArray(data.mediaUrls)
        ? data.mediaUrls.filter(Boolean)
        : [];
}

function getDraftLibraryHtmlCode(data = {}) {
    return data.htmlContent || data.htmlCode || null;
}

async function resolveDraftLibraryItemRef(postId, data = {}) {
    if (data.libraryItemId) {
        const linkedRef = db.collection('library_items').doc(data.libraryItemId);
        const linkedDoc = await linkedRef.get();
        if (linkedDoc.exists) {
            return linkedRef;
        }
    }

    const businessProfileId = data.businessProfileId;
    if (!businessProfileId) return null;

    const snapshot = await db.collection('library_items')
        .where('businessProfileId', '==', businessProfileId)
        .get();

    const draftFormat = normalizeFormat(data.format || data.type, 'static');
    const draftHtmlCode = getDraftLibraryHtmlCode(data);
    const draftMediaUrls = getDraftLibraryMediaUrls(data);
    const draftSourceUrls = Array.isArray(data.sourceMediaUrls) ? data.sourceMediaUrls.filter(Boolean) : [];

    const match = snapshot.docs.find(doc => {
        const item = doc.data() || {};
        if (data.userId && item.userId && item.userId !== data.userId) return false;

        const itemFormat = normalizeFormat(item.format || item.type, 'static');
        if (itemFormat !== draftFormat) return false;

        if (draftHtmlCode && item.htmlCode === draftHtmlCode) return true;

        const itemMediaUrls = Array.isArray(item.mediaUrls) ? item.mediaUrls.filter(Boolean) : [];
        const itemSourceUrls = Array.isArray(item.sourceMediaUrls) ? item.sourceMediaUrls.filter(Boolean) : [];
        const comparableUrls = [...draftMediaUrls, ...draftSourceUrls].filter(Boolean);
        return comparableUrls.some(url => itemMediaUrls.includes(url) || itemSourceUrls.includes(url));
    });

    return match ? db.collection('library_items').doc(match.id) : null;
}

function buildLibraryUpdateFromDraft(data = {}, {
    destination = null,
    postId = null,
    scheduledFor = data.scheduledFor || null
} = {}) {
    const format = normalizeFormat(data.format || data.type, 'static');
    const isStoryDraft = isStoryFormat(format);
    const isScheduledDestination = destination === 'schedule';
    const isLibraryDestination = destination === 'library';

    const update = {
        userId: data.userId,
        businessProfileId: data.businessProfileId,
        type: format,
        format,
        mediaUrls: getDraftLibraryMediaUrls(data),
        htmlCode: isHtmlFormat(format) ? (getDraftLibraryHtmlCode(data) || '') : null,
        caption: isStoryDraft ? '' : (data.caption || ''),
        tag: isLibraryDestination ? 'editar' : (isScheduledDestination ? 'agendado' : undefined),
        slideCount: data.slideCount || data.mediaUrls?.length || null,
        frameCount: data.frameCount || null,
        sourceMediaUrls: Array.isArray(data.sourceMediaUrls) ? data.sourceMediaUrls.filter(Boolean) : null,
        premiumLayout: data.premiumLayout || null,
        premiumLayouts: Array.isArray(data.premiumLayouts) ? data.premiumLayouts.map(layout => layout || null) : null,
        premiumOverlayBakedAt: data.premiumOverlayBakedAt || null,
        overlayData: data.overlayData === undefined
            ? extractOverlayData(data.generationPrompt || '')
            : (data.overlayData || null),
        exportStatus: data.exportStatus || null,
        carouselTemplateId: data.carouselTemplateId || data.extra?.carouselTemplateId || null,
        requestedSlideCount: data.requestedSlideCount || data.extra?.requestedSlideCount || data.extra?.generationInput?.slideCount || null,
        generationInput: data.generationInput || data.extra?.generationInput || null,
        pillarId: data.pillarId || null,
        pillarName: data.pillarName || null,
        generatedBy: data.generatedBy || 'auto',
        isScheduled: isScheduledDestination ? true : (isLibraryDestination ? false : undefined),
        scheduledPostId: isScheduledDestination ? postId : (isLibraryDestination ? null : undefined),
        scheduledFor: isScheduledDestination ? scheduledFor : (isLibraryDestination ? null : undefined),
        updatedAt: new Date()
    };

    return stripUndefinedValues(update);
}

export async function syncDraftToLibrary(postId, options = {}) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) throw new Error('Post não encontrado.');

    const data = { id: doc.id, ...doc.data() };
    if (!data.businessProfileId) return null;

    const libraryRef = await resolveDraftLibraryItemRef(postId, data);
    const update = buildLibraryUpdateFromDraft(data, {
        destination: options.destination || null,
        postId,
        scheduledFor: options.scheduledFor || data.scheduledFor || null
    });

    if (libraryRef) {
        await libraryRef.update(update);
        if (!data.libraryItemId || data.libraryItemId !== libraryRef.id) {
            await db.collection('posts').doc(postId).update({
                libraryItemId: libraryRef.id,
                updatedAt: new Date()
            });
        }
        console.log(`📚 Library item ${libraryRef.id} atualizado a partir do rascunho ${postId}.`);
        return libraryRef.id;
    }

    const libraryItem = createLibraryItemRecord({
        userId: data.userId,
        businessProfileId: data.businessProfileId,
        type: update.format,
        mediaUrls: update.mediaUrls,
        htmlCode: update.htmlCode,
        caption: update.caption,
        tag: update.tag || 'auto',
        extra: stripUndefinedValues({
            slideCount: update.slideCount,
            frameCount: update.frameCount,
            pillarId: update.pillarId,
            pillarName: update.pillarName,
            generatedBy: update.generatedBy,
            sourceMediaUrls: update.sourceMediaUrls,
            premiumLayout: update.premiumLayout,
            premiumLayouts: update.premiumLayouts,
            premiumOverlayBakedAt: update.premiumOverlayBakedAt,
            overlayData: update.overlayData,
            exportStatus: update.exportStatus,
            carouselTemplateId: update.carouselTemplateId,
            requestedSlideCount: update.requestedSlideCount,
            generationInput: update.generationInput,
            isScheduled: update.isScheduled,
            scheduledPostId: update.scheduledPostId,
            scheduledFor: update.scheduledFor
        })
    });

    const createdRef = await db.collection('library_items').add({
        ...libraryItem,
        updatedAt: new Date()
    });

    await db.collection('posts').doc(postId).update({
        libraryItemId: createdRef.id,
        updatedAt: new Date()
    });

    console.log(`📚 Library item ${createdRef.id} criado para o rascunho ${postId}.`);
    return createdRef.id;
}

function normalizePremiumLayout(layout = {}, profile = {}, fallbackText = '') {
    const fallbackLayout = extractPremiumLayoutFromPrompt('', profile, fallbackText);
    const safeTitle = String(layout.title || fallbackLayout.title || '')
        .replace(/[{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    // layout.highlights (array) comes from extractPremiumLayoutFromPrompt;
    // layout.highlightText (string) comes from already-normalized layouts.
    const rawHighlight = layout.highlightText
        || (Array.isArray(layout.highlights) && layout.highlights.length > 0 ? layout.highlights.join(', ') : '')
        || (Array.isArray(fallbackLayout.highlights) && fallbackLayout.highlights.length > 0 ? fallbackLayout.highlights.join(', ') : '')
        || fallbackLayout.highlightText
        || '';
    const safeHighlightText = String(rawHighlight)
        .replace(/[{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        brandName: String(layout.brandName || fallbackLayout.brandName || 'Sua Marca').trim(),
        title: safeTitle,
        highlightText: safeHighlightText,
        description: String(layout.description || '').trim(),
        descriptionEnabled: Boolean(layout.descriptionEnabled),
        descriptionColor: String(layout.descriptionColor || '#d1d5db').trim(),
        primaryColor: String(layout.primaryColor || fallbackLayout.primaryColor || '#4C1D95').trim(),
        logoIcon: String(layout.logoIcon || fallbackLayout.logoIcon || '🧠').trim(),
        logoUrl: layout.logoUrl || fallbackLayout.logoUrl || null,
        imageOffsetX: Number.isFinite(Number(layout.imageOffsetX)) ? Math.min(100, Math.max(-100, Number(layout.imageOffsetX))) : 0,
        imageOffsetY: Number.isFinite(Number(layout.imageOffsetY)) ? Math.min(100, Math.max(-100, Number(layout.imageOffsetY))) : 0,
        imageScale: Number.isFinite(Number(layout.imageScale)) ? Math.min(1.4, Math.max(1, Number(layout.imageScale))) : 1,
        gradientOpacity: Number.isFinite(Number(layout.gradientOpacity)) ? Math.min(1, Math.max(0, Number(layout.gradientOpacity))) : 1,
        slideIndex: Number.isFinite(layout.slideIndex) ? Number(layout.slideIndex) : null,
        slideCount: Number.isFinite(layout.slideCount) ? Number(layout.slideCount) : null,
        hideOverlay: Boolean(layout.hideOverlay)
    };
}

function shouldAutoBakePremiumDraft(data = {}) {
    const format = normalizeFormat(data.format || data.type, 'static');
    const prompt = String(data.generationPrompt || '');
    // WHITE_OVERLAY is Fitswap's variant; PREMIUM_OVERLAY is the generic one.
    // Also trigger if a premiumLayout object exists (meaning the draft was already structured).
    const hasPremiumIntent =
        Boolean(data.premiumLayout) ||
        /\[PREMIUM_OVERLAY\]/i.test(prompt) ||
        /\[WHITE_OVERLAY\]/i.test(prompt);

    return format === 'carousel-premium'
        && hasPremiumIntent
        && !data.premiumOverlayBakedAt;
}

async function bakePremiumDraftMedia(data = {}) {
    // Prefer sourceMediaUrls (original raw photos before any bake) as the input for
    // compositing. This prevents double-baking when the layout is edited after the
    // initial generation already wrote baked composites into mediaUrls.
    const rawUrls = Array.isArray(data.sourceMediaUrls) && data.sourceMediaUrls.filter(Boolean).length > 0
        ? data.sourceMediaUrls.filter(Boolean)
        : null;
    const mediaUrls = (rawUrls || (Array.isArray(data.mediaUrls) ? data.mediaUrls.filter(Boolean) : []));
    if (mediaUrls.length === 0) {
        return { baked: false, mediaUrls };
    }

    const profile = data.businessProfileId
        ? mergeBrandProfileDefaults(await getBusinessProfile(data.businessProfileId))
        : {};
    const fallbackLayout = data.premiumLayout
        ? normalizePremiumLayout(data.premiumLayout, profile, data.caption || '')
        : normalizePremiumLayout(
            extractPremiumLayoutFromPrompt(data.generationPrompt || '', profile, data.caption || ''),
            profile,
            data.caption || ''
        );
    const storedLayouts = Array.isArray(data.premiumLayouts) ? data.premiumLayouts : [];
    const totalSlides = mediaUrls.length;
    const slideLayouts = mediaUrls.map((_, index) => {
        const candidate = storedLayouts[index] || fallbackLayout;
        return normalizePremiumLayout({
            ...candidate,
            slideIndex: index,
            slideCount: totalSlides
        }, profile, data.caption || '');
    });

    if (slideLayouts.every(layout => !layout.title)) {
        return { baked: false, mediaUrls };
    }

    const bakedUrls = await Promise.all(mediaUrls.map(async (imageUrl, index) => {
        const composedImage = await createPremiumComposition(imageUrl, slideLayouts[index] || fallbackLayout);
        if (!composedImage || composedImage === imageUrl) {
            return imageUrl;
        }
        return uploadImage(composedImage);
    }));

    return {
        baked: true,
        mediaUrls: bakedUrls,
        premiumLayout: fallbackLayout,
        premiumLayouts: slideLayouts
    };
}

/**
 * Aprova um rascunho: define status como 'pending' para o scheduler local processá-lo.
 * Se o post tiver data futura, o scheduler irá despachá-lo no momento certo via executePost.
 * Suporta passar um accountId caso o rascunho não tenha um (ex: perfil não tinha conta na geração).
 */
export async function approveDraftPost(postId, accountId = null, options = {}) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) throw new Error('Post não encontrado.');

    const data = doc.data();
    const destination = options.destination === 'library' ? 'library' : 'schedule';
    // Fallback: use businessProfileId as virtual accountId (same pattern as createPost/executePost)
    const finalAccountId = accountId || data.accountId || data.businessProfileId || null;
    if (destination === 'schedule' && !finalAccountId) {
        throw new Error('Vincule uma conta Instagram antes de aprovar este rascunho.');
    }

    const scheduledDate = data.scheduledFor?.toDate?.() || (data.scheduledFor ? new Date(data.scheduledFor) : null);
    const newStatus = destination === 'library'
        ? 'library'
        : (scheduledDate && scheduledDate > new Date() ? 'scheduled' : 'processing');

    const updates = {
        isDraft: false,
        status: newStatus,
        accountId: destination === 'schedule' ? (finalAccountId || null) : (data.accountId || null),
        needsAccount: destination === 'schedule' ? false : data.needsAccount ?? false,
        approvedAt: new Date(),
        updatedAt: new Date()
    };

    let finalMediaUrls = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];

    if (shouldAutoBakePremiumDraft(data)) {
        try {
            console.log(`✨ Premium draft detected for post ${postId}. Applying automatic overlay bake...`);
            const baked = await bakePremiumDraftMedia(data);
            if (baked.baked) {
                finalMediaUrls = baked.mediaUrls;
                data.mediaUrls = finalMediaUrls;
                data.overlayData = null;
                updates.mediaUrls = finalMediaUrls;
                updates.overlayData = null;
                updates.premiumOverlayBakedAt = new Date();
            }
        } catch (bakeErr) {
            console.error(`⚠️ Erro no auto-bake premium (postId: ${postId}):`, bakeErr.message);
        }
    }

    // 🎨 HTML to JPG Export integration
    if (isHtmlFormat(data.format || data.type)) {
        try {
            console.log(`🎨 HTML detected for post ${postId}. Triggering automatic export to JPG...`);
            const { exportHtmlCarouselToImages } = await import('./htmlExportService.js');
            finalMediaUrls = await exportHtmlCarouselToImages(postId);
            // Updating local data object so the library sync uses the new URLs
            data.mediaUrls = finalMediaUrls;
            data.exportStatus = 'exported';
            updates.mediaUrls = finalMediaUrls;
            // Also include in the initial update if we can, though exportHtmlCarouselToImages already updates the doc.
            // But for consistency with the library sync below, we must update the local 'data' object.
        } catch (exportErr) {
            console.error(`⚠️ Erro na exportação automática do HTML (postId: ${postId}):`, exportErr.message);
            if (destination === 'schedule') {
                // Sem mídia exportada o agendamento falharia depois e deixaria o
                // post preso em 'scheduled' sem job externo. Aborta antes de
                // aplicar as atualizações: o post continua como rascunho e pode
                // ser aprovado novamente.
                throw new Error(`Falha ao exportar o carrossel HTML: ${exportErr.message}`);
            }
        }
    }

    await db.collection('posts').doc(postId).update(updates);

    // 🗓️ Sincronizar com a Library sem duplicar: atualiza o item automático
    // vinculado ao rascunho quando houver libraryItemId, ou cria apenas como fallback.
    try {
        await syncDraftToLibrary(postId, { destination, scheduledFor: data.scheduledFor || null });
    } catch (libErr) {
        console.error('⚠️ Falha ao sincronizar com a Library (aprovação continua):', libErr.message);
    }

    console.log(`✅ Rascunho ${postId} aprovado (Conta: ${finalAccountId}) → status: ${newStatus}`);
    return {
        destination,
        status: newStatus,
        scheduledFor: scheduledDate,
        accountId: finalAccountId
    };
}

/**
 * Helper para extrair dados de overlay (Headline, Highlights) do prompt de geração.
 * Utilizado para renderização no frontend e persistência.
 */
export function extractOverlayData(prompt) {
    if (!prompt) return null;
    
    const headline = prompt.match(/\[HEADLINE:\s*(.*?)\]/i)?.[1]?.trim();
    const subheadline = prompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i)?.[1]?.trim();
    const highlights = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i)?.[1]
        ?.split(',')
        .map(h => h.trim())
        .filter(Boolean);
    const layout = prompt.match(/\[LAYOUT:\s*(.*?)\]/i)?.[1]?.trim();

    if (!headline && !subheadline && (!highlights || highlights.length === 0)) {
        return null;
    }

    return { headline, subheadline, highlights, layout };
}

/**
 * Rejeita um rascunho (arquiva sem postar)
 */
export async function rejectDraftPost(postId) {
    await db.collection('posts').doc(postId).update({
        isDraft: false,
        status: 'rejected',
        rejectedAt: new Date(),
        updatedAt: new Date()
    });

    console.log(`🗑️ Rascunho ${postId} rejeitado`);
    return true;
}

/**
 * Atualiza a caption de um rascunho antes de aprovar
 */
export async function updateDraftCaption(postId, caption) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) throw new Error('Post não encontrado.');
    const draft = doc.data() || {};
    const nextCaption = isStoryFormat(draft.format || draft.type) ? '' : caption;
    await db.collection('posts').doc(postId).update({
        caption: nextCaption,
        updatedAt: new Date()
    });
    await syncDraftToLibrary(postId).catch(err => {
        console.warn(`⚠️ Falha ao sincronizar caption com Library (postId: ${postId}):`, err.message);
    });
    return true;
}

/**
 * Atualiza o layout premium customizado de um rascunho antes de aprovar.
 */
export async function updateDraftPremiumLayout(postId, layout, profile = null, slideIndex = null) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) throw new Error('Post não encontrado.');
    const draft = doc.data() || {};
    const resolvedProfile = profile || (draft.businessProfileId
        ? mergeBrandProfileDefaults(await getBusinessProfile(draft.businessProfileId).catch(() => ({})))
        : {});
    const normalizedLayout = normalizePremiumLayout(layout, resolvedProfile, '');
    const normalizedSlideIndex = Number.isFinite(Number(slideIndex)) ? Number(slideIndex) : null;

    // Build the full updated layouts array so we can re-bake correctly
    let updatedLayouts = Array.isArray(draft.premiumLayouts) ? [...draft.premiumLayouts] : [];
    if (normalizedSlideIndex !== null && normalizedSlideIndex >= 0) {
        updatedLayouts[normalizedSlideIndex] = {
            ...(updatedLayouts[normalizedSlideIndex] || {}),
            ...normalizedLayout,
            slideIndex: normalizedSlideIndex,
            slideCount: normalizedLayout.slideCount
        };
    }

    const updates = {
        premiumLayout: normalizedSlideIndex === 0 || normalizedSlideIndex === null
            ? normalizedLayout
            : (draft.premiumLayout || normalizedLayout),
        premiumLayouts: updatedLayouts.length > 0 ? updatedLayouts : undefined,
        overlayData: buildOverlayDataFromPremiumLayout(normalizedLayout),
        premiumOverlayBakedAt: null,
        updatedAt: new Date()
    };

    await db.collection('posts').doc(postId).update(updates);

    // Immediately re-bake with the updated layout so the preview is refreshed
    try {
        const bakeData = {
            businessProfileId: draft.businessProfileId,
            mediaUrls: Array.isArray(draft.mediaUrls) ? draft.mediaUrls : [],
            sourceMediaUrls: Array.isArray(draft.sourceMediaUrls) ? draft.sourceMediaUrls : null,
            premiumLayout: updates.premiumLayout,
            premiumLayouts: updates.premiumLayouts || updatedLayouts,
            generationPrompt: draft.generationPrompt || '',
            caption: draft.caption || ''
        };
        const baked = await bakePremiumDraftMedia(bakeData);
        if (baked.baked) {
            await db.collection('posts').doc(postId).update({
                mediaUrls: baked.mediaUrls,
                premiumOverlayBakedAt: new Date(),
                updatedAt: new Date()
            });
            console.log(`✅ Premium layout re-baked immediately for post ${postId}.`);
        }
    } catch (bakeErr) {
        console.warn(`⚠️ Falha no re-bake imediato após edição premium (postId: ${postId}):`, bakeErr.message);
        // Non-blocking: the bake will happen again on approval
    }

    await syncDraftToLibrary(postId).catch(err => {
        console.warn(`⚠️ Falha ao sincronizar layout premium com Library (postId: ${postId}):`, err.message);
    });

    return normalizedLayout;
}

/**
 * Regera a mídia e legenda de um rascunho usando um novo prompt.
 */
export async function regenerateDraftPost(postId, newPrompt) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) throw new Error('Post não encontrado.');

    const draft = doc.data();
    if (!draft.isDraft) throw new Error('Apenas rascunhos podem ser regerados.');

    const profile = await getBusinessProfile(draft.businessProfileId);
    const merged = mergeBrandProfileDefaults(profile);
    const pillar = merged.editorialPillars?.find(p => p.id === draft.pillarId);
    
    const format = normalizeFormat(draft.format || draft.type, 'static');
    const editorialMemory = await analyzeRecentEditorialMemory(draft.businessProfileId, 30);
    const context = buildGenerationContext(merged, pillar || { name: draft.pillarName, description: '' }, editorialMemory);
    const aspectRatio = getAspectRatioForFormat(
        format,
        merged.aiPreferences?.defaultAspectRatio || '4:5'
    );
    const brandingStyle = merged.aiPreferences?.style || merged.branding?.style || '';
    const requestedSlideCount = resolveRequestedSlideCount(format, {
        slideCount: draft.slideCount || draft.extra?.generationInput?.slideCount,
        customBriefing: newPrompt,
        customTopic: draft.theme || draft.pillarName || ''
    });

    let mediaUrls = [];
    let caption = '';
    let generationPrompt = newPrompt;
    let premiumLayout = draft.premiumLayout || null;
    let premiumLayouts = Array.isArray(draft.premiumLayouts) ? draft.premiumLayouts : null;
    let sourceMediaUrls = Array.isArray(draft.sourceMediaUrls) ? draft.sourceMediaUrls : null;
    let overlayData = draft.overlayData || null;
    let premiumOverlayBakedAt = null;

    console.log(`🔄 Regerando post ${postId} (formato: ${format}) com novo prompt...`);

    if (isHtmlFormat(format)) {
        const htmlContext = {
            ...context,
            brandName: merged.name,
            brandKey: merged.brandKey,
            branding: merged.branding,
            targetAudience: merged.targetAudience,
            contentStrategy: context.contentStrategy
        };
        // Keep same template as original draft; fall back to selectHtmlTemplate
        const existingTemplate = draft.extra?.carouselTemplateId;
        const regenTemplate = existingTemplate || selectHtmlTemplate(pillar || {}, {});
        const templateSlideCount = resolveHtmlTemplateSlideCount(regenTemplate, requestedSlideCount || draft.slideCount || 0);

        // ElevePic moodboard: regenerar também com imagens IA
        let html = null;
        if (regenTemplate === 'moodboard' && merged.brandKey === 'elevepic') {
            html = await generateElevepicMoodboardHtml(newPrompt, merged).catch(err => {
                console.warn('⚠️ [Regen] Moodboard IA falhou, usando fallback:', err.message);
                return null;
            });
        }
        if (!html) {
            html = await generateHtmlCarousel(newPrompt, htmlContext, regenTemplate, templateSlideCount);
        }
        if (!html) throw new Error('HTML carousel vazio retornado pela IA.');
        const htmlSlideCount = inferHtmlSlideCount(html);
        
        await db.collection('posts').doc(postId).update({
            htmlContent: html,
            generationPrompt: newPrompt,
            slideCount: htmlSlideCount,
            exportStatus: 'not_exported',
            updatedAt: new Date()
        });
        await syncDraftToLibrary(postId).catch(err => {
            console.warn(`⚠️ Falha ao sincronizar HTML regerado com Library (postId: ${postId}):`, err.message);
        });
        return normalizeStoredPostRecord({
            ...draft,
            htmlContent: html,
            generationPrompt: newPrompt,
            slideCount: htmlSlideCount,
            exportStatus: 'not_exported',
            updatedAt: new Date()
        });

    } else if (format === 'carousel-premium' || format === 'carousel') {
        const result = await generateCarousel(
            newPrompt,
            aspectRatio,
            requestedSlideCount || draft.slideCount || 5,
            brandingStyle,
            'gemini',
            { ...context, isPremiumCarousel: format === 'carousel-premium', overlayMode: format === 'carousel-premium' ? 'premium' : undefined },
            draft.businessProfileId
        );
        mediaUrls = (result.images || []).filter(Boolean);
        if (Array.isArray(result.prompts) && result.prompts.length > 0) {
            generationPrompt = result.prompts.join('\n---SEPARATOR---\n');
        }

        if (format === 'carousel-premium' && mediaUrls.length > 0) {
            sourceMediaUrls = [...mediaUrls];
            premiumLayouts = buildPremiumLayoutsFromPrompt(
                generationPrompt || newPrompt,
                merged,
                newPrompt,
                mediaUrls.length
            );
            premiumLayout = premiumLayouts[0] || normalizePremiumLayout(
                extractPremiumLayoutFromPrompt(
                    generationPrompt || newPrompt,
                    merged,
                    newPrompt
                ),
                merged,
                newPrompt
            );
            overlayData = buildOverlayDataFromPremiumLayout(premiumLayout);

            try {
                const baked = await bakePremiumDraftMedia({
                    businessProfileId: draft.businessProfileId,
                    mediaUrls,
                    premiumLayout,
                    premiumLayouts,
                    generationPrompt,
                    caption: newPrompt
                });
                if (baked.baked) {
                    mediaUrls = baked.mediaUrls;
                    premiumLayout = baked.premiumLayout || premiumLayout;
                    premiumLayouts = baked.premiumLayouts || premiumLayouts;
                    premiumOverlayBakedAt = new Date();
                }
            } catch (premiumBakeErr) {
                console.error(`⚠️ Erro ao assar overlay premium na regeração: ${premiumBakeErr.message}`);
            }
        }

    } else {
        // static, story
        const images = await generateImages(newPrompt, aspectRatio, 1, brandingStyle, false, context);
        mediaUrls = (images || []).filter(Boolean);
    }

    if (mediaUrls.length === 0) {
        throw new Error('Nenhuma mídia gerada na regeração.');
    }

    // Gerar nova legenda
    if (!isStoryFormat(format)) {
        caption = await generateImageCaption(
            mediaUrls[0],
            merged.name,
            `${pillar?.description || ''}. ${pillar?.captionStyle || ''}`,
            merged.branding?.guidelines || '',
            editorialMemory,
            merged
        );
    }

    // Atualizar documento
    const updates = {
        mediaUrls,
        slideCount: mediaUrls.length,
        caption,
        generationPrompt,
        premiumLayout,
        premiumLayouts,
        sourceMediaUrls,
        overlayData,
        premiumOverlayBakedAt,
        updatedAt: new Date()
    };

    await db.collection('posts').doc(postId).update(updates);
    await syncDraftToLibrary(postId).catch(err => {
        console.warn(`⚠️ Falha ao sincronizar rascunho regerado com Library (postId: ${postId}):`, err.message);
    });

    return normalizeStoredPostRecord({ ...draft, ...updates });
}

/**
 * Regera um único slide de um carrossel de rascunho
 */
export async function regenerateDraftSlide(postId, slideIndex) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) throw new Error('Post não encontrado.');

    const draft = doc.data();
    if (!draft.isDraft) throw new Error('Apenas rascunhos podem ser regerados.');

    const mediaUrls = draft.mediaUrls || [];
    if (!Array.isArray(mediaUrls) || typeof slideIndex !== 'number' || slideIndex < 0 || slideIndex >= mediaUrls.length) {
        throw new Error('Índice de slide inválido para este post.');
    }

    const format = normalizeFormat(draft.format || draft.type, 'static');
    if (format !== 'carousel' && format !== 'carousel-premium') {
        throw new Error('Apenas itens de carrossel podem ter slides regerados individualmente.');
    }

    const profile = await getBusinessProfile(draft.businessProfileId);
    const merged = mergeBrandProfileDefaults(profile);
    const pillar = merged.editorialPillars?.find(p => p.id === draft.pillarId);
    
    const editorialMemory = await analyzeRecentEditorialMemory(draft.businessProfileId, 30);
    const context = buildGenerationContext(merged, pillar || { name: draft.pillarName, description: '' }, editorialMemory);
    const aspectRatio = getAspectRatioForFormat(
        format,
        merged.aiPreferences?.defaultAspectRatio || '4:5'
    );
    const brandingStyle = merged.aiPreferences?.style || merged.branding?.style || '';

    const generationPrompt = draft.generationPrompt || '';
    const promptBlocks = splitPremiumPromptBlocks(generationPrompt);
    const slidePrompt = promptBlocks[slideIndex] || promptBlocks[0] || draft.theme || draft.pillarName || `${merged.name} post`;

    console.log(`🔄 Regerando slide ${slideIndex} do post ${postId}...`);

    let newImageUrl = await generateSingleImage(
        slidePrompt,
        aspectRatio,
        brandingStyle,
        false,
        { ...context, isPremiumCarousel: format === 'carousel-premium', overlayMode: format === 'carousel-premium' ? 'premium' : undefined },
        null,
        'gemini'
    );
    
    if (!newImageUrl) throw new Error('IA não conseguiu gerar uma nova imagem.');

    let finalMediaUrls = [...mediaUrls];
    finalMediaUrls[slideIndex] = newImageUrl;

    let sourceMediaUrls = Array.isArray(draft.sourceMediaUrls) ? [...draft.sourceMediaUrls] : [...mediaUrls];
    if (format === 'carousel-premium') {
        sourceMediaUrls[slideIndex] = newImageUrl;
        
        const premiumLayouts = Array.isArray(draft.premiumLayouts) ? [...draft.premiumLayouts] : [];
        const layout = premiumLayouts[slideIndex] || null;
        
        if (layout && layout.type) {
            try {
                const composedUrl = await createPremiumComposition(newImageUrl, layout);
                if (composedUrl) {
                    finalMediaUrls[slideIndex] = composedUrl;
                }
            } catch (compositionErr) {
                console.error(`⚠️ Erro ao aplicar layout premium no slide regerado: ${compositionErr.message}`);
            }
        }
    }

    const updates = {
        mediaUrls: finalMediaUrls,
        sourceMediaUrls: sourceMediaUrls,
        updatedAt: new Date()
    };

    await db.collection('posts').doc(postId).update(updates);
    await syncDraftToLibrary(postId).catch(err => {
        console.warn(`⚠️ Falha ao sincronizar slide regerado com Library (postId: ${postId}):`, err.message);
    });
    
    return normalizeStoredPostRecord({
        id: doc.id,
        ...draft,
        ...updates
    });
}
