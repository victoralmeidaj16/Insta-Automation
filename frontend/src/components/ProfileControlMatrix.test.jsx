import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileControlMatrix from './ProfileControlMatrix';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPut: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: mocks.apiGet, put: mocks.apiPut } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const DAY = 86400000;

function isoIn(days) {
    return new Date(Date.now() + days * DAY).toISOString();
}

function dayLabel(days) {
    return new Date(Date.now() + days * DAY).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function mockApi({ profiles = [{ id: 'profile-1', name: 'Fitswap' }], coverage = [] }) {
    mocks.apiGet.mockImplementation(url => {
        if (url === '/api/coverage') return Promise.resolve({ data: { coverage } });
        return Promise.resolve({ data: { profiles } });
    });
}

beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPut.mockReset();
});

describe('ProfileControlMatrix coverage', () => {
    // A pergunta que o painel responde: até que dia a marca está coberta.
    it('shows how far ahead the profile is covered', async () => {
        mockApi({
            coverage: [{
                profileId: 'profile-1', coveredUntil: isoIn(10),
                scheduledCount: 18, pendingCount: 8, pendingCountsAsCovered: true, pendingUntil: null,
            }],
        });

        render(<ProfileControlMatrix />);

        expect(await screen.findByText(dayLabel(10))).toBeInTheDocument();
        expect(screen.getByText(/10 dias à frente/)).toBeInTheDocument();
        // Agendado e auto-aprovado são a mesma promessa, e ambos entram na conta.
        expect(screen.getByText(/18 agendados \+ 8 aprovados automaticamente/)).toBeInTheDocument();
    });

    it('warns that drafts do not count while approval is manual', async () => {
        mockApi({
            coverage: [{
                profileId: 'profile-1', coveredUntil: isoIn(2),
                scheduledCount: 1, pendingCount: 5, pendingCountsAsCovered: false, pendingUntil: isoIn(9),
            }],
        });

        render(<ProfileControlMatrix />);

        expect(await screen.findByText(dayLabel(2))).toBeInTheDocument();
        expect(screen.getByText(/5 aguardando você/)).toBeInTheDocument();
        expect(screen.getByText(new RegExp(`5 rascunhos até ${dayLabel(9)} só publicam se você aprovar`))).toBeInTheDocument();
    });

    it('says the queue is empty instead of inventing a date', async () => {
        mockApi({
            coverage: [{
                profileId: 'profile-1', coveredUntil: null,
                scheduledCount: 0, pendingCount: 0, pendingCountsAsCovered: true, pendingUntil: null,
            }],
        });

        render(<ProfileControlMatrix />);

        expect(await screen.findByText('sem fila')).toBeInTheDocument();
        expect(screen.getByText(/Nenhum post futuro garantido/)).toBeInTheDocument();
    });

    // A cobertura é acessória: sem ela os interruptores ainda têm de funcionar.
    it('still renders the toggles when the coverage request fails', async () => {
        mocks.apiGet.mockImplementation(url => (
            url === '/api/coverage'
                ? Promise.reject(new Error('500'))
                : Promise.resolve({ data: { profiles: [{ id: 'profile-1', name: 'Fitswap' }] } })
        ));

        render(<ProfileControlMatrix />);

        expect(await screen.findByText('Fitswap')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText(/Conteúdo até/)).not.toBeInTheDocument());
    });
});
