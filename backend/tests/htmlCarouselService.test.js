import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
    default: { post: vi.fn() }
}));

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { countCarouselSlides, fixHtmlCarousel } = await import('../src/services/carousel/htmlCarouselService.js');

function geminiHtmlResponse(html) {
    return {
        data: {
            candidates: [{ content: { parts: [{ text: html }] } }]
        }
    };
}

describe('countCarouselSlides', () => {
    it('counts the exact slide class token on generated carousel containers', () => {
        const html = `
            <div class="carousel-track">
                <div class="slide"></div>
                <section class="slide active"></section>
                <article class='theme-dark slide ready'></article>
            </div>
        `;

        expect(countCarouselSlides(html)).toBe(3);
    });

    it('ignores navigation classes, CSS selectors, comments and partial class names', () => {
        const html = `
            <style>.slide { width: 420px; } .slide-nav { bottom: 0; }</style>
            <!-- <div class="slide"></div> -->
            <div class="slide-nav"><div class="slide-dots"></div></div>
            <div class="myslide slider slide-card"></div>
        `;

        expect(countCarouselSlides(html)).toBe(0);
    });

    it('handles empty and malformed input safely', () => {
        expect(countCarouselSlides()).toBe(0);
        expect(countCarouselSlides(null)).toBe(0);
        expect(countCarouselSlides('<div class="slide-nav">')).toBe(0);
    });
});

describe('fixHtmlCarousel slide-count guardrail', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'test-key';
        axios.post.mockReset();
    });

    it('retries once and returns HTML only after restoring the original slide count', async () => {
        const original = '<div class="carousel"><div class="slide">A</div><div class="slide">B</div></div>';
        axios.post
            .mockResolvedValueOnce(geminiHtmlResponse('<div class="carousel"><div class="slide">A+</div></div>'))
            .mockResolvedValueOnce(geminiHtmlResponse('<div class="carousel"><div class="slide">A+</div><div class="slide">B</div></div>'));

        const result = await fixHtmlCarousel(original, 'Ajuste a cor do primeiro slide');

        expect(countCarouselSlides(result)).toBe(2);
        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(axios.post.mock.calls[1][1].contents[0].parts[0].text).toContain('exactly 2 slide containers');
    });

    it('throws a 422 error after the single retry still changes the slide count', async () => {
        const original = '<div class="slide">A</div><div class="slide">B</div>';
        axios.post
            .mockResolvedValueOnce(geminiHtmlResponse('<div class="slide">A</div>'))
            .mockResolvedValueOnce(geminiHtmlResponse('<div class="slide">A</div>'));

        await expect(fixHtmlCarousel(original, 'Ajuste a tipografia')).rejects.toMatchObject({
            statusCode: 422,
            code: 'HTML_SLIDE_COUNT_MISMATCH'
        });
        expect(axios.post).toHaveBeenCalledTimes(2);
    });
});
