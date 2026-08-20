import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
    createPremiumComposition,
    fitPremiumTitle,
    PREMIUM_GRADIENT_OPACITY_DEFAULT,
    PREMIUM_TITLE_METRICS
} from '../src/services/premiumCompositionService.js';

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

// Quebra por largura média de caractere, igual à usada no compositor.
function wrapAt(maxWidth) {
    return (text, fontSize) => {
        const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.58)));
        const lines = [];
        let current = '';
        String(text).split(/\s+/).filter(Boolean).forEach(word => {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= charsPerLine) current = candidate;
            else { if (current) lines.push(current); current = word; }
        });
        if (current) lines.push(current);
        return lines.length > 0 ? lines : [''];
    };
}

const CONTENT_W = 1080 - Math.round(1080 * PREMIUM_TITLE_METRICS.paddingRatio) * 2; // 864
const AVAILABLE_H = 1350 - (810 + Math.round(540 * 0.14) + 38 + PREMIUM_TITLE_METRICS.topGap)
    - 40 - PREMIUM_TITLE_METRICS.bottomGap;

describe('fitPremiumTitle', () => {
    it('dá o mesmo tamanho para títulos diferentes que ocupam o mesmo número de linhas', () => {
        const a = fitPremiumTitle('EMAGRECER SEM PASSAR FOME É POSSÍVEL', wrapAt(CONTENT_W), AVAILABLE_H);
        const b = fitPremiumTitle('TREINAR PESADO NÃO COMPENSA COMER MAL', wrapAt(CONTENT_W), AVAILABLE_H);

        expect(a.lines.length).toBe(b.lines.length);
        expect(a.fontSize).toBe(b.fontSize);
        expect(PREMIUM_TITLE_METRICS.ladder.map(step => step.fontSize)).toContain(a.fontSize);
    });

    it('usa o degrau maior para títulos curtos e degraus menores conforme cresce', () => {
        const short = fitPremiumTitle('COMA BEM', wrapAt(CONTENT_W), AVAILABLE_H);
        const long = fitPremiumTitle(
            'A MANEIRA MAIS SIMPLES DE TROCAR OS ALIMENTOS DO SEU DIA SEM PERDER O SABOR DE COMER',
            wrapAt(CONTENT_W),
            AVAILABLE_H
        );

        expect(short.lines).toHaveLength(1);
        expect(short.fontSize).toBe(PREMIUM_TITLE_METRICS.ladder[0].fontSize);
        expect(long.fontSize).toBeLessThan(short.fontSize);
        expect(long.lines.length).toBeGreaterThan(short.lines.length);
    });

    it('mantém o bloco dentro da altura livre, mesmo em títulos extremos', () => {
        const extreme = fitPremiumTitle(
            'ESTE É UM TÍTULO PROPOSITALMENTE ENORME QUE JAMAIS DEVERIA CHEGAR AO SLIDE MAS PRECISA CABER MESMO ASSIM SEM VAZAR PARA FORA DO QUADRO NEM ENCOSTAR NOS PONTINHOS',
            wrapAt(CONTENT_W),
            AVAILABLE_H
        );

        const blockHeight = extreme.lines.length * extreme.fontSize * PREMIUM_TITLE_METRICS.lineHeightRatio;
        expect(blockHeight).toBeLessThanOrEqual(AVAILABLE_H);
        expect(extreme.fontSize).toBeGreaterThanOrEqual(PREMIUM_TITLE_METRICS.minFontSize);
    });
});

describe('createPremiumComposition sem subtítulo', () => {
    it('gera a arte ignorando description, sem quebrar quando ela vem preenchida', async () => {
        const mockBg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        const withSub = await createPremiumComposition(mockBg, {
            brandName: 'Fitswap',
            title: 'COMO PERDER GORDURA COMENDO BEM',
            description: 'Uma estratégia simples e eficiente baseada em escolhas inteligentes para o seu dia a dia',
            descriptionEnabled: true,
            slideIndex: 0,
            slideCount: 5
        });
        const withoutSub = await createPremiumComposition(mockBg, {
            brandName: 'Fitswap',
            title: 'COMO PERDER GORDURA COMENDO BEM',
            slideIndex: 0,
            slideCount: 5
        });

        expect(withSub).toMatch(/^data:image\/jpeg;base64,/);
        // A description não muda um pixel: a arte é só título.
        expect(withSub).toBe(withoutSub);
    });
});

describe('gradiente de transição', () => {
    it('usa 80% quando o layout não define a intensidade', async () => {
        const background = await splitBackground();

        const implicit = await createPremiumComposition(background, baseLayout);
        const explicit80 = await createPremiumComposition(background, { ...baseLayout, gradientOpacity: PREMIUM_GRADIENT_OPACITY_DEFAULT });
        const full = await createPremiumComposition(background, { ...baseLayout, gradientOpacity: 1 });

        expect(PREMIUM_GRADIENT_OPACITY_DEFAULT).toBe(0.8);
        expect(implicit).toBe(explicit80);
        expect(implicit).not.toBe(full);
    });
});

describe('createPremiumComposition hero framing', () => {
    it('centra a foto na faixa superior de 60%, como o editor — e não no canvas inteiro', async () => {
        const result = await createPremiumComposition(await splitBackground(), baseLayout);

        // A foto vive na faixa de 810px, não no canvas inteiro: a fronteira
        // vermelho/azul cai em ~y=324 (405 do centro menos o lift de 10%).
        expect(isRed(await pixelAt(result, 540, 260))).toBe(true);
        expect(isBlue(await pixelAt(result, 540, 380))).toBe(true);

        // Se a foto fosse esticada no canvas inteiro, a fronteira estaria em 675 e
        // o topo do gradiente (y=378) ainda mostraria vermelho lá embaixo.
        expect(isRed(await pixelAt(result, 540, 640))).toBe(false);

        // A faixa abaixo de 810px é o painel sólido do tema.
        const panel = await pixelAt(result, 540, 830);
        expect(panel.r).toBeGreaterThan(220);
        expect(panel.g).toBeGreaterThan(220);
    });

    it('sobe a foto 10% da faixa por padrão, sem abrir faixa vazia embaixo', async () => {
        const background = await splitBackground();
        const result = await createPremiumComposition(background, baseLayout);

        // Fronteira vermelho/azul da foto (y=675 na origem) sai em 675-351=324:
        // o recorte desceu 81px (10% de 810) dentro da imagem.
        expect(isRed(await pixelAt(result, 540, 316))).toBe(true);
        expect(isBlue(await pixelAt(result, 540, 332))).toBe(true);

    });

    it('limita o lift ao que a foto permite, sem forçar recorte fora da imagem', async () => {
        // Foto na mesma proporção da faixa (1080x810): não há folga vertical,
        // então o lift precisa ser 0 em vez de arrastar o recorte para fora.
        const svg = `<svg width="1080" height="810" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="1080" height="405" fill="#FF0000" />
            <rect x="0" y="405" width="1080" height="405" fill="#0000FF" />
        </svg>`;
        const png = await sharp(Buffer.from(svg)).png().toBuffer();
        const exactFit = `data:image/png;base64,${png.toString('base64')}`;

        const result = await createPremiumComposition(exactFit, baseLayout);

        // Topo e fronteira permanecem onde a foto os coloca (405), sem lift.
        expect(isRed(await pixelAt(result, 540, 40))).toBe(true);
        expect(isRed(await pixelAt(result, 540, 396))).toBe(true);
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
