import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

const client = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn() }));

vi.mock('axios', () => ({
    default: { create: vi.fn(() => client) }
}));

process.env.UPLOAD_POST_API_KEY = process.env.UPLOAD_POST_API_KEY || 'test-key';

const { listUserProfiles, deleteUserProfile } = await import('../src/services/uploadPostService.js');

beforeEach(() => {
    client.get.mockReset();
    client.delete.mockReset();
    axios.create.mockClear();
});

describe('listUserProfiles', () => {
    it('returns the provider profile list', async () => {
        client.get.mockResolvedValue({ data: { profiles: [{ username: 'fitswap' }, { username: 'Tudy' }] } });

        await expect(listUserProfiles()).resolves.toEqual([{ username: 'fitswap' }, { username: 'Tudy' }]);
        expect(client.get).toHaveBeenCalledWith('/uploadposts/users');
    });

    it('returns an empty list when the provider omits the field', async () => {
        client.get.mockResolvedValue({ data: {} });
        await expect(listUserProfiles()).resolves.toEqual([]);
    });
});

describe('deleteUserProfile', () => {
    it('sends the username in the body, which is where the provider expects it', async () => {
        client.delete.mockResolvedValue({ data: { success: true } });

        await expect(deleteUserProfile('Inner_bst')).resolves.toEqual({ success: true });
        expect(client.delete).toHaveBeenCalledWith('/uploadposts/users', { data: { username: 'Inner_bst' } });
    });

    it('refuses to call the provider without a username', async () => {
        await expect(deleteUserProfile('')).rejects.toThrow(/username é obrigatório/);
        expect(client.delete).not.toHaveBeenCalled();
    });

    it('uses the per-profile key when one is given', async () => {
        client.delete.mockResolvedValue({ data: { success: true } });

        await deleteUserProfile('Tudy', 'chave-do-perfil');
        expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Apikey chave-do-perfil' })
        }));
    });

    it('propagates provider failures instead of reporting a phantom deletion', async () => {
        client.delete.mockRejectedValue(new Error('403 Forbidden'));
        await expect(deleteUserProfile('fitswap')).rejects.toThrow('403 Forbidden');
    });
});
