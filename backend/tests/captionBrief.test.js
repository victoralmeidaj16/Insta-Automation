import { describe, expect, it } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { buildCaptionFromBriefSystemPrompt } = await import('../src/services/content/captionService.js');

describe('buildCaptionFromBriefSystemPrompt', () => {
    it('preserves the generic legacy prompt when no profile is provided', () => {
        const prompt = buildCaptionFromBriefSystemPrompt({
            tone: 'casual',
            includeHashtags: true,
            language: 'pt'
        });

        expect(prompt).toContain('Tom casual e descontraído');
        expect(prompt).toContain('Incluam 5-8 hashtags relevantes');
        expect(prompt).not.toContain('DIREÇÃO DA MARCA');
    });

    it('injects the selected profile voice and caption rules', () => {
        const prompt = buildCaptionFromBriefSystemPrompt({
            context: { brandKey: 'tudy' },
            tone: 'educativo',
            includeHashtags: false,
            language: 'pt'
        });

        expect(prompt).toContain('DIREÇÃO DA MARCA');
        expect(prompt).toContain('Voz: Inteligente, direta, encorajadora e focada');
        expect(prompt).toContain('REGRAS DE LEGENDA');
        expect(prompt).toContain('NÃO incluam hashtags');
        expect(prompt).not.toContain('undefined');
    });
});
