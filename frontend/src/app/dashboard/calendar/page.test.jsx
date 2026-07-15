import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from './page';

const mocks = vi.hoisted(() => ({
    apiGet: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
    default: {
        get: mocks.apiGet,
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('react-hot-toast', () => ({
    default: {
        error: vi.fn(),
        success: vi.fn(),
        loading: vi.fn(),
    },
}));

vi.mock('@/contexts/BusinessProfileContext', () => ({
    useBusinessProfile: () => ({
        selectedProfile: {
            id: 'profile-1',
            name: 'Perfil Principal',
            instagram: {
                username: 'perfil_teste',
            },
        },
    }),
}));

vi.mock('@/components/BackButton', () => ({
    default: () => <div>Back Button</div>,
}));

vi.mock('@/components/PostsStatusWidget', () => ({
    default: () => <div>Posts Status Widget</div>,
}));

describe('CalendarPage smoke', () => {
    beforeEach(() => {
        mocks.apiGet.mockReset();
        mocks.apiGet.mockImplementation((url) => {
            if (url === '/api/library') {
                return Promise.resolve({ data: [] });
            }

            if (url === '/api/posts') {
                return Promise.resolve({ data: { posts: [] } });
            }

            return Promise.resolve({ data: {} });
        });
    });

    it('renders the calendar view for the selected profile', async () => {
        render(<CalendarPage />);

        expect(screen.getByText('📅 Calendário de Posts')).toBeInTheDocument();
        expect(screen.getByText('Perfil Principal')).toBeInTheDocument();

        await waitFor(() => {
            expect(mocks.apiGet).toHaveBeenCalled();
        });

        expect(screen.getByText('Posts Status Widget')).toBeInTheDocument();
        expect(screen.getByText('Nenhum post marcado como "Pronto" neste perfil. Vá à Library e marque posts como prontos.')).toBeInTheDocument();
    });
});
