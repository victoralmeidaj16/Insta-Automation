import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;

const HOUR = 60 * 60 * 1000;
const USER = 'user-1';

// Perfil conectado e tick recente: o teste isola o alerta em questão em vez de
// afogá-lo nos alertas de infraestrutura.
function stubProviderConnected() {
    vi.doMock('axios', () => ({
        default: {
            get: vi.fn().mockResolvedValue({
                data: { profiles: [{ username: 'fitswap', social_accounts: { instagram: { username: 'fitswap' } } }] }
            })
        }
    }));
}

async function seedProfile(overrides = {}) {
    await firebase.db.collection('businessProfiles').doc('profile-1').set({
        userId: USER,
        name: 'Fitswap',
        instagram: { uploadPostApiKey: 'key', uploadPostUsername: 'fitswap' },
        contentSchedule: { autoGenerationEnabled: true, timezone: 'America/Sao_Paulo' },
        ...overrides,
    });
}

async function seedPost(overrides = {}) {
    return firebase.db.collection('posts').add({
        userId: USER,
        businessProfileId: 'profile-1',
        status: 'scheduled',
        format: 'story',
        scheduledFor: new Date(Date.now() + 5 * 24 * HOUR),
        ...overrides,
    });
}

async function loadAlerts() {
    const { getOperationalAlerts } = await import('../src/services/operationalAlertsService.js');
    return getOperationalAlerts(USER);
}

beforeEach(async () => {
    vi.resetModules();
    firebase = createInMemoryFirebase();
    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db, storage: firebase.storage, auth: {}, default: {},
    }));
    stubProviderConnected();
    await firebase.db.collection('schedulerRuns').doc('uptimerobot_tick').set({ heartbeatAt: new Date() });
});

describe('coverage_gap', () => {
    it('flags a profile whose autopilot is on but has no future posts', async () => {
        await seedProfile();

        const alert = (await loadAlerts()).find(item => item.kind === 'coverage_gap');
        expect(alert).toMatchObject({ severity: 'critical', profileId: 'profile-1' });
        expect(alert.message).toContain('não tem nenhum post futuro');
    });

    it('warns while the queue runs out within three days', async () => {
        await seedProfile();
        await seedPost({ scheduledFor: new Date(Date.now() + 40 * HOUR) });

        const alert = (await loadAlerts()).find(item => item.kind === 'coverage_gap');
        expect(alert).toMatchObject({ severity: 'warning' });
        expect(alert.message).toContain('Resta 1 post');
        expect(alert.message).toContain('40h');
    });

    it('stays quiet when the queue reaches far enough ahead', async () => {
        await seedProfile();
        await seedPost();

        expect((await loadAlerts()).some(item => item.kind === 'coverage_gap')).toBe(false);
    });

    // Um rascunho só é cobertura se algo o publicaria sozinho. Sem
    // auto-aprovação a fila está cheia e mesmo assim nada vai ao ar.
    it('does not count drafts as coverage while approval is manual', async () => {
        await seedProfile({
            contentSchedule: { autoGenerationEnabled: true, publishingMode: 'review', autoApproveFallbackEnabled: false, timezone: 'America/Sao_Paulo' }
        });
        await seedPost({ status: 'draft', scheduledFor: new Date(Date.now() + 6 * 24 * HOUR) });

        const alert = (await loadAlerts()).find(item => item.kind === 'coverage_gap');
        expect(alert).toMatchObject({ severity: 'critical', action: 'Revisar conteúdo' });
        expect(alert.message).toContain('1 rascunho aguarda aprovação manual');
    });

    it('counts the same draft as coverage once auto-approval is on', async () => {
        await seedProfile({
            contentSchedule: { autoGenerationEnabled: true, autoApproveFallbackEnabled: true, timezone: 'America/Sao_Paulo' }
        });
        await seedPost({ status: 'draft', scheduledFor: new Date(Date.now() + 6 * 24 * HOUR) });

        expect((await loadAlerts()).some(item => item.kind === 'coverage_gap')).toBe(false);
    });

    // Sem piloto automático a fila vazia é uma escolha, não uma falha.
    it('ignores profiles with the autopilot switched off', async () => {
        await seedProfile({ contentSchedule: { autoGenerationEnabled: false } });

        expect((await loadAlerts()).some(item => item.kind === 'coverage_gap')).toBe(false);
    });
});

describe('slot_collision', () => {
    it('reports two future posts sharing the same instant', async () => {
        await seedProfile();
        const slot = new Date(Date.now() + 5 * 24 * HOUR);
        await seedPost({ scheduledFor: slot, format: 'carousel-premium' });
        await seedPost({ scheduledFor: slot, format: 'carousel-html', status: 'draft' });

        const alert = (await loadAlerts()).find(item => item.kind === 'slot_collision');
        expect(alert).toMatchObject({ severity: 'warning', profileName: 'Fitswap' });
        expect(alert.message).toContain('carousel-premium');
        expect(alert.message).toContain('carousel-html');
    });

    it('does not treat a past duplicate as a pending problem', async () => {
        await seedProfile();
        const past = new Date(Date.now() - 2 * HOUR);
        await seedPost({ scheduledFor: past, format: 'story' });
        await seedPost({ scheduledFor: past, format: 'carousel-premium' });
        await seedPost();

        expect((await loadAlerts()).some(item => item.kind === 'slot_collision')).toBe(false);
    });

    it('keeps distinct times separate', async () => {
        await seedProfile();
        await seedPost({ scheduledFor: new Date(Date.now() + 5 * 24 * HOUR) });
        await seedPost({ scheduledFor: new Date(Date.now() + 5 * 24 * HOUR + 60000) });

        expect((await loadAlerts()).some(item => item.kind === 'slot_collision')).toBe(false);
    });
});

describe('export_failed', () => {
    it('surfaces a carousel whose export failed, with the provider message', async () => {
        await seedProfile();
        await seedPost({
            status: 'draft',
            format: 'carousel-html',
            exportStatus: 'failed',
            errorMessage: "Export error: browserType.launch: Executable doesn't exist at /opt/render/...\nrode npx playwright",
        });

        const alert = (await loadAlerts()).find(item => item.kind === 'export_failed');
        expect(alert).toMatchObject({ severity: 'critical', profileName: 'Fitswap' });
        // Só a primeira linha: o rodapé ASCII do playwright é ilegível num card.
        expect(alert.message).toContain("Executable doesn't exist");
        expect(alert.message).not.toContain('rode npx playwright');
    });

    // Rejeitado é uma decisão já tomada; realertar sobre ele é ruído.
    it('ignores failures on posts that were already rejected', async () => {
        await seedProfile();
        await seedPost({ status: 'rejected', format: 'carousel-html', exportStatus: 'failed' });

        expect((await loadAlerts()).some(item => item.kind === 'export_failed')).toBe(false);
    });
});
