import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findAvailableScheduleSlots, getWeeklySlotCapacity } from '../src/utils/scheduleConfig.js';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

const SCHEDULE = {
    timezone: 'America/Sao_Paulo',
    preferredDays: ['tuesday', 'thursday', 'saturday'],
    preferredTimes: ['09:00', '18:00'],
    storyPreferredDays: ['monday', 'wednesday'],
    storyPreferredTimes: ['08:00']
};

// Segunda-feira, 10:00 em São Paulo.
const MONDAY = new Date('2026-09-07T13:00:00.000Z');

function localLabel(date) {
    return date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

describe('findAvailableScheduleSlots', () => {
    it('devolve os próximos horários do cronograma em ordem cronológica', () => {
        const slots = findAvailableScheduleSlots({ schedule: SCHEDULE, count: 4, from: MONDAY });

        expect(slots.map(slot => slot.toISOString())).toEqual([
            '2026-09-08T12:00:00.000Z', // terça 09:00
            '2026-09-08T21:00:00.000Z', // terça 18:00
            '2026-09-10T12:00:00.000Z', // quinta 09:00
            '2026-09-10T21:00:00.000Z'  // quinta 18:00
        ]);
    });

    it('pula os horários já ocupados em vez de deixar lacuna', () => {
        const taken = new Set([
            new Date('2026-09-08T12:00:00.000Z').getTime(),
            new Date('2026-09-08T21:00:00.000Z').getTime()
        ]);

        const slots = findAvailableScheduleSlots({
            schedule: SCHEDULE,
            count: 2,
            from: MONDAY,
            isSlotTaken: slot => taken.has(slot.getTime())
        });

        expect(slots.map(slot => slot.toISOString())).toEqual([
            '2026-09-10T12:00:00.000Z',
            '2026-09-10T21:00:00.000Z'
        ]);
    });

    it('continua nas semanas seguintes quando a semana enche', () => {
        const slots = findAvailableScheduleSlots({ schedule: SCHEDULE, count: 8, from: MONDAY });

        expect(slots).toHaveLength(8);
        // 6 vagas na semana corrente (ter/qui/sáb × 2 horários); a 7ª cai na terça seguinte.
        expect(slots[6].toISOString()).toBe('2026-09-15T12:00:00.000Z');
        expect(localLabel(slots[6])).toContain('15/09');
    });

    it('ignora o horário do próprio dia que já passou', () => {
        // Terça, 12:00 em São Paulo: o slot das 09:00 já passou.
        const tuesdayNoon = new Date('2026-09-08T15:00:00.000Z');
        const slots = findAvailableScheduleSlots({ schedule: SCHEDULE, count: 1, from: tuesdayNoon });

        expect(slots[0].toISOString()).toBe('2026-09-08T21:00:00.000Z');
    });

    it('respeita a antecedência mínima para não agendar em cima da hora', () => {
        // Terça, 08:55 em São Paulo — faltam 5 minutos para o slot das 09:00.
        const justBefore = new Date('2026-09-08T11:55:00.000Z');
        const slots = findAvailableScheduleSlots({ schedule: SCHEDULE, count: 1, from: justBefore });

        expect(slots[0].toISOString()).toBe('2026-09-08T21:00:00.000Z');
    });

    it('usa os dias e horários de story para conteúdo de story', () => {
        const slots = findAvailableScheduleSlots({ schedule: SCHEDULE, kind: 'story', count: 2, from: MONDAY });

        expect(slots.map(slot => slot.toISOString())).toEqual([
            '2026-09-09T11:00:00.000Z', // quarta 08:00
            '2026-09-14T11:00:00.000Z'  // segunda seguinte 08:00
        ]);
    });

    it('cai para todos os dias às 09:00 quando o cronograma está vazio', () => {
        const slots = findAvailableScheduleSlots({
            schedule: { timezone: 'America/Sao_Paulo', preferredDays: [], preferredTimes: [] },
            count: 2,
            from: MONDAY
        });

        expect(slots.map(slot => slot.toISOString())).toEqual([
            '2026-09-08T12:00:00.000Z',
            '2026-09-09T12:00:00.000Z'
        ]);
    });

    it('não devolve nada quando não há conteúdo a alocar', () => {
        expect(findAvailableScheduleSlots({ schedule: SCHEDULE, count: 0, from: MONDAY })).toEqual([]);
    });
});

describe('getWeeklySlotCapacity', () => {
    it('multiplica dias por horários preferidos', () => {
        expect(getWeeklySlotCapacity(SCHEDULE, 'post')).toBe(6);
        expect(getWeeklySlotCapacity(SCHEDULE, 'story')).toBe(2);
    });
});

describe('alocação de horários com dados do Firestore', () => {
    let firebase;

    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.setSystemTime(MONDAY);
        process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

        firebase = createInMemoryFirebase();
        vi.doMock('../src/config/firebase.js', () => ({
            db: firebase.db,
            storage: firebase.storage,
            auth: {},
            default: {}
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('trata como ocupados apenas os posts futuros e ativos do perfil', async () => {
        const { getReservedSlotTimes } = await import('../src/services/slotAllocationService.js');

        await firebase.db.collection('posts').add({
            businessProfileId: 'profile-1',
            status: 'scheduled',
            scheduledFor: new Date('2026-09-08T12:00:00.000Z')
        });
        await firebase.db.collection('posts').add({
            businessProfileId: 'profile-1',
            status: 'rejected',
            scheduledFor: new Date('2026-09-08T21:00:00.000Z')
        });
        await firebase.db.collection('posts').add({
            businessProfileId: 'profile-2',
            status: 'scheduled',
            scheduledFor: new Date('2026-09-10T12:00:00.000Z')
        });
        await firebase.db.collection('posts').add({
            businessProfileId: 'profile-1',
            status: 'draft',
            scheduledFor: null
        });

        const reserved = await getReservedSlotTimes('profile-1');

        expect([...reserved]).toEqual([new Date('2026-09-08T12:00:00.000Z').getTime()]);
    });

    it('distribui os conteúdos em sequência, sem repetir horário', async () => {
        const { allocateSlotsForKinds } = await import('../src/services/slotAllocationService.js');

        await firebase.db.collection('posts').add({
            businessProfileId: 'profile-1',
            status: 'scheduled',
            scheduledFor: new Date('2026-09-08T12:00:00.000Z')
        });

        const slots = await allocateSlotsForKinds({
            businessProfileId: 'profile-1',
            schedule: SCHEDULE,
            kinds: ['post', 'post', 'story']
        });

        expect(slots.map(slot => slot.toISOString())).toEqual([
            '2026-09-08T21:00:00.000Z', // terça 18:00 (09:00 já está ocupado)
            '2026-09-10T12:00:00.000Z', // quinta 09:00
            '2026-09-09T11:00:00.000Z'  // quarta 08:00 (cronograma de stories)
        ]);
    });

    it('atribui o horário só na aprovação do rascunho', async () => {
        await firebase.db.collection('businessProfiles').doc('profile-1').set({
            userId: 'user-1',
            name: 'Marca Teste',
            contentSchedule: SCHEDULE
        });

        const draftRef = await firebase.db.collection('posts').add({
            userId: 'user-1',
            businessProfileId: 'profile-1',
            isDraft: true,
            status: 'draft',
            type: 'static',
            format: 'static',
            mediaUrls: ['https://storage.test/image.jpg'],
            caption: 'Legenda',
            scheduledFor: null
        });

        const { approveDraftPost } = await import('../src/services/contentGeneratorService.js');
        const approval = await approveDraftPost(draftRef.id, 'account-1', { destination: 'schedule' });

        expect(approval.scheduledFor.toISOString()).toBe('2026-09-08T12:00:00.000Z');
        expect(firebase.getCollection('posts').get(draftRef.id)).toMatchObject({
            isDraft: false,
            status: 'scheduled'
        });
        expect(firebase.getCollection('posts').get(draftRef.id).scheduledFor.toISOString())
            .toBe('2026-09-08T12:00:00.000Z');
    });

    it('não aprova story quando a frequência do perfil está pausada', async () => {
        await firebase.db.collection('businessProfiles').doc('profile-1').set({
            userId: 'user-1',
            name: 'Marca Teste',
            contentSchedule: { ...SCHEDULE, storiesPerWeek: 0 }
        });
        const draftRef = await firebase.db.collection('posts').add({
            userId: 'user-1',
            businessProfileId: 'profile-1',
            isDraft: true,
            status: 'draft',
            type: 'story',
            format: 'story',
            mediaUrls: ['https://storage.test/story.jpg'],
            scheduledFor: null
        });

        const { approveDraftPost } = await import('../src/services/contentGeneratorService.js');
        await expect(approveDraftPost(draftRef.id, 'account-1', { destination: 'schedule' }))
            .rejects.toThrow('Stories pausados');
        expect(firebase.getCollection('posts').get(draftRef.id).isDraft).toBe(true);
    });

    it('dá horários diferentes a rascunhos aprovados em sequência', async () => {
        await firebase.db.collection('businessProfiles').doc('profile-1').set({
            userId: 'user-1',
            name: 'Marca Teste',
            contentSchedule: SCHEDULE
        });

        const baseDraft = {
            userId: 'user-1',
            businessProfileId: 'profile-1',
            isDraft: true,
            status: 'draft',
            type: 'static',
            format: 'static',
            mediaUrls: ['https://storage.test/image.jpg'],
            caption: 'Legenda',
            scheduledFor: null
        };

        const first = await firebase.db.collection('posts').add({ ...baseDraft });
        const second = await firebase.db.collection('posts').add({ ...baseDraft });

        const { approveDraftPost } = await import('../src/services/contentGeneratorService.js');
        const firstApproval = await approveDraftPost(first.id, 'account-1', { destination: 'schedule' });
        const secondApproval = await approveDraftPost(second.id, 'account-1', { destination: 'schedule' });

        expect(firstApproval.scheduledFor.toISOString()).toBe('2026-09-08T12:00:00.000Z');
        expect(secondApproval.scheduledFor.toISOString()).toBe('2026-09-08T21:00:00.000Z');
    });

    it('preserva a data quando o usuário definiu uma manualmente', async () => {
        await firebase.db.collection('businessProfiles').doc('profile-1').set({
            userId: 'user-1',
            name: 'Marca Teste',
            contentSchedule: SCHEDULE
        });

        const manualDate = new Date('2026-09-11T14:30:00.000Z');
        const draftRef = await firebase.db.collection('posts').add({
            userId: 'user-1',
            businessProfileId: 'profile-1',
            isDraft: true,
            status: 'draft',
            type: 'static',
            format: 'static',
            mediaUrls: ['https://storage.test/image.jpg'],
            caption: 'Legenda',
            scheduledFor: manualDate
        });

        const { approveDraftPost } = await import('../src/services/contentGeneratorService.js');
        const approval = await approveDraftPost(draftRef.id, 'account-1', { destination: 'schedule' });

        expect(approval.scheduledFor.toISOString()).toBe(manualDate.toISOString());
    });
});
