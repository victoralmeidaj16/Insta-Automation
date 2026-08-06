'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function ProfileControlMatrix({ onProfilesUpdated }) {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);
    const [collapsed, setCollapsed] = useState(false);

    const loadProfiles = async () => {
        try {
            const res = await api.get('/api/business-profiles');
            setProfiles(res.data?.profiles || []);
        } catch (error) {
            console.error('Erro ao carregar perfis para matriz de controle:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfiles();
    }, []);

    const handleToggle = async (profile, field, currentValue) => {
        const profileId = profile.id;
        const newValue = !currentValue;
        setUpdatingId(`${profileId}-${field}`);

        const fieldNameLabel = field === 'autoGenerationEnabled' ? 'Piloto Automático' : 'Auto-Aprovação 24h';

        // Optimistic update
        setProfiles(prev => prev.map(p => {
            if (p.id !== profileId) return p;
            const currentSchedule = p.contentSchedule || {};
            return {
                ...p,
                contentSchedule: {
                    ...currentSchedule,
                    [field]: newValue
                }
            };
        }));

        try {
            const currentSchedule = profile.contentSchedule || {};
            await api.put(`/api/business-profiles/${profileId}`, {
                contentSchedule: {
                    ...currentSchedule,
                    [field]: newValue
                }
            });

            toast.success(`${profile.name}: ${fieldNameLabel} ${newValue ? 'ATIVADO ✅' : 'DESATIVADO ⚪'}`);
            if (onProfilesUpdated) onProfilesUpdated();
        } catch (error) {
            console.error(`Erro ao atualizar ${field} do perfil ${profileId}:`, error);
            toast.error(`Falha ao atualizar ${fieldNameLabel} de ${profile.name}`);
            // Revert optimistic update on failure
            loadProfiles();
        } finally {
            setUpdatingId(null);
        }
    };

    if (loading) {
        return (
            <div className="card-glass mb-lg" style={{ padding: '1.5rem', textAlign: 'center', color: '#a1a1aa' }}>
                Carregando Matriz de Controle dos Perfis...
            </div>
        );
    }

    if (profiles.length === 0) {
        return null;
    }

    return (
        <div className="card-glass mb-lg" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: collapsed ? 0 : '1rem' }}>
                <div>
                    <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🎛️ Matriz de Controle de Perfis
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0.25rem 0 0 0' }}>
                        Controle rápido de Piloto Automático e Auto-Aprovação em lote por marca.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setCollapsed(value => !value)}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? 'Expandir Matriz de Controle de Perfis' : 'Recolher Matriz de Controle de Perfis'}
                    title={collapsed ? 'Expandir painel' : 'Recolher painel'}
                    style={{
                        flexShrink: 0, width: '2rem', height: '2rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0, color: '#cbd5e1', background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', cursor: 'pointer',
                        transition: 'background 160ms ease, color 160ms ease'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={collapsed ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'} />
                    </svg>
                </button>
            </div>

            {!collapsed && <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1rem'
            }}>
                {profiles.map(profile => {
                    const schedule = profile.contentSchedule || {};
                    const isAutopilotOn = schedule.autoGenerationEnabled ?? (profile.autonomyMode !== 'manual');
                    const isAutoApproveOn = schedule.autoApproveFallbackEnabled === true;
                    const username = profile.instagram?.username;

                    const isUpdatingAutopilot = updatingId === `${profile.id}-autoGenerationEnabled`;
                    const isUpdatingAutoApprove = updatingId === `${profile.id}-autoApproveFallbackEnabled`;

                    return (
                        <div
                            key={profile.id}
                            style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '0.75rem',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.85rem',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {/* Profile Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <h4 style={{ fontSize: '1rem', margin: 0, fontWeight: '700', color: '#fff' }}>
                                        {profile.name}
                                    </h4>
                                    <p style={{ fontSize: '0.75rem', color: username ? '#a855f7' : '#ef4444', margin: '0.15rem 0 0 0' }}>
                                        {username ? `@${username}` : '⚠️ Sem conta conectada'}
                                    </p>
                                </div>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: 'rgba(124, 58, 237, 0.2)',
                                    color: '#c084fc',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1rem'
                                }}>
                                    🏢
                                </div>
                            </div>

                            <hr style={{ borderColor: 'rgba(255, 255, 255, 0.06)', margin: 0 }} />

                            {/* Toggle 1: Piloto Automático */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#e4e4e7' }}>
                                        🤖 Piloto Automático
                                    </span>
                                    <p style={{ fontSize: '0.7rem', color: '#a1a1aa', margin: 0 }}>
                                        Geração semanal automática
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleToggle(profile, 'autoGenerationEnabled', isAutopilotOn)}
                                    disabled={isUpdatingAutopilot}
                                    style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '20px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        background: isAutopilotOn
                                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                            : 'rgba(255, 255, 255, 0.1)',
                                        color: isAutopilotOn ? '#fff' : '#a1a1aa',
                                        opacity: isUpdatingAutopilot ? 0.6 : 1
                                    }}
                                >
                                    {isUpdatingAutopilot ? '...' : (isAutopilotOn ? 'ON' : 'OFF')}
                                </button>
                            </div>

                            {/* Toggle 2: Auto-Aprovação 24h */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <span style={{ fontSize: '0.825rem', fontWeight: '600', color: '#e4e4e7' }}>
                                        ⚡ Auto-Aprovação 24h
                                    </span>
                                    <p style={{ fontSize: '0.7rem', color: '#a1a1aa', margin: 0 }}>
                                        Agenda rascunhos 24h antes
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleToggle(profile, 'autoApproveFallbackEnabled', isAutoApproveOn)}
                                    disabled={isUpdatingAutoApprove}
                                    style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '20px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        background: isAutoApproveOn
                                            ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
                                            : 'rgba(255, 255, 255, 0.1)',
                                        color: isAutoApproveOn ? '#fff' : '#a1a1aa',
                                        opacity: isUpdatingAutoApprove ? 0.6 : 1
                                    }}
                                >
                                    {isUpdatingAutoApprove ? '...' : (isAutoApproveOn ? 'ON' : 'OFF')}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>}
        </div>
    );
}
