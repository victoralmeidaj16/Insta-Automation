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

async function fetchImageBuffer(url) {
    if (!url) return null;
    const isUrl = typeof url === 'string' && url.startsWith('http');
    if (isUrl) {
        const r = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(r.data);
    }
    return Buffer.from(url.replace(/^data:[^;]+;base64,/, ''), 'base64');
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
            brandName = 'Inner Boost',
            logoUrl = null,
            primaryColor = '#00C2FF',
            logoIcon = '🧠'
        } = layout;

        if (!title) {
            console.warn('⚠️ No title provided, skipping composition.');
            return backgroundUrl;
        }

        const width = 1080;
        const height = 1350;

        // ─── 1. Background ─────────────────────────────────────────────────────
        const bgBuffer = await fetchImageBuffer(backgroundUrl);
        const baseImage = sharp(bgBuffer).resize(width, height, { fit: 'cover', position: 'center' });

        // ─── 2. Configuration ──────────────────────────────────────────────────
        const highlightColor = primaryColor || '#00C2FF';
        const highlightSet = new Set((highlights || []).map(h => String(h).trim().toUpperCase()));

        // ─── 3. Fixed zone: bottom 40% ─────────────────────────────────────────
        // Zone starts at 60% from top, never overflows upward.
        const ZONE_TOP = height * 0.60;   // 810
        const ZONE_HEIGHT = height * 0.40; // 540
        const HEADER_AREA = 200; // logo + brand name block height
        const BOTTOM_PAD = 48;
        const AVAILABLE_TITLE = ZONE_HEIGHT - HEADER_AREA - BOTTOM_PAD; // ~292px

        // ─── Auto-scale font size to fit title within available space ───────────
        // SVG text wrapping is manual: we estimate chars per line at each font size.
        // Avg char width ≈ 0.6 * fontSize for bold sans-serif.
        const contentWidth = 780; // px
        const MAX_FONT = 108;
        const MIN_FONT = 52;
        const FONT_STEP = 4;
        const LH_RATIO = 0.93;

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

        // Gradient: white, fades to transparent above zone
        const gradientFadeStart = height * 0.55;
        svgParts.push(`
        <defs>
            <linearGradient id="whiteGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%"   stop-color="white" stop-opacity="0.98" />
                <stop offset="28%"  stop-color="white" stop-opacity="0.96" />
                <stop offset="62%"  stop-color="white" stop-opacity="0.58" />
                <stop offset="100%" stop-color="white" stop-opacity="0" />
            </linearGradient>
        </defs>
        <rect x="0" y="${gradientFadeStart}" width="${width}" height="${height - gradientFadeStart}" fill="url(#whiteGrad)" />`);

        // Branding area — anchored to ZONE_TOP
        const groupTop = ZONE_TOP + 12;
        const lineY = groupTop + 24;
        const lineWidth = 192;
        const iconGap = 48;
        const iconX = width / 2;
        const iconFontSize = 68;
        const brandFontSize = 28;

        // Horizontal lines
        svgParts.push(`
        <rect x="${iconX - iconGap - lineWidth}" y="${lineY}" width="${lineWidth}" height="5" fill="rgba(17,24,39,0.22)" />
        <rect x="${iconX + iconGap}" y="${lineY}" width="${lineWidth}" height="5" fill="rgba(17,24,39,0.22)" />
        `);

        // Logo icon (emoji) — centered on the line
        svgParts.push(`
        <text x="${iconX}" y="${lineY + iconFontSize * 0.5}" font-size="${iconFontSize}" text-anchor="middle" dominant-baseline="middle" filter="drop-shadow(0 0 14px ${highlightColor}66)">
            ${escapeXml(logoIcon)}
        </text>
        `);

        // Brand Name
        const brandNameY = groupTop + 98;
        svgParts.push(`
        <text x="${width/2}" y="${brandNameY}" font-family="Inter, -apple-system, sans-serif" font-size="${brandFontSize}" font-weight="800" fill="#111827" text-anchor="middle" letter-spacing="8">
            ${escapeXml(brandName.toUpperCase())}
        </text>
        `);

        // Title — auto-scaled, within fixed zone
        let titleY = groupTop + HEADER_AREA;
        titleLines.forEach((line) => {
            const words = line.split(/\s+/);
            const tspanContent = words.map(word => {
                const cleanWord = word.replace(/[.,!?;]/g, '').toUpperCase();
                const isHighlighted = highlightSet.has(cleanWord);
                return isHighlighted
                    ? `<tspan fill="${highlightColor}" filter="drop-shadow(0 2px 8px rgba(0,0,0,0.3))">${escapeXml(word)}</tspan>`
                    : `<tspan fill="#111827">${escapeXml(word)}</tspan>`;
            }).join('<tspan> </tspan>');

            titleY += lineHeight;
            svgParts.push(`
            <text x="${width/2}" y="${titleY}" font-family="Inter, -apple-system, sans-serif" font-size="${titleFontSize}" font-weight="900" text-anchor="middle" letter-spacing="-2">
                ${tspanContent}
            </text>
            `);
        });

        const finalSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            ${svgParts.join('\n')}
        </svg>`;

        // ─── 4. Composite ──────────────────────────────────────────────────────
        const compositedBuffer = await baseImage
            .composite([{ input: Buffer.from(finalSvg), top: 0, left: 0 }])
            .jpeg({ quality: 95 })
            .toBuffer();

        console.log('✅ Premium Composition finished.');
        return `data:image/jpeg;base64,${compositedBuffer.toString('base64')}`;

    } catch (error) {
        console.error('❌ Error in Premium Composition:', error);
        return backgroundUrl;
    }
}
