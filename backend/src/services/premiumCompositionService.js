import sharp from 'sharp';
import axios from 'axios';

// Deriva a cor da subheadline do texto do tema. Fixar um cinza claro deixaria o
// texto ilegível nos temas de painel claro (Fitswap).
function withAlpha(hexColor, alpha) {
    const hex = String(hexColor || '').trim().replace('#', '');
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    if (!/^[0-9a-f]{6}$/i.test(full)) return `rgba(255,255,255,${alpha})`;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Escada de tipografia do título premium: cada quantidade de linhas tem UM
// tamanho fixo, então dois posts com o mesmo número de linhas saem idênticos.
// Espelhado no editor (PremiumCarouselEditor.renderPremiumPostToDataUrl).
export const PREMIUM_TITLE_METRICS = {
    paddingRatio: 0.10,     // margem lateral segura (10% de 1080 = 108px)
    topGap: 30,             // respiro entre o logo/divisor e a primeira linha
    bottomGap: 34,          // respiro entre a última linha e os swipe dots
    lineHeightRatio: 1.0,
    ladder: [
        { maxLines: 1, fontSize: 150 },
        { maxLines: 2, fontSize: 132 },
        { maxLines: 3, fontSize: 104 },
        { maxLines: 4, fontSize: 78 },
        { maxLines: 5, fontSize: 62 },
        { maxLines: 6, fontSize: 52 }
    ],
    minFontSize: 34,
    fontStep: 4
};

// Enquadramento padrão da foto no hero: o recorte sobe 10% da altura da faixa,
// senão o motivo da imagem nasce baixo demais e some atrás do gradiente.
// Espelhado no editor (PremiumCarouselEditor: PREMIUM_HERO_LIFT_RATIO).
export const PREMIUM_HERO_LIFT_RATIO = 0.10;

// Intensidade padrão do gradiente de transição foto → painel.
export const PREMIUM_GRADIENT_OPACITY_DEFAULT = 0.8;

/**
 * Escolhe o tamanho do título pela escada padronizada: usa o primeiro degrau em
 * que o texto cabe na largura E na altura disponíveis. Títulos extremos caem
 * para um ajuste fino abaixo do último degrau, ainda dentro do quadro.
 *
 * @param {string} title
 * @param {(text: string, fontSize: number) => string[]} wrapAt quebra o texto no tamanho dado
 * @param {number} availableHeight altura livre do bloco de título
 */
export function fitPremiumTitle(title, wrapAt, availableHeight) {
    const { ladder, lineHeightRatio, minFontSize, fontStep } = PREMIUM_TITLE_METRICS;
    const text = String(title || '').trim();

    for (const step of ladder) {
        const lines = wrapAt(text, step.fontSize);
        if (lines.length <= step.maxLines && lines.length * step.fontSize * lineHeightRatio <= availableHeight) {
            return { fontSize: step.fontSize, lines };
        }
    }

    const smallest = ladder[ladder.length - 1].fontSize;
    let fallbackSize = minFontSize;
    let fallbackLines = wrapAt(text, minFontSize);
    for (let fs = smallest; fs >= minFontSize; fs -= fontStep) {
        const lines = wrapAt(text, fs);
        if (lines.length * fs * lineHeightRatio <= availableHeight) {
            fallbackSize = fs;
            fallbackLines = lines;
            break;
        }
    }

    return { fontSize: fallbackSize, lines: fallbackLines };
}

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
            // Espelha o `imageFilter` do editor (contrast(1.02) brightness(1.02)).
            imageContrast: 1.02,
            imageBrightness: 1.02,
            panelFill: '#EEF2E8',
            gradientEnd: '#EEF2E8',
            text: '#111827',
            subtitleColor: '#727983',
            divider: 'rgba(17,24,39,0.18)',
            // O editor desenha o círculo do logo em branco com as iniciais escuras;
            // o inverso deixava a marca publicada diferente do preview.
            logoCircle: '#FFFFFF',
            logoText: '#111827',
            inactiveDot: 'rgba(17,24,39,0.24)'
        };
    }

    if (isElevepicLayout(layout)) {
        return {
            accent: '#3F507A', // Keyword color as highlights
            imageContrast: 1.1,
            imageBrightness: 0.9,
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
        imageContrast: 1.1,
        imageBrightness: 0.9,
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

async function buildPositionedBackground(backgroundBuffer, targetWidth, targetHeight, layout = {}, heroLiftRatio = 0) {
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
    // O editor move a IMAGEM sobre o quadro; aqui movemos o RECORTE dentro da
    // imagem, então o sinal inverte para o pan bater com o preview.
    // Pan para cima tem 1.5x mais alcance (painel overlay cobre o inferior).
    const xOffset = -Math.round(maxTravelX * (imageOffsetX / 150));
    const yOffset = imageOffsetY < 0
        ? -Math.round(maxTravelY * 1.5 * (imageOffsetY / 150))
        : -Math.round(maxTravelY * (imageOffsetY / 150));
    const left = Math.round((renderWidth - targetWidth) / 2 + xOffset);
    const centeredTop = Math.round((renderHeight - targetHeight) / 2 + yOffset);
    // Descer o RECORTE dentro da imagem = subir a FOTO no quadro. O lift é
    // limitado ao que ainda existe de imagem abaixo, para não abrir faixa vazia.
    const liftRoom = Math.max(0, renderHeight - targetHeight - centeredTop);
    const heroLift = Math.min(Math.round(targetHeight * heroLiftRatio), liftRoom);
    const top = centeredTop + heroLift;

    // O pan de 1.5x pode empurrar o recorte para fora da imagem (o editor
    // simplesmente deixa sobrar fundo). Preenchemos essa sobra com a cor do tema
    // em vez de travar o deslocamento, senão o publicado divergiria do preview.
    const padTop = Math.max(0, -top);
    const padLeft = Math.max(0, -left);
    const padBottom = Math.max(0, top + targetHeight - renderHeight);
    const padRight = Math.max(0, left + targetWidth - renderWidth);

    // Espelha o `filter: contrast(c) brightness(b)` que o editor aplica na imagem.
    // Em CSS, contrast é out = (in - 0.5) * c + 0.5, que em sharp vira .linear().
    const theme = getPremiumTheme(layout);
    const contrast = Number(theme.imageContrast ?? 1);
    const brightness = Number(theme.imageBrightness ?? 1);

    let resized = sharp(backgroundBuffer).resize(renderWidth, renderHeight, { fit: 'fill' });

    if (padTop || padBottom || padLeft || padRight) {
        const extended = await resized
            .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: theme.panelFill })
            .png()
            .toBuffer();
        resized = sharp(extended);
    }

    const positioned = resized.extract({
        left: left + padLeft,
        top: top + padTop,
        width: targetWidth,
        height: targetHeight
    });

    if (contrast !== 1) positioned.linear(contrast, -(0.5 * contrast - 0.5) * 255);
    if (brightness !== 1) positioned.modulate({ brightness });

    return positioned.png().toBuffer();
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

        // A arte premium é só título: um bloco grande, centralizado e enquadrado.
        // `description` continua no draft (histórico/legenda), mas não é desenhada.
        // O editor deixa regular a intensidade do gradiente; ignorá-la aqui fazia
        // a arte publicada sair sempre com o gradiente no máximo.
        const gradientOpacity = Math.min(1, Math.max(0, Number(layout.gradientOpacity ?? PREMIUM_GRADIENT_OPACITY_DEFAULT)));

        const width = 1080;
        const height = 1350;
        // A foto ocupa só a faixa superior (60%), como no editor. Compor no canvas
        // inteiro jogava o motivo da imagem para baixo, bem dentro do gradiente.
        const IMAGE_H = Math.round(height * 0.60);
        const themedLayout = { ...layout, primaryColor };

        // ─── 1. Configuration ──────────────────────────────────────────────────
        const theme = getPremiumTheme(themedLayout);

        // ─── 2. Background ─────────────────────────────────────────────────────
        const bgBuffer = await fetchImageBuffer(backgroundUrl);

        // Sem overlay o editor usa a foto no canvas inteiro, sem gradiente nem painel.
        if (layout.hideOverlay) {
            const fullBleed = await buildPositionedBackground(bgBuffer, width, height, themedLayout);
            const rawBuffer = await sharp({ create: { width, height, channels: 3, background: '#000000' } })
                .composite([{ input: fullBleed, top: 0, left: 0 }])
                .jpeg({ quality: 95 })
                .toBuffer();
            return `data:image/jpeg;base64,${rawBuffer.toString('base64')}`;
        }

        if (!title) {
            console.warn('⚠️ No title provided, skipping composition.');
            return backgroundUrl;
        }

        const heroBuffer = await buildPositionedBackground(bgBuffer, width, IMAGE_H, themedLayout, PREMIUM_HERO_LIFT_RATIO);
        const baseImage = sharp({ create: { width, height, channels: 3, background: theme.panelFill } });
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
        // Todas as medidas espelham renderPremiumPostToDataUrl() no editor.
        const ZONE_TOP = IMAGE_H;
        const ZONE_HEIGHT = height - IMAGE_H;              // 540
        // Margem lateral de 10% (108px): o título nunca encosta na borda do post.
        const PADDING_X = Math.round(width * PREMIUM_TITLE_METRICS.paddingRatio); // 108
        const LOGO_Y = IMAGE_H + Math.round(ZONE_HEIGHT * 0.14); // 886
        const LOGO_R = 38;
        const LINE_GAP = LOGO_R + 18;                      // 56
        const TITLE_TOP = LOGO_Y + LOGO_R + PREMIUM_TITLE_METRICS.topGap;   // 954
        const DOTS_H = 40;
        const AVAILABLE_TITLE = height - TITLE_TOP - DOTS_H - PREMIUM_TITLE_METRICS.bottomGap;

        // ─── Tamanho padronizado por número de linhas ───────────────────────────
        const contentWidth = width - PADDING_X * 2;        // 864
        const LH_RATIO = PREMIUM_TITLE_METRICS.lineHeightRatio;

        function wrapTextSvg(text, maxWidth, fontSize) {
            const avgCharWidth = fontSize * 0.58;
            const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
            const lines = [];

            String(text || '').split('\n').forEach(sourceLine => {
                const words = sourceLine.split(/\s+/).filter(Boolean);
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
            });

            return lines.length > 0 ? lines : [''];
        }

        const fitted = fitPremiumTitle(
            title,
            (text, fontSize) => wrapTextSvg(text, contentWidth, fontSize),
            AVAILABLE_TITLE
        );
        const titleFontSize = fitted.fontSize;
        const titleLines = fitted.lines;
        const lineHeight = titleFontSize * LH_RATIO;
        const totalBlockHeight = titleLines.length * lineHeight;

        // ─── 4. Layout SVG ────────────────────────────────────────────────────
        const svgParts = [];

        // Gradient from image to card — softer at the top, fully opaque at the bottom
        const gradientFadeStart = Math.round(height * 0.28);
        const gradientFadeEnd = IMAGE_H;
        svgParts.push(`
        <defs>
            <linearGradient id="darkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stop-color="${theme.gradientEnd}" stop-opacity="0" />
                <stop offset="20%"  stop-color="${theme.gradientEnd}" stop-opacity="${(gradientOpacity * 0.15).toFixed(3)}" />
                <stop offset="45%"  stop-color="${theme.gradientEnd}" stop-opacity="${(gradientOpacity * 0.55).toFixed(3)}" />
                <stop offset="70%"  stop-color="${theme.gradientEnd}" stop-opacity="${(gradientOpacity * 0.88).toFixed(3)}" />
                <stop offset="88%"  stop-color="${theme.gradientEnd}" stop-opacity="${(gradientOpacity * 0.97).toFixed(3)}" />
                <stop offset="100%" stop-color="${theme.gradientEnd}" stop-opacity="1" />
            </linearGradient>
        </defs>
        <rect x="0" y="${gradientFadeStart}" width="${width}" height="${gradientFadeEnd - gradientFadeStart}" fill="url(#darkGrad)" />
        <rect x="0" y="${ZONE_TOP}" width="${width}" height="${ZONE_HEIGHT}" fill="${theme.panelFill}" />`);

        // Branding area — anchored to ZONE_TOP
        const lineY = LOGO_Y;
        const lineWidth = width / 2 - LINE_GAP - PADDING_X;
        const iconGap = LINE_GAP;
        const iconX = width / 2;
        const iconFontSize = 42;
        const circleRadius = LOGO_R;

        // Horizontal lines
        svgParts.push(`
        <rect x="${PADDING_X}" y="${lineY - 1}" width="${lineWidth}" height="2" fill="${theme.divider}" />
        <rect x="${iconX + iconGap}" y="${lineY - 1}" width="${lineWidth}" height="2" fill="${theme.divider}" />
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

        // Title — auto-scaled, bloco centralizado na zona livre (igual ao editor)
        // Tracking proporcional ao corpo, para o título grande não abrir demais.
        const letterSpacing = -(titleFontSize * 0.02).toFixed(2);
        let titleY = TITLE_TOP
            + Math.max(0, (AVAILABLE_TITLE - totalBlockHeight) / 2)
            + titleFontSize * 0.8;
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

            svgParts.push(`
            <text x="${width / 2}" y="${titleY}" font-family="Inter, -apple-system, sans-serif" font-size="${titleFontSize}" font-weight="900" text-anchor="middle" letter-spacing="${letterSpacing}">
                ${tspanContent}
            </text>
            `);
            titleY += lineHeight;
        });

        // Swipe dots
        const dotY = height - 50;
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
        // Ordem = empilhamento: foto na faixa superior, depois gradiente/painel/texto.
        const layers = [
            { input: heroBuffer, top: 0, left: 0 },
            { input: Buffer.from(finalSvg), top: 0, left: 0 }
        ];
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
