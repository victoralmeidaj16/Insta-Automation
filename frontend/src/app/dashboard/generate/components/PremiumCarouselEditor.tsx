import React from 'react';
import type { PremiumLayout } from '../types';

const premiumBackgroundCache = new Map<string, Promise<string>>();

interface BuildLayoutOptions {
    brandName?: string;
    primaryColor?: string;
    logoIcon?: string;
    logoUrl?: string;
    description?: string;
}

interface PremiumPreviewProps {
    layout: PremiumLayout;
    backgroundImage?: string;
    compact?: boolean;
}

interface PremiumEditorModalProps {
    isOpen: boolean;
    layout: PremiumLayout | null;
    backgroundImage?: string;
    onClose: () => void;
    onChange: (field: keyof PremiumLayout, value: string | boolean) => void;
    onDownload: () => void;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type HighlightRange = { start: number; end: number };

function getHighlightRanges(text: string, highlightText: string): HighlightRange[] {
    const normalized = (highlightText || '').trim();
    if (!normalized) return [];

    const parts = normalized.split(',').map(part => part.trim()).filter(Boolean);
    const ranges: HighlightRange[] = [];

    parts.forEach(part => {
        if (part.includes('...')) {
            const [startToken, endToken] = part.split('...').map(token => token.trim());
            if (!startToken || !endToken) return;

            const startRegex = new RegExp(escapeRegExp(startToken), 'gi');
            const endRegex = new RegExp(escapeRegExp(endToken), 'gi');
            const startIndices: number[] = [];
            const endIndices: number[] = [];

            let startMatch: RegExpExecArray | null;
            while ((startMatch = startRegex.exec(text)) !== null) {
                startIndices.push(startMatch.index);
            }

            let endMatch: RegExpExecArray | null;
            while ((endMatch = endRegex.exec(text)) !== null) {
                endIndices.push(endMatch.index + endMatch[0].length);
            }

            if (startIndices.length > 0 && endIndices.length > 0) {
                ranges.push({
                    start: Math.min(...startIndices),
                    end: Math.max(...endIndices)
                });
            }
            return;
        }

        const regex = new RegExp(escapeRegExp(part), 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            ranges.push({
                start: match.index,
                end: match.index + match[0].length
            });
        }
    });

    if (ranges.length === 0) return [];
    ranges.sort((a, b) => a.start - b.start);

    const merged: HighlightRange[] = [ranges[0]];
    for (let index = 1; index < ranges.length; index++) {
        const current = ranges[index];
        const previous = merged[merged.length - 1];

        if (current.start < previous.end) {
            previous.end = Math.max(previous.end, current.end);
        } else {
            merged.push({ ...current });
        }
    }

    return merged;
}

function getHighlightedFragments(text: string, highlightText: string) {
    const ranges = getHighlightRanges(text, highlightText);
    if (ranges.length === 0) {
        return [{ text, highlighted: false }];
    }

    const fragments: Array<{ text: string; highlighted: boolean }> = [];
    let cursor = 0;

    ranges.forEach(range => {
        if (cursor < range.start) {
            fragments.push({
                text: text.slice(cursor, range.start),
                highlighted: false
            });
        }

        fragments.push({
            text: text.slice(range.start, range.end),
            highlighted: true
        });
        cursor = range.end;
    });

    if (cursor < text.length) {
        fragments.push({
            text: text.slice(cursor),
            highlighted: false
        });
    }

    return fragments;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function getBackgroundProxyUrl(imageUrl: string, apiBaseUrl?: string) {
    const baseUrl = apiBaseUrl || 'http://localhost:3001';
    return `${baseUrl}/api/proxy-download?url=${encodeURIComponent(imageUrl)}&filename=premium-background.jpg`;
}

function splitTitleLines(
    context: CanvasRenderingContext2D,
    title: string,
    maxWidth: number
) {
    const sourceLines = (title || '').split('\n').map(line => line.trim()).filter(Boolean);
    const lines: string[] = [];

    sourceLines.forEach(sourceLine => {
        const words = sourceLine.split(/\s+/).filter(Boolean);
        if (words.length === 0) return;

        let currentLine = words[0];
        for (let index = 1; index < words.length; index++) {
            const candidate = `${currentLine} ${words[index]}`;
            if (context.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = words[index];
            }
        }
        lines.push(currentLine);
    });

    return lines.length > 0 ? lines : [''];
}

function splitDescriptionLines(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
) {
    const sourceLines = (text || '').split('\n');
    const lines: string[] = [];

    sourceLines.forEach(sourceLine => {
        const words = sourceLine.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push('');
            return;
        }

        let currentLine = words[0];
        for (let index = 1; index < words.length; index++) {
            const candidate = `${currentLine} ${words[index]}`;
            if (context.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = words[index];
            }
        }
        lines.push(currentLine);
    });

    return lines;
}

function measureSegmentedLine(
    context: CanvasRenderingContext2D,
    fragments: Array<{ text: string; highlighted: boolean }>
) {
    return fragments.reduce((width, fragment) => width + context.measureText(fragment.text).width, 0);
}

function drawCenteredTextWithLetterSpacing(
    context: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    y: number,
    letterSpacing: number
) {
    const chars = Array.from(text || '');
    if (chars.length === 0) return;

    const totalWidth = chars.reduce((width, char, index) => {
        return width + context.measureText(char).width + (index < chars.length - 1 ? letterSpacing : 0);
    }, 0);

    let drawX = centerX - totalWidth / 2;
    chars.forEach((char, index) => {
        context.fillText(char, drawX, y);
        drawX += context.measureText(char).width;
        if (index < chars.length - 1) {
            drawX += letterSpacing;
        }
    });
}

/**
 * Auto-extracts key words from card text to highlight in brand color.
 * Priority: words in quotes → words after contrast markers → last 2 significant words.
 */
function extractAutoHighlights(cardText: string): string {
    if (!cardText) return '';
    const clean = cardText.replace(/\*\*/g, '').trim();

    // 1. Words inside quotes (single, double, or curly)
    const quotedMatch = clean.match(/['"'"]([^'"'"]{3,30})['"'"]/);
    if (quotedMatch) return quotedMatch[1].trim();

    // 2. Words right after contrast/negation markers
    const contrastMatch = clean.match(
        /(?:não é|nunca|mas sim|porém|jamais|nem sempre|e não)\s+([\w\u00C0-\u024F]+(?:\s+[\w\u00C0-\u024F]+)?)/i
    );
    if (contrastMatch) return contrastMatch[1].trim();

    // 3. Last 2 significant words (skip articles, prepositions, conjunctions)
    const stopWords = new Set([
        'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'um', 'uma',
        'para', 'por', 'com', 'em', 'no', 'na', 'nos', 'nas', 'se', 'que', 'é',
        'ao', 'à', 'seu', 'sua', 'seus', 'suas', 'não', 'isso', 'este', 'esta',
        'esse', 'essa', 'quanto', 'tão', 'mais', 'só', 'você', 'voce', 'seu'
    ]);
    const words = clean
        .replace(/[.,!?;'"]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));

    return words.slice(-2).join(', ');
}

export function buildPremiumLayoutFromPrompt(
    prompt: string,
    options: BuildLayoutOptions = {}
): PremiumLayout {
    const titleMatch = prompt.match(/\[TITLE:\s*(.*?)\]/i);
    const headlineMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
    const highlightMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
    const descriptionMatch = prompt.match(/\[DESCRIPTION:\s*(.*?)\]/i);

    const parsedDescription = descriptionMatch ? descriptionMatch[1].trim() : options.description || '';

    // Fallback for batch-style prompts
    const mainPhraseMatch = prompt.match(/Main phrase:\s*\"(.*?)\"/i);

    let title = titleMatch ? titleMatch[1].trim() : headlineMatch ? headlineMatch[1].trim() : '';
    if (!title && mainPhraseMatch) {
        title = mainPhraseMatch[1].trim();
    }
    
    // Also extract from concept if available
    if (!title && options.description) {
        const conceptTitleMatch = options.description.match(/\*\*(HEADLINE|TITLE):\*\*\s*(.*)/i) || options.description.match(/\*\*(HEADLINE|TITLE)\*\*\s*(.*)/i);
        if (conceptTitleMatch) {
            title = conceptTitleMatch[2].trim().replace(/\*\*/g, '');
        }
    }

    // Fallback: try **Card N:** content (from parseStructuredCarouselCards concepts)
    if (!title && options.description) {
        const cardMatch = options.description.match(/\*\*Card\s+\d+:\*\*\s*([^\n*]+)/i);
        if (cardMatch) {
            const cardText = cardMatch[1].replace(/\*\*/g, '').trim();
            const firstPhrase = cardText.split(/[—–\-]/)[0].trim();
            if (firstPhrase.length > 2) {
                title = firstPhrase.substring(0, 80);
            }
        }
    }

    // Last resort: first clean non-structural line from description
    if (!title && options.description) {
        const structuralTags = /^(Tema Central|Imagem de Fundo|Card \d+|TEMA|SUBHEADLINE|FRASE|DESCRIÇÃO)/i;
        for (const line of options.description.split('\n')) {
            const clean = line.replace(/\*\*/g, '').replace(/^#\s*/, '').replace(/^\s*[-*•]\s*/, '').trim();
            if (clean.length > 5 && clean.length <= 80 && !structuralTags.test(clean)) {
                title = clean;
                break;
            }
        }
    }

    title = title.toUpperCase(); // Ensure title is uppercase

    // Highlights: use explicit [HIGHLIGHTS:] from prompt if present,
    // otherwise auto-extract key words from card concept text.
    let highlightText = highlightMatch ? highlightMatch[1].trim().toUpperCase() : '';
    if (!highlightText && options.description) {
        // Try to get the card-specific text from the concept
        const cardMatch = options.description.match(/\*\*Card\s+\d+:\*\*\s*([\s\S]+?)$/i);
        const sourceText = cardMatch ? cardMatch[1].trim() : options.description;
        highlightText = extractAutoHighlights(sourceText).toUpperCase();
    }

    return {
        brandName: options.brandName || 'Inner Boost',
        title: title || '',
        highlightText: highlightText,
        description: '',
        descriptionEnabled: false,
        descriptionColor: '#d1d5db',
        primaryColor: options.primaryColor || '#00C2FF',
        logoIcon: options.logoIcon || '🧠',
        logoUrl: options.logoUrl,
        backgroundImage: undefined
    };
}

export function extractPremiumBackgroundPrompt(prompt: string) {
    const backgroundMatch = prompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
    return backgroundMatch ? backgroundMatch[1].trim() : prompt;
}

export function isPremiumPrompt(prompt: string) {
    return /\[PREMIUM_OVERLAY\]/i.test(prompt || '');
}

export async function resolvePremiumBackgroundDataUrl(imageUrl: string, apiBaseUrl?: string) {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('data:')) return imageUrl;
    const cacheKey = `${apiBaseUrl || 'http://localhost:3001'}::${imageUrl}`;

    const cached = premiumBackgroundCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const request = (async () => {
        const response = await fetch(getBackgroundProxyUrl(imageUrl, apiBaseUrl));
        if (!response.ok) {
            throw new Error(`Falha ao carregar imagem premium: ${response.statusText}`);
        }

        return blobToDataUrl(await response.blob());
    })();

    premiumBackgroundCache.set(cacheKey, request);

    try {
        return await request;
    } catch (error) {
        premiumBackgroundCache.delete(cacheKey);
        throw error;
    }
}

export async function renderPremiumPostToDataUrl({
    layout,
    backgroundImage,
    apiBaseUrl
}: {
    layout: PremiumLayout;
    backgroundImage?: string;
    apiBaseUrl?: string;
}) {
    const resolvedBackground = backgroundImage
        ? await resolvePremiumBackgroundDataUrl(backgroundImage, apiBaseUrl)
        : '';

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D indisponível');
    }

    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (resolvedBackground) {
        const background = await loadImage(resolvedBackground);
        context.drawImage(background, 0, 0, canvas.width, canvas.height);
    }

    // ── FIXED OVERLAY ZONE: bottom 40% ───────────────────────────────────────
    // Zone starts at 60% from top and is always exactly 40% tall.
    // Content never grows above this boundary.
    const ZONE_TOP = canvas.height * 0.60;   // 810px for 1350px
    const ZONE_HEIGHT = canvas.height * 0.40; // 540px

    // Gradient: fades from transparent at 55% to solid white at ~72% then stays solid
    const gradientFadeStart = canvas.height * 0.55;
    const gradient = context.createLinearGradient(0, canvas.height, 0, gradientFadeStart);
    gradient.addColorStop(0,    'rgba(255,255,255,0.98)');
    gradient.addColorStop(0.28, 'rgba(255,255,255,0.96)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,0.58)');
    gradient.addColorStop(1,    'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, gradientFadeStart, canvas.width, canvas.height - gradientFadeStart);

    const centerX = canvas.width / 2;
    const highlightColor = layout.primaryColor || '#00C2FF';
    const baseTextColor = '#111827';
    const lineColor = 'rgba(17, 24, 39, 0.24)';
    const contentWidth = 760;
    const lineWidth = 192;
    const iconGap = 48;

    // ── AUTO-SCALE FONT: fits title within fixed zone ────────────────────────
    // Reserve space: header block (logo + brand name) = 200px, bottom pad = 48px
    const HEADER_AREA = 200;
    const BOTTOM_PAD = 48;
    const AVAILABLE_TITLE = ZONE_HEIGHT - HEADER_AREA - BOTTOM_PAD; // ~292px

    const MAX_FONT = 102;
    const MIN_FONT = 52;
    const FONT_STEP = 4;
    const LH_RATIO = 0.92;

    let titleFontSize = MAX_FONT;
    let titleLines: string[] = [];

    for (let fs = MAX_FONT; fs >= MIN_FONT; fs -= FONT_STEP) {
        context.font = `900 ${fs}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const candidate = splitTitleLines(context, layout.title || '', contentWidth);
        if (candidate.length * fs * LH_RATIO <= AVAILABLE_TITLE) {
            titleFontSize = fs;
            titleLines = candidate;
            break;
        }
        if (fs - FONT_STEP < MIN_FONT) {
            // Use minimum font size even if it overflows slightly
            titleFontSize = MIN_FONT;
            context.font = `900 ${MIN_FONT}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            titleLines = splitTitleLines(context, layout.title || '', contentWidth);
        }
    }
    const titleLineHeight = titleFontSize * LH_RATIO;

    // ── POSITIONS (anchored to ZONE_TOP) ─────────────────────────────────────
    const groupTop = ZONE_TOP + 12;
    const lineY = groupTop + 24;

    context.fillStyle = lineColor;
    context.fillRect(centerX - iconGap - lineWidth, lineY, lineWidth, 6);
    context.fillRect(centerX + iconGap, lineY, lineWidth, 6);

    context.textAlign = 'center';
    context.textBaseline = 'middle';

    if (layout.logoUrl) {
        try {
            const proxyUrl = apiBaseUrl
                ? `${apiBaseUrl}/api/proxy-download?url=${encodeURIComponent(layout.logoUrl)}&filename=logo.png`
                : layout.logoUrl;
            const logoImg = await loadImage(proxyUrl);
            const logoSize = 68;
            const logoX = centerX - logoSize / 2;
            const logoY = lineY - logoSize / 2 + 3;
            context.save();
            context.shadowColor = `${highlightColor}88`;
            context.shadowBlur = 22;
            context.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
            context.restore();
        } catch {
            context.shadowColor = `${highlightColor}88`;
            context.shadowBlur = 22;
            context.fillStyle = baseTextColor;
            context.font = '72px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            context.fillText(layout.logoIcon || '🧠', centerX, lineY + 3);
            context.shadowBlur = 0;
        }
    } else {
        context.shadowColor = `${highlightColor}88`;
        context.shadowBlur = 22;
        context.fillStyle = baseTextColor;
        context.font = '72px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        context.fillText(layout.logoIcon || '🧠', centerX, lineY + 3);
        context.shadowBlur = 0;
    }

    context.fillStyle = baseTextColor;
    context.font = '800 28px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawCenteredTextWithLetterSpacing(
        context,
        (layout.brandName || 'Inner Boost').toUpperCase(),
        centerX,
        groupTop + 98,
        10
    );

    // Title — auto-scaled font, within AVAILABLE_TITLE zone
    context.font = `900 ${titleFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    let titleY = groupTop + HEADER_AREA;

    titleLines.forEach((line) => {
        const fragments = getHighlightedFragments(line, layout.highlightText || '');
        const totalWidth = measureSegmentedLine(context, fragments);
        let drawX = centerX - totalWidth / 2;

        fragments.forEach((fragment) => {
            context.fillStyle = fragment.highlighted ? highlightColor : baseTextColor;
            if (fragment.highlighted) {
                context.shadowColor = 'rgba(0,0,0,0.35)';
                context.shadowBlur = 20;
                context.shadowOffsetY = 3;
            } else {
                context.shadowBlur = 0;
                context.shadowOffsetY = 0;
            }
            context.fillText(fragment.text, drawX, titleY);
            context.shadowBlur = 0;
            context.shadowOffsetY = 0;
            drawX += context.measureText(fragment.text).width;
        });

        titleY += titleLineHeight;
    });

    let descriptionLines: string[] = [];
    if (layout.descriptionEnabled && layout.description) {
        context.font = '600 38px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        descriptionLines = splitDescriptionLines(context, layout.description, 900);
        context.fillStyle = layout.descriptionColor || '#374151';
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        let descriptionY = titleY + 18;
        descriptionLines.forEach((line) => {
            context.fillText(line, centerX, descriptionY);
            descriptionY += 50;
        });
    }

    return canvas.toDataURL('image/jpeg', 0.92);
}

export function PremiumPostPreview({ layout, backgroundImage, compact = false }: PremiumPreviewProps) {
    const titleFragments = getHighlightedFragments(layout.title || '', layout.highlightText || '');

    // Auto-scale font: estimate lines and reduce size proportionally to fit 40% zone
    const charCount = (layout.title || '').length;
    const charsPerLine = compact ? 11 : 16;
    const estimatedLines = Math.max(1, Math.ceil(charCount / charsPerLine));
    const maxTitleRem = compact ? 2.2 : 3.5;
    const minTitleRem = compact ? 1.1 : 1.75;
    const scaledRem = Math.max(minTitleRem, maxTitleRem / Math.sqrt(Math.max(1, estimatedLines)));
    const titleFontSize = `${scaledRem.toFixed(2)}rem`;

    const brandFontSize = compact ? '0.9rem' : '1.2rem';
    const iconFontSize = compact ? '2.2rem' : '3.6rem';
    const descFontSize = compact ? '0.95rem' : '1.25rem';

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4 / 5',
                overflow: 'hidden',
                borderRadius: '18px',
                background: '#111',
                boxShadow: compact ? '0 20px 50px rgba(0,0,0,0.35)' : '0 30px 80px rgba(0,0,0,0.45)'
            }}
        >
            {backgroundImage && (
                <img
                    src={backgroundImage}
                    alt="Premium preview background"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                />
            )}

            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: '40%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: compact ? '0.75rem 1rem 1.25rem' : '1.5rem 2rem 2.5rem',
                    textAlign: 'center',
                    background: 'linear-gradient(to top, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.96) 28%, rgba(255,255,255,0.62) 62%, rgba(255,255,255,0) 100%)',
                    color: '#111827',
                    overflow: 'hidden'
                }}
            >
                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: compact ? '0.35rem' : '0.65rem',
                        marginBottom: compact ? '0.85rem' : '1.35rem'
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: compact ? '0.65rem' : '1.1rem'
                        }}
                    >
                        <div style={{ flex: 1, maxWidth: compact ? '72px' : '148px', height: '5px', background: 'rgba(17, 24, 39, 0.22)' }} />
                        {layout.logoUrl ? (
                            <img
                                src={layout.logoUrl}
                                alt={layout.brandName}
                                style={{
                                    width: iconFontSize,
                                    height: iconFontSize,
                                    objectFit: 'contain',
                                    filter: `drop-shadow(0 0 12px ${layout.primaryColor}66)`
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    fontSize: iconFontSize,
                                    lineHeight: 1,
                                    transform: 'translateY(-0.08em)',
                                    filter: `drop-shadow(0 0 12px ${layout.primaryColor}66)`
                                }}
                            >
                                {layout.logoIcon}
                            </div>
                        )}
                        <div style={{ flex: 1, maxWidth: compact ? '72px' : '148px', height: '5px', background: 'rgba(17, 24, 39, 0.22)' }} />
                    </div>
                    <div
                        style={{
                            fontSize: brandFontSize,
                            fontWeight: 800,
                            letterSpacing: compact ? '0.18em' : '0.28em',
                            textTransform: 'uppercase',
                            color: '#111827'
                        }}
                    >
                        {layout.brandName}
                    </div>
                </div>

                <div
                    style={{
                        fontSize: titleFontSize,
                        fontWeight: 900,
                        lineHeight: 0.92,
                        letterSpacing: '-0.05em',
                        textTransform: 'uppercase',
                        whiteSpace: 'pre-wrap',
                        color: '#111827'
                    }}
                >
                    {titleFragments.map((fragment, index) => (
                        <span
                            key={`${fragment.text}-${index}`}
                            style={{
                                color: fragment.highlighted ? layout.primaryColor : '#111827',
                                textShadow: fragment.highlighted ? '0 2px 15px rgba(0,0,0,0.35)' : 'none'
                            }}
                        >
                            {fragment.text}
                        </span>
                    ))}
                </div>

                {layout.descriptionEnabled && layout.description && (
                    <div
                        style={{
                            marginTop: compact ? '0.85rem' : '1.5rem',
                            color: layout.descriptionColor || '#374151',
                            fontSize: descFontSize,
                            fontWeight: 600,
                            lineHeight: 1.2,
                            whiteSpace: 'pre-wrap'
                        }}
                    >
                        {layout.description}
                    </div>
                )}
            </div>
        </div>
    );
}

export function PremiumEditorModal({
    isOpen,
    layout,
    backgroundImage,
    onClose,
    onChange,
    onDownload
}: PremiumEditorModalProps) {
    if (!isOpen || !layout) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.88)',
                zIndex: 1700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem'
            }}
            onClick={onClose}
        >
            <div
                className="card-glass"
                style={{
                    width: 'min(1200px, 100%)',
                    maxHeight: '92vh',
                    overflowY: 'auto',
                    padding: '1.5rem',
                    background: '#09090b',
                    border: '1px solid #27272a',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(280px, 360px) minmax(320px, 1fr)',
                    gap: '1.5rem'
                }}
                onClick={event => event.stopPropagation()}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Editor Premium</h2>
                            <p style={{ margin: '0.25rem 0 0', color: '#a1a1aa', fontSize: '0.875rem' }}>
                                Mesmo mecanismo do template premium, agora dentro do AI Generator.
                            </p>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                        Branding / Logo
                        <input value={layout.brandName} onChange={event => onChange('brandName', event.target.value)} className="input" />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                        Ícone
                        <input value={layout.logoIcon} onChange={event => onChange('logoIcon', event.target.value)} className="input" maxLength={4} />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                        Título Principal
                        <textarea value={layout.title} onChange={event => onChange('title', event.target.value)} className="input" rows={4} />
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                        Palavra em Destaque
                        <input value={layout.highlightText} onChange={event => onChange('highlightText', event.target.value)} className="input" />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Descrição
                            <textarea value={layout.description} onChange={event => onChange('description', event.target.value)} className="input" rows={3} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Cor
                            <input type="color" value={layout.descriptionColor} onChange={event => onChange('descriptionColor', event.target.value)} style={{ width: '56px', height: '54px', borderRadius: '0.75rem', border: '1px solid #3f3f46', background: 'transparent', padding: '0.2rem' }} />
                        </label>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#d4d4d8', fontSize: '0.875rem' }}>
                        <input type="checkbox" checked={layout.descriptionEnabled} onChange={event => onChange('descriptionEnabled', event.target.checked)} />
                        Mostrar descrição
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Cor de Destaque
                            <input type="color" value={layout.primaryColor} onChange={event => onChange('primaryColor', event.target.value)} style={{ width: '100%', height: '46px', borderRadius: '0.75rem', border: '1px solid #3f3f46', background: 'transparent', padding: '0.2rem' }} />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Upload Fundo
                            <input
                                type="file"
                                accept="image/*"
                                onChange={async event => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    const dataUrl = await blobToDataUrl(file);
                                    onChange('backgroundImage', dataUrl);
                                }}
                                className="input"
                            />
                        </label>
                    </div>

                    <button
                        onClick={onDownload}
                        className="btn"
                        style={{
                            width: '100%',
                            background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
                            color: '#111',
                            border: 'none',
                            fontWeight: 700
                        }}
                    >
                        Baixar Arte Premium
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '320px' }}>
                    <div style={{ width: 'min(100%, 420px)' }}>
                        <PremiumPostPreview
                            layout={layout}
                            backgroundImage={layout.backgroundImage || backgroundImage}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
