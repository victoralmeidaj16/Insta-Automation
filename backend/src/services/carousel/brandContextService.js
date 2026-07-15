import { isFitswapBrand, mergeBrandProfileDefaults, normalizeBrandKey } from '../../utils/brandProfiles.js';

// Helper: convert hex to a descriptive color name for image prompts
export function hexToColorName(hex) {
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
    const r = parseInt(key.slice(1, 3), 16) || 0;
    const g = parseInt(key.slice(3, 5), 16) || 0;
    const b = parseInt(key.slice(5, 7), 16) || 0;
    if (r > g && r > b) return 'warm reddish tone';
    if (g > r && g > b) return 'green tone';
    if (b > r && b > g) return 'blue-purple tone';
    if (r > 200 && g > 200 && b > 200) return 'light neutral';
    return 'dark accent tone';
}

export function buildImageBrandingPrompt(context = {}, options = {}) {
    const { backgroundOnly = false } = options;
    const branding = context.branding || {};
    const brandName = String(context.brandName || context.name || '').trim();
    const primaryColor = branding.primaryColor || context.primaryColor || '';
    const secondaryColor = branding.secondaryColor || context.secondaryColor || '';
    const brandStyle = String(branding.style || context.brandingStyle || '').trim();
    const guidelines = String(branding.guidelines || context.guidelines || '').trim();
    const brandContext = String(context.brandContext || context.profileDescription || '').trim();
    const instructions = [];

    if (brandName) {
        instructions.push(`Brand: ${brandName}.`);
    }

    if (primaryColor || secondaryColor) {
        const describedPrimary = primaryColor ? `${primaryColor} (${hexToColorName(primaryColor)})` : 'the brand primary accent';
        const describedSecondary = secondaryColor ? `${secondaryColor} (${hexToColorName(secondaryColor)})` : '';
        instructions.push(`Color direction: prioritize a palette that feels harmonious with ${describedPrimary}${describedSecondary ? ` and ${describedSecondary}` : ''}.`);
    }

    if (backgroundOnly && primaryColor) {
        instructions.push(`Background-only mode: use subtle accents, props, lighting, reflections, gradients or wardrobe details that naturally echo ${primaryColor}, while keeping the scene premium and avoiding any clashing dominant hues.`);
    }

    if (brandStyle) {
        instructions.push(`Brand style reference: ${brandStyle}.`);
    }

    if (brandContext) {
        instructions.push(`Brand context: ${brandContext}.`);
    }

    if (guidelines) {
        instructions.push(`Brand guidelines: ${guidelines}.`);
    }

    return instructions.join('\n');
}

export function buildFitswapBrandContext(context = {}) {
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
            logoUrl: context.logoUrl,
            style: context.brandingStyle,
            guidelines: context.guidelines
        },
        brandKit: context.brandKit,
        aiPreferences: context.aiPreferences
    });

    return merged;
}

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function nonEmptyStrings(values) {
    return Array.isArray(values) ? values.map(text).filter(Boolean) : [];
}

function bulletSection(title, values) {
    const lines = nonEmptyStrings(values);
    return lines.length ? `## ${title}\n${lines.map((value) => `- ${value}`).join('\n')}` : '';
}

function resolveSlideRoles(slideRoles, slideCount) {
    const count = Number.isInteger(slideCount) && slideCount > 0 ? slideCount : null;

    return (Array.isArray(slideRoles) ? slideRoles : [])
        .flatMap((role) => {
            if (!role || typeof role !== 'object') return [];
            const position = text(role.position);
            const roleName = text(role.role);
            const rules = text(role.rules);
            let positions = [];

            if (/^\d+$/.test(position)) {
                positions = [Number(position)];
            } else if (position === 'last' && count) {
                positions = [count];
            } else if (position === 'last-1' && count > 1) {
                positions = [count - 1];
            } else if (position === 'middle' && count) {
                positions = Array.from({ length: Math.max(0, count - 3) }, (_, index) => index + 2);
            }

            if (!positions.length) return [];
            return positions.map((index) => `Slide ${index}${roleName ? ` — ${roleName}` : ''}${rules ? `: ${rules}` : ''}`);
        });
}

/**
 * Builds reusable, brand-specific prompt sections without coupling generators
 * to individual VIP brands. The returned `compose` method intentionally omits
 * empty sections so prompts never receive placeholder text such as "undefined".
 */
