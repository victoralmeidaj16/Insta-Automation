import { describe, expect, it } from 'vitest';
import { clampCopy, normalizeElevepicContentJson } from '../src/services/carouselTemplateService.js';

describe('clampCopy', () => {
    it('leaves copy within budget untouched, markup included', () => {
        const value = 'ENTENDA.<br><span class="hl-blue">APLIQUE.</span>';
        expect(clampCopy(value, 60)).toBe(value);
    });

    it('cuts overlong copy at a word boundary', () => {
        const long = 'Você se esforça para comer bem, mas a falta de tempo te derruba todo dia';
        const result = clampCopy(long, 40);
        expect(result.length).toBeLessThanOrEqual(40);
        expect(long.startsWith(result)).toBe(true);
        expect(result.endsWith(' ')).toBe(false);
    });

    it('drops trailing punctuation left by the cut', () => {
        expect(clampCopy('uma frase bem comprida, mesmo', 24)).not.toMatch(/[,\s]$/);
    });

    it('drops markup once it has to truncate, to avoid emitting a broken tag', () => {
        const result = clampCopy('<span class="hl">Uma manchete grande demais para o slide</span>', 20);
        expect(result).not.toContain('<');
        expect(result.length).toBeLessThanOrEqual(20);
    });

    it('passes through non-strings and missing budgets', () => {
        expect(clampCopy(undefined, 20)).toBeUndefined();
        expect(clampCopy('qualquer coisa', null)).toBe('qualquer coisa');
    });
});

describe('normalizeElevepicContentJson', () => {
    it('unwraps slides the model nested under their type key', () => {
        const result = normalizeElevepicContentJson({
            brandName: 'Fitswap',
            slides: [
                { hook: { eyebrow: 'DECISÃO', headline: '5 REFEIÇÕES', subtext: 'Em 10 minutos.' } },
                { impact: { eyebrow: 'TEMPO', impactNumber: '10', impactLabel: 'Minutos.' } }
            ]
        });

        expect(result.slides[0]).toEqual({ eyebrow: 'DECISÃO', headline: '5 REFEIÇÕES', subtext: 'Em 10 minutos.' });
        expect(result.slides[1].impactNumber).toBe('10');
    });

    it('leaves already-flat slides untouched', () => {
        const flat = {
            slides: [{ eyebrow: 'A', headline: 'B', subtext: 'C' }]
        };
        expect(normalizeElevepicContentJson(flat).slides[0]).toEqual({ eyebrow: 'A', headline: 'B', subtext: 'C' });
    });

    it('keeps a single-key slide whose only field is real content', () => {
        const slides = [{ statementLines: ['DE', 'X', 'PARA', 'Y'] }, { headline: 'SÓ TÍTULO' }];
        expect(normalizeElevepicContentJson({ slides }).slides).toEqual(slides);
    });

    it('does not unwrap a wrapper whose inner object carries no known field', () => {
        const slides = [{ meta: { renderedAt: 'ontem' } }];
        expect(normalizeElevepicContentJson({ slides }).slides).toEqual(slides);
    });

    it('passes through content without a slides array', () => {
        expect(normalizeElevepicContentJson({ brandName: 'X' })).toEqual({ brandName: 'X' });
        expect(normalizeElevepicContentJson()).toEqual({});
    });
});
