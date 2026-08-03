import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();

vi.mock('../src/config/firebase.js', () => ({
    auth: { verifyIdToken },
}));

const { authenticate, PRIMARY_ADMIN_UID } = await import('../src/middleware/auth.js');

function createApp() {
    const app = express();
    app.get('/private', authenticate, (req, res) => res.json({ uid: req.userId }));
    return app;
}

describe('Firebase API authentication', () => {
    beforeEach(() => verifyIdToken.mockReset());

    it('rejects requests without a bearer token', async () => {
        const response = await request(createApp()).get('/private');
        expect(response.status).toBe(401);
    });

    it('rejects invalid tokens', async () => {
        verifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
        const response = await request(createApp()).get('/private').set('Authorization', 'Bearer invalid');
        expect(response.status).toBe(401);
    });

    it('rejects authenticated users outside the allowlist', async () => {
        verifyIdToken.mockResolvedValueOnce({ uid: 'old-owner' });
        const response = await request(createApp()).get('/private').set('Authorization', 'Bearer valid');
        expect(response.status).toBe(403);
    });

    it('accepts the primary admin uid', async () => {
        verifyIdToken.mockResolvedValueOnce({ uid: PRIMARY_ADMIN_UID });
        const response = await request(createApp()).get('/private').set('Authorization', 'Bearer valid');
        expect(response.status).toBe(200);
        expect(response.body.uid).toBe(PRIMARY_ADMIN_UID);
    });
});