export function buildBrandPromptSections(context = {}, opts = {}) {
    const merged = mergeBrandProfileDefaults({
        ...context,
        brandKey: context.brandKey || normalizeBrandKey(context),
        brandName: context.brandName || context.name,
        description: context.description || context.profileDescription,
        branding: context.branding || {
            primaryColor: context.primaryColor,
            secondaryColor: context.secondaryColor,
            logoUrl: context.logoUrl,
            style: context.brandingStyle,
            guidelines: context.guidelines
        }
    });
    const kit = merged.brandKit || {};
    const branding = merged.branding || {};
    const visualIdentity = kit.visualIdentity || {};
    const colors = [branding.primaryColor, branding.secondaryColor, ...(kit.customColors || [])]
        .map(text)
        .filter(Boolean)
        .map((color) => `${color} (${hexToColorName(color)})`);
    const logo = text(merged.logoUrl) || text(branding.logoUrl) || text(branding.logo);

    const identity = [
        text(merged.brandName || merged.name) && `Marca: ${text(merged.brandName || merged.name)}`,
        text(kit.coreMessage) && `Mensagem central: ${text(kit.coreMessage)}`,
        text(kit.archetype) && `Arquétipo: ${text(kit.archetype)}`,
        text(kit.personality) && `Personalidade: ${text(kit.personality)}`,
        text(merged.targetAudience) && `Público: ${text(merged.targetAudience)}`,
        text(merged.productService) && `Produto/serviço: ${text(merged.productService)}`,
        text(merged.description) && `Descrição: ${text(merged.description)}`,
        text(merged.brandContext) && `Contexto de marca: ${text(merged.brandContext)}`
    ].filter(Boolean).join('\n');

    const voice = [
        text(kit.voice) && `Voz: ${text(kit.voice)}`,
        bulletSection('REGRAS DE TOM', kit.toneRules),
        bulletSection('ARQUÉTIPOS DE COPY', kit.copyArchetypes),
        bulletSection('EXEMPLOS DE HEADLINE', kit.headlineExamples),
        nonEmptyStrings(kit.forbiddenWords).length && `PROIBIDO na copy: ${nonEmptyStrings(kit.forbiddenWords).join('; ')}.`
    ].filter(Boolean).join('\n\n');

    const resolvedRoles = resolveSlideRoles(kit.narrativeStructure?.slideRoles, opts.slideCount);
    const narrative = [
        text(kit.narrativeStructure?.description) && `Estrutura narrativa: ${text(kit.narrativeStructure.description)}`,
        bulletSection('PAPÉIS DOS SLIDES', resolvedRoles)
    ].filter(Boolean).join('\n\n');

    const visual = [
        text(visualIdentity.photographyStyle) && `Fotografia: ${text(visualIdentity.photographyStyle)}`,
        text(visualIdentity.colorUsage) && `Uso de cores: ${text(visualIdentity.colorUsage)}`,
        colors.length && `Paleta disponível: ${colors.join(', ')}`,
        text(visualIdentity.typographyFeel) && `Sensação tipográfica: ${text(visualIdentity.typographyFeel)}`,
        bulletSection('DIRETRIZES DE IMAGEM', visualIdentity.imagePromptGuidelines),
        bulletSection('FAÇA SEMPRE', kit.doAlways),
        bulletSection('NUNCA USE', [...nonEmptyStrings(kit.neverUse), ...nonEmptyStrings(kit.forbiddenVisuals)]),
        logo && `Logo de referência: ${logo}`
    ].filter(Boolean).join('\n\n');

    const cta = bulletSection('REGRAS DE CTA', kit.ctaRules);
    const caption = [
        bulletSection('REGRAS DE LEGENDA', kit.captionRules),
        text(kit.hashtagStrategy) && `Estratégia de hashtags: ${text(kit.hashtagStrategy)}`
    ].filter(Boolean).join('\n\n');
    const sections = { identity, voice, narrative, visual, cta, caption };

    return {
        ...sections,
        compose(sectionNames = Object.keys(sections)) {
            const names = Array.isArray(sectionNames) ? sectionNames : Object.keys(sections);
            return names
                .filter((name) => Object.hasOwn(sections, name) && text(sections[name]))
                .map((name) => `# ${name.toUpperCase()}\n${sections[name]}`)
                .join('\n\n');
        }
    };
}

