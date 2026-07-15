import { describe, expect, it } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { CONTENT_PLAN_SCHEMA, buildContentPlanSystemPrompt } = await import('../src/services/content/contentPlanService.js');

describe('content plan contract', () => {
    it('requires narrative, slides, caption, hashtags and cta in strict mode', () => {
        expect(CONTENT_PLAN_SCHEMA.strict).toBe(true);
        expect(CONTENT_PLAN_SCHEMA.schema.required).toEqual([
            'narrative', 'slides', 'caption', 'hashtags', 'cta'
        ]);
        expect(CONTENT_PLAN_SCHEMA.schema.additionalProperties).toBe(false);
        expect(CONTENT_PLAN_SCHEMA.schema.properties.slides.items.required).toEqual([
            'background', 'headline', 'subheadline', 'highlights'
        ]);
    });

    it('builds one coherent Tudy plan prompt with caption and CTA rules', () => {
        const prompt = buildContentPlanSystemPrompt({
            description: 'Como lembrar o que estudou',
            count: 5,
            context: { brandKey: 'tudy' }
        });

        expect(prompt).toContain('Slide 1 — HOOK');
        expect(prompt).toContain('Slide 4 — SOLUÇÃO');
        expect(prompt).toContain('caption continua o arco dos slides');
        expect(prompt).toContain('cta deve ser coerente com o último slide');
        expect(prompt).toContain('Estratégia de hashtags');
        expect(prompt).not.toContain('undefined');
    });
});
