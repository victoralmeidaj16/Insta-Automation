import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;
let getAccountMock;
let getAccountsByProfileMock;
let getBusinessProfileMock;
let uploadPhotosMock;
let uploadVideoMock;
let cancelScheduledPostMock;
let checkJobStatusMock;

async function createTestApp() {
    const { authenticate } = await import('../src/middleware/auth.js');
    const { default: postsRouter } = await import('../src/routes/posts.js');

    const app = express();
    app.use(express.json());
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            message: 'Instagram Automation API is running',
            timestamp: new Date().toISOString(),
        });
    });
    app.use('/api/posts', authenticate, postsRouter);

    return app;
}

beforeEach(() => {
    vi.resetModules();

    firebase = createInMemoryFirebase();
    getAccountMock = vi.fn().mockResolvedValue({
        id: 'account-1',
        username: 'perfil_principal',
        businessProfileId: 'profile-1',
    });
    getAccountsByProfileMock = vi.fn().mockResolvedValue([]);
    getBusinessProfileMock = vi.fn().mockResolvedValue({
        id: 'profile-1',
        name: 'Perfil Principal',
        branding: { style: 'clean' },
    });
    uploadPhotosMock = vi.fn().mockResolvedValue({
        success: true,
        job_id: 'job-123',
    });
    uploadVideoMock = vi.fn();
    cancelScheduledPostMock = vi.fn();
    checkJobStatusMock = vi.fn().mockResolvedValue({
        status: 'completed',
        last_update: '2026-04-08T15:00:00.000Z',
    });

    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db,
        storage: firebase.storage,
        auth: {},
        default: {},
    }));

    vi.doMock('../src/services/accountService.js', () => ({
        getAccount: getAccountMock,
    }));

    vi.doMock('../src/services/businessProfileService.js', () => ({
        getAccountsByProfile: getAccountsByProfileMock,
        getBusinessProfile: getBusinessProfileMock,
    }));

    vi.doMock('../src/services/uploadPostService.js', () => ({
        uploadPhotos: uploadPhotosMock,
        uploadVideo: uploadVideoMock,
        cancelScheduledPost: cancelScheduledPostMock,
        checkJobStatus: checkJobStatusMock,
    }));
});

describe('critical post flow', () => {
    it('creates a scheduled post through the API and stores the external job id', async () => {
        const app = await createTestApp();
        const mediaUrl = 'https://firebasestorage.googleapis.com/v0/b/test/o/media%2Fscheduled-post.jpg?alt=media';

        const response = await request(app)
            .post('/api/posts')
            .send({
                accountId: 'account-1',
                type: 'static',
                format: 'static',
                mediaUrls: [mediaUrl],
                caption: 'Legenda de teste',
                scheduledFor: '2026-04-09T12:00:00.000Z',
            });

        expect(response.status).toBe(201);
        expect(response.body.post.status).toBe('scheduled');
        expect(response.body.post.externalJobId).toBe('job-123');
        expect(uploadPhotosMock).toHaveBeenCalledTimes(1);

        const savedPosts = Array.from(firebase.getCollection('posts').values());
        expect(savedPosts).toHaveLength(1);
        expect(savedPosts[0].status).toBe('scheduled');
        expect(savedPosts[0].externalJobId).toBe('job-123');
    });

    it('syncs an externally scheduled post and marks it as published', async () => {
        const { syncScheduledPosts } = await import('../src/services/postService.js');

        const mediaUrl = 'https://firebasestorage.googleapis.com/v0/b/test/o/media%2Fsync-post.jpg?alt=media';
        const postRef = await firebase.db.collection('posts').add({
            userId: 'A9NJto9KIOSgYJg8uRj8u5xAvAg1',
            accountId: 'account-1',
            businessProfileId: 'profile-1',
            type: 'static',
            format: 'static',
            mediaUrls: [mediaUrl],
            caption: 'Post agendado',
            scheduledFor: new Date('2026-04-09T12:00:00.000Z'),
            status: 'scheduled',
            externalScheduler: 'upload-post',
            externalJobId: 'job-123',
            createdAt: new Date('2026-04-08T12:00:00.000Z'),
            updatedAt: new Date('2026-04-08T12:00:00.000Z'),
        });

        await syncScheduledPosts();

        const savedPost = firebase.getCollection('posts').get(postRef.id);
        expect(savedPost.status).toBe('success');
        expect(savedPost.postedAt).toBeInstanceOf(Date);
        expect(checkJobStatusMock).toHaveBeenCalledWith('job-123', undefined);
        expect(firebase.deletedFiles).toEqual(['media/sync-post.jpg']);
    });
});
