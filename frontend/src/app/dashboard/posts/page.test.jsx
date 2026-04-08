import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostsPage from './page';

const mocks = vi.hoisted(() => ({
    apiGet: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
    default: {
        get: mocks.apiGet,
    },
}));

vi.mock('react-hot-toast', () => ({
    default: {
        error: mocks.toastError,
        success: vi.fn(),
    },
}));

vi.mock('@/components/BackButton', () => ({
    default: () => <div>Back Button</div>,
}));

vi.mock('@/components/CalendarView', () => ({
    default: () => <div>Calendar View</div>,
}));

describe('PostsPage smoke', () => {
    beforeEach(() => {
        mocks.apiGet.mockReset();
        mocks.toastError.mockReset();
        mocks.apiGet.mockResolvedValue({
            data: {
                accounts: [
                    { id: 'account-1', username: 'conta_teste', status: 'active' },
                ],
            },
        });
    });

    it('renders the account selection screen', async () => {
        render(<PostsPage />);

        expect(screen.getByText('Selecione uma Conta')).toBeInTheDocument();

        await waitFor(() => {
            expect(mocks.apiGet).toHaveBeenCalledWith('/api/accounts');
        });

        expect(screen.getByText('@conta_teste')).toBeInTheDocument();
        expect(screen.getByText('Todas as Contas')).toBeInTheDocument();
    });
});
