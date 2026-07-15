import sharp from 'sharp';
import axios from 'axios';

function escapeXml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function deriveFallbackHighlights(title = '') {
    const stopWords = new Set([
        'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'O', 'A', 'OS', 'AS', 'UM', 'UMA',
        'PARA', 'POR', 'COM', 'EM', 'NO', 'NA', 'NOS', 'NAS', 'SE', 'QUE', 'É',
        'AO', 'À', 'SEM', 'MAIS', 'COMO', 'NÃO', 'NAO'
    ]);

    return String(title || '')
        .toUpperCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word => word.length >= 5 && !stopWords.has(word))
        .slice(-2);
}

function normalizeHighlights(highlights = [], highlightText = '', title = '') {
    const explicit = Array.isArray(highlights) && highlights.length > 0
        ? highlights
        : String(highlightText || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

    const fallback = explicit.length > 0 ? explicit : deriveFallbackHighlights(title);

    return fallback
        .map(item => String(item || '').trim().toUpperCase())
        .filter(Boolean);
}

function normalizeHighlightWords(items = []) {
    return items
        .flatMap(item => String(item || '').toUpperCase().split(/\s+/))
        .map(word => word.replace(/[^\p{L}\p{N}]/gu, '').trim())
        .filter(Boolean);
}

function isFitswapLayout(layout = {}) {
    const brandName = String(layout.brandName || '').toLowerCase();
    return brandName.includes('fitswap');
}

function isElevepicLayout(layout = {}) {
    const brandName = String(layout.brandName || '').toLowerCase();
    return brandName.includes('elevepic');
}

function getPremiumTheme(layout = {}) {
    const fitswap = isFitswapLayout(layout);

    if (fitswap) {
        return {
            accent: '#6F9800',
            panelFill: '#EEF2E8',
            gradientEnd: '#EEF2E8',
            text: '#111827',
            divider: 'rgba(17,24,39,0.18)',
            logoCircle: '#111827',
            logoText: '#FFFFFF',
            inactiveDot: 'rgba(17,24,39,0.24)'
        };
    }

    if (isElevepicLayout(layout)) {
        return {
            accent: '#3F507A', // Keyword color as highlights
            panelFill: '#000000', // Black background
            gradientEnd: '#000000',
            text: '#C7CEDA', // Main text blue-grey
            divider: '#2A3142', // Decorative lines
            logoCircle: '#C7CEDA',
            logoText: '#000000',
            inactiveDot: '#2A3142'
        };
    }

    return {
        accent: layout.primaryColor || '#00C2FF',
        panelFill: '#000000',
        gradientEnd: '#000000',
        text: '#FFFFFF',
        divider: 'rgba(255,255,255,0.15)',
        logoCircle: '#FFFFFF',
        logoText: '#000000',
        inactiveDot: 'rgba(255,255,255,0.2)'
    };
}

async function fetchImageBuffer(url) {
    if (!url) return null;
    const isUrl = typeof url === 'string' && url.startsWith('http');
    if (isUrl) {
        const r = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(r.data);
    }
    return Buffer.from(url.replace(/^data:[^;]+;base64,/, ''), 'base64');
}

async function buildCircularLogoLayer(logoUrl, diameter) {
    const logoBuf = await fetchImageBuffer(logoUrl);
    if (!logoBuf) return null;

    const inset = 14; // keep some breathing room inside the circle
    const innerSize = Math.max(1, diameter - inset);

    const resized = await sharp(logoBuf)
        .resize(innerSize, innerSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();

    const meta = await sharp(resized).metadata();
    const w = meta.width || innerSize;
    const h = meta.height || innerSize;
    const left = Math.round((diameter - w) / 2);
    const top = Math.round((diameter - h) / 2);

    const r = Math.max(1, Math.floor(diameter / 2) - 1);
    const maskSvg = `<svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${diameter / 2}" cy="${diameter / 2}" r="${r}" fill="#fff" />
</svg>`;

    return sharp({
        create: {
            width: diameter,
            height: diameter,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([
            { input: resized, top, left },
            { input: Buffer.from(maskSvg), blend: 'dest-in' }
        ])
        .png()
        .toBuffer();
}

function clampPremiumImageScale(value) {
    return Math.min(2.0, Math.max(1, Number.isFinite(value) ? value : 1));
}

function clampPremiumImageOffset(value) {
    return Math.min(150, Math.max(-150, Number.isFinite(value) ? value : 0));
}

async function buildPositionedBackground(backgroundBuffer, targetWidth, targetHeight, layout = {}) {
    const metadata = await sharp(backgroundBuffer).metadata();
    const imageWidth = metadata.width || targetWidth;
    const imageHeight = metadata.height || targetHeight;
    const imageScale = clampPremiumImageScale(Number(layout.imageScale || 1));
    const imageOffsetX = clampPremiumImageOffset(Number(layout.imageOffsetX || 0));
    const imageOffsetY = clampPremiumImageOffset(Number(layout.imageOffsetY || 0));

    const coverScale = Math.max(targetWidth / imageWidth, targetHeight / imageHeight);
    const renderWidth = Math.max(targetWidth, Math.round(imageWidth * coverScale * imageScale));
    const renderHeight = Math.max(targetHeight, Math.round(imageHeight * coverScale * imageScale));
    const maxTravelX = Math.max(0, Math.round((renderWidth - targetWidth) / 2));
    const maxTravelY = Math.max(0, Math.round((renderHeight - targetHeight) / 2));
    // Pan para cima tem 1.5x mais alcance (painel overlay cobre o inferior)
    const xOffset = Math.round(maxTravelX * (imageOffsetX / 150));
    const yOffset = imageOffsetY < 0
        ? Math.round(maxTravelY * 1.5 * (imageOffsetY / 150))
        : Math.round(maxTravelY * (imageOffsetY / 150));
    const left = Math.max(0, Math.min(renderWidth - targetWidth, Math.round((renderWidth - targetWidth) / 2 + xOffset)));
    const top = Math.max(0, Math.min(renderHeight - targetHeight, Math.round((renderHeight - targetHeight) / 2 + yOffset)));

    return sharp(backgroundBuffer)
        .resize(renderWidth, renderHeight, { fit: 'fill' })
        .extract({ left, top, width: targetWidth, height: targetHeight });
}

/**
 * Creates the "Premium Overlay" composition:
 * - Background photo fills the entire image
 * - Dark gradient overlay from bottom to mid-image
 * - Branding area with icon and lines
 * - Bold centered headline with color highlights
 *
 * @param {string} backgroundUrl - Generated image URL or base64
 * @param {object} layout - { title, highlights, brandName, logoUrl, primaryColor, logoIcon }
 */
export async function createPremiumComposition(backgroundUrl, layout = {}) {
    try {
        console.log('🟢 Starting Premium Overlay Composition...');

        const {
            title = '',
            highlights = [],
            highlightText = '',
            brandName = 'Sua Marca',
            logoUrl = null,
            primaryColor = '#00C2FF'
        } = layout;

        if (!title) {
            console.warn('⚠️ No title provided, skipping composition.');
            return backgroundUrl;
        }

        const width = 1080;
        const height = 1350;

        // ─── 1. Background ─────────────────────────────────────────────────────
        const bgBuffer = await fetchImageBuffer(backgroundUrl);
        const baseImage = await buildPositionedBackground(bgBuffer, width, height, layout);

        // ─── 2. Configuration ──────────────────────────────────────────────────
        const theme = getPremiumTheme({ ...layout, primaryColor });
        const highlightColor = theme.accent;
        const normalizedHighlights = normalizeHighlights(highlights, highlightText, title);
        const highlightSet = new Set(normalizeHighlightWords(normalizedHighlights));
        const brandInitials = String(brandName || 'IB').replace(/\s+/g, '').slice(0, 2).toUpperCase();
        const currentSlideIndex = Math.max(0, Number(layout.slideIndex || 0));
        const currentSlideCount = Math.max(Number(layout.slideCount || 0), 1);

        // Try to build a circular logo layer first; if it fails we fall back to initials.
        let circularLogoLayer = null;
        if (logoUrl) {
            try {
                circularLogoLayer = await buildCircularLogoLayer(logoUrl, 76);
            } catch (e) {
                console.warn('⚠️ Could not load premium logo image, using initials fallback:', e.message);
                circularLogoLayer = null;
            }
        }

        // ─── 3. Fixed zone: bottom 40% ─────────────────────────────────────────
        const IMAGE_H = height * 0.60;
        const ZONE_TOP = IMAGE_H;
        const ZONE_HEIGHT = height - IMAGE_H;
        const HEADER_AREA = 150;
        const BOTTOM_PAD = 92;
        const AVAILABLE_TITLE = ZONE_HEIGHT - HEADER_AREA - BOTTOM_PAD;

        // ─── Auto-scale font size to fit title within available space ───────────
        const contentWidth = 908;
        const MAX_FONT = 148;
        const MIN_FONT = 76;
        const FONT_STEP = 4;
        const LH_RATIO = 0.96;

        function wrapTextSvg(text, maxWidth, fontSize) {
            const avgCharWidth = fontSize * 0.58;
            const charsPerLine = Math.floor(maxWidth / avgCharWidth);
            const words = text.split(/\s+/).filter(Boolean);
            const lines = [];
            let current = '';
            words.forEach(word => {
                const candidate = current ? `${current} ${word}` : word;
                if (candidate.length <= charsPerLine) {
                    current = candidate;
                } else {
                    if (current) lines.push(current);
                    current = word;
                }
            });
            if (current) lines.push(current);
            return lines.length > 0 ? lines : [''];
        }

        let titleFontSize = MAX_FONT;
        let titleLines = [];

        for (let fs = MAX_FONT; fs >= MIN_FONT; fs -= FONT_STEP) {
            const candidate = wrapTextSvg(title, contentWidth, fs);
            if (candidate.length * fs * LH_RATIO <= AVAILABLE_TITLE) {
                titleFontSize = fs;
                titleLines = candidate;
                break;
            }
            if (fs - FONT_STEP < MIN_FONT) {
                titleFontSize = MIN_FONT;
                titleLines = wrapTextSvg(title, contentWidth, MIN_FONT);
            }
        }
        const lineHeight = titleFontSize * LH_RATIO;

        // ─── 4. Layout SVG ────────────────────────────────────────────────────
        const svgParts = [];

        // Gradient from image to card — softer at the top, fully opaque at the bottom
        const gradientFadeStart = height * 0.28;
        const gradientFadeEnd = height * 0.60;
        svgParts.push(`
        <defs>
            <linearGradient id="darkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stop-color="${theme.gradientEnd}" stop-opacity="0" />
                <stop offset="20%"  stop-color="${theme.gradientEnd}" stop-opacity="0.15" />
                <stop offset="45%"  stop-color="${theme.gradientEnd}" stop-opacity="0.55" />
                <stop offset="70%"  stop-color="${theme.gradientEnd}" stop-opacity="0.88" />
                <stop offset="88%"  stop-color="${theme.gradientEnd}" stop-opacity="0.97" />
                <stop offset="100%" stop-color="${theme.gradientEnd}" stop-opacity="1" />
            </linearGradient>
        </defs>
        <rect x="0" y="${gradientFadeStart}" width="${width}" height="${gradientFadeEnd - gradientFadeStart}" fill="url(#darkGrad)" />
        <rect x="0" y="${ZONE_TOP}" width="${width}" height="${ZONE_HEIGHT}" fill="${theme.panelFill}" />`);

        // Branding area — anchored to ZONE_TOP
        const groupTop = ZONE_TOP + 68;
        const lineY = groupTop + 10;
        const lineWidth = 330;
        const iconGap = 56;
        const iconX = width / 2;
        const iconFontSize = 42;
        const circleSize = 76;
        const circleRadius = circleSize / 2;

        // Horizontal lines
        svgParts.push(`
        <rect x="${iconX - iconGap - lineWidth}" y="${lineY}" width="${lineWidth}" height="2" fill="${theme.divider}" />
        <rect x="${iconX + iconGap}" y="${lineY}" width="${lineWidth}" height="2" fill="${theme.divider}" />
        `);

        // Logo circle
        svgParts.push(`
        <circle cx="${iconX}" cy="${lineY}" r="${circleRadius}" fill="${theme.logoCircle}" />
        `);

        // Logo / initials (only if we couldn't load the logo image)
        if (!circularLogoLayer) {
            svgParts.push(`
            <text x="${iconX}" y="${lineY + 2}" font-family="Inter, -apple-system, sans-serif" font-size="${iconFontSize}" font-weight="800" fill="${theme.logoText}" text-anchor="middle" dominant-baseline="middle">
                ${escapeXml(brandInitials || logoIcon)}
            </text>
            `);
        }

        // Title — auto-scaled, within fixed zone
        let titleY = groupTop + HEADER_AREA - 40;
        titleLines.forEach((line) => {
            const words = line.split(/\s+/);
            const tspanContent = words.map((word, index) => {
                const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
                const isHighlighted = highlightSet.has(cleanWord);
                const renderedWord = escapeXml(word);
                const renderedText = index === words.length - 1 ? renderedWord : `${renderedWord} `;
                return isHighlighted
                    ? `<tspan xml:space="preserve" fill="${highlightColor}">${renderedText}</tspan>`
                    : `<tspan xml:space="preserve" fill="${theme.text}">${renderedText}</tspan>`;
            }).join('');

            titleY += lineHeight;
            svgParts.push(`
            <text x="${width / 2}" y="${titleY}" font-family="Inter, -apple-system, sans-serif" font-size="${titleFontSize}" font-weight="900" text-anchor="middle" letter-spacing="-2">
                ${tspanContent}
            </text>
            `);
        });

        // Swipe dots
        const dotY = height - 58;
        const dotRadius = 7;
        const dotGap = 10;
        const activeWidth = 28;
        const dotCount = currentSlideCount;
        const totalDotsWidth = activeWidth + (dotCount - 1) * (dotRadius * 2) + (dotCount - 1) * dotGap;
        let dotX = iconX - totalDotsWidth / 2;

        for (let index = 0; index < dotCount; index++) {
            if (index === currentSlideIndex) {
                svgParts.push(`<rect x="${dotX}" y="${dotY - dotRadius}" width="${activeWidth}" height="${dotRadius * 2}" rx="${dotRadius}" fill="${highlightColor}" />`);
                dotX += activeWidth + dotGap;
            } else {
                svgParts.push(`<circle cx="${dotX + dotRadius}" cy="${dotY}" r="${dotRadius}" fill="${theme.inactiveDot}" />`);
                dotX += dotRadius * 2 + dotGap;
            }
        }

        const finalSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            ${svgParts.join('\n')}
        </svg>`;

        // ─── 4. Composite ──────────────────────────────────────────────────────
        const layers = [{ input: Buffer.from(finalSvg), top: 0, left: 0 }];
        if (circularLogoLayer) {
            layers.push({
                input: circularLogoLayer,
                top: Math.round(lineY - circleRadius),
                left: Math.round(iconX - circleRadius)
            });
        }

        const compositedBuffer = await baseImage
            .composite(layers)
            .jpeg({ quality: 95 })
            .toBuffer();

        console.log('✅ Premium Composition finished.');
        return `data:image/jpeg;base64,${compositedBuffer.toString('base64')}`;

    } catch (error) {
        console.error('❌ Error in Premium Composition:', error);
        return backgroundUrl;
    }
}