export function parseStructuredFitswapPrompt(prompt = '') {
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

export function enforceFitswapPromptGuardrails(prompt = '', context = {}) {
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

export function stripSocialHashtags(text = '') {
    return String(text).replace(/(^|\s)#[A-Za-z][\w-]*/g, '$1').trim();
}

export function isPromptRefusal(text = '') {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return true;

    return [
        "i'm sorry",
        'i am sorry',
        "can't assist",
        'cannot assist',
        "can't help",
        'cannot help',
        'unable to assist',
        'unable to help'
    ].some(pattern => normalized.includes(pattern));
}

export function extractConceptField(concept = '', labelPattern) {
    const match = String(concept || '').match(labelPattern);
    return match?.[1]?.trim() || '';
}

export function inferInnerBoostEmotion(text = '') {
    const normalized = String(text || '').toLowerCase();

    if (/(ansiedade|medo|alarme|ameaça|perigo|stress|estresse)/i.test(normalized)) return 'Anxiety';
    if (/(procrastina|travado|parado|stop|agir|ação|move|movimento)/i.test(normalized)) return 'Frustration';
    if (/(clareza|alívio|liberdade|peace|calma|silêncio|presença)/i.test(normalized)) return 'Introspective relief';
    if (/(passado|narrativa|autoengano|ciclo|loop|rumina)/i.test(normalized)) return 'Overwhelm and introspection';

    return 'Overwhelm';
}

export function buildFallbackImagePrompt(concept, context = {}) {
    const background = extractConceptField(concept, /\*\*Imagem de Fundo:\*\*\s*([^\n]+)/i);
    const headline = extractConceptField(concept, /\*\*HEADLINE:\*\*\s*([^\n]+)/i)
        || extractConceptField(concept, /\*\*Card\s+\d+:\*\*\s*([^\n]+)/i)
        || String(concept || '').split('\n').map(line => line.trim()).find(Boolean)
        || 'Mental transformation';

    const brandName = String(context.brandName || context.name || '').toLowerCase();
    const safeBackground = background || 'Abstract dark psychological background with minimal geometric forms';
    const safeHeadline = headline.replace(/^["']|["']$/g, '').trim();

    if (brandName.includes('inner boost')) {
        const emotion = inferInnerBoostEmotion(`${safeHeadline} ${safeBackground}`);
        const overlayRule = context.isPremiumCarousel
            ? 'Do not generate any readable text, letters, words, headlines, typography, or UI elements on the image.'
            : `Reserve clean negative space for overlay text inspired by: "${safeHeadline}".`;

        return `Create a dark, minimalist, emotionally intense vertical image in Inner Boost's modern style (4:5, 1080x1350).

Background: ${safeBackground}, reinterpreted as a dark psychological environment with subtle texture, particles, soft haze, and strong contrast.
Color palette: Black (#0B0B0D) dominant, Neon Blue (#00C2FF), Neon Green (#00F5A0).

Main subject: A symbolic visual metaphor for "${safeHeadline}", using one human figure or one abstract focal object, layered shadows, fractured reflections, and floating geometric elements to communicate ${emotion}.
Add floating 3D thought cards with subtle blue/green glow and zero readable text.

Textures: digital noise, soft grain, light haze, neon reflections.
Lighting: dramatic, cinematic, high contrast.
Atmosphere: heavy, introspective, uncomfortable, transformative.
Composition rule: ${overlayRule}`;
    }

    const primaryColor = context.branding?.primaryColor || '#00C2FF';
    const secondaryColor = context.branding?.secondaryColor || '#111111';
    const overlayRule = context.isPremiumCarousel
        ? 'Generate no readable text on the image.'
        : `Keep clean negative space for overlay text inspired by "${safeHeadline}".`;

    return `Create a premium vertical editorial image (4:5, 1080x1350) based on the concept "${safeHeadline}".

Background: ${safeBackground}.
Color palette: primary ${primaryColor}, secondary ${secondaryColor}, plus clean neutrals.
Main subject: a strong visual metaphor that communicates the concept clearly and emotionally, with professional composition and premium lighting.
Atmosphere: cinematic, modern, polished.
Composition rule: ${overlayRule}`;
}

export function sanitizeBackgroundPromptForImageGeneration(prompt = '') {
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
