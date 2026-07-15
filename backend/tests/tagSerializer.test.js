import { describe, expect, it } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { CAROUSEL_SLIDES_SCHEMA, serializeSlideToTagPrompt } = await import('../src/services/carousel/carouselPromptService.js');

// These are the literal grammars consumed by contentGeneratorService.js
// (lines 218-219, 1432-1435 and 1906-1908 at the time this test was added).
const autopilotTitle = /\[TITLE:\s*(.*?)\]/i;
const autopilotHeadline = /\[HEADLINE:\s*(.*?)\]/i;
const autopilotHighlights = /\[HIGHLIGHTS:\s*(.*?)\]/i;

// These are the frontend grammars from PremiumCarouselEditor.tsx.
const frontendTitle = /\[(?:TITLE|HEADLINE):\s*(.*?)\]/i;
const frontendHighlights = /\[HIGHLIGHTS:\s*(.*?)\]/i;
const frontendBackground = /\[BACKGROUND:\s*(.*?)\]/i;

describe('serializeSlideToTagPrompt', () => {
    it('serializes a premium slide in the grammar parsed by autopilot and frontend', () => {
        const prompt = serializeSlideToTagPrompt({
            background: 'A student studying in a dark library, electric blue rim light',
            headline: 'RELER NÃO FIXA NADA',
            subheadline: 'Pratique para lembrar',
            highlights: ['RELER', 'FIXA']
        }, { premium: true });

        expect(prompt).toContain('[PREMIUM_OVERLAY]');
        expect(prompt.match(autopilotHeadline)?.[1]).toBe('RELER NÃO FIXA NADA');
        expect(prompt.match(autopilotHighlights)?.[1]).toBe('RELER, FIXA');
        expect(prompt.match(frontendTitle)?.[1]).toBe('RELER NÃO FIXA NADA');
        expect(prompt.match(frontendHighlights)?.[1]).toBe('RELER, FIXA');
        expect(prompt.match(frontendBackground)?.[1]).toContain('dark library');
    });

    it('preserves the Fitswap white-overlay contract and omits empty optional tags', () => {
        const prompt = serializeSlideToTagPrompt({
            background: 'A calm kitchen in natural daylight',
            headline: 'COMA SEM CULPA',
            subheadline: '',
            highlights: []
        }, { white: true });

        expect(prompt).toContain('[WHITE_OVERLAY]');
        expect(prompt.match(autopilotHeadline)?.[1]).toBe('COMA SEM CULPA');
        expect(prompt.match(autopilotTitle)).toBeNull();
        expect(prompt).not.toContain('[SUBHEADLINE:');
        expect(prompt).not.toContain('[HIGHLIGHTS:');
    });

    it('sanitizes delimiters that would corrupt tag parsers', () => {
        const prompt = serializeSlideToTagPrompt({
            background: 'Scene ] with | broken delimiters',
            headline: 'PARE ] DE | REPETIR',
            subheadline: 'Sem ] delimitadores | internos',
            highlights: ['PARE]', '|REPETIR']
        }, { premium: true });

        expect(prompt.match(frontendTitle)?.[1]).not.toMatch(/[\]|]/);
        expect(prompt.match(frontendBackground)?.[1]).not.toMatch(/[\]|]/);
        expect(prompt.match(frontendTitle)?.[1]).toBe('PARE DE REPETIR');
        expect(prompt.match(frontendHighlights)?.[1]).toBe('PARE, REPETIR');
    });

    it('uses a strict schema with every slide field required', () => {
        const slideSchema = CAROUSEL_SLIDES_SCHEMA.schema.properties.slides.items;

        expect(CAROUSEL_SLIDES_SCHEMA.strict).toBe(true);
        expect(slideSchema.required).toEqual(['background', 'headline', 'subheadline', 'highlights']);
        expect(slideSchema.additionalProperties).toBe(false);
    });
});
