import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;
let cancelMock;
let scheduleMock;

beforeEach(() => {
    vi.resetModules();
    firebase = createInMemoryFirebase();
    cancelMock = vi.fn().mockResolvedValue(undefined);
    scheduleMock = vi.fn().mockImplementation(async postId => ({ status: 'scheduled', externalJobId: `new-${postId}` }));
    vi.doMock('../src/config/firebase.js', () => ({ db: firebase.db, storage: firebase.storage }));
    vi.doMock('../src/services/postService.js', () => ({
        createPost: vi.fn(), deletePost: vi.fn(),
        cancelPostScheduleForUpdate: cancelMock,
        scheduleApprovedPost: scheduleMock,
        syncScheduledPosts: vi.fn()
    }));
    vi.doMock('../src/services/historyService.js', () => ({ uploadImage: vi.fn(async url => url) }));
    vi.doMock('../src/services/aiService.js', () => ({ generateImages: vi.fn() }));
    vi.doMock('../src/services/businessProfileService.js', () => ({ getOwnedBusinessProfile: vi.fn().mockResolvedValue({ id: 'profile-1' }) }));
});

async function appWithLinkedPosts() {
    const tomorrow = new Date(Date.now() + 86_400_000);
    await firebase.db.collection('library_items').doc('item-1').set({
        userId: 'user-1', businessProfileId: 'profile-1', type: 'carousel', format: 'carousel',
        mediaUrls: ['https://storage.test/old-1.jpg', 'https://storage.test/old-2.jpg'], caption: 'Antiga'
    });
    for (const id of ['post-1', 'post-2']) {
        await firebase.db.collection('posts').doc(id).set({
            userId: 'user-1', businessProfileId: 'profile-1', accountId: 'account-1',
            libraryItemId: 'item-1', status: 'scheduled', scheduledFor: tomorrow,
            type: 'carousel', format: 'carousel', mediaUrls: ['https://storage.test/old-1.jpg', 'https://storage.test/old-2.jpg'],
            caption: 'Antiga', externalScheduler: 'upload-post', externalJobId: `old-${id}`
        });
    }
    const { default: router } = await import('../src/routes/library.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.userId = 'user-1'; next(); });
    app.use('/api/library', router);
    return app;
}

describe('Library scheduled content', () => {
    it('advances past pages without the requested type', async () => {
        for (let index = 0; index < 5; index++) {
            await firebase.db.collection('library_items').doc(`item-${index}`).set({
                userId: 'user-1', businessProfileId: 'profile-1',
                isPosted: false, createdAt: new Date(2026, 0, 5 - index),
                type: index === 4 ? 'story' : 'static',
                format: index === 4 ? 'story' : 'static',
                mediaUrls: [`https://storage.test/${index}.jpg`]
            });
        }
        const { default: router } = await import('../src/routes/library.js');
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => { req.userId = 'user-1'; next(); });
        app.use('/api/library', router);

        const response = await request(app).get('/api/library?businessProfileId=profile-1&type=story&limit=2');
        expect(response.status).toBe(200);
        expect(response.body.items.map(item => item.id)).toEqual(['item-4']);
        expect(response.body.nextCursor).toBe('item-4');
        expect(response.body.hasMore).toBe(false);
    });

    it('updates every linked post after cancelling old jobs', async () => {
        const app = await appWithLinkedPosts();
        const mediaUrls = ['https://storage.test/new-1.jpg', 'https://storage.test/new-2.jpg'];
        const response = await request(app).put('/api/library/item-1/update-schedule').send({ mediaUrls, caption: 'Nova' });

        expect(response.status).toBe(200);
        expect(cancelMock).toHaveBeenCalledTimes(2);
        expect(scheduleMock).toHaveBeenCalledTimes(2);
        expect(firebase.getCollection('library_items').get('item-1')).toMatchObject({ mediaUrls, caption: 'Nova' });
        for (const id of ['post-1', 'post-2']) {
            expect(firebase.getCollection('posts').get(id)).toMatchObject({ mediaUrls, caption: 'Nova' });
        }
    });

    it('keeps the original version when the provider does not cancel a job', async () => {
        cancelMock.mockRejectedValueOnce(new Error('provider unavailable'));
        const app = await appWithLinkedPosts();
        const response = await request(app).put('/api/library/item-1/update-schedule').send({ caption: 'Nova' });

        expect(response.status).toBe(502);
        expect(scheduleMock).not.toHaveBeenCalled();
        expect(firebase.getCollection('library_items').get('item-1').caption).toBe('Antiga');
    });
});
