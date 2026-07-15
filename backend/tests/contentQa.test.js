import { describe, expect, it } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { normalizeQaText, reviewContentPlan, reviewContentPlanLocal } = await import('../src/services/content/contentQaService.js');

describe('content QA local checks', () => {
    it('normalizes case and accents for reliable rule matching', () => {
        expect(normalizeQaText('  MÁGICA   Revolução  ')).toBe('magica revolucao');
    });

    it('finds forbidden words in slides and captions accent-insensitively', () => {
        const issues = reviewContentPlanLocal({
            slides: [
                { headline: 'Uma solução MÁGICA', subheadline: '' },
                { headline: 'Conteúdo válido', subheadline: '' }
            ],
            caption: 'Esta revolução começa agora.'
        }, {
            brandKit: { forbiddenWords: ['magica', 'revolução'] }
        });

        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ target: 'slide', index: 0, rule: 'forbidden_word' }),
            expect.objectContaining({ target: 'caption', index: null, rule: 'forbidden_word' })
        ]));
    });

    it('flags placeholder meta-copy without an LLM', () => {
        const issues = reviewContentPlanLocal({
            slides: [{ headline: 'TEMA CENTRAL', subheadline: 'Conteúdo criado para a marca' }],
            caption: ''
        }, {});

        expect(issues.some((issue) => issue.rule === 'meta_copy')).toBe(true);
    });

    it('skips LLM review when there are no rules or suspicions', async () => {
        const result = await reviewContentPlan({
            slides: [{ headline: 'MENOS HORAS, MAIS RESULTADO', subheadline: 'Pratique de forma ativa' }],
            caption: 'Uma técnica útil para aplicar hoje.'
        }, {});

        expect(result).toEqual({ ok: true, issues: [] });
    });
});
