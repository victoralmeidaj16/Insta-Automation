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

// Estimate character width using a font-size relative factor
function estimateTextWidth(text, fontSize, fontWeight = 900) {
    const baseRatio = fontWeight >= 700 ? 0.68 : 0.6;
    return String(text).length * fontSize * baseRatio;
}

function wrapTextByWidth(text, fontSize, maxWidth) {
    const words = String(text || '').toUpperCase().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = [];

    for (const word of words) {
        const candidate = [...current, word].join(' ');
        if (current.length > 0 && estimateTextWidth(candidate, fontSize, 900) > maxWidth) {
            lines.push(current.join(' '));
            current = [word];
        } else {
            current.push(word);
        }
    }

    if (current.length) lines.push(current.join(' '));
    return lines;
}

function buildHighlightedLineSvg(line, highlights, centerX, y, fontSize, normalColor, highlightColor) {
    const highlightSet = new Set((highlights || []).map(h => String(h).trim().toUpperCase()).filter(Boolean));
    const words = String(line || '').split(/\s+/).filter(Boolean);
    const estimatedLineWidth = estimateTextWidth(line, fontSize, 900);
    let cursorX = centerX - estimatedLineWidth / 2;

    const spans = words.map((word, index) => {
        const clean = word.replace(/[.,!?;]/g, '').toUpperCase();
        const fill = highlightSet.has(clean) ? highlightColor : normalColor;
        const output = `<tspan x="${cursorX}" y="${y}" fill="${fill}">${escapeXml(word)}</tspan>`;
        cursorX += estimateTextWidth(word, fontSize, 900);
        if (index < words.length - 1) {
            cursorX += estimateTextWidth(' ', fontSize, 900) * 0.9;
        }
        return output;
    }).join('');

    return `<text font-family="Inter, -apple-system, sans-serif" font-size="${fontSize}" font-weight="900">${spans}</text>`;
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

export async function createFitswapWhiteComposition(backgroundUrl, layout = {}) {
    try {
        console.log('🟢 Starting Fitswap White Overlay Composition...');

        const {
            headline = '',
            highlights = [],
            brandName = 'Fitswap',
            logoUrl = null,
            options = {}
        } = layout;

        if (!headline) {
            console.warn('⚠️ No headline provided, skipping composition.');
            return backgroundUrl;
        }

        // Image dimensions: 4:5 at 1080x1350
        const width = 1080;
        const height = 1350;

        // Scale factor: HTML is 800×1000, we render at 1080×1350 (scale ≈ 1.35)
        const scale = 1.35;

        // ─── 1. Fetch & resize background ──────────────────────────────────────
        const bgBuffer = await fetchImageBuffer(backgroundUrl);
        const baseImage = sharp(bgBuffer).resize(width, height, { fit: 'cover', position: 'center' });

        // ─── 2. Headline layout parameters ─────────────────────────────────────
        const fontSize = 64 * scale;
        const lineHeight = fontSize * 0.94;
        const safeSidePadding = 64;
        const maxHeadlineWidth = width - safeSidePadding * 2;

        // Split headline into safe lines that never invade the lateral margins
        const headlineLines = wrapTextByWidth(headline, fontSize, maxHeadlineWidth).slice(0, 4);

        // ─── 3. Compute vertical positions (bottom-up) ─────────────────────────
        const paddingBottom = 80 * scale;   // ~108px bottom padding
        const logoMarginBottom = 40 * scale;
        const logoBrandFontSize = 26 * scale; // ~35px for brand name text
        const iconDiameter = 52;
        const dividerGap = 56;
        const dividerLineWidth = Math.round((width - safeSidePadding * 2 - iconDiameter - dividerGap) / 2);

        // Total headline block height
        const headlineBlockHeight = headlineLines.length * lineHeight;

        // Y positions: fixed, more upward, with a final clamp to preserve the footer
        const logoY = height - paddingBottom;            // brand text baseline
        const dividerY = Math.round(height * 0.70);
        const preferredHeadlineStartY = dividerY + 112;
        const maxHeadlineStartY = logoY - logoMarginBottom - headlineBlockHeight;
        const headlineStartY = Math.min(preferredHeadlineStartY, maxHeadlineStartY);

        // ─── 4. Build SVG layers ────────────────────────────────────────────────
        const svgParts = [];

        // 4a. White gradient overlay (45% of height from bottom)
        const gradientHeight = height * 0.55;
        const gradientY = height - gradientHeight;
        svgParts.push(`
        <defs>
            <linearGradient id="whiteGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stop-color="white" stop-opacity="0.97" />
                <stop offset="35%" stop-color="white" stop-opacity="0.88" />
                <stop offset="70%" stop-color="white" stop-opacity="0.30" />
                <stop offset="100%" stop-color="white" stop-opacity="0" />
            </linearGradient>
        </defs>
        <rect x="0" y="${gradientY}" width="${width}" height="${gradientHeight}" fill="url(#whiteGrad)" />`);

        // 4b. Divider with centered circular icon
        const highlightColor = '#A6F000';
        svgParts.push(`
        <rect x="${safeSidePadding}" y="${dividerY}" width="${dividerLineWidth}" height="3" fill="#9CA3AF" fill-opacity="0.7" rx="2" />
        <rect x="${width - safeSidePadding - dividerLineWidth}" y="${dividerY}" width="${dividerLineWidth}" height="3" fill="#9CA3AF" fill-opacity="0.7" rx="2" />
        <circle cx="${width / 2}" cy="${dividerY + 1}" r="${iconDiameter / 2}" fill="#FFFFFF" fill-opacity="0.96" />
        <circle cx="${width / 2}" cy="${dividerY + 1}" r="${iconDiameter / 2 - 2}" fill="#F3F4F6" />
        `);

        // 4c. Headline lines with lime text highlights decided by HIGHLIGHTS
        for (let i = 0; i < headlineLines.length; i++) {
            const lineText = headlineLines[i];
            const lineY = headlineStartY + i * lineHeight;
            svgParts.push(buildHighlightedLineSvg(
                lineText,
                highlights,
                width / 2,
                lineY + fontSize * 0.75,
                fontSize,
                '#111827',
                highlightColor
            ));
        }

        // 4d. Brand name / logo bottom-right
        const logoRightMargin = 40 * scale;
        const logoBottomMargin = 40 * scale;
        svgParts.push(`
        <text
            x="${width - logoRightMargin}"
            y="${height - logoBottomMargin}"
            font-family="Inter, -apple-system, sans-serif"
            font-size="${logoBrandFontSize}"
            font-weight="700"
            fill="${highlightColor}"
            text-anchor="end"
        >${escapeXml(brandName)}</text>`);

        const finalSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            ${svgParts.join('\n')}
        </svg>`;

        // ─── 5. Composite with Sharp ────────────────────────────────────────────
        const layers = [];
        const iconCenterX = width / 2;
        const iconCenterY = dividerY + 1;

        // If there's a logo image, composite it instead of text
        if (logoUrl) {
            try {
                const logoBuf = await fetchImageBuffer(logoUrl);
                const logoResized = await sharp(logoBuf)
                    .resize(iconDiameter - 14, iconDiameter - 14, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();
                const logoMeta = await sharp(logoResized).metadata();
                layers.push({
                    input: logoResized,
                    top: Math.round(iconCenterY - (logoMeta.height || 0) / 2),
                    left: Math.round(iconCenterX - (logoMeta.width || 0) / 2)
                });
            } catch (e) {
                console.warn('⚠️ Could not load logo image, using text fallback:', e.message);
            }
        } else {
            const iconSvg = `
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="${iconCenterX}"
                    y="${iconCenterY + 13}"
                    text-anchor="middle"
                    font-family="Inter, -apple-system, sans-serif"
                    font-size="28"
                    font-weight="800"
                    fill="#111827"
                >F</text>
            </svg>`;
            layers.push({ input: Buffer.from(iconSvg), top: 0, left: 0 });
        }

        layers.push({ input: Buffer.from(finalSvg), top: 0, left: 0 });

        const compositedBuffer = await baseImage
            .composite(layers)
            .jpeg({ quality: 95 })
            .toBuffer();

        console.log('✅ Fitswap White Composition finished.');
        return `data:image/jpeg;base64,${compositedBuffer.toString('base64')}`;

    } catch (error) {
        console.error('❌ Error in Fitswap White Composition:', error);
        return backgroundUrl; // Fallback: return original image
    }
}
