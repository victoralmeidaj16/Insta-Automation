import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;
let buildBusinessProfileUpdates;
let getBusinessProfile;
let getRawBusinessProfile;

beforeEach(async () => {
    vi.resetModules();
    firebase = createInMemoryFirebase();
    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db,
        storage: firebase.storage,
        auth: {},
        default: {}
    }));

    ({
        buildBusinessProfileUpdates,
        getBusinessProfile,
        getRawBusinessProfile
    } = await import('../src/services/businessProfileService.js'));
});

describe('business profile update source', () => {
    it('reads the raw document separately from preset-enriched read models', async () => {
        const ref = await firebase.db.collection('businessProfiles').add({
            userId: 'user-1',
            name: 'Tudy personalizado',
            brandKey: 'tudy',
            brandKit: { coreMessage: 'Mensagem persistida' }
        });

        const raw = await getRawBusinessProfile(ref.id);
        const enriched = await getBusinessProfile(ref.id);

        expect(raw.brandKit).toEqual({ coreMessage: 'Mensagem persistida' });
        expect(raw.brandKit.voice).toBeUndefined();
        expect(enriched.brandKit.voice).toBeTruthy();
    });

    it('merges PUT fields against raw persisted data without materializing preset defaults', () => {
        const raw = {
            userId: 'user-1',
            brandKey: 'tudy',
            brandKit: {
                coreMessage: 'Mensagem persistida',
                toneRules: ['Regra antiga']
            }
        };

        const updates = buildBusinessProfileUpdates(raw, {
            name: 'Novo nome',
            brandKit: {
                toneRules: [],
                voice: 'Voz personalizada'
            }
        });

        expect(updates).toEqual({
            name: 'Novo nome',
            brandKit: {
                coreMessage: 'Mensagem persistida',
                toneRules: [],
                voice: 'Voz personalizada'
            }
        });
        expect(updates.brandKit.copyArchetypes).toBeUndefined();
    });
});
