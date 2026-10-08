export const EXPORT_NAVIGATION_SELECTORS = Object.freeze([
    '.ig-header', '.ig-dots', '.ig-actions', '.ig-caption',
    '.nav-btn', '.nav-prev', '.nav-next',
    '.progress-bar', '.slide-counter',
    '.nav-dots', '.slide-nav', '.slide-dots', '.slide-arrow',
    '.swipe-hint', '.bottom-bar .bb-swipe',
]);

export const EXPORT_VALIDATION_VERSION = 1;

function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
}

export function resolveExpectedSlideCount(entity = {}) {
    return positiveInteger(entity.requestedSlideCount)
        || positiveInteger(entity.extra?.requestedSlideCount)
        || positiveInteger(entity.generationInput?.slideCount)
        || positiveInteger(entity.extra?.generationInput?.slideCount)
        || positiveInteger(entity.slideCount);
}

export function assertExportSlideCount({ expected = 0, rendered = 0, exported } = {}) {
    const expectedCount = positiveInteger(expected);
    if (!expectedCount) return;

    if (rendered !== expectedCount) {
        const error = new Error(`Exportação bloqueada: esperados ${expectedCount} slides, encontrados ${rendered}.`);
        error.code = 'HTML_SLIDE_COUNT_MISMATCH';
        throw error;
    }

    if (exported !== undefined && exported !== expectedCount) {
        const error = new Error(`Exportação bloqueada: esperados ${expectedCount} arquivos, exportados ${exported}.`);
        error.code = 'EXPORTED_MEDIA_COUNT_MISMATCH';
        throw error;
    }
}

export function assertNoTextOverflow(issues = [], slideIndex = 0) {
    if (!Array.isArray(issues) || issues.length === 0) return;

    const first = issues[0];
    const excerpt = String(first.text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const sides = Array.isArray(first.sides) ? first.sides.join(', ') : 'limites';
    const error = new Error(
        `Exportação bloqueada: slide ${slideIndex + 1} contém texto cortado (${sides}): "${excerpt}".`
    );
    error.code = 'HTML_TEXT_OVERFLOW';
    error.issues = issues;
    throw error;
}

export function assertCarouselReadyForPublication(entity = {}) {
    const format = String(entity.format || entity.type || '').toLowerCase();
    const isHtmlCarousel = format === 'carousel-html'
        || format === 'carousel-html-video'
        || format === 'html';
    if (!isHtmlCarousel) return;

    const expected = resolveExpectedSlideCount(entity);
    const mediaCount = Array.isArray(entity.mediaUrls) ? entity.mediaUrls.length : 0;
    assertExportSlideCount({ expected, rendered: mediaCount, exported: mediaCount });

    if (positiveInteger(entity.exportValidationVersion) < EXPORT_VALIDATION_VERSION) {
        const error = new Error(
            'Publicação bloqueada: este carrossel HTML não passou pela validação visual atual. Exporte-o novamente.'
        );
        error.code = 'HTML_EXPORT_NOT_VALIDATED';
        throw error;
    }
}

/**
 * Runs in the browser through page.evaluate(). Keep it closure-free.
 */
export function inspectVisibleTextOverflow() {
    var slide = Array.from(document.querySelectorAll('.slide')).find(function (candidate) {
        var style = getComputedStyle(candidate);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
    });
    if (!slide) return [];

    var slideRect = slide.getBoundingClientRect();
    var tolerance = 2;
    var candidates = slide.querySelectorAll('h1, h2, h3, h4, p, li, [data-export-text]');
    var issues = [];

    for (var i = 0; i < candidates.length; i++) {
        var element = candidates[i];
        var text = (element.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;

        var style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) continue;

        var rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        var sides = [];
        if (rect.top < slideRect.top - tolerance) sides.push('top');
        if (rect.left < slideRect.left - tolerance) sides.push('left');
        if (rect.right > slideRect.right + tolerance) sides.push('right');
        if (rect.bottom > slideRect.bottom + tolerance) sides.push('bottom');
        if (element.scrollWidth > element.clientWidth + tolerance) sides.push('horizontal');

        if (sides.length > 0) {
            issues.push({
                selector: element.tagName.toLowerCase(),
                text: text.slice(0, 160),
                sides: Array.from(new Set(sides)),
            });
        }
    }

    return issues;
}
