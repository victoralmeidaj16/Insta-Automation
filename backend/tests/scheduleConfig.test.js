import { describe, expect, it } from 'vitest';
import {
    getNextWeekStart,
    getScheduleClock,
    getScheduleWeekKey,
    normalizeScheduleConfig,
    zonedDateTimeToUtc
} from '../src/utils/scheduleConfig.js';

describe('schedule configuration', () => {
    it('maps legacy review mode to automatic generation with human review', () => {
        expect(normalizeScheduleConfig({ autonomyMode: 'review' })).toMatchObject({
            autoGenerationEnabled: true,
            publishingMode: 'review',
            autonomyMode: 'review',
            timezone: 'America/Sao_Paulo'
        });
    });

    it('keeps legacy manual mode disabled', () => {
        expect(normalizeScheduleConfig({ autonomyMode: 'manual' })).toMatchObject({
            autoGenerationEnabled: false,
            publishingMode: 'review',
            autonomyMode: 'manual'
        });
    });

    it('derives the legacy mode from the new independent fields', () => {
        expect(normalizeScheduleConfig({
            autonomyMode: 'manual',
            autoGenerationEnabled: true,
            publishingMode: 'auto'
        }).autonomyMode).toBe('auto');
    });

    it('reads schedule day and time in the configured timezone', () => {
        const instant = new Date('2026-07-20T00:30:00.000Z');
        expect(getScheduleClock(instant, 'America/Sao_Paulo')).toEqual({
            dayName: 'sunday',
            time: '21:30'
        });
    });

    it('uses the local Monday as the weekly idempotency key', () => {
        const instant = new Date('2026-07-20T00:30:00.000Z');
        expect(getScheduleWeekKey(instant, 'America/Sao_Paulo')).toBe('2026-07-13');
    });

    it('normalizes the next week start to Monday midnight in Sao Paulo', () => {
        const saturday = new Date('2026-07-18T15:00:00.000Z');
        expect(getNextWeekStart(saturday, 'America/Sao_Paulo').toISOString())
            .toBe('2026-07-20T03:00:00.000Z');
    });

    it('converts a local scheduled time to its UTC instant', () => {
        expect(zonedDateTimeToUtc({
            year: 2026,
            month: 7,
            day: 20,
            hour: 12,
            minute: 0
        }, 'America/Sao_Paulo').toISOString()).toBe('2026-07-20T15:00:00.000Z');
    });
});
