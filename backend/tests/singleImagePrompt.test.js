import { describe, expect, it } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { stripCarouselStructure, enforceSingleFrame } = await import('../src/services/content/captionService.js');

describe('stripCarouselStructure', () => {
    it('removes the carousel slide outline from a pillar description', () => {
        const concept = [
            'ESTUDO INTELIGENTE: Essa linha educa sobre como estudar melhor',
            'Dor explorada',
            'reler e esquecer',
            'Estrutura dos posts',
            '',
            'Slide 1 — erro comum',
            'Slide 2 — explicação',
            'Slide 6 - CTA',
            '',
            'Exemplos',
            '"Pare de só reler"'
        ].join('\n');

        const result = stripCarouselStructure(concept);

        expect(result).not.toMatch(/slide\s*\d/i);
        expect(result).not.toMatch(/estrutura dos posts/i);
        expect(result).toContain('reler e esquecer');
        expect(result).toContain('"Pare de só reler"');
    });
});

describe('enforceSingleFrame', () => {
    it('appends the single-frame guard once', () => {
        const once = enforceSingleFrame('A student at a desk.');
        expect(once).toMatch(/Do NOT create a grid, collage/);
        expect(enforceSingleFrame(once)).toBe(once);
    });
});
