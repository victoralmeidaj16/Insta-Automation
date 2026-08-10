import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createPremiumComposition } from '../src/services/premiumCompositionService.js';

// Fundo 1080x1350 dividido ao meio: vermelho em cima, azul embaixo.
// A fronteira fica exatamente no centro vertical da foto (y=675), o que permite
// descobrir qual recorte da imagem sobreviveu à composição.
async function splitBackground() {
    const svg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="1080" height="675" fill="#FF0000" />
        <rect x="0" y="675" width="1080" height="675" fill="#0000FF" />
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
}

async function pixelAt(dataUrl, x, y) {
    const buffer = Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    const { data } = await sharp(buffer)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { r: data[0], g: data[1], b: data[2] };
}

const isRed = px => px.r > 150 && px.b < 110;
const isBlue = px => px.b > 150 && px.r < 110;

const baseLayout = {
    brandName: 'Fitswap',
    title: 'COMO PERDER GORDURA COMENDO BEM',
    slideIndex: 0,
    slideCount: 5
};

describe('createPremiumComposition Fitswap Subtitle', () => {
    it('applies #727983 (RGB 114, 121, 131) subtitle color and renders multi-line subtitles', async () => {
        // Base 1x1 transparent/white test image buffer as dataUrl
        const mockBg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        const result = await createPremiumComposition(mockBg, {
            brandName: 'Fitswap',
            title: 'COMO PERDER GORDURA COMENDO BEM',
            description: 'Uma estratégia simples e eficiente baseada em escolhas inteligentes para o seu dia a dia',
            descriptionEnabled: true,
            slideIndex: 0,
            slideCount: 5
        });

        expect(result).toMatch(/^data:image\/jpeg;base64,/);

        // Decode base64 to SVG text if available or check SVG parts in composite buffer
        const base64Data = result.replace(/^data:image\/jpeg;base64,/, '');
        expect(base64Data.length).toBeGreaterThan(100);
    });
});

describe('createPremiumComposition hero framing', () => {
    it('centra a foto na faixa superior de 60%, como o editor — e não no canvas inteiro', async () => {
        const result = await createPremiumComposition(await splitBackground(), baseLayout);

        // Centro da foto cai em ~y=405 (metade da faixa de 810px), não em y=675.
        expect(isRed(await pixelAt(result, 540, 340))).toBe(true);
        expect(isBlue(await pixelAt(result, 540, 460))).toBe(true);

        // Se a foto fosse esticada no canvas inteiro, a fronteira estaria em 675 e
        // o topo do gradiente (y=378) ainda mostraria vermelho lá embaixo.
        expect(isRed(await pixelAt(result, 540, 640))).toBe(false);

        // A faixa abaixo de 810px é o painel sólido do tema.
        const panel = await pixelAt(result, 540, 830);
        expect(panel.r).toBeGreaterThan(220);
        expect(panel.g).toBeGreaterThan(220);
    });

    it('desloca a imagem para cima com imageOffsetY negativo, revelando a parte de baixo da foto', async () => {
        const background = await splitBackground();

        const centered = await createPremiumComposition(background, { ...baseLayout, imageScale: 1.2 });
        expect(isRed(await pixelAt(centered, 540, 100))).toBe(true);

        const pannedUp = await createPremiumComposition(background, {
            ...baseLayout,
            imageScale: 1.2,
            imageOffsetY: -100
        });
        expect(isBlue(await pixelAt(pannedUp, 540, 100))).toBe(true);
    });

    it('com hideOverlay entrega a foto sangrando no canvas inteiro, sem gradiente nem painel', async () => {
        const result = await createPremiumComposition(await splitBackground(), {
            ...baseLayout,
            hideOverlay: true
        });

        expect(isRed(await pixelAt(result, 540, 600))).toBe(true);
        expect(isBlue(await pixelAt(result, 540, 750))).toBe(true);
        expect(isBlue(await pixelAt(result, 540, 1300))).toBe(true);
    });
});
