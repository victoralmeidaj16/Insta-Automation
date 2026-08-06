import { describe, expect, it } from 'vitest';
import { isAutopilotEnabled, isAutoApproveEnabled } from './schedule';

describe('isAutopilotEnabled', () => {
    it('reads the flag the profile actually stores', () => {
        expect(isAutopilotEnabled({ contentSchedule: { autoGenerationEnabled: true } })).toBe(true);
        expect(isAutopilotEnabled({ contentSchedule: { autoGenerationEnabled: false } })).toBe(false);
    });

    // O banner lia autoGenerateSettings.enabled / autoPostEnabled, que nenhum
    // perfil tem, e por isso anunciava "DESLIGADO" mesmo com o piloto ativo.
    it('ignores the fields the old banner invented', () => {
        expect(isAutopilotEnabled({
            contentSchedule: { autoGenerationEnabled: true },
            autoGenerateSettings: { enabled: false },
            autoPostEnabled: false,
        })).toBe(true);
    });

    it('falls back to the legacy mode when the flag is absent', () => {
        expect(isAutopilotEnabled({ contentSchedule: { autonomyMode: 'manual' } })).toBe(false);
        expect(isAutopilotEnabled({ contentSchedule: { autonomyMode: 'review' } })).toBe(true);
        expect(isAutopilotEnabled({ autonomyMode: 'manual' })).toBe(false);
    });

    it('treats a profile with no schedule as enabled, matching the backend', () => {
        expect(isAutopilotEnabled({})).toBe(true);
    });

    it('survives a missing profile', () => {
        expect(isAutopilotEnabled(null)).toBe(true);
        expect(isAutoApproveEnabled(null)).toBe(false);
    });
});

describe('isAutoApproveEnabled', () => {
    it('requires an explicit opt-in', () => {
        expect(isAutoApproveEnabled({ contentSchedule: { autoApproveFallbackEnabled: true } })).toBe(true);
        expect(isAutoApproveEnabled({ contentSchedule: {} })).toBe(false);
        expect(isAutoApproveEnabled({ contentSchedule: { autoApproveFallbackEnabled: 'sim' } })).toBe(false);
    });
});
