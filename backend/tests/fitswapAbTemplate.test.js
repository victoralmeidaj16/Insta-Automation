import { describe, expect, it } from 'vitest';
import { renderElevepicTemplate, computeFitswapAbNumbers, ELEVEPIC_TEMPLATE_METADATA, ELEVEPIC_CONTENT_SCHEMAS } from '../src/services/carouselTemplateService.js';

const brand = { brandName: 'Fitswap', brandKey: 'fitswap' };

const strogonoff = {
    dishName: 'strogonoff de frango',
    dishShort: 'strogonoff',
    dishGender: 'm',
    rows: [
        { a: { name: 'Peito de frango', qty: '150 g', kcal: 180 }, b: { name: 'Peito de frango', qty: '150 g', kcal: 180 } },
        { a: { name: 'Manteiga', qty: '1 col. sopa', kcal: 108 }, b: { name: 'Azeite', qty: '1 col. chá', kcal: 44 } },
        { a: { name: 'Creme de leite', qty: '½ caixinha', kcal: 220 }, b: { name: 'Iogurte grego zero', qty: '100 g', kcal: 60 } },
        { a: { name: 'Ketchup', qty: '1 col. sopa', kcal: 22 }, b: { name: 'Extrato de tomate', qty: '1 col. sopa', kcal: 12 } },
        { a: { name: 'Arroz branco', qty: '150 g', kcal: 192 }, b: { name: 'Arroz integral', qty: '120 g', kcal: 149 } },
        { a: { name: 'Batata palha', qty: '40 g', kcal: 220 }, b: { name: 'Batata na airfryer', qty: '80 g', kcal: 70 } },
    ],
    macros: { protein: { a: 40, b: 46 }, fat: { a: 54, b: 13 } },
    tip: 'Dica: junte o iogurte com o fogo desligado.',
    imagePromptA: 'Creamy stroganoff with shoestring potatoes.',
    imagePromptB: 'Same stroganoff with brown rice.',
    nextDishes: ['Lasanha', 'Feijoada', 'Brigadeiro', 'Pizza'],
    cta: { tag: 'Prazer sem culpa', title: 'Qual prato vira o <em>próximo?</em>', subtitle: 'Comenta aqui.', ctaText: 'Baixe a Fitswap', ctaSub: 'Link na bio' },
};

function withData(overrides = {}) {
    return { ...strogonoff, ...overrides };
}

describe('fitswap-ab template', () => {
    it('is registered with a content schema', () => {
        expect(ELEVEPIC_TEMPLATE_METADATA.some(t => t.id === 'fitswap-ab')).toBe(true);
        expect(ELEVEPIC_CONTENT_SCHEMAS['fitswap-ab']).toBeDefined();
    });

    it('computes every number from the ingredient rows', () => {
        const n = computeFitswapAbNumbers(strogonoff);

        expect(n.totalA).toBe(942);
        expect(n.totalB).toBe(515);
        expect(n.delta).toBe(427);
        expect(n.pct).toBe(45);
        expect(n.swaps.map(s => s.cut)).toEqual([160, 150, 64, 43, 10]);
        expect(n.swaps.reduce((sum, s) => sum + s.cut, 0)).toBe(n.delta);
    });

    it('renders hook, reveal, tables, swaps and macros with consistent figures', () => {
        const html = renderElevepicTemplate('fitswap-ab', strogonoff, brand);

        expect(html.match(/class="slide[ "]/g)).toHaveLength(7);
        expect(html).not.toContain('__FITSWAP_LOGO__');
        expect(html).toContain('Um desses tem <em class="hl">427 kcal</em> a menos.');
        expect(html).toContain('Mesmo strogonoff. Mesmo sabor. <b>Qual é?</b>');
        expect(html).toContain('Era o <em class="hl">B.</em>');
        expect(html).toContain('<!--EP:s1_pct-->−45%<!--/EP:s1_pct-->');
        expect(html).toContain('<b class="num">942 kcal</b>');
        expect(html).toContain('<b class="num">515 kcal</b>');
        expect(html).toContain('5 trocas. <em>Zero sacrifício.</em>');
        expect(html).toContain('<div class="from">Creme de leite</div><div class="to">Iogurte grego zero</div></div><div class="cut num">−160</div>');
        expect(html).toContain('<div class="from">Arroz branco</div><div class="to">Arroz integral</div>');
        expect(html).not.toContain('<div class="from">Peito de frango');
        expect(html).toContain('<b>Dica:</b> junte o iogurte com o fogo desligado.');
        expect(html).toContain('Menos gordura. <em>Mais proteína.</em>');
        expect(html).toContain('<span>Feijoada</span>');
    });

    it('generates each photo once and makes B reference A', () => {
        const html = renderElevepicTemplate('fitswap-ab', strogonoff, brand);

        expect(html.match(/data-ai-key="a"/g)).toHaveLength(3);
        expect(html.match(/data-ai-key="b" data-ai-ref="a"/g)).toHaveLength(3);
        expect(html).toContain('DISH: Creamy stroganoff with shoestring potatoes.');
        expect(html).toContain('SAME plate, SAME table');
    });

    it('only promises more protein when the numbers show it', () => {
        const less = renderElevepicTemplate('fitswap-ab', withData({ macros: { protein: { a: 44, b: 41 }, fat: { a: 58, b: 18 } } }), brand);
        expect(less).toContain('<em>Bem menos</em> gordura.');
        expect(less).toContain('<b class="num flat">−3 g</b>');

        const same = renderElevepicTemplate('fitswap-ab', withData({ macros: { protein: { a: 40, b: 41 }, fat: { a: 54, b: 13 } } }), brand);
        expect(same).toContain('Menos gordura. <em>Mesma proteína.</em>');
    });

    it('uses feminine agreement for feminine dishes', () => {
        const html = renderElevepicTemplate('fitswap-ab', withData({ dishShort: 'lasanha', dishGender: 'f' }), brand);

        expect(html).toContain('Uma dessas tem');
        expect(html).toContain('Mesma lasanha.');
        expect(html).toContain('Era a <em class="hl">B.</em>');
    });

    it('escapes ingredient names and prompts', () => {
        const rows = strogonoff.rows.map((row, i) => (i === 1 ? { ...row, b: { ...row.b, name: '<script>x</script>Azeite' } } : row));
        const html = renderElevepicTemplate('fitswap-ab', withData({ rows, imagePromptA: 'Plate "with" quotes' }), brand);

        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('data-ai-prompt="');
        expect(html).not.toMatch(/data-ai-prompt="[^"]*Plate "with/);
    });

    it('refuses content whose numbers cannot tell the story', () => {
        expect(() => renderElevepicTemplate('fitswap-ab', withData({ rows: strogonoff.rows.slice(0, 2) }), brand)).toThrow(/3 linhas/);
        const swapped = strogonoff.rows.map(row => ({ a: row.b, b: row.a }));
        expect(() => renderElevepicTemplate('fitswap-ab', withData({ rows: swapped }), brand)).toThrow(/menos kcal/);
    });
});
