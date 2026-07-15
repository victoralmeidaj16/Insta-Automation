import { describe, expect, it } from 'vitest';
import { getBrandPreset, mergeBrandProfileDefaults } from '../src/utils/brandProfiles.js';

describe('mergeBrandProfileDefaults brandKit IA', () => {
    it('keeps the complete preset for a profile without overrides', () => {
        const preset = getBrandPreset('tudy');
        const merged = mergeBrandProfileDefaults({ brandKey: 'tudy' });

        expect(merged.brandKit.voice).toBe(preset.brandKit.voice);
        expect(merged.brandKit.toneRules).toEqual(preset.brandKit.toneRules);
        expect(merged.brandKit.narrativeStructure).toEqual(preset.brandKit.narrativeStructure);
        expect(merged.brandKit.visualIdentity).toEqual(preset.brandKit.visualIdentity);
    });

    it('uses scalar profile values while preserving preset values when empty', () => {
        const emptyOverride = mergeBrandProfileDefaults({
            brandKey: 'fitswap',
            brandKit: { voice: '', hashtagStrategy: '' }
        });
        const override = mergeBrandProfileDefaults({
            brandKey: 'fitswap',
            brandKit: { voice: 'Voz do perfil', hashtagStrategy: 'Use #marca' }
        });

        expect(emptyOverride.brandKit.voice).toBe(getBrandPreset('fitswap').brandKit.voice);
        expect(override.brandKit.voice).toBe('Voz do perfil');
        expect(override.brandKit.hashtagStrategy).toBe('Use #marca');
    });

    it('replaces curated rule arrays instead of unioning them with the preset', () => {
        const merged = mergeBrandProfileDefaults({
            brandKey: 'tudy',
            brandKit: {
                toneRules: ['Regra exclusiva'],
                copyArchetypes: ['Hook exclusivo'],
                headlineExamples: ['HEADLINE EXCLUSIVA'],
                ctaRules: ['CTA exclusiva'],
                forbiddenWords: ['Termo exclusivo'],
                forbiddenVisuals: ['Visual exclusivo'],
                captionRules: ['Legenda exclusiva']
            }
        });

        expect(merged.brandKit.toneRules).toEqual(['Regra exclusiva']);
        expect(merged.brandKit.copyArchetypes).toEqual(['Hook exclusivo']);
        expect(merged.brandKit.headlineExamples).toEqual(['HEADLINE EXCLUSIVA']);
        expect(merged.brandKit.ctaRules).toEqual(['CTA exclusiva']);
        expect(merged.brandKit.forbiddenWords).toEqual(['Termo exclusivo']);
        expect(merged.brandKit.forbiddenVisuals).toEqual(['Visual exclusivo']);
        expect(merged.brandKit.captionRules).toEqual(['Legenda exclusiva']);
    });

    it('shallow-merges nested structures while replacing their curated lists', () => {
        const merged = mergeBrandProfileDefaults({
            brandKey: 'tudy',
            brandKit: {
                narrativeStructure: { description: 'Arco do perfil', slideRoles: [{ position: 'last', role: 'Fecho', rules: 'Feche.' }] },
                visualIdentity: { photographyStyle: 'Foto do perfil', imagePromptGuidelines: ['Regra visual exclusiva'] }
            }
        });

        expect(merged.brandKit.narrativeStructure.description).toBe('Arco do perfil');
        expect(merged.brandKit.narrativeStructure.slideRoles).toEqual([{ position: 'last', role: 'Fecho', rules: 'Feche.' }]);
        expect(merged.brandKit.visualIdentity.photographyStyle).toBe('Foto do perfil');
        expect(merged.brandKit.visualIdentity.colorUsage).toBeTruthy();
        expect(merged.brandKit.visualIdentity.imagePromptGuidelines).toEqual(['Regra visual exclusiva']);
    });
});
