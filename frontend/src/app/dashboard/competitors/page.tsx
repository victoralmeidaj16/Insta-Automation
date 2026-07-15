'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';

// ─── helpers ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011';

function proxyImg(url: string) {
    if (!url) return '';
    return `${API_BASE}/api/competitors/proxy-image?url=${encodeURIComponent(url)}`;
}

function fmtNum(n: number) {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

function fmtDate(iso: string) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
        return iso;
    }
}

function initials(username: string) {
    return (username || '?').slice(0, 2).toUpperCase();
}

function getApiErrorMessage(error: unknown, fallback: string) {
    const maybeAxios = error as {
        response?: { data?: { error?: string; message?: string } };
        message?: string;
    };

    return (
        maybeAxios?.response?.data?.error
        || maybeAxios?.response?.data?.message
        || maybeAxios?.message
        || fallback
    );
}

// ─── types ──────────────────────────────────────────────────────────────────

interface Post {
    id: string;
    type: string;
    caption: string;
    imageUrl: string;
    videoUrl?: string;
    likes: number;
    comments: number;
    videoViews: number | null;
    slideCount: number;
    timestamp: string;
    sourceUrl: string;
    // radar-enriched fields
    ownerUsername?: string;
    outlierScore?: number;
    engagement?: number;
    followers?: number;
}

interface SavedIdea {
    id: string;
    post: Post;
    note: string;
    strategy: string | null;
    concept: string | null;
    enriched: boolean;
    businessProfileId: string;
    createdAt: any;
}

interface CompetitorProfile {
    id: string;
    username: string;
    fullName: string;
    biography: string;
    profilePicUrl: string;
    tag: string;
    followers: number;
    following: number;
    postsCount: number;
    verified: boolean;
    reelsLast30d: number;
    postsLast30d: number;
    avgViews: number;
    avgLikes: number;
    avgComments: number;
    engagementRate: number;
    syncedAt: string;
    createdAt: any;
}

// ─── subcomponents ──────────────────────────────────────────────────────────

function PostCard({ post, onAnalyze, onExtract, onSaveIdea, analysisResult, analyzingId, extractingId, savingIdeaId, savedIdeaIds, selectedProfileId }: {
    post: Post;
    onAnalyze: (p: Post) => void;
    onExtract: (p: Post, deepScan?: boolean) => void;
    onSaveIdea?: (p: Post) => void;
    analysisResult: { id: string; text: string } | null;
    analyzingId: string | null;
    extractingId: string | null;
    savingIdeaId?: string | null;
    savedIdeaIds?: Set<string>;
    selectedProfileId: string | undefined;
}) {
    const [imgFailed, setImgFailed] = useState(false);
    const proxied = proxyImg(post.imageUrl);

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ position: 'relative', aspectRatio: '1/1', background: '#111' }}>
                {post.imageUrl && !imgFailed ? (
                    <img
                        src={proxied}
                        alt="Post"
                        onError={() => setImgFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'rgba(255,255,255,0.25)' }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                        <span style={{ fontSize: '0.7rem' }}>{post.type}</span>
                    </div>
                )}

                {/* type badge */}
                {post.type === 'video' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="12" viewBox="0 0 10 12" fill="white"><path d="M0 0l10 6-10 6z"/></svg>
                    </div>
                )}
                {post.type === 'carousel' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '2px 7px', fontSize: '0.65rem', color: 'white', fontWeight: 700 }}>
                        1/{post.slideCount}
                    </div>
                )}

                {/* open in instagram */}
                {post.sourceUrl && (
                    <a
                        href={post.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir no Instagram"
                        style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.65)', borderRadius: '6px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                )}

                {/* stats bar */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px', background: 'linear-gradient(to top, rgba(0,0,0,0.88), transparent)', display: 'flex', gap: '12px', color: 'white', fontSize: '0.8rem', fontWeight: 600, alignItems: 'center' }}>
                    <span>❤️ {fmtNum(post.likes)}</span>
                    <span>💬 {fmtNum(post.comments)}</span>
                    {post.videoViews != null && <span>👁 {fmtNum(post.videoViews)}</span>}
                </div>
            </div>

            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1, margin: 0 }}>
                    {post.caption || 'Sem legenda'}
                </p>


                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '7px', fontSize: '0.7rem', justifyContent: 'center' }}
                        onClick={() => onAnalyze(post)}
                        disabled={analyzingId === post.id || extractingId === post.id}
                    >
                        {analyzingId === post.id ? '⏳' : '📊 Estratégia'}
                    </button>
                    {post.type === 'video' ? (
                        <button
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '7px', fontSize: '0.7rem', justifyContent: 'center', background: 'linear-gradient(90deg, #ff00cc, #333399)', border: 'none', color: 'white', fontWeight: 700 }}
                            onClick={() => onExtract(post, true)}
                            disabled={!selectedProfileId || extractingId === post.id || analyzingId === post.id}
                        >
                            {extractingId === post.id ? '⏳' : '💎 Raio-X Profundo'}
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '7px', fontSize: '0.7rem', justifyContent: 'center', background: 'rgba(142,68,173,0.2)', border: '1px solid var(--accent-primary)', color: 'white' }}
                            onClick={() => onExtract(post, false)}
                            disabled={!selectedProfileId || extractingId === post.id || analyzingId === post.id}
                        >
                            {extractingId === post.id ? '⏳' : '✨ Extrair Hook'}
                        </button>
                    )}
                </div>
                {onSaveIdea && (
                    <button
                        onClick={() => onSaveIdea(post)}
                        disabled={savingIdeaId === post.id || savedIdeaIds?.has(post.id)}
                        style={{ width: '100%', padding: '7px', fontSize: '0.7rem', background: savedIdeaIds?.has(post.id) ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.08)', border: `1px solid ${savedIdeaIds?.has(post.id) ? 'rgba(234,179,8,0.5)' : 'rgba(234,179,8,0.25)'}`, borderRadius: '8px', color: savedIdeaIds?.has(post.id) ? '#fbbf24' : '#f59e0b', cursor: savedIdeaIds?.has(post.id) ? 'default' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.15s' }}
                    >
                        {savingIdeaId === post.id ? '⏳ Salvando...' : savedIdeaIds?.has(post.id) ? '✅ Salvo nas Ideias' : '💡 Salvar Ideia'}
                    </button>
                )}
            </div>
        </div>
    );
}

