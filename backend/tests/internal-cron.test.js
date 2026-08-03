import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };
let dispatchMock;

async function createTestApp() {
    const { default: router } = await import('../src/routes/internalCron.js');
    const app = express();
    app.use('/internal/cron', router);
    return app;
}

beforeEach(() => {
    vi.resetModules();
    process.env.CRON_USERNAME = 'uptime';
    process.env.CRON_PASSWORD = 'strong-password';
    dispatchMock = vi.fn().mockResolvedValue({ accepted: true, runId: 'uptimerobot_tick' });
    vi.doMock('../src/services/schedulerService.js', () => ({
        dispatchExternalSchedulerTick: dispatchMock,
    }));
});

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
});

describe('internal cron endpoint', () => {
    it('rejects an invalid Basic credential', async () => {
        const app = await createTestApp();
        const response = await request(app)
            .get('/internal/cron/tick')
            .auth('uptime', 'wrong-password');

        expect(response.status).toBe(401);
        expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('accepts a valid Basic credential and returns quickly', async () => {
        const app = await createTestApp();
        const response = await request(app)
            .post('/internal/cron/tick')
            .auth('uptime', 'strong-password');

        expect(response.status).toBe(202);
        expect(response.body.runId).toBe('uptimerobot_tick');
        expect(dispatchMock).toHaveBeenCalledTimes(1);
    });

    it('reports a deduplicated tick without dispatching another run', async () => {
        dispatchMock.mockResolvedValue({ accepted: false, reason: 'tick-already-running' });
        const app = await createTestApp();
        const response = await request(app)
            .get('/internal/cron/tick')
            .auth('uptime', 'strong-password');

        expect(response.status).toBe(200);
        expect(response.body.reason).toBe('tick-already-running');
    });
});
