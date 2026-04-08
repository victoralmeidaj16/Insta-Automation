import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './page';

const mocks = vi.hoisted(() => ({
    apiGet: vi.fn(),
    routerPush: vi.fn(),
    logout: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('@/lib/api', () => ({
    default: {
        get: mocks.apiGet,
    },
}));

vi.mock('react-hot-toast', () => ({
    default: {
        error: mocks.toastError,
    },
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'user-1' },
        logout: mocks.logout,
    }),
}));

vi.mock('@/contexts/BusinessProfileContext', () => ({
    useBusinessProfile: () => ({
        selectedProfile: {
            id: 'profile-1',
            name: 'Perfil Principal',
        },
    }),
}));

vi.mock('@/components/PageHeader', () => ({
    default: ({ title, subtitle }) => (
        <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
        </div>
    ),
}));

vi.mock('@/components/ProfileSwitcher', () => ({
    default: () => <div>Profile Switcher</div>,
}));

vi.mock('@/components/PostsStatusWidget', () => ({
    default: () => <div>Posts Status Widget</div>,
}));

describe('DashboardPage smoke', () => {
    beforeEach(() => {
        mocks.apiGet.mockReset();
        mocks.toastError.mockReset();
        mocks.apiGet
            .mockResolvedValueOnce({
                data: {
                    accounts: [
                        { id: 'account-1', businessProfileId: 'profile-1' },
                        { id: 'account-2', businessProfileId: 'profile-2' },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: {
                    posts: [
                        { id: 'post-1', businessProfileId: 'profile-1', status: 'pending' },
                        { id: 'post-2', businessProfileId: 'profile-2', status: 'success' },
                    ],
                },
            });
    });

    it('renders the dashboard with the selected profile filter applied', async () => {
        render(<DashboardPage />);

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Filtrado por: Perfil Principal')).toBeInTheDocument();

        await waitFor(() => {
            expect(mocks.apiGet).toHaveBeenCalledTimes(2);
        });

        expect(screen.getByText('Ações Rápidas')).toBeInTheDocument();
        expect(screen.getByText(/AI Generator/)).toBeInTheDocument();
        expect(screen.getByText('Posts Status Widget')).toBeInTheDocument();
    });
});
