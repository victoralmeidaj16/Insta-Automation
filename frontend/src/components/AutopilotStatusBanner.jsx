'use client';

import Link from 'next/link';
import { isAutopilotEnabled } from '@/lib/schedule';

export default function AutopilotStatusBanner({ selectedProfile }) {
    const isAutopilotOn = isAutopilotEnabled(selectedProfile);

    if (!selectedProfile) {
        return null;
    }

    return (
        <div
            className="card-glass mb-lg"
            style={{
                background: isAutopilotOn
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)',
                borderLeft: isAutopilotOn ? '4px solid #10b981' : '4px solid #f59e0b',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ fontSize: '1.75rem' }}>
                    {isAutopilotOn ? '🤖' : '⚙️'}
                </div>
                <div>
                    <h3 style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Piloto Automático:
                        <span
                            style={{
                                color: isAutopilotOn ? '#10b981' : '#f59e0b',
                                fontWeight: 'bold',
                            }}
                        >
                            {isAutopilotOn ? 'ATIVADO' : 'DESLIGADO'}
                        </span>
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: '0.25rem 0 0 0' }}>
                        {isAutopilotOn
                            ? `Geração e postagem automática configurada para ${selectedProfile.name}.`
                            : `Ative a geração automática para que a IA crie posts semanais para ${selectedProfile.name}.`}
                    </p>
                </div>
            </div>

            <div>
                <Link
                    href="/dashboard/business-profiles"
                    className={isAutopilotOn ? 'btn btn-secondary' : 'btn btn-primary'}
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                    {isAutopilotOn ? '⚙️ Ajustar Configurações' : '⚡ Configurar Piloto Automático'}
                </Link>
            </div>
        </div>
    );
}
