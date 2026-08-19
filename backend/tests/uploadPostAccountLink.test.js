import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;
let getAccountsByProfile;
let upsertUploadPostAccount;

beforeEach(async () => {
    vi.resetModules();
    firebase = createInMemoryFirebase();
    vi.doMock('../src/config/firebase.js', () => ({
        db: firebase.db,
        storage: firebase.storage,
        auth: {},
        default: {}
    }));

    ({ upsertUploadPostAccount } = await import('../src/services/accountService.js'));
    ({ getAccountsByProfile } = await import('../src/services/businessProfileService.js'));
});

describe('Upload-Post account link', () => {
    it('creates the active account record required by automatic generation', async () => {
        await upsertUploadPostAccount('user-1', {
            businessProfileId: 'fitswap-profile',
            profileUsername: 'fitswap.app'
        });

        const accounts = await getAccountsByProfile('fitswap-profile');

        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatchObject({
            username: 'fitswap.app',
            businessProfileId: 'fitswap-profile',
            connectionType: 'upload-post',
            platform: 'instagram',
            status: 'active',
            isActive: true
        });
    });

    it('updates the same link instead of creating duplicates', async () => {
        const first = await upsertUploadPostAccount('user-1', {
            businessProfileId: 'fitswap-profile',
            profileUsername: 'fitswap.app'
        });
        const second = await upsertUploadPostAccount('user-1', {
            businessProfileId: 'fitswap-profile',
            profileUsername: 'fitswap.app.br'
        });

        expect(second.id).toBe(first.id);
        await expect(getAccountsByProfile('fitswap-profile')).resolves.toHaveLength(1);
    });
});