function ProfileCard({ profile, onSync, onDelete, onEditTag, onViewPosts, syncing }: {
    profile: CompetitorProfile;
    onSync: () => void;
    onDelete: () => void;
    onEditTag: (tag: string) => void;
    onViewPosts: () => void;
    syncing: boolean;
}) {
    const [editingTag, setEditingTag] = useState(false);
    const [tagValue, setTagValue] = useState(profile.tag || '');
    const [imgFailed, setImgFailed] = useState(false);

    const saveTag = () => {
        setEditingTag(false);
        if (tagValue !== profile.tag) onEditTag(tagValue);
    };

    return (
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                {/* avatar */}
                <div style={{ flexShrink: 0, width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', background: 'rgba(142,68,173,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: '#a78bfa', border: '2px solid rgba(167,139,250,0.3)' }}>
                    {profile.profilePicUrl && !imgFailed ? (
                        <img
                            src={proxyImg(profile.profilePicUrl)}
                            alt={profile.username}
                            onError={() => setImgFailed(true)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <span>{initials(profile.username)}</span>
                    )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            @{profile.username}
                        </span>
                        {profile.verified && <span title="Verificado" style={{ fontSize: '14px' }}>✅</span>}
                    </div>
                    {profile.fullName && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {profile.fullName}
                        </div>
                    )}

                    {/* tag pill / edit */}
                    <div style={{ marginTop: '8px' }}>
                        {editingTag ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input
                                    autoFocus
                                    className="input"
                                    value={tagValue}
                                    onChange={e => setTagValue(e.target.value)}
                                    onBlur={saveTag}
                                    onKeyDown={e => { if (e.key === 'Enter') saveTag(); if (e.key === 'Escape') setEditingTag(false); }}
                                    style={{ fontSize: '0.75rem', padding: '3px 8px', height: '26px', maxWidth: '160px' }}
                                />
                            </div>
                        ) : (
                            <button
                                onClick={() => setEditingTag(true)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '20px', padding: '2px 10px', fontSize: '0.72rem', color: '#a78bfa', cursor: 'pointer' }}
                            >
                                {profile.tag || 'sem categoria'}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* action icons */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                        onClick={onSync}
                        disabled={syncing}
                        title="Sincronizar dados"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: syncing ? 'var(--accent-primary)' : 'var(--text-secondary)', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                    </button>
                    <button
                        onClick={onDelete}
                        title="Remover perfil"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </div>

            {/* stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <StatBox icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} label="SEGUIDORES" value={fmtNum(profile.followers)} />
                <StatBox icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} label="POSTS/DIA" value={(profile.postsLast30d / 30).toFixed(1)} />
                <StatBox icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 17h5"/><path d="M17 7h5"/></svg>} label="REELS/30D" value={String(profile.reelsLast30d)} />
                <StatBox icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>} label="VIS. MÉDIAS" value={fmtNum(profile.avgViews)} />
                <StatBox icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>} label="LIKES MÉDIOS" value={fmtNum(profile.avgLikes)} />
                <StatBox icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} label="ENGAJ. %" value={`${profile.engagementRate}%`} />
            </div>

            {/* footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    Coletado em {fmtDate(profile.syncedAt)}
                </span>
                <button
                    onClick={onViewPosts}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                >
                    Ver conteúdos
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
            </div>
        </div>
    );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', textAlign: 'center' }}>
            {icon}
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
        </div>
    );
}

function renderMarkdownSimple(text: string) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:0.78rem;color:#c4b5fd">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:0.82rem;color:#c4b5fd">$1</h3>')
        .replace(/^- (.+)$/gm, '<li style="margin:2px 0;font-size:0.78rem">$1</li>')
        .replace(/\n/g, '<br/>');
}

function IdeaCard({ idea, onDelete, onNoteChange, onUse }: {
    idea: SavedIdea;
    onDelete: () => void;
    onNoteChange: (note: string) => void;
    onUse: () => void;
}) {
    const [imgFailed, setImgFailed] = useState(false);
    const [note, setNote] = useState(idea.note || '');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [activeSection, setActiveSection] = useState<'strategy' | 'concept' | null>(null);
    const proxied = proxyImg(idea.post.imageUrl);
    const hasStrategy = !!idea.strategy;
    const hasConcept = !!idea.concept;
    const isProcessing = !idea.enriched && !hasStrategy;

    const saveNote = async () => {
        if (note === idea.note) return;
        setIsSavingNote(true);
        try {
            await api.patch(`/api/competitors/ideas/${idea.id}`, { note });
            onNoteChange(note);
        } catch {
            toast.error('Erro ao salvar nota.');
        } finally {
            setIsSavingNote(false);
        }
    };

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* thumbnail */}
            <div style={{ position: 'relative', aspectRatio: '1/1', background: '#111', flexShrink: 0 }}>
                {idea.post.imageUrl && !imgFailed ? (
                    <img
                        src={proxied}
                        alt="Ideia"
                        onError={() => setImgFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                    </div>
                )}

                {/* type badge */}
                {idea.post.type === 'video' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="12" viewBox="0 0 10 12" fill="white"><path d="M0 0l10 6-10 6z"/></svg>
                    </div>
                )}
                {idea.post.type === 'carousel' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '2px 7px', fontSize: '0.65rem', color: 'white', fontWeight: 700 }}>
                        1/{idea.post.slideCount}
                    </div>
                )}

                {/* instagram link */}
                {idea.post.sourceUrl && (
                    <a
                        href={idea.post.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir no Instagram"
                        style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.65)', borderRadius: '6px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                )}

                {/* owner username badge */}
                {idea.post.ownerUsername && (
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.68rem', color: 'white', fontWeight: 600 }}>
                        @{idea.post.ownerUsername}
                    </div>
                )}

                {/* stats bar */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px', background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', display: 'flex', gap: '10px', color: 'white', fontSize: '0.75rem', fontWeight: 600, alignItems: 'center', justifyContent: idea.post.ownerUsername ? 'flex-end' : 'flex-start' }}>
                    <span>❤️ {fmtNum(idea.post.likes)}</span>
                    <span>💬 {fmtNum(idea.post.comments)}</span>
                    {idea.post.videoViews != null && <span>👁 {fmtNum(idea.post.videoViews)}</span>}
                </div>
            </div>

            {/* body */}
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>

                {/* processing indicator */}
                {isProcessing && (
                    <div style={{ fontSize: '0.72rem', color: '#a78bfa', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '8px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                        Gerando análise IA...
                    </div>
                )}

                {/* strategy + concept pills */}
                {(hasStrategy || hasConcept) && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(['strategy', 'concept'] as const).map(sec => {
                            const hasData = sec === 'strategy' ? hasStrategy : hasConcept;
                            if (!hasData) return null;
                            const label = sec === 'strategy' ? '📊 Estratégia' : '✨ Conceito';
                            const isActive = activeSection === sec;
                            return (
                                <button key={sec} onClick={() => setActiveSection(isActive ? null : sec)}
                                    style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${isActive ? 'rgba(167,139,250,0.6)' : 'rgba(167,139,250,0.25)'}`, background: isActive ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.08)', color: isActive ? '#c4b5fd' : '#a78bfa', transition: 'all 0.15s' }}>
                                    {label} {isActive ? '▲' : '▼'}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* expanded section content */}
                {activeSection === 'strategy' && hasStrategy && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '10px', lineHeight: 1.6, maxHeight: '200px', overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdownSimple(idea.strategy!) }} />
                )}
                {activeSection === 'concept' && hasConcept && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '10px', lineHeight: 1.6, maxHeight: '200px', overflowY: 'auto' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdownSimple(idea.concept!) }} />
                )}

                <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notas</label>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        onBlur={saveNote}
                        placeholder="Descreva como adaptar esse post para o seu negócio..."
                        rows={2}
                        style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.5, outline: 'none', fontFamily: 'inherit' }}
                        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                    />
                    {isSavingNote && <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>Salvando...</div>}
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                    <button
                        className="btn btn-primary"
                        onClick={onUse}
                        style={{ flex: 1, padding: '8px', fontSize: '0.75rem', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(142,68,173,0.6), rgba(142,68,173,0.3))', border: '1px solid var(--accent-primary)' }}
                    >
                        🚀 Usar no Gerador
                    </button>
                    <button
                        onClick={onDelete}
                        title="Remover ideia"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', padding: '8px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>

                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                    Salvo em {fmtDate(idea.createdAt?.toDate ? idea.createdAt.toDate().toISOString() : idea.createdAt)}
                </div>
            </div>
        </div>
    );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function CompetitorsPage() {
    const { selectedProfile } = useBusinessProfile();
    const router = useRouter();
    const [tab, setTab] = useState<'explore' | 'profiles' | 'radar' | 'ideas'>('explore');

    // radar state
    const [isLoadingRadar, setIsLoadingRadar] = useState(false);
    const [radarPosts, setRadarPosts] = useState<Post[]>([]);
    const [radarDays, setRadarDays] = useState<number>(7);
    const [radarLimit, setRadarLimit] = useState<number>(10);

    // explore state
    const [searchQuery, setSearchQuery] = useState('');
    const [limit, setLimit] = useState(12);
    const [days, setDays] = useState<number | null>(null);
    const [postType, setPostType] = useState('all');
    const [sortBy, setSortBy] = useState<'recent' | 'likes' | 'comments' | 'views' | 'engagement'>('recent');
    const [isLoading, setIsLoading] = useState(false);
    const [posts, setPosts] = useState<Post[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [extractingId, setExtractingId] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<{ id: string; text: string } | null>(null);

    // load recent searches
    useEffect(() => {
        try {
            const saved = localStorage.getItem('insta_competitor_history');
            if (saved) setRecentSearches(JSON.parse(saved));
        } catch { }
    }, []);

    // profiles state
    const [profiles, setProfiles] = useState<CompetitorProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
    const [addUsername, setAddUsername] = useState('');
    const [addTag, setAddTag] = useState('');
    const [isAddingProfile, setIsAddingProfile] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    // ideas state
    const [ideas, setIdeas] = useState<SavedIdea[]>([]);
    const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
    const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);
    const savedIdeaIds = new Set(ideas.map(i => i.post.id).filter(Boolean));

    // load profiles
    const loadProfiles = useCallback(async () => {
        if (!selectedProfile?.id) return;
        setIsLoadingProfiles(true);
        try {
            const res = await api.get(`/api/competitors/profiles?businessProfileId=${selectedProfile.id}`);
            if (res.data.success) setProfiles(res.data.profiles);
        } catch {
            toast.error('Erro ao carregar perfis de referência.');
        } finally {
            setIsLoadingProfiles(false);
        }
    }, [selectedProfile?.id]);

    const loadIdeas = useCallback(async () => {
        if (!selectedProfile?.id) return;
        setIsLoadingIdeas(true);
        try {
            const res = await api.get(`/api/competitors/ideas?businessProfileId=${selectedProfile.id}`);
            if (res.data.success) setIdeas(res.data.ideas);
        } catch {
            toast.error('Erro ao carregar ideias.');
        } finally {
            setIsLoadingIdeas(false);
        }
    }, [selectedProfile?.id]);

    // Load ideas count on mount so badge shows immediately
    useEffect(() => {
        loadIdeas();
    }, [loadIdeas]);

    useEffect(() => {
        if (tab === 'profiles') loadProfiles();
        if (tab === 'ideas') loadIdeas();
    }, [tab, loadProfiles, loadIdeas]);

    // ── explore handlers ────────────────────────────────────────────────────

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            toast.error('Informe um nome de usuário ou URL do Instagram.');
            return;
        }
        setIsLoading(true);
        setPosts([]);
        setAnalysisResult(null);
        try {
            const cleanUser = searchQuery.split('?')[0].replace(/\/$/, "").replace(/^@/, "").replace(/^.*instagram\.com\//, "");
            const newHistory = [cleanUser, ...recentSearches.filter(u => u !== cleanUser)].slice(0, 10);
            setRecentSearches(newHistory);
            localStorage.setItem('insta_competitor_history', JSON.stringify(newHistory));

            const response = await api.post('/api/competitors/fetch', {
                username: cleanUser,
                limit,
                days
            }, { timeout: 150000 });
            if (response.data.success) {
                setPosts(response.data.posts);
                if (response.data.posts.length === 0) {
                    toast.error(`Nenhum post público encontrado para @${cleanUser}.`);
                } else {
                    toast.success(`${response.data.posts.length} posts carregados!`);
                }
            }
        } catch (error: unknown) {
            toast.error(getApiErrorMessage(error, 'Erro ao carregar dados do concorrente.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleRadar = async () => {
        if (!selectedProfile?.id) {
            toast.error('Selecione um projeto primeiro.');
            return;
        }
        setIsLoadingRadar(true);
        setRadarPosts([]);
        setAnalysisResult(null);
        try {
            const response = await api.post('/api/competitors/radar', {
                businessProfileId: selectedProfile.id,
                limitPerUser: radarLimit,
                days: radarDays
            }, { timeout: 300000 }); // 5 minutes timeout for heavy batch
            if (response.data.success) {
                setRadarPosts(response.data.posts);
                if (response.data.posts.length === 0) {
                    toast.error(response.data.message || 'Nenhum post retornado.');
                } else {
                    toast.success(`Radar escaneou ${response.data.posts.length} posts na sua bolha!`);
                }
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao processar radar global.');
        } finally {
            setIsLoadingRadar(false);
        }
    };

    const handleAnalyze = async (post: Post) => {
        setAnalyzingId(post.id);
        setAnalysisResult(null);
        try {
            const res = await api.post('/api/competitors/analyze', { post });
            if (res.data.success) setAnalysisResult({ id: post.id, text: res.data.analysis });
        } catch (error: any) {
            toast.error(error.message || 'Erro ao analisar post.');
        } finally {
            setAnalyzingId(null);
        }
    };

    const handleExtract = async (post: Post, deepScan: boolean = false) => {
        if (!selectedProfile) {
            toast.error('Selecione um projeto/perfil no menu lateral primeiro.');
            return;
        }
        setExtractingId(post.id);
        const toastId = deepScan ? toast.loading('Baixando MP4 e transcrevendo via Gemini (Pode demorar 1-2 min)...') : toast.loading('Extraindo hook...');
        try {
            const res = await api.post('/api/competitors/concept', { post, businessProfileId: selectedProfile.id, deepScan }, { timeout: deepScan ? 240000 : 45000 });
            if (res.data.success) {
                // Update local ideas state
                if (res.data.updated) {
                    setIdeas(prev => prev.map(i => i.id === res.data.ideaId ? { ...i, ...res.data.idea } : i));
                } else if (res.data.idea) {
                    setIdeas(prev => [res.data.idea, ...prev]);
                }
                toast.success(deepScan ? '💎 Raio-X salvo nas Ideias!' : '✨ Hook extraído e salvo nas Ideias!', { id: toastId });
                setTab('ideas');
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao extrair conceito.', { id: toastId });
        } finally {
            setExtractingId(null);
            setTimeout(() => toast.dismiss(toastId), 3000);
        }
    };

    // ── profile handlers ─────────────────────────────────────────────────────

    const handleAddProfile = async () => {
        if (!addUsername.trim()) { toast.error('Informe o @username.'); return; }
        if (!selectedProfile?.id) { toast.error('Selecione um perfil de negócio.'); return; }
        setIsAddingProfile(true);
        const toastId = toast.loading(`Coletando dados de @${addUsername.replace(/^@/, '')}... (~30s)`);
        try {
            const res = await api.post('/api/competitors/profiles', {
                businessProfileId: selectedProfile.id,
                username: addUsername,
                tag: addTag,
            }, { timeout: 180000 });
            if (res.data.success) {
                setProfiles(prev => [res.data.profile, ...prev]);
                setAddUsername('');
                setAddTag('');
                setShowAddForm(false);
                toast.success(`@${res.data.profile.username} adicionado!`, { id: toastId });
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao adicionar perfil.', { id: toastId });
        } finally {
            setIsAddingProfile(false);
        }
    };

    const handleSync = async (profileId: string) => {
        setSyncingId(profileId);
        const toastId = toast.loading('Sincronizando dados...');
        try {
            const res = await api.post(`/api/competitors/profiles/${profileId}/sync`, {}, { timeout: 180000 });
            if (res.data.success) {
                setProfiles(prev => prev.map(p => p.id === profileId ? res.data.profile : p));
                toast.success('Dados sincronizados!', { id: toastId });
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao sincronizar.', { id: toastId });
        } finally {
            setSyncingId(null);
        }
    };

    const handleDelete = async (profileId: string, username: string) => {
        if (!confirm(`Remover @${username} da sua lista de referências?`)) return;
        try {
            await api.delete(`/api/competitors/profiles/${profileId}`);
            setProfiles(prev => prev.filter(p => p.id !== profileId));
            toast.success('Perfil removido.');
        } catch (error: any) {
            toast.error(error.message || 'Erro ao remover.');
        }
    };

    const handleEditTag = async (profileId: string, tag: string) => {
        try {
            await api.patch(`/api/competitors/profiles/${profileId}`, { tag });
            setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, tag } : p));
        } catch {
            toast.error('Erro ao salvar categoria.');
        }
    };

    const handleViewPosts = (username: string) => {
        setSearchQuery(username);
        setTab('explore');
    };

    // ── ideas handlers ───────────────────────────────────────────────────────

    const handleSaveIdea = async (post: Post) => {
        if (!selectedProfile?.id) {
            toast.error('Selecione um projeto primeiro.');
            return;
        }
        setSavingIdeaId(post.id);
        try {
            const res = await api.post('/api/competitors/ideas', {
                businessProfileId: selectedProfile.id,
                post,
                note: '',
            });
            if (res.data.success) {
                setIdeas(prev => [res.data.idea, ...prev]);
                toast.success('💡 Ideia salva! Veja na aba Ideias.');
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao salvar ideia.');
        } finally {
            setSavingIdeaId(null);
        }
    };

    const handleDeleteIdea = async (ideaId: string) => {
        if (!confirm('Remover esta ideia?')) return;
        try {
            await api.delete(`/api/competitors/ideas/${ideaId}`);
            setIdeas(prev => prev.filter(i => i.id !== ideaId));
            toast.success('Ideia removida.');
        } catch (error: any) {
            toast.error(error.message || 'Erro ao remover ideia.');
        }
    };

    const handleIdeaNoteChange = (ideaId: string, note: string) => {
        setIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, note } : i));
    };

    const handleUseIdea = (idea: SavedIdea) => {
        const text = idea.note || idea.post.caption || '';
        router.push(`/dashboard/generate?description=${encodeURIComponent(text)}`);
    };

    // ─── render ──────────────────────────────────────────────────────────────

    return (
        <div style={{ padding: 'var(--spacing-lg)', maxWidth: '1400px', margin: '0 auto' }}>
            {/* page title */}
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: '4px' }}>
                    <span style={{ fontSize: '28px' }}>🕵️</span>
                    Espião de Competidores
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    Analise concorrentes e acompanhe referências de mercado.
                </p>
            </div>

            {/* tab bar */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--spacing-lg)', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px', width: 'fit-content', flexWrap: 'wrap' }}>
                {(['explore', 'profiles', 'radar', 'ideas'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '7px',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            transition: 'all 0.15s',
                            background: tab === t ? 'var(--accent-primary)' : 'transparent',
                            color: tab === t ? '#fff' : 'var(--text-secondary)',
                            position: 'relative',
                        }}
                    >
                        {t === 'explore' ? '🔍 Espionar Conta' : t === 'profiles' ? '📋 Perfis de Referência' : t === 'radar' ? '📡 Radar Global' : '💡 Ideias Salvas'}
                        {t === 'ideas' && ideas.length > 0 && (
                            <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#f59e0b', color: '#000', borderRadius: '50%', width: '16px', height: '16px', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{ideas.length > 99 ? '99+' : ideas.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Explore tab ──────────────────────────────────────────────── */}
            {tab === 'explore' && (
                <>
                    <div className="card" style={{ marginBottom: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1 1 300px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>URL ou Usuário do Instagram</label>
                                <input
                                    className="input"
                                    placeholder="@username ou https://instagram.com/..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                    disabled={isLoading}
                                />
                            </div>
                            <div style={{ flex: '0 1 120px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Quantidade</label>
                                <select className="input" value={limit} onChange={e => setLimit(Number(e.target.value))} disabled={isLoading}>
                                    <option value={6}>Últimos 6 posts</option>
                                    <option value={12}>Últimos 12 posts</option>
                                    <option value={24}>Últimos 24 posts</option>
                                    <option value={36}>Últimos 36 posts</option>
                                    <option value={100}>Todos/Ilimitado</option>
                                </select>
                            </div>
                            <div style={{ flex: '0 1 130px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Período</label>
                                <select className="input" value={days === null ? 'all' : String(days)} onChange={e => setDays(e.target.value === 'all' ? null : Number(e.target.value))} disabled={isLoading}>
                                    <option value="all">Sempre</option>
                                    <option value="7">Últimos 7 dias</option>
                                    <option value="30">Últimos 30 dias</option>
                                    <option value="90">Últimos 90 dias</option>
                                </select>
                            </div>
                            <div style={{ flex: '0 1 120px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Tipo</label>
                                <select className="input" value={postType} onChange={e => setPostType(e.target.value)} disabled={isLoading}>
                                    <option value="all">Todos</option>
                                    <option value="image">Estático</option>
                                    <option value="carousel">Carrossel</option>
                                    <option value="video">Reels (Vídeo)</option>
                                </select>
                            </div>
                            <div style={{ flex: '0 1 150px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Ordenar Por</label>
                                <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value as any)} disabled={isLoading}>
                                    <option value="recent">Mais Recentes</option>
                                    <option value="likes">Mais Curtidas</option>
                                    <option value="comments">Mais Comentários</option>
                                    <option value="views">Mais Visualizações</option>
                                    <option value="engagement">Mais Engajamento</option>
                                </select>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleSearch}
                                disabled={isLoading || !searchQuery.trim()}
                                style={{ whiteSpace: 'nowrap', minWidth: '140px', justifyContent: 'center', height: '46px' }}
                            >
                                {isLoading ? '⏳ Buscando...' : 'Investigar'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                                ⚠️ Pode levar até 60s. Buscas recentes de 24h carregam instantaneamente.
                            </p>
                        </div>
                        
                        {recentSearches.length > 0 && (
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Buscas Recentes:</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {recentSearches.map(user => (
                                        <button
                                            key={user}
                                            onClick={() => { setSearchQuery(user); }}
                                            style={{
                                                background: 'rgba(142,68,173,0.1)',
                                                border: '1px solid rgba(142,68,173,0.3)',
                                                borderRadius: '20px',
                                                padding: '4px 12px',
                                                fontSize: '0.75rem',
                                                color: '#d8b4fe',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                            }}
                                        >
                                            <span style={{ fontSize: '0.65rem' }}>🕒</span> @{user}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {isLoading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-secondary)', gap: '12px' }}>
                            <div style={{ fontSize: '40px' }} className="animate-spin">⏳</div>
                            <p>Infiltrando no Instagram de forma indetectável...</p>
                        </div>
                    )}

                    {!isLoading && posts.length > 0 && (
                        <div className="grid grid-4">
                            {posts
                                .filter(p => postType === 'all' || p.type === postType)
                                .sort((a, b) => {
                                    if (sortBy === 'likes') return (b.likes || 0) - (a.likes || 0);
                                    if (sortBy === 'comments') return (b.comments || 0) - (a.comments || 0);
                                    if (sortBy === 'views') return (b.videoViews || 0) - (a.videoViews || 0);
                                    if (sortBy === 'engagement') return ((b.likes || 0) + (b.comments || 0)) - ((a.likes || 0) + (a.comments || 0));
                                    // default recent
                                    return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
                                })
                                .map(post => (
                                <PostCard
                                    key={post.id}
                                    post={post}
                                    onAnalyze={handleAnalyze}
                                    onExtract={handleExtract}
                                    onSaveIdea={handleSaveIdea}
                                    analysisResult={analysisResult}
                                    analyzingId={analyzingId}
                                    extractingId={extractingId}
                                    savingIdeaId={savingIdeaId}
                                    savedIdeaIds={savedIdeaIds}
                                    selectedProfileId={selectedProfile?.id}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Radar Global tab ────────────────────────────────────────── */}
            {tab === 'radar' && (
                <>
                    <div className="card" style={{ marginBottom: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 min-content' }}>
                                <h3 style={{ margin: 0, marginBottom: '8px', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Radar Viral Global 📡</h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    Vasculhe <strong style={{color: 'var(--accent-primary)'}}>todos os seus perfis de referência</strong> de uma só vez e descubra os posts absolutos que mais viralizaram na sua bolha.
                                </p>
                            </div>
                            <div style={{ flex: '0 1 140px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Por Perfil</label>
                                <select className="input" value={radarLimit} onChange={e => setRadarLimit(Number(e.target.value))} disabled={isLoadingRadar}>
                                    <option value={5}>Últimos 5</option>
                                    <option value={10}>Últimos 10</option>
                                    <option value={20}>Últimos 20</option>
                                </select>
                            </div>
                            <div style={{ flex: '0 1 140px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Período</label>
                                <select className="input" value={radarDays} onChange={e => setRadarDays(Number(e.target.value))} disabled={isLoadingRadar}>
                                    <option value={7}>Últimos 7 dias</option>
                                    <option value={15}>Últimos 15 dias</option>
                                    <option value={30}>Últimos 30 dias</option>
                                </select>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleRadar}
                                disabled={isLoadingRadar || profiles.length === 0}
                                style={{ minWidth: '180px', justifyContent: 'center', height: '46px', fontSize: '0.9rem' }}
                            >
                                {isLoadingRadar ? '⏳ Varrilagem...' : 'Iniciar Radar'}
                            </button>
                        </div>
                        {profiles.length === 0 && (
                            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--error-color)' }}>
                                Você não possui nenhum <strong>Perfil de Referência</strong> salvo para usar o Radar.
                            </div>
                        )}
                    </div>

                    {isLoadingRadar && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-secondary)', gap: '12px' }}>
                            <div style={{ fontSize: '40px' }} className="animate-spin">📡</div>
                            <p style={{ textAlign: 'center' }}>
                                Escaneando a rede... Extraindo dados de <strong style={{color:'var(--accent-primary)'}}>{profiles.length} concorrentes</strong> de uma só vez.<br/>
                                <span style={{fontSize: '0.8em', color: 'var(--text-tertiary)'}}>Isativo e profundo: Pode levar até 2-3 minutos.</span>
                            </p>
                        </div>
                    )}

                    {!isLoadingRadar && radarPosts.length > 0 && (
                        <div className="grid grid-4">
                            {radarPosts
                                // Default sorting for radar is highest outlier/engagement globally
                                .sort((a, b) => (b.outlierScore || b.engagement || 0) - (a.outlierScore || a.engagement || 0))
                                .map((post, index) => (
                                <div key={post.id} style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: '-10px', left: '-10px', background: index < 3 ? 'gold' : 'var(--accent-primary)', color: index < 3 ? '#000' : '#fff', padding: '4px 10px', borderRadius: '20px', fontWeight: 800, fontSize: '0.9rem', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                                        #{index + 1}
                                    </div>
                                    <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', zIndex: 10, border: '1px solid rgba(255,255,255,0.2)' }}>
                                        @{post.ownerUsername}
                                    </div>
                                    <PostCard
                                        post={post}
                                        onAnalyze={handleAnalyze}
                                        onExtract={handleExtract}
                                        onSaveIdea={handleSaveIdea}
                                        analysisResult={analysisResult}
                                        analyzingId={analyzingId}
                                        extractingId={extractingId}
                                        savingIdeaId={savingIdeaId}
                                        savedIdeaIds={savedIdeaIds}
                                        selectedProfileId={selectedProfile?.id}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Profiles tab ─────────────────────────────────────────────── */}
            {tab === 'profiles' && (
                <>
                    {/* add profile button + form */}
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        {!showAddForm ? (
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowAddForm(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Adicionar Perfil de Referência
                            </button>
                        ) : (
                            <div className="card" style={{ padding: 'var(--spacing-lg)', maxWidth: '520px' }}>
                                <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Novo Perfil de Referência</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>@Username ou URL do Instagram *</label>
                                        <input
                                            className="input"
                                            placeholder="@username"
                                            value={addUsername}
                                            onChange={e => setAddUsername(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleAddProfile()}
                                            disabled={isAddingProfile}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Categoria / Tag (opcional)</label>
                                        <input
                                            className="input"
                                            placeholder="ex: concorrente, referência, parceiro..."
                                            value={addTag}
                                            onChange={e => setAddTag(e.target.value)}
                                            disabled={isAddingProfile}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleAddProfile}
                                            disabled={isAddingProfile || !addUsername.trim()}
                                            style={{ flex: 1, justifyContent: 'center' }}
                                        >
                                            {isAddingProfile ? '⏳ Coletando dados...' : 'Adicionar'}
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => { setShowAddForm(false); setAddUsername(''); setAddTag(''); }}
                                            disabled={isAddingProfile}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                    {isAddingProfile && (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                            Coletando dados via Apify... isso leva ~30–60 segundos.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* profiles grid */}
                    {isLoadingProfiles ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-secondary)', gap: '12px' }}>
                            <div className="animate-spin">⏳</div> Carregando perfis...
                        </div>
                    ) : profiles.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                            <p style={{ fontSize: '1.05rem', marginBottom: '8px' }}>Nenhum perfil de referência ainda</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Adicione concorrentes ou referências para monitorar seus stats.</p>
                        </div>
                    ) : (
                        <div className="grid grid-3">
                            {profiles.map(profile => (
                                <ProfileCard
                                    key={profile.id}
                                    profile={profile}
                                    onSync={() => handleSync(profile.id)}
                                    onDelete={() => handleDelete(profile.id, profile.username)}
                                    onEditTag={tag => handleEditTag(profile.id, tag)}
                                    onViewPosts={() => handleViewPosts(profile.username)}
                                    syncing={syncingId === profile.id}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Ideas tab ─────────────────────────────────────────────────── */}
            {tab === 'ideas' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                                💡 Ideias Salvas
                                {ideas.length > 0 && <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{ideas.length} {ideas.length === 1 ? 'ideia' : 'ideias'}</span>}
                            </h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                Posts espionados que você salvou como inspiração. Adicione um conceito e envie direto ao Gerador.
                            </p>
                        </div>
                        {ideas.length > 0 && (
                            <button
                                className="btn btn-primary"
                                onClick={() => setTab('explore')}
                                style={{ fontSize: '0.82rem', padding: '8px 18px' }}
                            >
                                + Espionar e Salvar Mais
                            </button>
                        )}
                    </div>

                    {isLoadingIdeas ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-secondary)', gap: '12px' }}>
                            <div className="animate-spin">⏳</div> Carregando ideias...
                        </div>
                    ) : ideas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
                            <div style={{ fontSize: '52px', marginBottom: '16px' }}>💡</div>
                            <p style={{ fontSize: '1.05rem', marginBottom: '8px' }}>Nenhuma ideia salva ainda</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
                                Explore contas concorrentes e clique em <strong style={{ color: '#f59e0b' }}>💡 Salvar Ideia</strong> nos posts que te inspirarem.
                            </p>
                            <button
                                className="btn btn-primary"
                                onClick={() => setTab('explore')}
                                style={{ fontSize: '0.85rem' }}
                            >
                                🔍 Ir para Espionar Conta
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-4">
                            {ideas.map(idea => (
                                <IdeaCard
                                    key={idea.id}
                                    idea={idea}
                                    onDelete={() => handleDeleteIdea(idea.id)}
                                    onNoteChange={note => handleIdeaNoteChange(idea.id, note)}
                                    onUse={() => handleUseIdea(idea)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            <style jsx global>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            {/* Analysis Modal */}
            {analysisResult && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-lg)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }} onClick={() => setAnalysisResult(null)} />
                    <div style={{ position: 'relative', width: '100%', maxWidth: '650px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', background: '#0e0e11', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(to right, rgba(142,68,173,0.1), transparent)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', margin: 0, color: '#fff', fontWeight: 700 }}>
                                <span style={{ fontSize: '1.3rem' }}>✨</span> Estratégia do Post
                            </h3>
                            <button onClick={() => setAnalysisResult(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                        <div 
                            style={{ padding: '30px 24px', overflowY: 'auto', flex: 1, fontSize: '0.98rem', color: '#e2e8f0', lineHeight: 1.7 }}
                            dangerouslySetInnerHTML={{ 
                                __html: analysisResult.text
                                    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent-primary); font-size:1.05em; font-weight:700;">$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em style="color:#cbd5e1;">$1</em>')
                                    .replace(/^- (.*)$/gm, '<li style="margin-left:20px; list-style-type:none; position:relative;"><span style="position:absolute; left:-15px; color:var(--accent-primary);">•</span>$1</li>')
                                    .replace(/\n\n/g, '<br/><br/>')
                                    .replace(/(?!>)\n(?!<)/g, '<br/>')
                            }} 
                        />
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
                            <button className="btn btn-primary" onClick={() => setAnalysisResult(null)} style={{ padding: '10px 28px', fontSize: '0.95rem', fontWeight: 600 }}>
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
