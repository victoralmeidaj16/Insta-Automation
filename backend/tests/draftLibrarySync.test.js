import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;

async function seedDraft(overrides = {}) {
    return firebase.db.collection('posts').add({
        userId: 'user-1',
        businessProfileId: 'profile-1',
        isDraft: true,
        status: 'draft',
        type: 'static',
        format: 'static',
        mediaUrls: ['https://storage.test/image.jpg'],
        caption: 'Legenda',
        ...overrides
    });
}

beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

    firebase = createInMemoryFirebase();
    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db,
        storage: firebase.storage,
        auth: {},
        default: {}
    }));
});

describe('draft to Library sync', () => {
    it('rejects a legacy reel before changing its approval state', async () => {
        const draftRef = await seedDraft({
            type: 'reel',
            format: 'reel',
            contentFamily: 'reel',
            videoUrl: 'https://storage.test/legacy.mp4',
            mediaUrls: ['https://storage.test/legacy.mp4']
        });
        const { approveDraftPost } = await import('../src/services/contentGeneratorService.js');

        await expect(approveDraftPost(draftRef.id, null, { destination: 'library' }))
            .rejects.toMatchObject({
                message: 'Vídeos e Reels não são aceitos na Library.',
                statusCode: 400
            });

        expect(firebase.getCollection('posts').get(draftRef.id)).toMatchObject({
            isDraft: true,
            status: 'draft'
        });
        expect(firebase.getCollection('library_items')).toHaveLength(0);
    });

    it('blocks direct sync calls for video URLs with a misleading static type', async () => {
        const draftRef = await seedDraft({
            mediaUrls: ['https://storage.test/legacy.webm?token=abc']
        });
        const { syncDraftToLibrary } = await import('../src/services/contentGeneratorService.js');

        await expect(syncDraftToLibrary(draftRef.id)).rejects.toMatchObject({ statusCode: 400 });
        expect(firebase.getCollection('library_items')).toHaveLength(0);
    });

    it('still approves and creates image Library items', async () => {
        const draftRef = await seedDraft();
        const { approveDraftPost } = await import('../src/services/contentGeneratorService.js');

        await expect(approveDraftPost(draftRef.id, null, { destination: 'library' }))
            .resolves.toMatchObject({ destination: 'library', status: 'library' });

        expect(firebase.getCollection('posts').get(draftRef.id)).toMatchObject({
            isDraft: false,
            status: 'library'
        });
        expect(firebase.getCollection('library_items')).toHaveLength(1);
    });
});

describe('unsupported Autopilot formats', () => {
    it('rejects reels before generating an image or creating a draft', async () => {
        const { generateDraftPost } = await import('../src/services/contentGeneratorService.js');

        await expect(generateDraftPost('profile-1', 'pillar-1', 'reel', null, null))
            .rejects.toMatchObject({
                message: 'Reels não são suportados pelo Content Autopilot.',
                statusCode: 400
            });

        expect(firebase.getCollection('posts')).toHaveLength(0);
    });
});
