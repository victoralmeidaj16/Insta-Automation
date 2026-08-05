import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;
let approveDraftPostMock;
let scheduleApprovedPostMock;
let getBusinessProfileMock;
let getAccountsByProfileMock;

const HOUR = 60 * 60 * 1000;

function seedProfile(schedule) {
    getBusinessProfileMock.mockResolvedValue({
        id: 'profile-1',
        name: 'Perfil Teste',
        contentSchedule: schedule,
    });
}

async function seedDraft(overrides = {}) {
    return firebase.db.collection('posts').add({
        businessProfileId: 'profile-1',
        isDraft: true,
        status: 'draft',
        format: 'static',
        pillarName: 'Pilar',
        mediaUrls: ['https://storage.test/photo.jpg'],
        scheduledFor: new Date(Date.now() + 6 * HOUR),
        ...overrides,
    });
}

beforeEach(() => {
    vi.resetModules();

    firebase = createInMemoryFirebase();
    approveDraftPostMock = vi.fn().mockResolvedValue({});
    scheduleApprovedPostMock = vi.fn().mockResolvedValue({ status: 'scheduled' });
    getBusinessProfileMock = vi.fn();
    getAccountsByProfileMock = vi.fn().mockResolvedValue([]);

    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db,
        storage: firebase.storage,
        auth: {},
        default: {},
    }));

    vi.doMock('../src/services/contentGeneratorService.js', () => ({
        approveDraftPost: approveDraftPostMock,
    }));

    vi.doMock('../src/services/postService.js', () => ({
        scheduleApprovedPost: scheduleApprovedPostMock,
    }));

    vi.doMock('../src/services/businessProfileService.js', () => ({
        getBusinessProfile: getBusinessProfileMock,
        getAccountsByProfile: getAccountsByProfileMock,
    }));
});

describe('auto approver fallback', () => {
    it('leaves drafts untouched while the profile has not opted in', async () => {
        seedProfile({ publishingMode: 'review' });
        await seedDraft();

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).not.toHaveBeenCalled();
        expect(scheduleApprovedPostMock).not.toHaveBeenCalled();
    });

    it('approves and schedules a draft inside the lead window when opted in', async () => {
        seedProfile({ publishingMode: 'review', autoApproveFallbackEnabled: true });
        const draft = await seedDraft();

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).toHaveBeenCalledWith(draft.id, 'profile-1', { destination: 'schedule' });
        expect(scheduleApprovedPostMock).toHaveBeenCalledWith(draft.id, 'profile-1');
    });

    it('does not touch drafts still outside the lead window', async () => {
        seedProfile({ publishingMode: 'review', autoApproveFallbackEnabled: true });
        await seedDraft({ scheduledFor: new Date(Date.now() + 72 * HOUR) });

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).not.toHaveBeenCalled();
    });

    it('honours a custom lead window', async () => {
        seedProfile({ autoApproveFallbackEnabled: true, autoApproveLeadHours: 96 });
        const draft = await seedDraft({ scheduledFor: new Date(Date.now() + 72 * HOUR) });

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).toHaveBeenCalledWith(draft.id, 'profile-1', { destination: 'schedule' });
    });

    it('never approves a draft whose scheduled time already passed', async () => {
        seedProfile({ autoApproveFallbackEnabled: true });
        await seedDraft({ scheduledFor: new Date(Date.now() - HOUR) });

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).not.toHaveBeenCalled();
    });

    it('skips drafts without media instead of failing at the provider', async () => {
        seedProfile({ autoApproveFallbackEnabled: true });
        await seedDraft({ mediaUrls: [] });

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).not.toHaveBeenCalled();
    });

    // Carrosséis HTML só são rasterizados na aprovação, então não têm mediaUrls
    // enquanto são rascunho.
    it('approves an HTML carousel that has no media yet but carries its markup', async () => {
        seedProfile({ autoApproveFallbackEnabled: true });
        const draft = await seedDraft({
            format: 'carousel-html',
            mediaUrls: [],
            htmlCode: '<section>slide</section>'
        });

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).toHaveBeenCalledWith(draft.id, 'profile-1', { destination: 'schedule' });
    });

    it('still skips an HTML carousel with neither media nor markup', async () => {
        seedProfile({ autoApproveFallbackEnabled: true });
        await seedDraft({ format: 'carousel-html', mediaUrls: [], htmlCode: '' });

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        expect(approveDraftPostMock).not.toHaveBeenCalled();
    });

    it('returns the draft to review when the external scheduling fails', async () => {
        seedProfile({ autoApproveFallbackEnabled: true });
        const draft = await seedDraft();
        scheduleApprovedPostMock.mockRejectedValue(new Error('Upload-Post fora do ar'));

        const { runAutoApprover } = await import('../src/cron/autoApprover.js');
        await runAutoApprover();

        const saved = firebase.getCollection('posts').get(draft.id);
        expect(saved.status).toBe('draft');
        expect(saved.isDraft).toBe(true);
        expect(saved.autoApproveError).toBe('Upload-Post fora do ar');
    });
});
