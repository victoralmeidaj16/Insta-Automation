import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const USER = 'user-1';

async function seedProfile(contentSchedule, id = 'profile-1', name = 'Fitswap') {
    await firebase.db.collection('businessProfiles').doc(id).set({
        userId: USER, name, contentSchedule,
    });
}

async function seedPost(overrides = {}) {
    return firebase.db.collection('posts').add({
        userId: USER,
        businessProfileId: 'profile-1',
        status: 'scheduled',
        format: 'story',
        scheduledFor: new Date(Date.now() + 2 * DAY),
        ...overrides,
    });
}

async function coverageFor(profileId = null) {
    const { getContentCoverage } = await import('../src/services/contentCoverageService.js');
    return getContentCoverage(USER, profileId);
}

beforeEach(() => {
    vi.resetModules();
    firebase = createInMemoryFirebase();
    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db, storage: firebase.storage, auth: {}, default: {},
    }));
});

describe('getContentCoverage', () => {
    // A premissa do painel: com auto-aprovação ligada o rascunho publica sozinho,
    // então prometer conteúdo só até o último "scheduled" subestima a cobertura.
    it('counts pending drafts as coverage when auto-approval publishes them anyway', async () => {
        await seedProfile({ autoGenerationEnabled: true, autoApproveFallbackEnabled: true });
        await seedPost({ status: 'scheduled', scheduledFor: new Date(Date.now() + 2 * DAY) });
        await seedPost({ status: 'draft', scheduledFor: new Date(Date.now() + 6 * DAY) });

        const [profile] = await coverageFor();
        expect(profile).toMatchObject({
            pendingCountsAsCovered: true,
            scheduledCount: 1,
            pendingCount: 1,
            totalUpcoming: 2,
            pendingUntil: null,
        });
        expect(new Date(profile.coveredUntil).getTime()).toBeCloseTo(Date.now() + 6 * DAY, -5);
    });

    // Sem auto-aprovação o rascunho é uma intenção, não uma promessa.
    it('stops the guarantee at the last scheduled post when approval is manual', async () => {
        await seedProfile({ autoGenerationEnabled: true, autoApproveFallbackEnabled: false });
        await seedPost({ status: 'scheduled', scheduledFor: new Date(Date.now() + 2 * DAY) });
        await seedPost({ status: 'draft', scheduledFor: new Date(Date.now() + 6 * DAY) });

        const [profile] = await coverageFor();
        expect(profile.pendingCountsAsCovered).toBe(false);
        expect(new Date(profile.coveredUntil).getTime()).toBeCloseTo(Date.now() + 2 * DAY, -5);
        // A fila além da garantia continua visível, para a revisão não sumir do radar.
        expect(new Date(profile.pendingUntil).getTime()).toBeCloseTo(Date.now() + 6 * DAY, -5);
        expect(profile.totalUpcoming).toBe(2);
    });

    it('reports an empty queue instead of guessing a date', async () => {
        await seedProfile({ autoGenerationEnabled: true, autoApproveFallbackEnabled: true });

        expect((await coverageFor())[0]).toMatchObject({
            coveredUntil: null, coverageHours: 0, totalUpcoming: 0, nextPostAt: null,
        });
    });

    it('ignores posts already in the past and statuses that will never publish', async () => {
        await seedProfile({ autoGenerationEnabled: true, autoApproveFallbackEnabled: true });
        await seedPost({ status: 'scheduled', scheduledFor: new Date(Date.now() - HOUR) });
        await seedPost({ status: 'rejected', scheduledFor: new Date(Date.now() + 5 * DAY) });
        await seedPost({ status: 'expired', scheduledFor: new Date(Date.now() + 5 * DAY) });
        await seedPost({ status: 'error', scheduledFor: new Date(Date.now() + 5 * DAY) });

        expect((await coverageFor())[0]).toMatchObject({ coveredUntil: null, totalUpcoming: 0 });
    });

    it('surfaces the next post and the last published one', async () => {
        await seedProfile({ autoGenerationEnabled: true, autoApproveFallbackEnabled: true });
        await seedPost({ status: 'scheduled', scheduledFor: new Date(Date.now() + 5 * DAY) });
        await seedPost({ status: 'draft', scheduledFor: new Date(Date.now() + 1 * DAY) });
        await seedPost({ status: 'success', scheduledFor: new Date(Date.now() - 3 * DAY) });

        const [profile] = await coverageFor();
        expect(new Date(profile.nextPostAt).getTime()).toBeCloseTo(Date.now() + DAY, -5);
        expect(new Date(profile.lastPublishedAt).getTime()).toBeCloseTo(Date.now() - 3 * DAY, -5);
    });

    it('keeps each profile separate and can be narrowed to one', async () => {
        await seedProfile({ autoApproveFallbackEnabled: true }, 'profile-1', 'Fitswap');
        await seedProfile({ autoApproveFallbackEnabled: true }, 'profile-2', 'Tudy');
        await seedPost({ businessProfileId: 'profile-1' });

        const all = await coverageFor();
        expect(all).toHaveLength(2);
        expect(all.find(item => item.profileName === 'Tudy')).toMatchObject({ totalUpcoming: 0, coveredUntil: null });

        const narrowed = await coverageFor('profile-2');
        expect(narrowed).toHaveLength(1);
        expect(narrowed[0].profileName).toBe('Tudy');
    });

    it('does not leak posts from another user', async () => {
        await seedProfile({ autoApproveFallbackEnabled: true });
        await firebase.db.collection('posts').add({
            userId: 'someone-else', businessProfileId: 'profile-1',
            status: 'scheduled', scheduledFor: new Date(Date.now() + 9 * DAY),
        });

        expect((await coverageFor())[0].coveredUntil).toBeNull();
    });
});
