import { describe, expect, it } from 'vitest';
import {
    EXPORT_NAVIGATION_SELECTORS,
    EXPORT_VALIDATION_VERSION,
    assertCarouselReadyForPublication,
    assertExportSlideCount,
    assertNoTextOverflow,
    resolveExpectedSlideCount,
} from '../src/services/carousel/carouselExportValidation.js';

describe('carousel export validation', () => {
    it('prefers the requested count over the previously stored actual count', () => {
        expect(resolveExpectedSlideCount({
            slideCount: 3,
            requestedSlideCount: 7,
        })).toBe(7);

        expect(resolveExpectedSlideCount({
            slideCount: 3,
            generationInput: { slideCount: 6 },
        })).toBe(6);
    });

    it('rejects a rendered or uploaded count that differs from the expectation', () => {
        expect(() => assertExportSlideCount({ expected: 7, rendered: 3 }))
            .toThrow(/esperados 7 slides, encontrados 3/i);
        expect(() => assertExportSlideCount({ expected: 7, rendered: 7, exported: 6 }))
            .toThrow(/esperados 7 arquivos, exportados 6/i);
    });

    it('accepts matching counts and legacy records without an expectation', () => {
        expect(() => assertExportSlideCount({ expected: 7, rendered: 7, exported: 7 })).not.toThrow();
        expect(() => assertExportSlideCount({ expected: 0, rendered: 3, exported: 3 })).not.toThrow();
    });

    it('rejects visible text reported outside the slide canvas', () => {
        expect(() => assertNoTextOverflow([
            { selector: 'h1', text: 'Título cortado', sides: ['top'] },
        ], 1)).toThrow(/slide 2.*top.*título cortado/i);
    });

    it('accepts slides whose visible text stays inside the canvas', () => {
        expect(() => assertNoTextOverflow([], 0)).not.toThrow();
    });

    it('removes the generic navigation generated inside each slide', () => {
        expect(EXPORT_NAVIGATION_SELECTORS).toEqual(expect.arrayContaining([
            '.slide-nav',
            '.slide-dots',
            '.slide-arrow',
        ]));
    });

    it('blocks publication of HTML carousels exported before layout validation existed', () => {
        expect(() => assertCarouselReadyForPublication({
            format: 'carousel-html',
            requestedSlideCount: 3,
            mediaUrls: ['1.jpg', '2.jpg', '3.jpg'],
            exportValidationVersion: 0,
        })).toThrow(/não passou pela validação visual/i);
    });

    it('allows a validated HTML carousel with the expected media count', () => {
        expect(() => assertCarouselReadyForPublication({
            format: 'carousel-html',
            requestedSlideCount: 3,
            mediaUrls: ['1.jpg', '2.jpg', '3.jpg'],
            exportValidationVersion: EXPORT_VALIDATION_VERSION,
        })).not.toThrow();
    });

    it('does not apply the HTML export guard to ordinary media posts', () => {
        expect(() => assertCarouselReadyForPublication({
            format: 'carousel-premium',
            mediaUrls: ['1.jpg'],
        })).not.toThrow();
    });
});
