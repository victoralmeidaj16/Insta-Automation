import React, { useState, useEffect } from 'react';
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
    onChange: (field: keyof PremiumLayout, value: string | boolean | number) => void;
    onAction?: () => void;
    actionLabel?: string;
    allowBackgroundUpload?: boolean;
    actionDisabled?: boolean;
    slideLabel?: string;
    onPreviousSlide?: () => void;
    onNextSlide?: () => void;
    canGoPrevious?: boolean;
    canGoNext?: boolean;
    apiBaseUrl?: string;
    onSecondaryAction?: () => void;
    secondaryActionLabel?: string;
    secondaryActionDisabled?: boolean;
}

function clampPremiumImageScale(value: number) {
    return Math.min(2.0, Math.max(1, Number.isFinite(value) ? value : 1));
}

function clampPremiumImageOffset(value: number) {
    return Math.min(150, Math.max(-150, Number.isFinite(value) ? value : 0));
}

function getPremiumImageFrame(layout: PremiumLayout, imageWidth: number, imageHeight: number, targetWidth: number, targetHeight: number) {
    const safeScale = clampPremiumImageScale(Number(layout.imageScale || 1));
    const safeOffsetY = clampPremiumImageOffset(Number(layout.imageOffsetY || 0));
    const safeOffsetX = clampPremiumImageOffset(Number(layout.imageOffsetX || 0));
    const coverScale = Math.max(targetWidth / imageWidth, targetHeight / imageHeight);
    const renderWidth = imageWidth * coverScale * safeScale;
    const renderHeight = imageHeight * coverScale * safeScale;
    const maxTravelY = Math.max(0, (renderHeight - targetHeight) / 2);
    const maxTravelX = Math.max(0, (renderWidth - targetWidth) / 2);
    // Pan para cima (negativo) tem 1.5x mais alcance: o painel overlay cobre o inferior,
    // então a imagem pode se deslocar para revelar mais conteúdo acima da linha de corte.
    const yOffset = safeOffsetY < 0
        ? maxTravelY * 1.5 * (safeOffsetY / 150)
        : maxTravelY * (safeOffsetY / 150);
    const xOffset = maxTravelX * (safeOffsetX / 150);

    return {
        safeScale,
        safeOffsetX,
        safeOffsetY,
        renderWidth,
        renderHeight,
        x: (targetWidth - renderWidth) / 2 + xOffset,
        y: (targetHeight - renderHeight) / 2 + yOffset
    };
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
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

async function fetchImageAsDataUrl(url: string, apiBaseUrl?: string): Promise<string> {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    const proxyUrl = apiBaseUrl
        ? `${apiBaseUrl}/api/proxy-download?url=${encodeURIComponent(url)}&filename=img.png`
        : url;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    return blobToDataUrl(await response.blob());
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


function measureSegmentedLine(
    context: CanvasRenderingContext2D,
    fragments: Array<{ text: string; highlighted: boolean }>
) {
    return fragments.reduce((width, fragment) => width + context.measureText(fragment.text).width, 0);
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

function isFitswapPremiumBrand(layoutLike: Partial<PremiumLayout> | BuildLayoutOptions = {}): boolean {
    return String(layoutLike.brandName || '').toLowerCase().includes('fitswap');
}

/** Returns relative luminance (0–1) of a hex color per WCAG 2.1 */
function hexLuminance(hex: string): number {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return 0.5;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Boosts color brightness to meet minimum luminance (default 0.18 ≈ contrast 4:1 on black) */
function ensureContrastOnDark(hex: string, minLuminance = 0.18): string {
    if (hexLuminance(hex) >= minLuminance) return hex;
    // Lighten by scaling RGB channels up toward white until threshold is met
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '#00C2FF';
    let r = parseInt(clean.slice(0, 2), 16);
    let g = parseInt(clean.slice(2, 4), 16);
    let b = parseInt(clean.slice(4, 6), 16);
    for (let step = 0; step < 20; step++) {
        r = Math.min(255, r + 15);
        g = Math.min(255, g + 15);
        b = Math.min(255, b + 15);
        const boosted = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        if (hexLuminance(boosted) >= minLuminance) return boosted;
    }
    return '#FFFFFF';
}

function getReadablePremiumAccentColor(layoutLike: Partial<PremiumLayout> | BuildLayoutOptions = {}): string {
    if (isFitswapPremiumBrand(layoutLike)) return '#6F9800';
    const raw = layoutLike.primaryColor || '#00C2FF';
    return ensureContrastOnDark(raw);
}

function ensureHighlightText(title: string, highlightText: string): string {
    const normalized = String(highlightText || '').trim();
    if (normalized) return normalized.toUpperCase();

    return extractAutoHighlights(title || '').toUpperCase();
}

function sanitizePremiumTitle(title: string): string {
    return String(title || '')
        .replace(/[{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function extractBraceHighlights(title: string): string[] {
    return Array.from(String(title || '').matchAll(/\{([^}]+)\}/g))
        .map(match => match[1]?.trim().toUpperCase())
        .filter(Boolean);
}

function getPremiumTheme(layoutLike: Partial<PremiumLayout> | BuildLayoutOptions = {}) {
    const accent = getReadablePremiumAccentColor(layoutLike);

    if (isFitswapPremiumBrand(layoutLike)) {
        return {
            accent,
            canvasBackground: '#EEF2E8',
            panelBackground: '#EEF2E8',
            gradientEnd: 'rgba(238,242,232,0.97)',
            text: '#111827',
            divider: 'rgba(17,24,39,0.18)',
            logoBackground: '#ffffff',
            logoText: '#111827',
            inactiveDot: 'rgba(17,24,39,0.24)',
            imageFilter: 'contrast(1.02) brightness(1.02)'
        };
    }

    return {
        accent,
        canvasBackground: '#000000',
        panelBackground: '#000000',
        gradientEnd: 'rgba(0,0,0,0.97)',
        text: '#ffffff',
        divider: 'rgba(255,255,255,0.18)',
        logoBackground: '#ffffff',
        logoText: '#000000',
        inactiveDot: 'rgba(255,255,255,0.2)',
        imageFilter: 'contrast(1.1) brightness(0.9)'
    };
}

export function buildPremiumLayoutFromPrompt(
    prompt: string,
    options: BuildLayoutOptions = {}
): PremiumLayout {
    const titleMatch = prompt.match(/\[TITLE:\s*(.*?)\]/i);
    const headlineMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
    const highlightMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);

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

    // Capture from "Slide X:" or "Hook:" directly
    if (!title && options.description) {
        const structuralMatch = options.description.match(/\*\*(?:Slide\s+\d+|Hook[a-zA-Z\s]*|Card\s+\d+):\*\*\s*(.*)/i);
        if (structuralMatch) {
            title = structuralMatch[1].trim().replace(/^["']|["']$/g, '');
        }
    }

    // Last resort: first clean non-structural line from description
    if (!title && options.description) {
        const structuralTags = /^(Tema Central|Imagem de Fundo|Card |Slide |Hook |TEMA|SUBHEADLINE|FRASE|DESCRIÇÃO)/i;
        for (const line of options.description.split('\n')) {
            const clean = line.replace(/\*\*/g, '').replace(/^#\s*/, '').replace(/^\s*[-*•]\s*/, '').trim();
            if (clean.length > 5 && clean.length <= 150 && !structuralTags.test(clean)) {
                title = clean.replace(/^["']|["']$/g, '');
                break;
            }
        }
    }
    
    // Fallback if everything else fails, try to remove prefixes directly
    if (!title && options.description) {
        title = options.description
            .replace(/^\s*[-*•]\s*/, '')
            .replace(/\*\*(?:Slide\s+\d+|Hook[a-zA-Z\s]*|Card\s+\d+):\*\*\s*/i, '')
            .replace(/^["']|["']$/g, '')
            .substring(0, 150);
    }

    const braceHighlights = extractBraceHighlights(title);
    title = sanitizePremiumTitle(title);

    // Highlights: use explicit [HIGHLIGHTS:] from prompt if present,
    // otherwise auto-extract key words from card concept text.
    let highlightText = highlightMatch ? highlightMatch[1].trim().toUpperCase() : '';
    if (!highlightText && options.description) {
        // Try to get the card-specific text from the concept
        const cardMatch = options.description.match(/\*\*Card\s+\d+:\*\*\s*([\s\S]+?)$/i);
        const sourceText = cardMatch ? cardMatch[1].trim() : options.description;
        highlightText = extractAutoHighlights(sourceText).toUpperCase();
    }
    if (!highlightText && braceHighlights.length > 0) {
        highlightText = braceHighlights.join(', ');
    }
    highlightText = ensureHighlightText(title, highlightText);

    return {
        brandName: options.brandName || 'Inner Boost',
        title: title || '',
        highlightText: highlightText,
        description: '',
        descriptionEnabled: false,
        descriptionColor: '#d1d5db',
        primaryColor: getReadablePremiumAccentColor(options),
        logoIcon: options.logoIcon || '🧠',
        logoUrl: options.logoUrl,
        backgroundImage: undefined,
        imageOffsetX: 0,
        imageOffsetY: 0,
        imageScale: 1,
        gradientOpacity: 1,
        slideIndex: 0,
        slideCount: 5
    };
}

export function extractPremiumBackgroundPrompt(prompt: string) {
    const idx = prompt.search(/\[BACKGROUND:/i);
    if (idx === -1) return prompt;
    const afterTag = prompt.slice(idx).replace(/^\[BACKGROUND:\s*/i, '');
    // Remove trailing ] if present (handles single-line and multi-line content)
    return afterTag.replace(/\]\s*$/, '').trim();
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

    if (layout.hideOverlay) {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (resolvedBackground) {
            const background = await loadImage(resolvedBackground);
            const frame = getPremiumImageFrame({...layout, imageScale: layout.imageScale || 1}, background.width, background.height, canvas.width, canvas.height);
            context.drawImage(background, frame.x, frame.y, frame.renderWidth, frame.renderHeight);
        }
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    // ── Scientific / editorial-sci aesthetic ─────────────────────────────────
    // Dark background, hero image top 60%, dark gradient overlay, logo divider,
    // bold uppercase headline with accent color highlights.

    const centerX = canvas.width / 2;
    const theme = getPremiumTheme(layout);
    const accentColor = theme.accent;
    const IMAGE_H = Math.round(canvas.height * 0.60); // 810px
    const activeSlideIndex = Math.max(0, Number(layout.slideIndex || 0));
    const totalSlideCount = Math.max(1, Number(layout.slideCount || 5));

    // 1. Base background
    context.fillStyle = theme.canvasBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Hero image — top 60%
    if (resolvedBackground) {
        const background = await loadImage(resolvedBackground);
        context.filter = theme.imageFilter;
        const frame = getPremiumImageFrame(layout, background.width, background.height, canvas.width, IMAGE_H);
        context.drawImage(background, frame.x, frame.y, frame.renderWidth, frame.renderHeight);
        context.filter = 'none';
    }

    // 3. Gradient overlay — compressed zone (28%→60%), stronger curve
    const gradOpacity = Math.min(1, Math.max(0, Number(layout.gradientOpacity ?? 1)));
    const gradStart = Math.round(canvas.height * 0.28);
    const gradEnd   = IMAGE_H; // 60% — exactly where panel begins
    const gradient = context.createLinearGradient(0, gradStart, 0, gradEnd);
    const gradColor = theme.gradientEnd.replace(/[\d.]+\)$/, `{opacity})`);
    gradient.addColorStop(0,    gradColor.replace('{opacity}', `0`));
    gradient.addColorStop(0.20, gradColor.replace('{opacity}', `${(gradOpacity * 0.15).toFixed(3)}`));
    gradient.addColorStop(0.45, gradColor.replace('{opacity}', `${(gradOpacity * 0.55).toFixed(3)}`));
    gradient.addColorStop(0.70, gradColor.replace('{opacity}', `${(gradOpacity * 0.88).toFixed(3)}`));
    gradient.addColorStop(0.88, gradColor.replace('{opacity}', `${(gradOpacity * 0.97).toFixed(3)}`));
    gradient.addColorStop(1,    gradColor.replace('{opacity}', `1`));
    context.fillStyle = gradient;
    context.fillRect(0, gradStart, canvas.width, gradEnd - gradStart);

    // Solid panel for bottom 40%
    context.fillStyle = theme.panelBackground;
    context.fillRect(0, IMAGE_H, canvas.width, canvas.height - IMAGE_H);

    // ── Content area: bottom 40% (IMAGE_H → canvas.height) ───────────────────
    const CONTENT_H = canvas.height - IMAGE_H;          // 540px
    const PADDING_X = Math.round(canvas.width * 0.08);  // 86px
    const CONTENT_W = canvas.width - PADDING_X * 2;     // 908px

    // 4. Micro-UI: divider lines + logo circle
    const LOGO_Y  = IMAGE_H + Math.round(CONTENT_H * 0.18); // ~910px
    const LOGO_R  = 38;
    const LINE_GAP = LOGO_R + 18;

    // Divider lines
    context.fillStyle = theme.divider;
    context.fillRect(PADDING_X, LOGO_Y - 1, centerX - LINE_GAP - PADDING_X, 2);
    context.fillRect(centerX + LINE_GAP, LOGO_Y - 1, centerX - LINE_GAP - PADDING_X, 2);

    // Logo circle
    context.fillStyle = theme.logoBackground;
    context.beginPath();
    context.arc(centerX, LOGO_Y, LOGO_R, 0, Math.PI * 2);
    context.fill();

    // Logo image or initials inside circle
    if (layout.logoUrl) {
        try {
            const logoDataUrl = await fetchImageAsDataUrl(layout.logoUrl, apiBaseUrl);
            const logoImg = await loadImage(logoDataUrl);
            context.save();
            context.beginPath();
            context.arc(centerX, LOGO_Y, LOGO_R, 0, Math.PI * 2);
            context.clip();
            context.drawImage(logoImg, centerX - LOGO_R, LOGO_Y - LOGO_R, LOGO_R * 2, LOGO_R * 2);
            context.restore();
        } catch {
            // Fallback to initials
            const initials = (layout.brandName || 'EP').replace(/\s+/g, '').substring(0, 2).toUpperCase();
            context.fillStyle = theme.logoText;
            context.font = `800 ${LOGO_R}px Inter, sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(initials, centerX, LOGO_Y);
        }
    } else {
        const initials = (layout.brandName || 'EP').replace(/\s+/g, '').substring(0, 2).toUpperCase();
        context.fillStyle = theme.logoText;
        context.font = `800 ${LOGO_R}px Inter, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(initials, centerX, LOGO_Y);
    }

    // ── Auto-scale headline font ──────────────────────────────────────────────
    const TITLE_TOP    = LOGO_Y + LOGO_R + 48;
    const DOTS_H       = 40;
    const AVAILABLE_H  = canvas.height - TITLE_TOP - DOTS_H - 60;

    const MAX_FONT = 148;
    const MIN_FONT = 56;
    const FONT_STEP = 4;
    const LH_RATIO = 0.96;

    const sanitizedTitle = sanitizePremiumTitle(layout.title || '');
    let titleFontSize = MAX_FONT;
    let titleLines: string[] = [];

    for (let fs = MAX_FONT; fs >= MIN_FONT; fs -= FONT_STEP) {
        context.font = `900 ${fs}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
        const candidate = splitTitleLines(context, sanitizedTitle, CONTENT_W);
        if (candidate.length * fs * LH_RATIO <= AVAILABLE_H) {
            titleFontSize = fs;
            titleLines = candidate;
            break;
        }
        if (fs - FONT_STEP < MIN_FONT) {
            titleFontSize = MIN_FONT;
            context.font = `900 ${MIN_FONT}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
            titleLines = splitTitleLines(context, sanitizedTitle, CONTENT_W);
        }
    }
    const titleLineHeight = titleFontSize * LH_RATIO;

    // Center title block vertically between LOGO and dots
    const totalTitleH = titleLines.length * titleLineHeight;
    let titleY = TITLE_TOP + (AVAILABLE_H - totalTitleH) / 2 + titleFontSize * 0.8;

    context.font = `900 ${titleFontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';

    const effectiveHighlightText = ensureHighlightText(sanitizedTitle, layout.highlightText || '');
    titleLines.forEach((line) => {
        const fragments = getHighlightedFragments(line, effectiveHighlightText);
        const totalWidth = measureSegmentedLine(context, fragments);
        let drawX = centerX - totalWidth / 2;

        fragments.forEach((fragment) => {
            context.fillStyle = fragment.highlighted ? accentColor : theme.text;
            context.fillText(fragment.text, drawX, titleY);
            drawX += context.measureText(fragment.text).width;
        });

        titleY += titleLineHeight;
    });

    // ── Swipe dots ────────────────────────────────────────────────────────────
    const DOT_Y = canvas.height - 50;
    const DOT_R = 7;
    const DOT_GAP = 10;
    const ACTIVE_W = 28;
    const DOT_COUNT = totalSlideCount;
    // Total width: active dot (28) + 4 round dots (14 each) + 4 gaps
    const totalDotsW = ACTIVE_W + (DOT_COUNT - 1) * (DOT_R * 2) + (DOT_COUNT - 1) * DOT_GAP;
    let dotX = centerX - totalDotsW / 2;

    for (let d = 0; d < DOT_COUNT; d++) {
        context.fillStyle = d === activeSlideIndex ? accentColor : theme.inactiveDot;
        if (d === activeSlideIndex) {
            // Active: pill shape
            context.beginPath();
            context.roundRect(dotX, DOT_Y - DOT_R, ACTIVE_W, DOT_R * 2, DOT_R);
            context.fill();
            dotX += ACTIVE_W + DOT_GAP;
        } else {
            context.beginPath();
            context.arc(dotX + DOT_R, DOT_Y, DOT_R, 0, Math.PI * 2);
            context.fill();
            dotX += DOT_R * 2 + DOT_GAP;
        }
    }

    return canvas.toDataURL('image/jpeg', 0.92);
}

export function PremiumPostPreview({ layout, backgroundImage, compact = false }: PremiumPreviewProps) {
    const sanitizedTitle = sanitizePremiumTitle(layout.title || '');
    const effectiveHighlightText = ensureHighlightText(sanitizedTitle, layout.highlightText || '');
    const titleFragments = getHighlightedFragments(sanitizedTitle, effectiveHighlightText);
    const theme = getPremiumTheme(layout);
    const accentColor = theme.accent;
    const activeSlideIndex = Math.max(0, Number(layout.slideIndex || 0));
    const totalSlideCount = Math.max(1, Number(layout.slideCount || 5));
    const imageScale = clampPremiumImageScale(Number(layout.imageScale || 1));
    const imageOffsetX = clampPremiumImageOffset(Number(layout.imageOffsetX || 0));
    const imageOffsetY = clampPremiumImageOffset(Number(layout.imageOffsetY || 0));
    const gradientOpacity = Math.min(1, Math.max(0, Number(layout.gradientOpacity ?? 1)));

    // Auto-scale font to fit the 40% content zone
    // More text = more lines = smaller font, scaling aggressively for 3+ lines
    const charCount = sanitizedTitle.length;
    const charsPerLine = compact ? 11 : 16;
    const estimatedLines = Math.max(1, Math.ceil(charCount / charsPerLine));
    const maxTitleRem = compact ? 2.0 : 3.2;
    const minTitleRem = compact ? 0.72 : 1.1;
    // Use power 0.65 (steeper than sqrt=0.5) for more aggressive downscaling on long titles
    const scaledRem = Math.max(minTitleRem, maxTitleRem / Math.pow(Math.max(1, estimatedLines), 0.65));
    const titleFontSize = `${scaledRem.toFixed(2)}rem`;

    const logoSize = compact ? '20px' : '28px';
    const logoFontSize = compact ? '8px' : '10px';

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4 / 5',
                overflow: 'hidden',
                background: theme.canvasBackground,
                boxShadow: compact ? '0 20px 50px rgba(0,0,0,0.5)' : '0 30px 80px rgba(0,0,0,0.6)',
            }}
        >
            {/* Hero image */}
            {backgroundImage && (
                <img
                    src={backgroundImage}
                    alt="Hero"
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0,
                        width: '100%',
                        height: layout.hideOverlay ? '100%' : '60%',
                        objectFit: 'cover',
                        objectPosition: `calc(50% + ${imageOffsetX * 1.5}px) calc(50% + ${imageOffsetY * 1.5}px)`,
                        transform: `scale(${imageScale})`,
                        transformOrigin: 'center center',
                        filter: theme.imageFilter
                    }}
                />
            )}

            {/* Gradient overlay — compressed zone (28%→60%), stronger curve */}
            {!layout.hideOverlay && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0, right: 0,
                        top: '28%',
                        height: '32%',
                        background: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${theme.gradientEnd.replace(/[\d.]+\)$/, `${(gradientOpacity * 0.15).toFixed(3)})`)} 20%, ${theme.gradientEnd.replace(/[\d.]+\)$/, `${(gradientOpacity * 0.55).toFixed(3)})`)} 45%, ${theme.gradientEnd.replace(/[\d.]+\)$/, `${(gradientOpacity * 0.88).toFixed(3)})`)} 70%, ${theme.gradientEnd.replace(/[\d.]+\)$/, `${(gradientOpacity * 0.97).toFixed(3)})`)} 88%, ${theme.gradientEnd.replace(/[\d.]+\)$/, `1)`)} 100%)`,
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Content area — bottom 40% */}
            {!layout.hideOverlay && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0, right: 0, bottom: 0,
                        height: '40%',
                        background: theme.panelBackground,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: compact ? '5% 7% 7%' : '6% 8% 8%',
                    }}
                >
                    {/* Micro UI: divider + logo */}
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '1px', background: theme.divider }} />
                        <div
                            style={{
                                width: logoSize, height: logoSize,
                                borderRadius: '50%',
                                background: theme.logoBackground,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden', flexShrink: 0,
                            }}
                        >
                            {layout.logoUrl ? (
                                <img src={layout.logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <span style={{ fontSize: logoFontSize, fontWeight: 800, color: theme.logoText, fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
                                    {(layout.brandName || 'EP').replace(/\s+/g, '').substring(0, 2).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div style={{ flex: 1, height: '1px', background: theme.divider }} />
                    </div>

                    {/* Headline */}
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: titleFontSize,
                            fontFamily: "'Bebas Neue', 'Inter', sans-serif",
                            fontWeight: 900,
                            lineHeight: 0.95,
                            letterSpacing: '-0.04em',
                            textTransform: 'uppercase',
                            textAlign: 'center',
                            color: theme.text,
                            padding: '4% 0',
                        }}
                    >
                        <div>
                            {titleFragments.map((fragment, index) => (
                                <span
                                    key={`${fragment.text}-${index}`}
                                    style={{ color: fragment.highlighted ? accentColor : theme.text }}
                                >
                                    {fragment.text}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Swipe dots */}
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                        {Array.from({ length: totalSlideCount }).map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: i === activeSlideIndex ? '14px' : '4px',
                                    height: '4px',
                                    borderRadius: i === activeSlideIndex ? '2px' : '50%',
                                    background: i === activeSlideIndex ? accentColor : theme.inactiveDot,
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function PremiumEditorModal({
    isOpen,
    layout,
    backgroundImage,
    onClose,
    onChange,
    onAction,
    actionLabel = 'Aplicar',
    allowBackgroundUpload = true,
    actionDisabled = false,
    slideLabel,
    onPreviousSlide,
    onNextSlide,
    canGoPrevious = false,
    canGoNext = false,
    apiBaseUrl,
    onSecondaryAction,
    secondaryActionLabel = 'Ação secundária',
    secondaryActionDisabled = false,
}: PremiumEditorModalProps) {
    const [canvasPreviewUrl, setCanvasPreviewUrl] = useState<string | null>(null);
    const [canvasLoading, setCanvasLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !layout || !apiBaseUrl) return;
        setCanvasLoading(true);
        const timer = setTimeout(async () => {
            try {
                const url = await renderPremiumPostToDataUrl({
                    layout,
                    backgroundImage: layout.backgroundImage || backgroundImage,
                    apiBaseUrl
                });
                setCanvasPreviewUrl(url);
            } catch {
                // fallback silencioso para CSS preview
            } finally {
                setCanvasLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [isOpen, layout, backgroundImage, apiBaseUrl]);

    if (!isOpen || !layout) return null;

    const adjustZoomBy = (delta: number) => {
        onChange('imageScale', clampPremiumImageScale(Number(layout.imageScale || 1) + delta));
    };

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
                                Ajuste headline, destaque e branding antes de finalizar a arte premium.
                            </p>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                    </div>

                    {(slideLabel || onPreviousSlide || onNextSlide) && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <button
                                onClick={onPreviousSlide}
                                disabled={!onPreviousSlide || !canGoPrevious}
                                className="btn"
                                style={{
                                    minWidth: '88px',
                                    opacity: !onPreviousSlide || !canGoPrevious ? 0.45 : 1,
                                    cursor: !onPreviousSlide || !canGoPrevious ? 'default' : 'pointer'
                                }}
                            >
                                ← Anterior
                            </button>
                            <span style={{ color: '#d4d4d8', fontSize: '0.9rem', fontWeight: 600 }}>
                                {slideLabel || `Slide ${(layout.slideIndex || 0) + 1}`}
                            </span>
                            <button
                                onClick={onNextSlide}
                                disabled={!onNextSlide || !canGoNext}
                                className="btn"
                                style={{
                                    minWidth: '88px',
                                    opacity: !onNextSlide || !canGoNext ? 0.45 : 1,
                                    cursor: !onNextSlide || !canGoNext ? 'default' : 'pointer'
                                }}
                            >
                                Próximo →
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem', paddingBottom: '1rem', borderBottom: '1px solid #27272a' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
                            <input type="checkbox" checked={Boolean(layout.hideOverlay)} onChange={event => onChange('hideOverlay', event.target.checked)} style={{ width: '1.1rem', height: '1.1rem' }} />
                            Apenas Imagem (Sem Template HD)
                        </label>
                        <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>O texto será preservado apenas para visualização de limites do template, mas a arte final exportará somente a imagem posicionada.</span>
                    </div>

                    <details open={!layout.hideOverlay} style={{ marginBottom: '0.8rem', background: '#111113', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid #27272a' }}>
                        <summary style={{ cursor: 'pointer', color: '#fff', fontSize: '0.85rem', fontWeight: 600, outline: 'none' }}>
                            Opções Estruturais do Template (Oculto na arte final)
                        </summary>
                        <div style={{ display: 'grid', gap: '0.8rem', marginTop: '1rem' }}>
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
                        </div>
                    </details>

                    <div style={{ display: 'grid', gap: '0.85rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Ajustar Imagem
                            <span style={{ fontSize: '0.8rem', color: '#a1a1aa', textTransform: 'none' }}>Você pode arrastar e rolar o scroll na imagem ao lado para mover e dar zoom na imagem interativamente!</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn" onClick={() => { onChange('imageOffsetX', 0); onChange('imageOffsetY', 0); onChange('imageScale', 1); }} style={{ padding: '0.4rem 0.8rem' }}>Zerar Ajustes</button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Zoom da Imagem
                            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: '0.6rem', alignItems: 'center' }}>
                                <button type="button" className="btn" onClick={() => adjustZoomBy(-0.05)} style={{ padding: 0 }}>−</button>
                                <input
                                    type="range"
                                    min="1"
                                    max="2.0"
                                    step="0.01"
                                    value={Number(layout.imageScale || 1)}
                                    onChange={event => onChange('imageScale', Number(event.target.value))}
                                />
                                <button type="button" className="btn" onClick={() => adjustZoomBy(0.05)} style={{ padding: 0 }}>+</button>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#d4d4d8', textTransform: 'none' }}>
                                {Number(layout.imageScale || 1).toFixed(2)}x
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                            Gradiente de Transição
                            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: '0.6rem', alignItems: 'center' }}>
                                <button type="button" className="btn" onClick={() => onChange('gradientOpacity', Math.max(0, Number(layout.gradientOpacity ?? 1) - 0.05))} style={{ padding: 0 }}>−</button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={Number(layout.gradientOpacity ?? 1)}
                                    onChange={event => onChange('gradientOpacity', Number(event.target.value))}
                                />
                                <button type="button" className="btn" onClick={() => onChange('gradientOpacity', Math.min(1, Number(layout.gradientOpacity ?? 1) + 0.05))} style={{ padding: 0 }}>+</button>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#d4d4d8', textTransform: 'none' }}>
                                {Math.round(Number(layout.gradientOpacity ?? 1) * 100)}% opacidade
                            </span>
                        </div>
                    </div>

                    {!layout.hideOverlay && (
                        <>
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
                        </>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                        {!layout.hideOverlay ? (
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
                                Cor de Destaque
                                <input type="color" value={layout.primaryColor} onChange={event => onChange('primaryColor', event.target.value)} style={{ width: '100%', height: '46px', borderRadius: '0.75rem', border: '1px solid #3f3f46', background: 'transparent', padding: '0.2rem' }} />
                            </label>
                        ) : (
                            <div />
                        )}
                        {allowBackgroundUpload ? (
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
                        ) : (
                            <div />
                        )}
                    </div>

                    {onSecondaryAction && (
                        <button
                            onClick={onSecondaryAction}
                            disabled={secondaryActionDisabled}
                            className="btn btn-outline"
                            style={{
                                width: '100%',
                                marginTop: '1rem',
                                color: '#a1a1aa',
                                border: '1px solid #3f3f46',
                                fontWeight: 600,
                                opacity: secondaryActionDisabled ? 0.6 : 1,
                                cursor: secondaryActionDisabled ? 'default' : 'pointer'
                            }}
                        >
                            {secondaryActionLabel || 'Regerar slide'}
                        </button>
                    )}

                    {onAction && (
                        <button
                            onClick={onAction}
                            disabled={actionDisabled}
                            className="btn"
                            style={{
                                width: '100%',
                                background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
                                color: '#111',
                                border: 'none',
                                fontWeight: 700,
                                opacity: actionDisabled ? 0.6 : 1,
                                cursor: actionDisabled ? 'default' : 'pointer'
                            }}
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', minHeight: '320px' }}>
                    <div style={{ width: 'min(100%, 420px)', position: 'relative' }}>
                        <InteractivePremiumPreview
                            layout={layout}
                            backgroundImage={layout.backgroundImage || backgroundImage}
                            onChange={(updates) => {
                                if (updates.imageOffsetX !== undefined) onChange('imageOffsetX', updates.imageOffsetX);
                                if (updates.imageOffsetY !== undefined) onChange('imageOffsetY', updates.imageOffsetY);
                                if (updates.imageScale !== undefined) onChange('imageScale', updates.imageScale);
                            }}
                            canvasPreviewUrl={canvasPreviewUrl}
                            canvasLoading={canvasLoading}
                        />
                    </div>

                    {onSecondaryAction && (
                        <button
                            type="button"
                            onClick={onSecondaryAction}
                            disabled={secondaryActionDisabled}
                            style={{
                                width: 'min(100%, 420px)',
                                padding: '0.75rem',
                                borderRadius: '0.75rem',
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.06)',
                                color: '#d4d4d8',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: secondaryActionDisabled ? 'default' : 'pointer',
                                opacity: secondaryActionDisabled ? 0.5 : 1,
                            }}
                        >
                            {secondaryActionLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function InteractivePremiumPreview({ layout, backgroundImage, onChange, compact, canvasPreviewUrl, canvasLoading }: PremiumPreviewProps & { onChange: (u: Partial<PremiumLayout>) => void; canvasPreviewUrl?: string | null; canvasLoading?: boolean }) {
    const [isDragging, setIsDragging] = React.useState(false);
    const [startPos, setStartPos] = React.useState({ x: 0, y: 0 });

    // During drag show CSS preview for instant feedback; at rest show canvas if available
    const showCssPreview = isDragging || !canvasPreviewUrl;

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        setStartPos({ x: e.clientX, y: e.clientY });
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        onChange({
            imageOffsetX: clampPremiumImageOffset(Number(layout.imageOffsetX||0) + dx * 1.0),
            imageOffsetY: clampPremiumImageOffset(Number(layout.imageOffsetY||0) + dy * 1.0)
        });
        setStartPos({ x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const scaleChange = e.deltaY > 0 ? -0.02 : 0.02;
        onChange({
            imageScale: clampPremiumImageScale(Number(layout.imageScale||1) + scaleChange)
        });
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Transparent drag/wheel overlay — always on top of the image area */}
            <div
                style={{ position: 'absolute', inset: 0, top: 0, bottom: layout.hideOverlay ? 0 : '40%', touchAction: 'none', zIndex: 10, cursor: isDragging ? 'grabbing' : 'grab' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                title="Arraste para mover • Scroll para zoom"
            />
            {/* CSS preview during drag (instant feedback), canvas at rest (accurate render) */}
            {showCssPreview ? (
                <PremiumPostPreview layout={layout} backgroundImage={backgroundImage} compact={compact} />
            ) : (
                <img
                    src={canvasPreviewUrl!}
                    alt="Preview"
                    style={{
                        width: '100%',
                        aspectRatio: '4 / 5',
                        objectFit: 'cover',
                        borderRadius: '0.75rem',
                        display: 'block',
                        opacity: canvasLoading ? 0.5 : 1,
                        transition: 'opacity 0.2s',
                        userSelect: 'none',
                        pointerEvents: 'none',
                    }}
                />
            )}
            {canvasLoading && !isDragging && (
                <div style={{
                    position: 'absolute', top: '0.6rem', right: '0.6rem',
                    background: 'rgba(0,0,0,0.65)', color: '#fff',
                    fontSize: '0.68rem', fontWeight: 600,
                    padding: '0.2rem 0.55rem', borderRadius: '999px',
                    letterSpacing: '0.03em',
                    pointerEvents: 'none',
                }}>
                    Atualizando...
                </div>
            )}
        </div>
    );
}

/**
 * Static canvas-accurate preview for use in review cards.
 * Renders via renderPremiumPostToDataUrl() (identical to what gets saved),
 * shows CSS fallback while the canvas is computing.
 */
export function PremiumCanvasPreview({ layout, backgroundImage, apiBaseUrl }: {
    layout: PremiumLayout;
    backgroundImage: string;
    apiBaseUrl?: string;
}) {
    const [dataUrl, setDataUrl] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const layoutKey = JSON.stringify({
        title: layout.title,
        highlightText: layout.highlightText,
        imageOffsetX: layout.imageOffsetX,
        imageOffsetY: layout.imageOffsetY,
        imageScale: layout.imageScale,
        slideIndex: layout.slideIndex,
        slideCount: layout.slideCount,
        primaryColor: layout.primaryColor,
        brandName: layout.brandName,
        hideOverlay: layout.hideOverlay,
        gradientOpacity: layout.gradientOpacity,
    });

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        renderPremiumPostToDataUrl({ layout, backgroundImage, apiBaseUrl: apiBaseUrl || 'http://localhost:3001' })
            .then(url => { if (!cancelled) { setDataUrl(url); setLoading(false); } })
            .catch(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backgroundImage, layoutKey]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* CSS fallback — visible while canvas is computing */}
            <div style={{ position: 'absolute', inset: 0, opacity: (loading || !dataUrl) ? 1 : 0, transition: 'opacity 0.25s' }}>
                <PremiumPostPreview layout={layout} backgroundImage={backgroundImage} compact />
            </div>
            {/* Canvas-accurate render */}
            {dataUrl && (
                <img
                    src={dataUrl}
                    alt="Preview"
                    style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        opacity: loading ? 0 : 1,
                        transition: 'opacity 0.25s',
                        display: 'block',
                        userSelect: 'none',
                        pointerEvents: 'none',
                    }}
                />
            )}
        </div>
    );
}
