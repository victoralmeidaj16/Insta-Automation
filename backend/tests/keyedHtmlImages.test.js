import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generatePhotoImage } = vi.hoisted(() => ({ generatePhotoImage: vi.fn() }));

vi.mock('../src/services/image/imageGenerationService.js', () => ({
    generateImages: vi.fn(),
    generatePhotoImage,
}));

const { postProcessKeyedImages } = await import('../src/services/carousel/htmlCarouselService.js');

const blank = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const tagA = `<img src="${blank}" data-ai-key="a" data-ai-prompt="Plate A &quot;classic&quot;" alt="">`;
const tagB = `<img src="${blank}" data-ai-key="b" data-ai-ref="a" data-ai-prompt="Plate B" alt="">`;

describe('postProcessKeyedImages', () => {
    beforeEach(() => { generatePhotoImage.mockReset(); });

    it('generates each key once, B after A with A as reference, and fills every copy', async () => {
        const calls = [];
        generatePhotoImage.mockImplementation(async (prompt, ratio, refs) => {
            calls.push({ prompt, ratio, refs });
            return prompt.startsWith('Plate A') ? 'https://img/a.png' : 'https://img/b.png';
        });

        const html = `<div>${tagA}${tagB}</div><div>${tagA}</div><div>${tagB}</div>`;
        const out = await postProcessKeyedImages(html);

        expect(calls).toEqual([
            { prompt: 'Plate A "classic"', ratio: '4:5', refs: [] },
            { prompt: 'Plate B', ratio: '4:5', refs: ['https://img/a.png'] },
        ]);
        expect(out.match(/src="https:\/\/img\/a\.png"/g)).toHaveLength(2);
        expect(out.match(/src="https:\/\/img\/b\.png"/g)).toHaveLength(2);
        expect(out).not.toContain('data-ai-');
    });

    it('keeps the placeholder when a photo fails and leaves other HTML untouched', async () => {
        generatePhotoImage.mockRejectedValue(new Error('quota'));

        const out = await postProcessKeyedImages(`<p>oi</p>${tagA}`);

        expect(out).toContain(`src="${blank}"`);
        expect(out).toContain('<p>oi</p>');
        expect(out).not.toContain('data-ai-prompt');
    });

    it('returns HTML without keyed images unchanged', async () => {
        const html = '<img src="x.png" data-ai-prompt="free prompt">';
        expect(await postProcessKeyedImages(html)).toBe(html);
        expect(generatePhotoImage).not.toHaveBeenCalled();
    });
});
