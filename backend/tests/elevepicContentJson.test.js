import { describe, expect, it } from 'vitest';
import { clampCopy, normalizeElevepicContentJson, ELEVEPIC_TEMPLATE_METADATA, renderElevepicTemplate } from '../src/services/carouselTemplateService.js';

describe('dados de demonstração do template', () => {
    const brand = { brandName: 'Fitswap', brandKey: 'fitswap' };

    it('não publica a estatística de exemplo quando a IA não fornece uma', () => {
        const html = renderElevepicTemplate('editorial', {
            brandName: 'Fitswap',
            slides: [{}, {}, { title: 'Sem estatística', subtitle: 'Só texto' }, {}, {}, {}, {}]
        }, brand);

        expect(html).not.toContain('93%');
        expect(html).not.toContain('da percepção é não-verbal');
    });

    it('usa a estatística fornecida quando existe', () => {
        const html = renderElevepicTemplate('editorial', {
            brandName: 'Fitswap',
            slides: [{}, {}, { stats: [{ value: '10 min', label: 'por refeição' }] }, {}, {}, {}, {}]
        }, brand);

        expect(html).toContain('10 min');
        expect(html).not.toContain('93%');
    });
});

describe('classificação dos templates', () => {
    // O rodízio automático exclui os templates de biblioteca por este badge.
    // Se a classificação mudar, eles voltam a entrar sem ninguém perceber.
    const LIBRARY_BADGE = 'Usa biblioteca';

    it.each(['photo', 'moodboard', 'editorial-sci'])('marca %s como dependente da biblioteca', id => {
        expect(ELEVEPIC_TEMPLATE_METADATA.find(t => t.id === id)?.badge).toBe(LIBRARY_BADGE);
    });

    it.each(['bold', 'editorial', 'instagram'])('mantém %s independente de imagens', id => {
        expect(ELEVEPIC_TEMPLATE_METADATA.find(t => t.id === id)?.badge).not.toBe(LIBRARY_BADGE);
    });
});

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

describe('orçamentos por slot', () => {
    // Cada família de template usa nomes próprios: `_headline`/`_subtext` no
    // bold, `_title`/`_subtitle` no editorial.
    const LONGA = 'Uma manchete deliberadamente longa que passa do limite previsto para o slot';

    it('corta o título do editorial, não só o headline do bold', () => {
        expect(clampCopy(LONGA, 60).length).toBeLessThanOrEqual(60);
    });

    it('reserva menos espaço para o slide de CTA, que divide a área com o botão', () => {
        const cta = clampCopy(LONGA, 32);
        expect(cta.length).toBeLessThanOrEqual(32);
        expect(cta.length).toBeLessThan(clampCopy(LONGA, 60).length);
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
