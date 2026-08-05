import { render, screen, waitFor, within } from '@testing-library/react';
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

// O dashboard recarrega em [selectedProfile]. Devolver um objeto novo a cada
// render fazia o efeito disparar de novo e multiplicar as chamadas de API — o
// contexto real guarda o perfil em useState, então a referência é estável.
const selectedProfile = { id: 'profile-1', name: 'Perfil Principal' };

vi.mock('@/contexts/BusinessProfileContext', () => ({
    useBusinessProfile: () => ({ selectedProfile }),
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
vi.mock('@/components/FailedPostsAlert', () => ({ default: () => null }));
vi.mock('@/components/OperationalAlerts', () => ({ default: () => null }));
vi.mock('@/components/AutopilotStatusBanner', () => ({ default: () => null }));
vi.mock('@/components/NextWeekValidationWidget', () => ({ default: () => null }));
vi.mock('@/components/ProfileControlMatrix', () => ({ default: () => null }));

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
                        { id: 'post-2', businessProfileId: 'profile-1', status: 'schedule_error' },
                        { id: 'post-3', businessProfileId: 'profile-2', status: 'success' },
                    ],
                },
            })
            .mockResolvedValueOnce({ data: { drafts: [] } });
    });

    it('renders the dashboard with the selected profile filter applied', async () => {
        render(<DashboardPage />);

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Filtrado por: Perfil Principal')).toBeInTheDocument();

        await waitFor(() => {
            expect(mocks.apiGet).toHaveBeenCalledTimes(3);
        });

        expect(mocks.apiGet).toHaveBeenCalledWith('/api/accounts');
        expect(mocks.apiGet).toHaveBeenCalledWith('/api/posts');
        expect(mocks.apiGet).toHaveBeenCalledWith('/api/auto-generate/drafts');

        // O efeito deve rodar uma única vez: se recarregar, as chamadas extras caem
        // fora das respostas mockadas e o catch dispara o toast de erro.
        expect(mocks.apiGet).toHaveBeenCalledTimes(3);
        expect(mocks.toastError).not.toHaveBeenCalled();

        expect(screen.getByText('Ações Rápidas')).toBeInTheDocument();
        expect(screen.getByText(/AI Generator/)).toBeInTheDocument();
        expect(screen.getByText('Posts Status Widget')).toBeInTheDocument();

        const scheduledCard = screen.getByText('Agendados').closest('.card-glass');
        expect(within(scheduledCard).getByText('2')).toBeInTheDocument();
    });
});
