'use client';

import { useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function BatchApproveModal({
    isOpen,
    onClose,
    profileName,
    businessProfileId,
    drafts = [],
    onSuccess
}) {
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const filteredDrafts = businessProfileId && businessProfileId !== 'all'
        ? drafts.filter(d => d.businessProfileId === businessProfileId)
        : drafts;

    const totalCount = filteredDrafts.length;

    // Breakdown by format
    const carouselsCount = filteredDrafts.filter(d => (d.type || d.format || '').includes('carousel')).length;
    const storiesCount = filteredDrafts.filter(d => (d.type || d.format || '') === 'story' || (d.type || d.format || '') === 'stories').length;
    const staticsCount = filteredDrafts.filter(d => (d.type || d.format || '') === 'static').length;

    const handleConfirm = async () => {
        if (!businessProfileId || businessProfileId === 'all') {
            toast.error('Selecione um perfil específico para aprovar a fila da semana.');
            return;
        }

        setSubmitting(true);
        const toastId = toast.loading(`Aprovando ${totalCount} rascunhos para ${profileName}...`);

        try {
            const res = await api.post('/api/auto-generate/drafts/approve-all-week', {
                businessProfileId
            });

            toast.dismiss(toastId);

            if (res.data?.success) {
                const approvedCount = res.data.approvedCount || totalCount;
                toast.success(`✅ ${approvedCount} rascunhos aprovados! Eles já estão no Calendário.`, { duration: 5000 });
                if (onSuccess) onSuccess();
                onClose();
            } else {
                toast.error('Erro ao aprovar rascunhos.');
            }
        } catch (error) {
            console.error('Erro na aprovação em lote:', error);
            toast.dismiss(toastId);
            toast.error(error?.response?.data?.error || 'Erro ao aprovar rascunhos em lote.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div className="card-glass fade-in" style={{
                maxWidth: '480px',
                width: '100%',
                padding: '2rem',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{
                        fontSize: '1.75rem',
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(109, 40, 217, 0.2) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        ⚡
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.2rem', margin: 0, fontWeight: '700' }}>
                            Aprovação em Lote (1 Clique)
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0.2rem 0 0 0' }}>
                            Perfil: <strong style={{ color: '#c084fc' }}>{profileName || 'Selecionado'}</strong>
                        </p>
                    </div>
                </div>

                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: '600', margin: '0 0 0.75rem 0', color: '#e4e4e7' }}>
                        Conteúdos na fila para aprovar ({totalCount}):
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {carouselsCount > 0 && (
                            <span style={{
                                padding: '0.35rem 0.65rem',
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#c084fc',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                            }}>
                                🎠 {carouselsCount} Carrosséis
                            </span>
                        )}
                        {storiesCount > 0 && (
                            <span style={{
                                padding: '0.35rem 0.65rem',
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                            }}>
                                📖 {storiesCount} Stories
                            </span>
                        )}
                        {staticsCount > 0 && (
                            <span style={{
                                padding: '0.35rem 0.65rem',
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#4ade80',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                            }}>
                                📸 {staticsCount} Imagens
                            </span>
                        )}
                    </div>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                    💡 Ao confirmar, todos os {totalCount} rascunhos passarão para o status <strong style={{ color: '#22c55e' }}>Agendado</strong> e aparecerão na grade do seu <strong>Calendário</strong> imediatamente.
                </p>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={submitting || totalCount === 0}
                        className="btn btn-primary"
                        style={{
                            fontSize: '0.9rem',
                            padding: '0.6rem 1.2rem',
                            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                            fontWeight: '700'
                        }}
                    >
                        {submitting ? 'Aprovando...' : `⚡ Confirmar e Agendar (${totalCount})`}
                    </button>
                </div>
            </div>
        </div>
    );
}
