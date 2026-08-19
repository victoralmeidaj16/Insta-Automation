import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirebase } from './helpers/inMemoryFirebase.js';

let firebase;
let getAccountsByProfile;
let resolveActiveAccountForProfile;
let upsertUploadPostAccount;

const fitswapProfile = {
    id: 'fitswap-profile',
    name: 'Fitswap',
    userId: 'user-1',
    instagram: {
        username: 'fitswap.app',
        uploadPostUsername: 'fitswap',
        uploadPostApiKey: 'key-123'
    }
};

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
    ({ getAccountsByProfile, resolveActiveAccountForProfile } = await import('../src/services/businessProfileService.js'));
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

describe('resolveActiveAccountForProfile', () => {
    it('materializes the link from the profile config when none exists yet', async () => {
        const account = await resolveActiveAccountForProfile(fitswapProfile);

        expect(account).toMatchObject({
            username: 'fitswap',
            instagramHandle: 'fitswap.app',
            businessProfileId: 'fitswap-profile',
            connectionType: 'upload-post',
            status: 'active',
            isActive: true
        });
        await expect(getAccountsByProfile('fitswap-profile')).resolves.toHaveLength(1);
    });

    it('reuses the existing active link instead of creating another one', async () => {
        const created = await upsertUploadPostAccount('user-1', {
            businessProfileId: 'fitswap-profile',
            profileUsername: 'fitswap'
        });

        const resolved = await resolveActiveAccountForProfile(fitswapProfile);

        expect(resolved.id).toBe(created.id);
        await expect(getAccountsByProfile('fitswap-profile')).resolves.toHaveLength(1);
    });

    it('returns null when the profile has no Upload-Post credentials', async () => {
        const resolved = await resolveActiveAccountForProfile({
            ...fitswapProfile,
            instagram: { username: 'fitswap.app', uploadPostUsername: 'fitswap' }
        });

        expect(resolved).toBeNull();
        await expect(getAccountsByProfile('fitswap-profile')).resolves.toHaveLength(0);
    });

    it('replaces a deactivated link so autopilot keeps working', async () => {
        const created = await upsertUploadPostAccount('user-1', {
            businessProfileId: 'fitswap-profile',
            profileUsername: 'fitswap'
        });
        await firebase.db.collection('accounts').doc(created.id).update({ isActive: false });

        const resolved = await resolveActiveAccountForProfile(fitswapProfile);

        expect(resolved.id).toBe(created.id);
        expect(resolved.isActive).toBe(true);
    });
});
