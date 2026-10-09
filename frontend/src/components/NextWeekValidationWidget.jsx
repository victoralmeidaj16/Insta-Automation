'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BatchApproveModal from '@/components/BatchApproveModal';
import { countHtmlCarouselSlides, prepareHtmlCarouselPreview } from '@/lib/htmlCarouselPreview';

const draftImages = (draft) => (draft.mediaUrls || []).filter(Boolean).length
    ? draft.mediaUrls.filter(Boolean)
    : (draft.imageUrl ? [draft.imageUrl] : []);

function DraftMedia({ draft, slideIndex = 0 }) {
    const images = draftImages(draft);
    if (draft.htmlContent && !images.length) {
        return (
            <iframe
                srcDoc={prepareHtmlCarouselPreview(draft.htmlContent, slideIndex)}
                sandbox="allow-scripts"
                title="Preview do post"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none', background: '#fff' }}
            />
        );
    }
    const url = images[slideIndex] || images[0];
    if (!url) {
        return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem' }}>Sem mídia</div>;
    }
    return <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
}

function DraftViewer({ draft, onClose, onApprove, isApproving, formatDate }) {
    const [slide, setSlide] = useState(0);
    const images = draftImages(draft);
    const total = images.length || (draft.htmlContent ? countHtmlCarouselSlides(draft.htmlContent) : 1);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') setSlide(i => Math.max(0, i - 1));
            if (e.key === 'ArrowRight') setSlide(i => Math.min(total - 1, i + 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [total, onClose]);

    const navButton = (disabled) => ({
        width: '2.25rem', height: '2.25rem', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
        background: '#1e1e1e', color: '#fff', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
        fontSize: '1rem', flexShrink: 0
    });

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="card-glass"
                style={{ background: '#141414', display: 'flex', gap: '1.5rem', maxWidth: '920px', width: '100%', maxHeight: '90vh', padding: '1.5rem', flexWrap: 'wrap' }}
            >
                <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '100%', maxWidth: '420px', aspectRatio: '4 / 5', borderRadius: '0.75rem', overflow: 'hidden', background: '#18181b' }}>
                        <DraftMedia draft={draft} slideIndex={slide} />
                    </div>
                    {total > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button type="button" aria-label="Slide anterior" disabled={slide === 0} onClick={() => setSlide(i => i - 1)} style={navButton(slide === 0)}>‹</button>
                            <span style={{ color: '#fff', fontSize: '0.85rem' }}>{slide + 1} / {total}</span>
                            <button type="button" aria-label="Próximo slide" disabled={slide === total - 1} onClick={() => setSlide(i => i + 1)} style={navButton(slide === total - 1)}>›</button>
                        </div>
                    )}
                </div>

                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div>
                            <p style={{ margin: 0, color: '#fff', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
                                {draft.format || 'post'}
                            </p>
                            <p style={{ margin: '0.25rem 0 0', color: '#fff', fontSize: '0.9rem' }}>⏰ {formatDate(draft.scheduledFor)}</p>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Fechar" style={{ ...navButton(false), borderRadius: '0.5rem' }}>✕</button>
                    </div>

                    <p style={{ color: '#fff', fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowY: 'auto', margin: '1rem 0', flex: 1 }}>
                        {draft.caption || 'Sem legenda gerada.'}
                    </p>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => onApprove(draft.id)} disabled={isApproving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                            {isApproving ? '...' : 'Aprovar'}
                        </button>
                        <Link href={`/dashboard/review?draftId=${draft.id}`} className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                            ✏️ Editar
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function NextWeekValidationWidget({ drafts = [], selectedProfile, onRefresh }) {
    const [approvingId, setApprovingId] = useState(null);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [viewingDraft, setViewingDraft] = useState(null);

    if (!selectedProfile) return null;

    // Filter drafts for selected profile
    const profileDrafts = drafts.filter(
        d => d.businessProfileId === selectedProfile.id
    );

    if (profileDrafts.length === 0) {
        return (
            <div className="card-glass mb-lg" style={{ padding: '1.5rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#fff' }}>
                    📅 Validação da Próxima Semana
                </h3>
                <p style={{ color: '#fff', fontSize: '0.9rem', marginBottom: '1rem' }}>
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
            setViewingDraft(current => (current?.id === postId ? null : current));
            if (onRefresh) onRefresh();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao aprovar post');
        } finally {
            setApprovingId(null);
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
        <>
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
                                    backgroundColor: 'rgba(255, 255, 255, 0.10)',
                                    color: '#fff',
                                    fontSize: '0.75rem',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '1rem',
                                    fontWeight: 'bold'
                                }}
                            >
                                {profileDrafts.length} pendentes
                            </span>
                        </h2>
                        <p style={{ fontSize: '0.875rem', color: '#fff', margin: '0.25rem 0 0 0' }}>
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
                            onClick={() => setShowBatchModal(true)}
                            className="btn btn-primary"
                            style={{
                                fontSize: '0.85rem',
                                padding: '0.5rem 0.85rem',
                                background: '#3f3f46',
                                fontWeight: '700'
                            }}
                        >
                            ⚡ Aprovar Toda a Semana ({profileDrafts.length})
                        </button>
                    </div>
                </div>

                {/* Grid de Cards dos Posts */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '1.25rem'
                    }}
                >
                    {profileDrafts.map((draft) => {
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
                                {/* Media Preview Header — click opens the post */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Abrir post"
                                    onClick={() => setViewingDraft(draft)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingDraft(draft); } }}
                                    style={{
                                        aspectRatio: '4 / 5',
                                        backgroundColor: '#18181b',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <DraftMedia draft={draft} />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
                                                backgroundColor: 'rgba(255, 255, 255, 0.12)',
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
                                            color: '#fff',
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
                                            {isApproving ? '...' : '✓ Aprovar'}
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

            {viewingDraft && (
                <DraftViewer
                    draft={viewingDraft}
                    onClose={() => setViewingDraft(null)}
                    onApprove={handleApproveSingle}
                    isApproving={approvingId === viewingDraft.id}
                    formatDate={formatDate}
                />
            )}

            <BatchApproveModal
                isOpen={showBatchModal}
                onClose={() => setShowBatchModal(false)}
                profileName={selectedProfile?.name}
                businessProfileId={selectedProfile?.id}
                drafts={drafts}
                onSuccess={onRefresh}
            />
        </>
    );
}
