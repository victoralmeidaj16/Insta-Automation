import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';
import { mergeBrandProfileDefaults } from '../src/utils/brandProfiles.js';

let firebase;
let generateHtmlCarousel;
const html = '<html><body>' + '<section class="slide">Estude um passo por vez.</section>'.repeat(7) + '</body></html>';

beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
    firebase = createInMemoryFirebase();
    generateHtmlCarousel = vi.fn().mockResolvedValue(html);
    vi.doMock('../src/config/firebase.js', () => ({ db: firebase.db, storage: firebase.storage, auth: {}, default: {} }));
    vi.doMock('openai', () => ({ default: class {
        chat = { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Entenda e pratique.' } }] }) } };
    } }));
    vi.doMock('../src/services/aiService.js', async importOriginal => ({
        ...await importOriginal(), generateHtmlCarousel
    }));
});

describe('Tudy Impacto como padrão HTML', () => {
    it('applies the approved default to legacy saved profiles', () => {
        const profile = mergeBrandProfileDefaults({ name: 'Tudy', aiPreferences: { defaultHtmlTemplate: 'editorial' } });
        expect(profile.aiPreferences.defaultHtmlTemplate).toBe('tudy-impacto');
    });

    it.each(['review', 'auto'])('generates seven Impacto slides in %s mode despite old pillar preferences', async publishingMode => {
        await firebase.db.collection('businessProfiles').doc('tudy-profile').set({
            userId: 'user-1', name: 'Tudy',
            contentSchedule: { autoGenerationEnabled: true, publishingMode },
            editorialPillars: [{ id: 'study', name: 'Estudo', description: 'Prática ativa', preferredHtmlTemplate: 'editorial' }]
        });
        const { generateDraftPost } = await import('../src/services/contentGeneratorService.js');
        await generateDraftPost('tudy-profile', 'study', 'carousel-html', null, null, { slideCount: 4, customTopic: 'Dúvida na questão' });
        expect(generateHtmlCarousel).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ brandKey: 'tudy' }), 'tudy-impacto', 7);
    });

    it('regenerates a legacy Tudy draft with Impacto and updates its template metadata', async () => {
        await firebase.db.collection('businessProfiles').doc('tudy-profile').set({ userId: 'user-1', name: 'Tudy' });
        await firebase.db.collection('posts').doc('legacy').set({
            userId: 'user-1', businessProfileId: 'tudy-profile', isDraft: true, status: 'draft',
            format: 'carousel-html', type: 'carousel-html', htmlContent: html,
            carouselTemplateId: 'editorial', extra: { carouselTemplateId: 'editorial' }, slideCount: 5
        });
        const { regenerateDraftPost } = await import('../src/services/contentGeneratorService.js');
        await regenerateDraftPost('legacy', 'Explique como destravar uma questão');
        expect(generateHtmlCarousel).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 'tudy-impacto', 7);
        const saved = (await firebase.db.collection('posts').doc('legacy').get()).data();
        expect(saved.carouselTemplateId).toBe('tudy-impacto');
        expect(saved.extra.carouselTemplateId).toBe('tudy-impacto');
    });

    it('preserves template selection for other brands', async () => {
        const { selectHtmlTemplate, resolveHtmlTemplateSlideCount } = await import('../src/services/contentGeneratorService.js');
        expect(selectHtmlTemplate({}, {}, { brandKey: 'fitswap' })).toBe('fitswap-clareza');
        expect(selectHtmlTemplate({ preferredHtmlTemplate: 'photo' }, {}, { brandKey: 'other' })).toBe('photo');
        expect(resolveHtmlTemplateSlideCount('tudy-impacto', 3)).toBe(7);
    });
});
