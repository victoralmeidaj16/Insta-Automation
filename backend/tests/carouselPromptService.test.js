import { describe, expect, it } from 'vitest';

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { getEditorialSystemPrompt } = await import('../src/services/carousel/carouselPromptService.js');

describe('getEditorialSystemPrompt', () => {
    it('keeps the Fitswap white-overlay contract and injects preset direction', () => {
        const prompt = getEditorialSystemPrompt('Decisões alimentares sem culpa', 5, {
            brandKey: 'fitswap',
            isPremiumCarousel: true
        });

        expect(prompt).toContain('[WHITE_OVERLAY]');
        expect(prompt).toContain('[HEADLINE:');
        expect(prompt).toContain('QUEBRA DE MITO');
        expect(prompt).toContain('Neon Lime #A6F000');
    });

    it('keeps the premium contract and resolves Tudy narrative roles', () => {
        const prompt = getEditorialSystemPrompt('Como reter o que estudou', 5, {
            brandKey: 'tudy',
            isPremiumCarousel: true
        });

        expect(prompt).toContain('[PREMIUM_OVERLAY]');
        expect(prompt).toContain('[HEADLINE:');
        expect(prompt).toContain('Slide 1 — HOOK');
        expect(prompt).toContain('Slide 4 — SOLUÇÃO');
        expect(prompt).toContain('PROIBIDO na copy: O Tudy faz');
    });

    it('uses the same builder-driven skeleton for ElevePic and generic brands', () => {
        const elevepic = getEditorialSystemPrompt('Imagem profissional', 4, {
            brandKey: 'elevepic',
            isPremiumCarousel: true
        });
        const generic = getEditorialSystemPrompt('Tema livre', 3, {
            brandName: 'Marca Nova',
            isPremiumCarousel: true,
            brandKit: { voice: 'Clara e objetiva' }
        });

        expect(elevepic).toMatch(/autoridade/i);
        expect(elevepic).toContain('NUNCA USE');
        expect(generic).toContain('Marca: Marca Nova');
        expect(generic).toContain('Voz: Clara e objetiva');
        expect(generic).not.toContain('undefined');
    });
});
