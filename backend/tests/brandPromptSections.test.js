import { describe, expect, it } from 'vitest';
import { buildBrandPromptSections } from '../src/services/carousel/brandContextService.js';

describe('buildBrandPromptSections', () => {
    it.each([
        ['fitswap', 'FITSWAP', 'QUEBRA DE MITO'],
        ['tudy', 'TUDY', 'PAPÉIS DOS SLIDES'],
        ['elevepic', 'ELEVEPIC', 'AUTORIDADE'],
        ['inner-boost', 'INNER BOOST', 'NEON BLUE']
    ])('composes the %s preset without placeholders', (brandKey, expectedBrand, expectedRule) => {
        const composed = buildBrandPromptSections({ brandKey }, { slideCount: 5 }).compose();

        expect(composed.toUpperCase()).toContain(expectedBrand);
        expect(composed.toUpperCase()).toContain(expectedRule);
        expect(composed).not.toContain('undefined');
    });

    it('builds all sections for a generic profile and resolves narrative positions', () => {
        const sections = buildBrandPromptSections({
            brandName: 'Marca Teste',
            targetAudience: 'Pessoas curiosas',
            productService: 'Serviço teste',
            brandKit: {
                coreMessage: 'Uma mensagem clara',
                voice: 'Direta e humana',
                toneRules: ['Use frases curtas'],
                narrativeStructure: {
                    description: 'dor para ação',
                    slideRoles: [
                        { position: '1', role: 'Hook', rules: 'Abra forte' },
                        { position: 'middle', role: 'Valor', rules: 'Ensine' },
                        { position: 'last-1', role: 'Ponte', rules: 'Prepare CTA' },
                        { position: 'last', role: 'CTA', rules: 'Convide' }
                    ]
                },
                visualIdentity: { photographyStyle: 'Editorial', imagePromptGuidelines: ['Sem texto'] },
                ctaRules: ['CTA simples'],
                captionRules: ['Legenda curta'],
                hashtagStrategy: 'Use tags de nicho'
            }
        }, { slideCount: 5 });
        const composed = sections.compose(['identity', 'voice', 'narrative', 'visual', 'cta', 'caption']);

        expect(composed).toContain('Marca: Marca Teste');
        expect(composed).toContain('Slide 2 — Valor');
        expect(composed).toContain('Slide 3 — Valor');
        expect(composed).toContain('Slide 4 — Ponte');
        expect(composed).toContain('Slide 5 — CTA');
        expect(composed).toContain('Estratégia de hashtags: Use tags de nicho');
    });

    it('omits empty sections and never emits undefined', () => {
        const composed = buildBrandPromptSections({}, { slideCount: 5 }).compose();

        expect(composed).toBe('');
        expect(composed).not.toContain('undefined');
    });
});
