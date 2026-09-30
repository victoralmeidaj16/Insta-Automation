import { describe, expect, it } from 'vitest';
import {
    appendFitswapAbDisclaimer,
    buildFitswapAbTopic,
    FITSWAP_AB_DISCLAIMER,
    FITSWAP_AB_DISHES,
    isFitswapAbPillar,
    pickFitswapAbDish
} from '../src/services/content/fitswapAbDishes.js';
import { FITSWAP_AB_PILLAR, getBrandPreset } from '../src/utils/brandProfiles.js';

const post = (dish, day) => ({ generationPrompt: buildFitswapAbTopic(FITSWAP_AB_PILLAR, dish), createdAt: new Date(2026, 8, day) });

describe('fitswap-ab dish rotation', () => {
    it('recognizes the pillar by its template', () => {
        expect(isFitswapAbPillar(FITSWAP_AB_PILLAR)).toBe(true);
        expect(isFitswapAbPillar({ id: 'a-ou-b' })).toBe(false);
    });

    it('never repeats a dish while unused ones remain', () => {
        const history = FITSWAP_AB_DISHES.slice(0, -2).map((dish, i) => post(dish, 1 + (i % 28)));

        for (const r of [0, 0.5, 0.99]) {
            expect(FITSWAP_AB_DISHES.slice(-2)).toContain(pickFitswapAbDish(history, () => r));
        }
    });

    it('reads the dish back from the topic, ignoring accents and case', () => {
        const history = FITSWAP_AB_DISHES.filter(d => d !== 'açaí na tigela').map((dish, i) => post(dish, 1 + (i % 28)));
        history.push({ generationPrompt: 'A ou B — Prato: ACAI NA TIGELA', createdAt: new Date(2026, 8, 29) });

        const picked = pickFitswapAbDish(history, () => 0);
        expect(picked).not.toBe('açaí na tigela');
    });

    it('picks the dish used longest ago once all were used', () => {
        const history = FITSWAP_AB_DISHES.map(dish => post(dish, 20));
        history.push(post('feijoada', 1));
        history.find(p => p.generationPrompt.endsWith('feijoada')).createdAt = new Date(2026, 8, 1);

        expect(pickFitswapAbDish(history, () => 0)).toBe('feijoada');
    });
});

describe('fitswap-ab caption disclaimer', () => {
    it('adds the estimate notice before the hashtags', () => {
        const caption = 'A ou B? Comenta aí.\n\n#fitswap #receitafit';
        expect(appendFitswapAbDisclaimer(caption)).toBe(`A ou B? Comenta aí.\n\n${FITSWAP_AB_DISCLAIMER}\n\n#fitswap #receitafit`);
    });

    it('appends at the end without hashtags and keeps captions that already cite TACO', () => {
        expect(appendFitswapAbDisclaimer('A ou B?')).toBe(`A ou B?\n\n${FITSWAP_AB_DISCLAIMER}`);
        expect(appendFitswapAbDisclaimer('Base: tabela TACO.')).toBe('Base: tabela TACO.');
    });
});

describe('fitswap preset', () => {
    it('includes the A ou B pillar and keeps weights at 100%', () => {
        const pillars = getBrandPreset('fitswap').editorialPillars;
        expect(pillars.find(p => p.id === 'a-ou-b')).toMatchObject({ preferredHtmlTemplate: 'fitswap-ab', formats: ['carousel-html'] });
        expect(pillars.reduce((sum, p) => sum + p.weight, 0)).toBe(100);
    });
});
