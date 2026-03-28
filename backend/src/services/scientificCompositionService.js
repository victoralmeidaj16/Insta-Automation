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
        const candidate = `${current} ${word}`.trim();
        if (candidate.length > maxChars && current) {
            lines.push(current.trim());
            current = word;
        } else {
            current = candidate;
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

    const base64Data = String(imageUrl || '').replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
}

function buildHighlightedLineSvg(line, highlights, centerX, y, fontSize, primaryColor) {
    const words = String(line || '').split(/\s+/).filter(Boolean);
    const highlightSet = new Set((highlights || []).map((item) => String(item).trim().toUpperCase()).filter(Boolean));

    const spans = words.map((word, index) => {
        const cleanWord = word.replace(/[^\wÀ-ÿ-]/g, '').toUpperCase();
        const fill = highlightSet.has(cleanWord) ? primaryColor : '#FFFFFF';
        const spacer = index < words.length - 1 ? '<tspan fill="#FFFFFF">&#160;</tspan>' : '';
        return `<tspan fill="${fill}">${escapeXml(word)}</tspan>${spacer}`;
    }).join('');

    return `
        <text
            x="${centerX}"
            y="${y}"
            text-anchor="middle"
            font-family="Inter, Arial, sans-serif"
            font-size="${fontSize}"
            font-weight="900"
            fill="#FFFFFF"
        >${spans}</text>
    `;
}

export async function createScientificComposition(
    backgroundUrl,
    headline,
    subheadline = '',
    highlights = [],
    logoUrl = null,
    options = {}
) {
    try {
        const width = 1080;
        const height = 1350;
        const centerX = width / 2;
        const primaryColor = options.primaryColor || '#A6F000';
        const brandName = String(options.brandName || 'Sua Marca').toUpperCase();

        const bgBuffer = await fetchImageBuffer(backgroundUrl);
        if (!bgBuffer || !headline) return backgroundUrl;

        const baseImage = sharp(bgBuffer).resize(width, height, { fit: 'cover' });

        let logoOverlay = null;
        let logoWidth = 0;
        let logoHeight = 0;

        if (logoUrl) {
            try {
                const logoBuffer = await fetchImageBuffer(logoUrl);
                logoOverlay = await sharp(logoBuffer)
                    .resize({ height: 28, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                const logoMetadata = await sharp(logoOverlay).metadata();
                logoWidth = logoMetadata.width || 0;
                logoHeight = logoMetadata.height || 0;
            } catch (error) {
                console.error('⚠️ Falha ao processar logo científica:', error.message);
            }
        }

        const overlayTop = Math.round(height * 0.55);
        const overlayHeight = height - overlayTop;
        const titleLines = wrapText(String(headline).toUpperCase(), 18).slice(0, 4);
        const subtitleLines = wrapText(subheadline, 42).slice(0, 2);

        const titleFontSize = 64;
        const titleLineHeight = 76;
        const subtitleFontSize = 27;
        const subtitleLineHeight = 38;
        const brandFontSize = 24;
        const headerBlockHeight = 112;
        const titleBlockHeight = titleLines.length * titleLineHeight;
        const subtitleBlockHeight = subtitleLines.length > 0 ? subtitleLines.length * subtitleLineHeight + 18 : 0;
        const totalBlockHeight = headerBlockHeight + titleBlockHeight + subtitleBlockHeight;
        const startY = overlayTop + Math.max(70, Math.round((overlayHeight - totalBlockHeight) / 2));

        const lineY = startY + 6;
        const lineWidth = 120;
        const lineGap = 24;
        const brandY = startY + 78;
        let titleY = startY + 178;

        const titleSvg = titleLines
            .map((line, index) =>
                buildHighlightedLineSvg(line, highlights, centerX, titleY + (index * titleLineHeight), titleFontSize, primaryColor)
            )
            .join('');

        const subtitleStartY = titleY + titleBlockHeight + 8;
        const subtitleSvg = subtitleLines
            .map((line, index) => `
                <text
                    x="${centerX}"
                    y="${subtitleStartY + (index * subtitleLineHeight)}"
                    text-anchor="middle"
                    font-family="Inter, Arial, sans-serif"
                    font-size="${subtitleFontSize}"
                    font-weight="500"
                    fill="#D1D5DB"
                >${escapeXml(line)}</text>
            `)
            .join('');

        const brandSectionSvg = logoOverlay
            ? `
                <rect x="${centerX - logoWidth / 2 - lineGap - lineWidth}" y="${lineY}" width="${lineWidth}" height="3" fill="white" fill-opacity="0.42" />
                <rect x="${centerX + logoWidth / 2 + lineGap}" y="${lineY}" width="${lineWidth}" height="3" fill="white" fill-opacity="0.42" />
            `
            : `
                <rect x="${centerX - 180}" y="${lineY}" width="120" height="3" fill="white" fill-opacity="0.42" />
                <rect x="${centerX + 60}" y="${lineY}" width="120" height="3" fill="white" fill-opacity="0.42" />
                <text
                    x="${centerX}"
                    y="${brandY}"
                    text-anchor="middle"
                    font-family="Inter, Arial, sans-serif"
                    font-size="${brandFontSize}"
                    font-weight="800"
                    fill="#FFFFFF"
                    letter-spacing="6"
                >${escapeXml(brandName)}</text>
            `;

        const gradientSvg = `
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="scientificOverlayFade" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stop-color="#000000" stop-opacity="0.96" />
                        <stop offset="40%" stop-color="#000000" stop-opacity="0.85" />
                        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
                    </linearGradient>
                </defs>
                <rect x="0" y="${overlayTop}" width="${width}" height="${overlayHeight}" fill="url(#scientificOverlayFade)" />
            </svg>
        `;

        const contentSvg = `
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                ${brandSectionSvg}
                ${titleSvg}
                ${subtitleSvg}
            </svg>
        `;

        const layers = [{ input: Buffer.from(gradientSvg), top: 0, left: 0 }];

        if (logoOverlay) {
            layers.push({
                input: logoOverlay,
                top: Math.round(startY + 42),
                left: Math.round(centerX - logoWidth / 2)
            });

            layers.push({
                input: Buffer.from(`
                    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                        <text
                            x="${centerX}"
                            y="${brandY}"
                            text-anchor="middle"
                            font-family="Inter, Arial, sans-serif"
                            font-size="${brandFontSize}"
                            font-weight="800"
                            fill="#FFFFFF"
                            letter-spacing="6"
                        >${escapeXml(brandName)}</text>
                    </svg>
                `),
                top: 0,
                left: 0
            });
        }

        layers.push({ input: Buffer.from(contentSvg), top: 0, left: 0 });

        const composited = await baseImage
            .composite(layers)
            .jpeg({ quality: 95 })
            .toBuffer();

        return `data:image/jpeg;base64,${composited.toString('base64')}`;
    } catch (error) {
        console.error('❌ Error in Scientific Composition:', error);
        return backgroundUrl;
    }
}
