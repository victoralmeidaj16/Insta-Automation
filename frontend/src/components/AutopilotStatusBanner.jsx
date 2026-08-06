'use client';

import Link from 'next/link';
import { getAutopilotSummary } from '@/lib/schedule';

const TONES = {
    on: { accent: '#10b981', wash: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)' },
    partial: { accent: '#38bdf8', wash: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(2, 132, 199, 0.05) 100%)' },
    off: { accent: '#f59e0b', wash: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)' },
};

function Step({ label, detail, on }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span
                aria-hidden="true"
                style={{
                    marginTop: '0.15rem', width: '1rem', height: '1rem', flexShrink: 0, borderRadius: '999px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem',
                    color: '#0b0f17', fontWeight: 900,
                    background: on ? '#10b981' : 'rgba(148, 163, 184, 0.35)',
                }}
            >
                {on ? '✓' : '–'}
            </span>
            <div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: on ? '#f8fafc' : '#94a3b8' }}>
                    {label}
                </p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>{detail}</p>
            </div>
        </div>
    );
}

export default function AutopilotStatusBanner({ selectedProfile }) {
    if (!selectedProfile) return null;

    const { generates, publishes, generationDay, generationTime, leadHours, fullyAutomatic } =
        getAutopilotSummary(selectedProfile);

    const tone = fullyAutomatic ? TONES.on : (generates || publishes) ? TONES.partial : TONES.off;

    // O estado que importa não é "ligado", é se o ciclo fecha sem ninguém.
    const headline = fullyAutomatic
        ? 'Publica sozinho'
        : generates
            ? 'Gera sozinho, mas espera aprovação'
            : publishes
                ? 'Aprova sozinho, mas não gera conteúdo'
                : 'Tudo manual';

    const summary = fullyAutomatic
        ? `${selectedProfile.name} cria a semana e publica sem depender de ninguém.`
        : generates
            ? `${selectedProfile.name} cria os posts sozinho, mas nada é publicado até alguém aprovar na revisão.`
            : publishes
                ? `Nenhum conteúdo novo é criado para ${selectedProfile.name}; a aprovação automática só age sobre o que já existe.`
                : `Nada acontece sozinho para ${selectedProfile.name}: cada post precisa ser criado e aprovado à mão.`;

    return (
        <div
            className="card-glass mb-lg"
            style={{ background: tone.wash, borderLeft: `4px solid ${tone.accent}`, padding: '1.25rem 1.5rem' }}
        >
            <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ fontSize: '1.75rem' }}>{fullyAutomatic ? '🤖' : generates ? '📝' : '⚙️'}</div>
                    <div>
                        <h3 style={{ fontSize: '1.05rem', margin: 0 }}>
                            Piloto Automático: <span style={{ color: tone.accent, fontWeight: 'bold' }}>{headline}</span>
                        </h3>
                        <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: '0.25rem 0 0' }}>{summary}</p>
                    </div>
                </div>

                <Link
                    href="/dashboard/business-profiles"
                    className={fullyAutomatic ? 'btn btn-secondary' : 'btn btn-primary'}
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                >
                    {fullyAutomatic ? '⚙️ Ajustar Configurações' : '⚡ Configurar Piloto Automático'}
                </Link>
            </div>

            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem',
                paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
                <Step
                    on={generates}
                    label="1. Gerar conteúdo"
                    detail={generates
                        ? `Toda ${generationDay} às ${generationTime}, a IA monta a semana seguinte.`
                        : 'Desligado — nenhum post novo é criado automaticamente.'}
                />
                <Step
                    on={publishes}
                    label="2. Aprovar sem revisão"
                    detail={publishes
                        ? `Rascunhos não revisados são aprovados ${leadHours}h antes do horário.`
                        : 'Desligado — sem aprovação manual, o post não vai ao ar.'}
                />
                <Step
                    on={fullyAutomatic}
                    label="3. Publicar no Instagram"
                    detail={fullyAutomatic
                        ? 'O Upload-Post recebe o agendamento assim que o post é aprovado.'
                        : 'Só publica o que passar pelas etapas acima.'}
                />
            </div>
        </div>
    );
}
