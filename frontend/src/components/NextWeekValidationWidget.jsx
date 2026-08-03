'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function NextWeekValidationWidget({ drafts = [], selectedProfile, onRefresh }) {
    const [approvingId, setApprovingId] = useState(null);
    const [approvingAll, setApprovingAll] = useState(false);

    if (!selectedProfile) return null;

    // Filter drafts for selected profile
    const profileDrafts = drafts.filter(
        d => d.businessProfileId === selectedProfile.id
    );

    if (profileDrafts.length === 0) {
        return (
            <div className="card-glass mb-lg" style={{ padding: '1.5rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#f4f4f5' }}>
                    📅 Validação da Próxima Semana
                </h3>
                <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Nenhum post pendente de revisão para {selectedProfile.name}.
                </p>
                <Link href="/dashboard/generate" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                    ✨ Gerar Novos Rascunhos com IA
                </Link>
            </div>
        );
    }

    const handleApproveSingle = async (postId) => {
        try {
            setApprovingId(postId);
            await api.post(`/api/auto-generate/drafts/${postId}/approve`, {
                destination: 'schedule'
            });
            toast.success('Post aprovado e agendado com sucesso!');
            if (onRefresh) onRefresh();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao aprovar post');
        } finally {
            setApprovingId(null);
        }
    };

    const handleApproveAll = async () => {
        try {
            setApprovingAll(true);
            const res = await api.post('/api/auto-generate/drafts/approve-all-week', {
                businessProfileId: selectedProfile.id
            });
            toast.success(`${res.data.approvedCount} posts da semana aprovados e agendados!`);
            if (onRefresh) onRefresh();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao aprovar semana');
        } finally {
            setApprovingAll(false);
        }
    };

    const formatDate = (rawDate) => {
        if (!rawDate) return 'Sem data definida';
        const dateObj = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
        if (isNaN(dateObj.getTime())) return 'Sem data definida';
        return dateObj.toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="card-glass mb-lg" style={{ padding: '1.5rem' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1.25rem'
                }}
            >
                <div>
                    <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📅 Validar Conteúdo da Próxima Semana
                        <span
                            style={{
                                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                                color: '#f59e0b',
                                fontSize: '0.75rem',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '1rem',
                                fontWeight: 'bold'
                            }}
                        >
                            {profileDrafts.length} pendentes
                        </span>
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: '0.25rem 0 0 0' }}>
                        Revise e aprove os posts gerados para a semana de {selectedProfile.name}.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Link
                        href="/dashboard/review"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
                    >
                        🔍 Central de Revisão Completa
                    </Link>
                    <button
                        onClick={handleApproveAll}
                        disabled={approvingAll}
                        className="btn btn-primary"
                        style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
                    >
                        {approvingAll ? 'Aprovando...' : '🟢 Aprovar Toda a Semana'}
                    </button>
                </div>
            </div>

            {/* Grid de Cards dos Posts */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '1.25rem'
                }}
            >
                {profileDrafts.map((draft) => {
                    const thumbUrl = draft.mediaUrls?.[0] || draft.imageUrl || '/placeholder.png';
                    const isApproving = approvingId === draft.id;

                    return (
                        <div
                            key={draft.id}
                            style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            {/* Media Preview Header */}
                            <div
                                style={{
                                    height: '160px',
                                    backgroundColor: '#18181b',
                                    position: 'relative',
                                    backgroundImage: `url(${thumbUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center'
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '8px',
                                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                                        backdropFilter: 'blur(4px)',
                                        color: '#fff',
                                        fontSize: '0.75rem',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '6px'
                                    }}
                                >
                                    ⏰ {formatDate(draft.scheduledFor)}
                                </div>

                                {draft.format && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            bottom: '8px',
                                            left: '8px',
                                            backgroundColor: 'rgba(59, 130, 246, 0.8)',
                                            color: '#fff',
                                            fontSize: '0.7rem',
                                            padding: '0.15rem 0.4rem',
                                            borderRadius: '4px',
                                            textTransform: 'uppercase',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        {draft.format}
                                    </div>
                                )}
                            </div>

                            {/* Body Info */}
                            <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <p
                                    style={{
                                        fontSize: '0.85rem',
                                        color: '#e4e4e7',
                                        margin: '0 0 1rem 0',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        lineHeight: '1.4'
                                    }}
                                >
                                    {draft.caption || 'Sem legenda gerada.'}
                                </p>

                                <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => handleApproveSingle(draft.id)}
                                        disabled={isApproving}
                                        className="btn btn-primary"
                                        style={{
                                            flex: 1,
                                            fontSize: '0.8rem',
                                            padding: '0.4rem',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {isApproving ? '...' : '🟢 Aprovar'}
                                    </button>
                                    <Link
                                        href={`/dashboard/review?draftId=${draft.id}`}
                                        className="btn btn-secondary"
                                        style={{
                                            fontSize: '0.8rem',
                                            padding: '0.4rem 0.6rem',
                                            textAlign: 'center',
                                            textDecoration: 'none'
                                        }}
                                    >
                                        ✏️ Editar
                                    </Link>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
