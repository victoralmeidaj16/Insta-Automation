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

function wrapText(text, maxChars) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines = [];
    let current = '';

    for (const word of words) {
        if (`${current} ${word}`.trim().length > maxChars && current) {
            lines.push(current.trim());
            current = word;
        } else {
            current = `${current} ${word}`.trim();
        }
    }

    if (current) lines.push(current.trim());
    return lines;
}

async function fetchImageBuffer(imageUrl) {
    if (!imageUrl) return null;

    const isUrl = typeof imageUrl === 'string' && imageUrl.startsWith('http');
    if (isUrl) {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    }

    const b64 = String(imageUrl || '').replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(b64, 'base64');
}

export async function createFitswapComposition(backgroundUrl, layout = {}) {
    try {
        const {
            headline,
            subheadline,
            highlights = [],
            logoUrl = null,
            options = {},
            aspectRatio = '4:5'
        } = layout;

        if (!headline) return backgroundUrl;

        const sizeMap = {
            '1:1': { width: 1080, height: 1080 },
            '4:5': { width: 1080, height: 1350 },
            '16:9': { width: 1920, height: 1080 },
            '9:16': { width: 1080, height: 1920 }
        };

        const { width, height } = sizeMap[aspectRatio] || sizeMap['4:5'];
        const bgBuffer = await fetchImageBuffer(backgroundUrl);
        if (!bgBuffer) return backgroundUrl;

        const baseImage = sharp(bgBuffer).resize(width, height, { fit: 'cover' });

        const primaryColor = options.primaryColor || '#A6F000';
        const titleColor = options.secondaryColor || '#111827';
        const bodyColor = options.bodyColor || '#6B7280';
        const brandName = options.brandName || 'Fitswap';

        let logoOverlay = null;
        if (logoUrl) {
            try {
                const logoBuffer = await fetchImageBuffer(logoUrl);
                logoOverlay = await sharp(logoBuffer)
                    .resize(140, 60, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();
            } catch (error) {
                console.error('⚠️ Falha ao processar logo do Fitswap:', error.message);
            }
        }

        const cardHeight = Math.round(height * (aspectRatio === '1:1' ? 0.36 : 0.34));
        const cardY = height - cardHeight - Math.round(height * 0.04);
        const cardX = Math.round(width * 0.04);
        const cardWidth = width - cardX * 2;
        const cardRadius = Math.round(Math.min(width, height) * 0.03);
        const accentBarWidth = Math.round(cardWidth * 0.16);
        const accentBarHeight = Math.max(8, Math.round(height * 0.006));

        const headlineLines = wrapText(String(headline).toUpperCase(), aspectRatio === '1:1' ? 18 : 20).slice(0, 4);
        const subheadlineLines = wrapText(subheadline, aspectRatio === '1:1' ? 28 : 34).slice(0, 3);
        const highlightSet = new Set((highlights || []).map((item) => String(item).trim().toUpperCase()).filter(Boolean));

        const titleStartX = cardX + Math.round(cardWidth * 0.08);
        const titleStartY = cardY + Math.round(cardHeight * 0.28);
        const titleLineHeight = aspectRatio === '1:1' ? 74 : 80;
        const titleFontSize = aspectRatio === '1:1' ? 64 : 68;

        const titleSvg = headlineLines.map((line, index) => {
            const y = titleStartY + (index * titleLineHeight);
            const words = line.split(' ').filter(Boolean);
            let xCursor = titleStartX;

            const spans = words.map((word) => {
                const cleanWord = word.replace(/[^\wÀ-ÿ-]/g, '');
                const isHighlight = highlightSet.has(cleanWord);
                const escaped = escapeXml(word);
                const output = `<tspan x="${xCursor}" y="${y}" fill="${isHighlight ? primaryColor : titleColor}">${escaped}</tspan>`;
                xCursor += Math.round(word.length * (titleFontSize * 0.62));
                xCursor += Math.round(titleFontSize * 0.22);
                return output;
            }).join('');

            return `<text font-family="Inter, SF Pro Display, Arial, sans-serif" font-size="${titleFontSize}" font-weight="800">${spans}</text>`;
        }).join('');

        const subheadStartY = titleStartY + (headlineLines.length * titleLineHeight) + Math.round(height * 0.015);
        const subheadSvg = subheadlineLines.map((line, index) => {
            const y = subheadStartY + (index * 42);
            return `<text x="${titleStartX}" y="${y}" font-family="Inter, SF Pro Text, Arial, sans-serif" font-size="30" font-weight="500" fill="${bodyColor}">${escapeXml(line)}</text>`;
        }).join('');

        const footerTextY = cardY + cardHeight - Math.round(cardHeight * 0.12);
        const footerTextX = titleStartX;

        const overlaySvg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="fadeToWhite" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
                    <stop offset="28%" stop-color="#FFFFFF" stop-opacity="0.30" />
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="1" />
                </linearGradient>
                <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#111827" flood-opacity="0.08"/>
                </filter>
            </defs>

            <rect x="0" y="${Math.round(height * 0.46)}" width="${width}" height="${Math.round(height * 0.54)}" fill="url(#fadeToWhite)" />
            <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="${cardRadius}" fill="#FFFFFF" filter="url(#softShadow)" />
            <rect x="${titleStartX}" y="${cardY + Math.round(cardHeight * 0.12)}" width="${accentBarWidth}" height="${accentBarHeight}" rx="${Math.round(accentBarHeight / 2)}" fill="${primaryColor}" />
            ${titleSvg}
            ${subheadSvg}
            <text x="${footerTextX}" y="${footerTextY}" font-family="Inter, SF Pro Text, Arial, sans-serif" font-size="22" font-weight="700" fill="${titleColor}" opacity="0.85">${escapeXml(brandName.toUpperCase())}</text>
        </svg>`;

        const layers = [{ input: Buffer.from(overlaySvg), top: 0, left: 0 }];

        if (logoOverlay) {
            layers.push({
                input: logoOverlay,
                top: footerTextY - 48,
                left: cardX + cardWidth - 180
            });
        }

        const composited = await baseImage
            .composite(layers)
            .jpeg({ quality: 95 })
            .toBuffer();

        return `data:image/jpeg;base64,${composited.toString('base64')}`;
    } catch (error) {
        console.error('❌ Error in Fitswap Composition:', error);
        return backgroundUrl;
    }
}
