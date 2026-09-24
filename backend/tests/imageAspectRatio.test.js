import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { fitToAspectRatio } from '../src/services/image/imageFraming.js';
import { generateImageWithGemini } from '../src/services/image/imageGenerationAdapters.js';

// Posts de feed saíam em 3:4 (896x1200) e o Instagram completava com faixas
// brancas laterais para caber no limite de 4:5.

async function dataUrl(width, height) {
    const buffer = await sharp({
        create: { width, height, channels: 3, background: { r: 10, g: 20, b: 40 } }
    }).jpeg().toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function sizeOf(url) {
    const { width, height } = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata();
    return { width, height };
}

describe('fitToAspectRatio', () => {
    it('enquadra uma imagem 3:4 no 4:5 do feed (1080x1350)', async () => {
        const framed = await fitToAspectRatio(await dataUrl(896, 1200), '4:5');
        expect(await sizeOf(framed)).toEqual({ width: 1080, height: 1350 });
    });

    it('enquadra story em 1080x1920', async () => {
        const framed = await fitToAspectRatio(await dataUrl(928, 1152), '9:16');
        expect(await sizeOf(framed)).toEqual({ width: 1080, height: 1920 });
    });

    it('mantém a imagem que já está no tamanho final', async () => {
        const original = await dataUrl(1080, 1350);
        await expect(fitToAspectRatio(original, '4:5')).resolves.toBe(original);
    });

    it('ignora proporções desconhecidas e entradas vazias', async () => {
        const original = await dataUrl(800, 600);
        await expect(fitToAspectRatio(original, '3:2')).resolves.toBe(original);
        await expect(fitToAspectRatio(null, '4:5')).resolves.toBeNull();
    });
});

describe('generateImageWithGemini', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.GEMINI_API_KEY;
    });

    async function captureGeminiPayload(prompt, aspectRatio) {
        process.env.GEMINI_API_KEY = 'gemini-key';
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'abc' } }] } }]
            })
        }));
        vi.stubGlobal('fetch', fetchMock);
        await generateImageWithGemini(prompt, aspectRatio);
        return JSON.parse(fetchMock.mock.calls[0][1].body);
    }

    it('pede 4:5 nativo ao Gemini em vez de 3:4', async () => {
        const payload = await captureGeminiPayload('uma foto de estudo', '4:5');
        expect(payload.generationConfig.imageConfig).toEqual({ aspectRatio: '4:5' });
    });

    it('reescreve pixels e proporções do prompt para a proporção de destino', async () => {
        const payload = await captureGeminiPayload('FORMAT: Vertical 4:5 (1080×1350), cena 3:4', '4:5');
        const text = payload.contents[0].parts[0].text;
        expect(text).not.toMatch(/1080×1350|3:4/);
        expect(text).toContain('formato retrato vertical (aspect ratio 4:5)');
    });
});
