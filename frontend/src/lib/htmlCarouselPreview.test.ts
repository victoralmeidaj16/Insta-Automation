import { describe, expect, it } from 'vitest';
import { countHtmlCarouselSlides, prepareHtmlCarouselPreview } from './htmlCarouselPreview';

describe('htmlCarouselPreview', () => {
    const html = `<!doctype html><html><body>
        <div class="carousel-track">
            <section class="slide active">Primeiro</section>
            <section class="slide">Segundo</section>
        </div>
    </body></html>`;

    it('counts exact slide elements', () => {
        expect(countHtmlCarouselSlides(html)).toBe(2);
        expect(countHtmlCarouselSlides('<div class="slide-nav"></div>')).toBe(1);
    });

    it('injects the export canvas and preserves the template display mode', () => {
        const preview = prepareHtmlCarouselPreview(html, 1);

        expect(preview).toContain('width: 420px !important');
        expect(preview).toContain('height: 525px !important');
        expect(preview).toContain('slide.style.removeProperty(\'display\')');
        expect(preview).toContain('i === 1');
        expect(preview).not.toContain("slide.style.display = 'block'");
    });

    it('does not inject the preview overrides twice', () => {
        const once = prepareHtmlCarouselPreview(html);
        expect(prepareHtmlCarouselPreview(once)).toBe(once);
    });
});
