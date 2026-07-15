'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Scene {
    id: number;
    duration: number;
    description: string;
    on_screen_text?: string;
    voiceover?: string;
    image_prompt: string;
    motion_prompt: string;
    image_status: 'not_started' | 'pending' | 'approved' | 'rejected' | 'regenerating' | 'error';
    video_status: 'pending' | 'generating' | 'done' | 'error';
    image_url: string | null;
    video_url: string | null;
    regen_count: number;
    feedback: string | null;
    video_error?: string;
}

interface ReelProject {
    id: string;
    title: string;
    brand_name: string;
    created_at: string;
    script: string;
    copy_angle?: string;
    caption?: string;
    anchor_prompt: string;
    global_style: string;
    anchor_status: 'not_started' | 'pending' | 'approved' | 'rejected';
    anchor_url: string | null;
    scenes: Scene[];
    final_status: 'pending' | 'rendering' | 'rendered' | 'error';
    final_url: string | null;
    final_has_narration?: boolean;
    narration_status?: 'pending' | 'generating' | 'done' | 'skipped' | 'error';
    narration_url?: string | null;
    narration_error?: string | null;
}

// ─── Status badge helpers ──────────────────────────────────────────────────────
const imageStatusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    not_started: { label: 'Aguardando', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', dot: '#64748b' },
    pending: { label: 'Revisão', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', dot: '#f59e0b' },
    approved: { label: 'Aprovada', color: '#10b981', bg: 'rgba(16,185,129,0.1)', dot: '#10b981' },
    rejected: { label: 'Rejeitada', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', dot: '#ef4444' },
    regenerating: { label: 'Regerando...', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', dot: '#8b5cf6' },
    error: { label: 'Erro', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', dot: '#ef4444' },
};

const videoStatusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Vídeo pendente', color: '#64748b', icon: '⏳' },
    generating: { label: 'Animando...', color: '#8b5cf6', icon: '🎬' },
    done: { label: 'Vídeo pronto', color: '#10b981', icon: '✅' },
    error: { label: 'Erro no vídeo', color: '#ef4444', icon: '❌' },
};

function StatusBadge({ status, type = 'image' }: { status: string; type?: 'image' | 'video' }) {
    const config = type === 'image'
        ? (imageStatusConfig[status] || imageStatusConfig.not_started)
        : (videoStatusConfig[status] || videoStatusConfig.pending);

    if (type === 'image') {
        const cfg = config as typeof imageStatusConfig[string];
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.25rem 0.625rem', borderRadius: '999px',
                background: cfg.bg, color: cfg.color, fontSize: '0.75rem', fontWeight: 600,
            }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.dot }} />
                {cfg.label}
            </span>
        );
    }

    const cfg = config as typeof videoStatusConfig[string];
    return (
        <span style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: 600 }}>
            {cfg.icon} {cfg.label}
        </span>
    );
}

// ─── Anchor card ──────────────────────────────────────────────────────────────
function AnchorCard({
    project,
    onApprove,
    onReject,
    onSavePrompt,
    onRegenerate,
    isLoading,
    isRegenerating,
}: {
    project: ReelProject;
    onApprove: () => void;
    onReject: () => void;
    onSavePrompt: (prompt: string) => void;
    onRegenerate: (prompt: string) => void;
    isLoading: boolean;
    isRegenerating: boolean;
}) {
    const status = project.anchor_status;
    const [promptDraft, setPromptDraft] = useState(project.anchor_prompt || '');

    useEffect(() => {
        setPromptDraft(project.anchor_prompt || '');
    }, [project.id, project.anchor_prompt]);

    const promptChanged = promptDraft.trim() !== (project.anchor_prompt || '').trim();
    const disablePromptActions = isLoading || isRegenerating || !promptDraft.trim();

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.04) 100%)',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>⚓</span>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>Imagem Âncora</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Referência visual mestre da identidade do vídeo</div>
                    </div>
                </div>
                <StatusBadge status={status} type="image" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: project.anchor_url ? '200px 1fr' : '1fr', gap: '1.25rem' }}>
                {project.anchor_url && project.anchor_url.startsWith('http') && (
                    <div style={{ borderRadius: '0.875rem', overflow: 'hidden', aspectRatio: '9/16', maxHeight: '300px' }}>
                        <img
                            src={project.anchor_url}
                            alt="Imagem âncora"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Prompt de identidade visual</div>
                        <textarea
                            value={promptDraft}
                            onChange={e => setPromptDraft(e.target.value)}
                            rows={6}
                            disabled={isLoading || isRegenerating}
                            style={{
                                width: '100%',
                                padding: '0.875rem',
                                borderRadius: '0.875rem',
                                background: 'rgba(0,0,0,0.28)',
                                border: promptChanged ? '1px solid rgba(167,139,250,0.55)' : '1px solid rgba(255,255,255,0.09)',
                                color: '#cbd5e1',
                                fontSize: '0.875rem',
                                lineHeight: 1.55,
                                fontFamily: 'inherit',
                                resize: 'vertical',
                                outline: 'none',
                                boxSizing: 'border-box',
                                opacity: isLoading || isRegenerating ? 0.7 : 1,
                            }}
                        />
                        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                            <button
                                onClick={() => onSavePrompt(promptDraft)}
                                disabled={disablePromptActions || !promptChanged}
                                style={{
                                    padding: '0.55rem 0.875rem',
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(167,139,250,0.35)',
                                    background: promptChanged ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.04)',
                                    color: promptChanged ? '#c4b5fd' : '#64748b',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    cursor: disablePromptActions || !promptChanged ? 'not-allowed' : 'pointer',
                                }}
                            >
                                💾 Salvar Prompt
                            </button>
                            <button
                                onClick={() => onRegenerate(promptDraft)}
                                disabled={disablePromptActions}
                                style={{
                                    padding: '0.55rem 0.875rem',
                                    borderRadius: '0.75rem',
                                    border: 'none',
                                    background: disablePromptActions
                                        ? 'rgba(124,58,237,0.2)'
                                        : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                    color: '#fff',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    cursor: disablePromptActions ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                }}
                            >
                                {isRegenerating ? (
                                    <>
                                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                                        Regenerando...
                                    </>
                                ) : (
                                    <>🔄 Regenerar Imagem</>
                                )}
                            </button>
                        </div>
                    </div>

                    {status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                                onClick={onApprove}
                                disabled={isLoading}
                                style={{
                                    flex: 1, padding: '0.625rem', borderRadius: '0.75rem',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#fff', fontWeight: 700, border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                                    opacity: isLoading ? 0.6 : 1, fontSize: '0.875rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                }}
                            >
                                ✅ Aprovar Âncora
                            </button>
                            <button
                                onClick={onReject}
                                disabled={isLoading}
                                style={{
                                    flex: 1, padding: '0.625rem', borderRadius: '0.75rem',
                                    background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                    fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)',
                                    cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1,
                                    fontSize: '0.875rem',
                                }}
                            >
                                ❌ Rejeitar
                            </button>
                        </div>
                    )}

                    {status === 'approved' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', color: '#10b981', fontWeight: 600 }}>
                            <span>✅ Âncora aprovada — pipeline liberada</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Scene card ───────────────────────────────────────────────────────────────
function SceneCard({
    scene,
    onApprove,
    onReject,
    onRetryVideo,
    onSave,
    onRegenerateImage,
    isLoading,
    isGeneratingImage,
}: {
    scene: Scene;
    onApprove: (id: number) => void;
    onReject: (id: number, feedback: string) => void;
    onRetryVideo: (id: number) => void;
    onSave: (id: number, updates: Partial<Scene>) => void;
    onRegenerateImage: (id: number) => void;
    isLoading: boolean;
    isGeneratingImage: boolean;
}) {
    const [feedback, setFeedback] = useState('');
    const [showFeedback, setShowFeedback] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [draft, setDraft] = useState({
        description: scene.description || '',
        on_screen_text: scene.on_screen_text || '',
        voiceover: scene.voiceover || '',
        image_prompt: scene.image_prompt || '',
        motion_prompt: scene.motion_prompt || '',
        duration: scene.duration === 10 ? 10 : 5,
    });

    useEffect(() => {
        setDraft({
            description: scene.description || '',
            on_screen_text: scene.on_screen_text || '',
            voiceover: scene.voiceover || '',
            image_prompt: scene.image_prompt || '',
            motion_prompt: scene.motion_prompt || '',
            duration: scene.duration === 10 ? 10 : 5,
        });
    }, [scene.id, scene.description, scene.on_screen_text, scene.voiceover, scene.image_prompt, scene.motion_prompt, scene.duration]);

    const handleReject = () => {
        if (!feedback.trim()) {
            toast.error('Digite o feedback para regeneração');
            return;
        }
        onReject(scene.id, feedback.trim());
        setFeedback('');
        setShowFeedback(false);
    };

    const imgStatus = scene.image_status;
    const vidStatus = scene.video_status;
    const editorDisabled = isLoading || isGeneratingImage;
    const editorChanged = draft.description.trim() !== (scene.description || '').trim()
        || draft.on_screen_text.trim() !== (scene.on_screen_text || '').trim()
        || draft.voiceover.trim() !== (scene.voiceover || '').trim()
        || draft.image_prompt.trim() !== (scene.image_prompt || '').trim()
        || draft.motion_prompt.trim() !== (scene.motion_prompt || '').trim()
        || draft.duration !== (scene.duration === 10 ? 10 : 5);

    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '1.25rem', overflow: 'hidden',
            transition: 'border-color 0.2s',
        }}>
            {/* Scene image preview */}
            <div style={{ aspectRatio: '9/16', background: 'rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }}>
                {scene.image_url && scene.image_url.startsWith('http') ? (
                    <img
                        src={scene.image_url}
                        alt={`Cena ${scene.id}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <div style={{
                        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        color: '#475569', fontSize: '0.875rem',
                    }}>
                        {imgStatus === 'not_started' ? (
                            <>
                                <span style={{ fontSize: '2rem' }}>🖼️</span>
                                <span>Imagem não gerada</span>
                            </>
                        ) : imgStatus === 'regenerating' ? (
                            <>
                                <span style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>🔄</span>
                                <span>Regenerando...</span>
                            </>
                        ) : (
                            <>
                                <span style={{ fontSize: '2rem' }}>⏳</span>
                                <span>Gerando imagem...</span>
                            </>
                        )}
                    </div>
                )}

                {/* Overlay badges */}
                <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', right: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{
                        background: 'rgba(0,0,0,0.8)', borderRadius: '0.5rem',
                        padding: '0.25rem 0.5rem', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700,
                    }}>
                        Cena {scene.id} • {scene.duration}s
                    </div>
                    {scene.regen_count > 0 && (
                        <div style={{
                            background: 'rgba(139,92,246,0.8)', borderRadius: '0.5rem',
                            padding: '0.25rem 0.5rem', color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                        }}>
                            Regen #{scene.regen_count}
                        </div>
                    )}
                </div>

                {/* Video status overlay */}
                {scene.image_status === 'approved' && (
                    <div style={{
                        position: 'absolute', bottom: '0.5rem', left: '0.5rem', right: '0.5rem',
                        background: 'rgba(0,0,0,0.85)', borderRadius: '0.75rem', padding: '0.5rem',
                        textAlign: 'center',
                    }}>
                        <StatusBadge status={vidStatus} type="video" />
                    </div>
                )}
            </div>

            {/* Scene info */}
            <div style={{ padding: '1rem' }}>
                <p style={{ color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                    {scene.description}
                </p>

                {(scene.on_screen_text || scene.voiceover) && (
                    <div style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '0.75rem',
                        padding: '0.75rem',
                        marginBottom: '0.75rem',
                    }}>
                        {scene.on_screen_text && (
                            <div style={{ marginBottom: scene.voiceover ? '0.5rem' : 0 }}>
                                <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Texto na tela</div>
                                <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>{scene.on_screen_text}</div>
                            </div>
                        )}
                        {scene.voiceover && (
                            <div>
                                <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Voz / copy</div>
                                <div style={{ color: '#cbd5e1', fontSize: '0.78rem', lineHeight: 1.45 }}>{scene.voiceover}</div>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ marginBottom: '0.75rem' }}>
                    <StatusBadge status={imgStatus} type="image" />
                </div>

                <button
                    onClick={() => setShowEditor(!showEditor)}
                    disabled={editorDisabled}
                    style={{
                        width: '100%',
                        padding: '0.55rem',
                        borderRadius: '0.625rem',
                        background: 'rgba(124,58,237,0.12)',
                        color: '#c4b5fd',
                        fontWeight: 800,
                        border: '1px solid rgba(124,58,237,0.25)',
                        cursor: editorDisabled ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    ✏️ {showEditor ? 'Fechar edição' : 'Editar prompts da cena'}
                </button>

                {showEditor && (
                    <div style={{
                        background: 'rgba(0,0,0,0.24)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '0.875rem',
                        padding: '0.75rem',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.625rem',
                    }}>
                        {[
                            ['description', 'Descrição da cena', 3],
                            ['on_screen_text', 'Texto na tela', 2],
                            ['voiceover', 'Voz / copy', 3],
                            ['image_prompt', 'Prompt da imagem', 5],
                            ['motion_prompt', 'Prompt de movimento', 3],
                        ].map(([key, label, rows]) => (
                            <label key={String(key)} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                                <textarea
                                    value={(draft as any)[key]}
                                    onChange={e => setDraft(prev => ({ ...prev, [key as string]: e.target.value }))}
                                    rows={Number(rows)}
                                    disabled={editorDisabled}
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem',
                                        borderRadius: '0.625rem',
                                        background: 'rgba(15,23,42,0.72)',
                                        border: '1px solid rgba(255,255,255,0.09)',
                                        color: '#e2e8f0',
                                        fontSize: '0.76rem',
                                        lineHeight: 1.45,
                                        resize: 'vertical',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </label>
                        ))}

                        <div>
                            <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                                Duração aceita pelo provider
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {[5, 10].map(duration => (
                                    <button
                                        key={duration}
                                        onClick={() => setDraft(prev => ({ ...prev, duration }))}
                                        disabled={editorDisabled}
                                        style={{
                                            flex: 1,
                                            padding: '0.45rem',
                                            borderRadius: '0.55rem',
                                            border: draft.duration === duration ? '1px solid rgba(167,139,250,0.8)' : '1px solid rgba(255,255,255,0.08)',
                                            background: draft.duration === duration ? 'rgba(124,58,237,0.28)' : 'rgba(255,255,255,0.04)',
                                            color: draft.duration === duration ? '#fff' : '#94a3b8',
                                            fontWeight: 800,
                                            cursor: editorDisabled ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {duration}s
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => onSave(scene.id, draft as Partial<Scene>)}
                                disabled={editorDisabled || !editorChanged || !draft.description.trim() || !draft.image_prompt.trim()}
                                style={{
                                    flex: 1,
                                    minWidth: '130px',
                                    padding: '0.55rem',
                                    borderRadius: '0.625rem',
                                    background: editorChanged ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)',
                                    color: editorChanged ? '#34d399' : '#64748b',
                                    fontWeight: 800,
                                    border: '1px solid rgba(16,185,129,0.25)',
                                    cursor: editorDisabled || !editorChanged ? 'not-allowed' : 'pointer',
                                }}
                            >
                                💾 Salvar cena
                            </button>
                            <button
                                onClick={() => onRegenerateImage(scene.id)}
                                disabled={editorDisabled || editorChanged}
                                style={{
                                    flex: 1,
                                    minWidth: '150px',
                                    padding: '0.55rem',
                                    borderRadius: '0.625rem',
                                    background: editorDisabled || editorChanged ? 'rgba(124,58,237,0.16)' : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                    color: '#fff',
                                    fontWeight: 800,
                                    border: 'none',
                                    cursor: editorDisabled || editorChanged ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {isGeneratingImage ? '⚙️ Regenerando...' : '🔄 Regenerar imagem'}
                            </button>
                        </div>
                        {editorChanged && (
                            <p style={{ margin: 0, color: '#fbbf24', fontSize: '0.7rem' }}>
                                Salve a cena antes de regenerar a imagem.
                            </p>
                        )}
                    </div>
                )}

                {/* Action buttons */}
                {imgStatus === 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {!showFeedback ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => onApprove(scene.id)}
                                    disabled={isLoading}
                                    style={{
                                        flex: 1, padding: '0.5rem', borderRadius: '0.625rem',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: '#fff', fontWeight: 700, border: 'none',
                                        cursor: isLoading ? 'not-allowed' : 'pointer',
                                        opacity: isLoading ? 0.6 : 1, fontSize: '0.8rem',
                                    }}
                                >
                                    ✅ Aprovar
                                </button>
                                <button
                                    onClick={() => setShowFeedback(true)}
                                    disabled={isLoading}
                                    style={{
                                        flex: 1, padding: '0.5rem', borderRadius: '0.625rem',
                                        background: 'rgba(239,68,68,0.12)',
                                        color: '#f87171', fontWeight: 700,
                                        border: '1px solid rgba(239,68,68,0.25)',
                                        cursor: 'pointer', fontSize: '0.8rem',
                                    }}
                                >
                                    ✏️ Feedback
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <textarea
                                    value={feedback}
                                    onChange={e => setFeedback(e.target.value)}
                                    placeholder="Ex: O rosto está distorcido, iluminação muito escura..."
                                    rows={2}
                                    style={{
                                        width: '100%', padding: '0.5rem', borderRadius: '0.625rem',
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#fff', fontSize: '0.8rem', resize: 'none', outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={handleReject}
                                        disabled={isLoading}
                                        style={{
                                            flex: 1, padding: '0.5rem', borderRadius: '0.625rem',
                                            background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                            fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)',
                                            cursor: 'pointer', fontSize: '0.8rem',
                                        }}
                                    >
                                        🔄 Regenerar
                                    </button>
                                    <button
                                        onClick={() => setShowFeedback(false)}
                                        style={{
                                            padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
                                            background: 'transparent', color: '#64748b',
                                            border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Retry video */}
                {imgStatus === 'approved' && vidStatus === 'error' && (
                    <button
                        onClick={() => onRetryVideo(scene.id)}
                        disabled={isLoading}
                        style={{
                            width: '100%', padding: '0.5rem', borderRadius: '0.625rem',
                            background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                            fontWeight: 700, border: '1px solid rgba(139,92,246,0.3)',
                            cursor: 'pointer', fontSize: '0.8rem',
                        }}
                    >
                        🔁 Tentar vídeo novamente
                    </button>
                )}

                {scene.video_error && (
                    <p style={{ color: '#f87171', fontSize: '0.7rem', marginTop: '0.5rem' }}>
                        Erro: {scene.video_error}
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Project list item ────────────────────────────────────────────────────────
function ProjectListItem({
    project,
    isActive,
    onClick,
}: {
    project: any;
    isActive: boolean;
    onClick: () => void;
}) {
    const progress = project.scene_count > 0
        ? Math.round((project.scenes_done / project.scene_count) * 100)
        : 0;

    return (
        <button
            onClick={onClick}
            style={{
                width: '100%', textAlign: 'left', padding: '0.875rem 1rem',
                borderRadius: '0.875rem', border: '1px solid',
                borderColor: isActive ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.06)',
                background: isActive ? 'rgba(124,58,237,0.1)' : 'rgba(15,23,42,0.4)',
                cursor: 'pointer', transition: 'all 0.2s', marginBottom: '0.5rem',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                    {project.title}
                </span>
                <span style={{
                    fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                    background: project.final_status === 'rendered' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.1)',
                    color: project.final_status === 'rendered' ? '#10b981' : '#f59e0b',
                    fontWeight: 600,
                }}>
                    {project.final_status === 'rendered' ? '✅ Pronto' : `${progress}%`}
                </span>
            </div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                {project.brand_name} • {project.scene_count} cenas
            </div>
            <div style={{
                marginTop: '0.5rem', height: '3px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%', borderRadius: '999px', width: `${progress}%`,
                    background: 'linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)',
                    transition: 'width 0.3s',
                }} />
            </div>
        </button>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VideoReelsPage() {
    const { selectedProfile } = useBusinessProfile();

    const [phase, setPhase] = useState<'create' | 'pipeline' | 'final'>('create');
    const [script, setScript] = useState('');
    const [sceneCount, setSceneCount] = useState(4);
    const [isCreating, setIsCreating] = useState(false);
    const [isGeneratingAnchor, setIsGeneratingAnchor] = useState(false);
    const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [isApprovingAnchor, setIsApprovingAnchor] = useState(false);
    const [isApprovingScene, setIsApprovingScene] = useState(false);
    const [isGeneratingScript, setIsGeneratingScript] = useState(false);

    const [activeProject, setActiveProject] = useState<ReelProject | null>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [showProjectList, setShowProjectList] = useState(false);

    const pollRef = useRef<NodeJS.Timeout | null>(null);

    // ─── Fetch project status ────────────────────────────────────────────────
    const refreshProject = useCallback(async (projectId: string) => {
        try {
            const res = await api.get(`/api/video-reels/${projectId}`);
            if (res.data.success) {
                const p = res.data.project as ReelProject;
                setActiveProject(p);

                if (p.final_status === 'rendered') {
                    setPhase('final');
                } else if (p.anchor_status !== 'not_started') {
                    setPhase('pipeline');
                }
            }
        } catch (err) {
            console.error('Error refreshing project:', err);
        }
    }, []);

    const fetchProjects = useCallback(async () => {
        try {
            const res = await api.get('/api/video-reels');
            if (res.data.success) setProjects(res.data.projects);
        } catch (_) { }
    }, []);

    // ─── Auto-load most recent project on mount ──────────────────────────────
    useEffect(() => {
        const init = async () => {
            try {
                const res = await api.get('/api/video-reels');
                if (res.data.success) {
                    const list = res.data.projects as any[];
                    setProjects(list);
                    // Auto-load most recent project that is not yet finished creating
                    const latest = list[0]; // already sorted by created_at desc
                    if (latest) {
                        const projRes = await api.get(`/api/video-reels/${latest.id}`);
                        if (projRes.data.success) {
                            const p = projRes.data.project as ReelProject;
                            setActiveProject(p);
                            if (p.final_status === 'rendered') {
                                setPhase('final');
                            } else if (p.anchor_status !== 'not_started') {
                                setPhase('pipeline');
                            }
                        }
                    }
                }
            } catch (_) { }
        };
        init();
    }, []);

    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!activeProject) return;

        const anchorGenerating = activeProject.anchor_status === 'generating' || activeProject.anchor_status === 'not_started';
        const scenesGeneratingImages = activeProject.scenes?.some(s => s.image_status === 'regenerating' || s.image_status === 'generating');
        const scenesGeneratingVideo = activeProject.scenes?.some(s => s.video_status === 'generating');
        const finalRendering = activeProject.final_status === 'rendering';

        let interval = 0;
        if (anchorGenerating) interval = 5000;
        else if (scenesGeneratingImages) interval = 8000;
        else if (scenesGeneratingVideo) interval = 15000;
        else if (finalRendering) interval = 8000;

        if (interval > 0) {
            pollRef.current = setInterval(() => refreshProject(activeProject.id), interval);
        }

        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [activeProject?.anchor_status, activeProject?.final_status, activeProject?.scenes, refreshProject]);

    useEffect(() => {
        fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Handlers ────────────────────────────────────────────────────────────
    const handleGenerateScriptDescription = async () => {
        setIsGeneratingScript(true);
        try {
            const res = await api.post('/api/video-reels/generate-script', {
                businessProfileId: selectedProfile?.id,
                seed: script.trim(),
                sceneCount,
            });

            setScript(res.data.script || '');
            toast.success(script.trim() ? 'Roteiro aprimorado!' : 'Roteiro gerado!');
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Erro ao gerar roteiro');
        } finally {
            setIsGeneratingScript(false);
        }
    };

    const handleCreateProject = async () => {
        if (!script.trim()) { toast.error('Digite o roteiro do reel'); return; }

        setIsCreating(true);
        try {
            const res = await api.post('/api/video-reels', {
                script: script.trim(),
                businessProfileId: selectedProfile?.id,
                sceneCount,
            });

            const project = res.data.project as ReelProject;
            setActiveProject(project);
            setPhase('pipeline');
            fetchProjects();
            toast.success(`🎬 Projeto "${project.title}" criado!`);

            // Now generate anchor automatically
            setIsGeneratingAnchor(true);
            try {
                const anchorRes = await api.post(`/api/video-reels/${project.id}/generate-anchor`);
                setActiveProject(anchorRes.data.project);
                toast.success('🖼️ Imagem âncora gerada! Revise e aprove.');
            } catch (err: any) {
                toast.error('Erro ao gerar âncora: ' + (err.response?.data?.error || err.message));
            } finally {
                setIsGeneratingAnchor(false);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Erro ao criar projeto');
        } finally {
            setIsCreating(false);
        }
    };

    const handleApproveAnchor = async () => {
        if (!activeProject) return;
        setIsApprovingAnchor(true);
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/approve-anchor`, { approved: true });
            setActiveProject(res.data.project);
            toast.success('✅ Âncora aprovada! Agora gere as cenas.');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro ao aprovar âncora');
        } finally {
            setIsApprovingAnchor(false);
        }
    };

    const handleRejectAnchor = async () => {
        if (!activeProject) return;
        setIsApprovingAnchor(true);
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/approve-anchor`, { approved: false });
            setActiveProject(res.data.project);
            toast.error('❌ Âncora rejeitada. Regere manualmente.');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro ao rejeitar âncora');
        } finally {
            setIsApprovingAnchor(false);
        }
    };

    const handleSaveAnchorPrompt = async (prompt: string) => {
        if (!activeProject) return;
        setIsApprovingAnchor(true);
        try {
            const res = await api.patch(`/api/video-reels/${activeProject.id}/anchor-prompt`, { prompt });
            setActiveProject(res.data.project);
            toast.success('Prompt da âncora salvo.');
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Erro ao salvar prompt');
        } finally {
            setIsApprovingAnchor(false);
        }
    };

    const handleRegenerateAnchor = async (prompt?: string) => {
        if (!activeProject) return;
        setIsGeneratingAnchor(true);
        try {
            let project = activeProject;
            const nextPrompt = prompt?.trim();

            if (nextPrompt && nextPrompt !== activeProject.anchor_prompt.trim()) {
                const promptRes = await api.patch(`/api/video-reels/${activeProject.id}/anchor-prompt`, { prompt: nextPrompt });
                project = promptRes.data.project;
                setActiveProject(project);
            }

            const res = await api.post(`/api/video-reels/${project.id}/generate-anchor`);
            setActiveProject(res.data.project);
            toast.success('🖼️ Nova âncora gerada!');
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Erro ao regenerar âncora');
        } finally {
            setIsGeneratingAnchor(false);
        }
    };

    const handleGenerateScenes = async () => {
        if (!activeProject) return;
        setIsGeneratingScenes(true);
        toast.loading('Gerando imagens de cena...', { id: 'gen-scenes' });
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/generate-scenes`, {}, { timeout: 180000 });
            setActiveProject(res.data.project);
            toast.success('🎨 Cenas geradas! Revise e aprove cada uma.', { id: 'gen-scenes' });
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro ao gerar cenas', { id: 'gen-scenes' });
        } finally {
            setIsGeneratingScenes(false);
        }
    };

    const handleApproveScene = async (sceneId: number) => {
        if (!activeProject) return;
        setIsApprovingScene(true);
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/scenes/${sceneId}/approve`, { approved: true });
            setActiveProject(res.data.project);
            toast.success(`✅ Cena ${sceneId} aprovada! Animando...`);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro ao aprovar cena');
        } finally {
            setIsApprovingScene(false);
        }
    };

    const handleRejectScene = async (sceneId: number, feedback: string) => {
        if (!activeProject) return;
        setIsApprovingScene(true);
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/scenes/${sceneId}/approve`, {
                approved: false,
                feedback,
            });
            setActiveProject(res.data.project);
            toast.success(`🔄 Cena ${sceneId} rejeitada. Regenerando automaticamente...`);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro ao rejeitar cena');
        } finally {
            setIsApprovingScene(false);
        }
    };

    const handleSaveScene = async (sceneId: number, updates: Partial<Scene>) => {
        if (!activeProject) return;
        setIsApprovingScene(true);
        try {
            const res = await api.patch(`/api/video-reels/${activeProject.id}/scenes/${sceneId}`, updates);
            setActiveProject(res.data.project);
            toast.success(`Cena ${sceneId} salva. Dependências atualizadas.`);
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Erro ao salvar cena');
        } finally {
            setIsApprovingScene(false);
        }
    };

    const handleRegenerateSceneImage = async (sceneId: number) => {
        if (!activeProject) return;
        setIsApprovingScene(true);
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/scenes/${sceneId}/generate-image`, {}, { timeout: 180000 });
            setActiveProject(res.data.project);
            toast.success(`Imagem da cena ${sceneId} regenerada para revisão.`);
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Erro ao regenerar imagem da cena');
        } finally {
            setIsApprovingScene(false);
        }
    };

    const handleRetryVideo = async (sceneId: number) => {
        if (!activeProject) return;
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/scenes/${sceneId}/retry-video`);
            setActiveProject(res.data.project);
            toast.success(`🔁 Tentando novamente o vídeo da cena ${sceneId}...`);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro ao tentar novamente');
        }
    };

    const handleMerge = async () => {
        if (!activeProject) return;

        // Only reuse a rendered final if the current backend already added narration.
        if (activeProject.final_status === 'rendered' && activeProject.final_url && activeProject.final_has_narration) {
            setPhase('final');
            return;
        }

        setIsMerging(true);
        toast.loading('Montando vídeo final com narração...', { id: 'merge' });
        try {
            const res = await api.post(`/api/video-reels/${activeProject.id}/merge`, {}, { timeout: 120000 });
            setActiveProject(res.data.project);
            setPhase('final');
            toast.success('🎉 Vídeo final com narração montado com sucesso!', { id: 'merge' });
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Erro na montagem', { id: 'merge' });
        } finally {
            setIsMerging(false);
        }
    };

    // ─── Computed ─────────────────────────────────────────────────────────────
    const alreadyRendered = activeProject?.final_status === 'rendered' && !!activeProject?.final_url && !!activeProject?.final_has_narration;
    const allScenesDone = activeProject?.scenes?.every(s => s.video_status === 'done') ?? false;
    const anchorApproved = activeProject?.anchor_status === 'approved';
    const anyScenePending = activeProject?.scenes?.some(s => s.image_status === 'pending') ?? false;

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{
            minHeight: '100vh',
            background: 'radial-gradient(ellipse at top, rgba(124,58,237,0.06) 0%, transparent 60%), #0a0f1a',
            fontFamily: "'Inter', -apple-system, sans-serif",
            color: '#e2e8f0',
        }}>
            {/* CSS animations */}
            <style dangerouslySetInnerHTML={{ __html: `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
            ` }} />

            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>

                {/* ─── Header ─────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '0.875rem',
                                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem',
                            }}>🎬</div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
                                Reels{' '}
                                <span style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                    IA
                                </span>
                            </h1>
                        </div>
                        <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>
                            Roteiro → Plano → Imagens → Vídeo → Reel final
                            {selectedProfile && (
                                <span style={{ color: '#7c3aed', marginLeft: '0.5rem' }}>
                                    • {selectedProfile.name}
                                </span>
                            )}
                        </p>
                    </div>

                    <button
                        onClick={() => { setShowProjectList(!showProjectList); fetchProjects(); }}
                        style={{
                            padding: '0.625rem 1.25rem', borderRadius: '0.875rem',
                            background: 'rgba(30,42,72,0.7)', border: '1px solid rgba(255,255,255,0.08)',
                            color: '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}
                    >
                        📁 Projetos ({projects.length})
                    </button>
                </div>

                {/* ─── Project list sidebar ────────────────────── */}
                {showProjectList && (
                    <div style={{
                        background: 'rgba(15,23,42,0.8)', borderRadius: '1.25rem',
                        border: '1px solid rgba(255,255,255,0.07)',
                        padding: '1.25rem', marginBottom: '2rem',
                        animation: 'slideUp 0.2s ease-out',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, color: '#e2e8f0', fontWeight: 700, fontSize: '1rem' }}>Projetos Recentes</h3>
                            <button
                                onClick={() => { setActiveProject(null); setPhase('create'); setShowProjectList(false); }}
                                style={{
                                    padding: '0.375rem 0.875rem', borderRadius: '0.625rem',
                                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                    color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                                }}
                            >
                                + Novo Reel
                            </button>
                        </div>
                        {projects.length === 0 ? (
                            <p style={{ color: '#475569', textAlign: 'center', padding: '1rem' }}>Nenhum projeto ainda</p>
                        ) : (
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {projects.map(p => (
                                    <ProjectListItem
                                        key={p.id}
                                        project={p}
                                        isActive={activeProject?.id === p.id}
                                        onClick={() => { refreshProject(p.id); setShowProjectList(false); }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── PHASE 1: Create ─────────────────────────── */}
                {phase === 'create' && !activeProject && (
                    <div style={{ animation: 'slideUp 0.3s ease-out' }}>
                        <div style={{
                            maxWidth: '720px', margin: '0 auto',
                            background: 'linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(15,23,42,0.8) 100%)',
                            borderRadius: '1.5rem', border: '1px solid rgba(124,58,237,0.2)',
                            padding: '2.5rem',
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎬</div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
                                    Novo Reel com IA
                                </h2>
                                <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>
                                    Descreva seu roteiro e a IA gerará um plano de produção completo adaptado para{' '}
                                    <strong style={{ color: '#a78bfa' }}>{selectedProfile?.name || 'sua marca'}</strong>
                                </p>
                            </div>

                            {/* Script textarea */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Roteiro / Descrição
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleGenerateScriptDescription}
                                        disabled={isGeneratingScript || isCreating}
                                        style={{
                                            padding: '0.5rem 0.875rem',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(124,58,237,0.35)',
                                            background: isGeneratingScript
                                                ? 'rgba(124,58,237,0.16)'
                                                : 'linear-gradient(135deg, rgba(124,58,237,0.22) 0%, rgba(167,139,250,0.14) 100%)',
                                            color: '#c4b5fd',
                                            fontSize: '0.78rem',
                                            fontWeight: 800,
                                            cursor: isGeneratingScript || isCreating ? 'not-allowed' : 'pointer',
                                            opacity: isGeneratingScript || isCreating ? 0.65 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                        }}
                                    >
                                        {isGeneratingScript ? (
                                            <>
                                                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                                                Gerando roteiro...
                                            </>
                                        ) : (
                                            <>✨ {script.trim() ? 'Aprimorar Roteiro' : 'Criar Roteiro'}</>
                                        )}
                                    </button>
                                </div>
                                <textarea
                                    value={script}
                                    onChange={e => setScript(e.target.value)}
                                    placeholder={`Ex: ${selectedProfile?.name || 'Nossa marca'} apresenta os 3 benefícios principais do produto, mostrando resultado antes e depois, com depoimento de cliente satisfeito e CTA para link na bio.`}
                                    rows={5}
                                    style={{
                                        width: '100%', padding: '1rem', borderRadius: '1rem',
                                        background: 'rgba(0,0,0,0.3)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#e2e8f0', fontSize: '0.9rem', resize: 'vertical',
                                        outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                                        fontFamily: 'inherit',
                                        transition: 'border-color 0.2s',
                                    }}
                                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                            </div>

                            {/* Scene count */}
                            <div style={{ marginBottom: '2rem' }}>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.625rem' }}>
                                    Número de Cenas
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {[2, 3, 4, 5, 6, 7, 8].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setSceneCount(n)}
                                            style={{
                                                padding: '0.5rem 1rem', borderRadius: '0.75rem',
                                                border: '1px solid',
                                                borderColor: sceneCount === n ? 'transparent' : 'rgba(255,255,255,0.08)',
                                                background: sceneCount === n
                                                    ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                    : 'rgba(15,23,42,0.5)',
                                                color: sceneCount === n ? '#fff' : '#64748b',
                                                fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                                <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                    ≈ {sceneCount * 5}s de vídeo final • {sceneCount} cenas de 5s
                                </p>
                            </div>

                            {/* Profile context preview */}
                            {selectedProfile && (
                                <div style={{
                                    background: 'rgba(124,58,237,0.06)', borderRadius: '0.875rem',
                                    border: '1px solid rgba(124,58,237,0.15)', padding: '1rem',
                                    marginBottom: '1.5rem',
                                }}>
                                    <div style={{ color: '#7c3aed', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Contexto da Marca
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                                        {[
                                            ['Marca', selectedProfile.name],
                                            ['Cor', selectedProfile.branding?.primaryColor],
                                            ['Voz', selectedProfile.aiPreferences?.elevenLabsVoiceId ? 'ElevenLabs Personalizada' : 'Padrão xi-api-key'],
                                            ['Estilo', selectedProfile.branding?.style?.substring(0, 25)],
                                            ['Público', selectedProfile.targetAudience?.substring(0, 25)],
                                        ].filter(([, v]) => v).map(([k, v]) => (
                                            <div key={String(k)} style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                                <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>{k}</span>
                                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleCreateProject}
                                disabled={isCreating || !script.trim()}
                                style={{
                                    width: '100%', padding: '1rem', borderRadius: '1rem',
                                    background: isCreating || !script.trim()
                                        ? 'rgba(124,58,237,0.3)'
                                        : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                    color: '#fff', fontWeight: 800, border: 'none',
                                    fontSize: '1rem', cursor: isCreating || !script.trim() ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                                    letterSpacing: '-0.01em', boxShadow: '0 8px 24px rgba(124,58,237,0.3)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {isCreating ? (
                                    <>
                                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                                        Gerando Plano de Produção...
                                    </>
                                ) : (
                                    <>🎬 Gerar Plano de Produção</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── PHASE 2: Pipeline ───────────────────────── */}
                {(phase === 'pipeline' || (phase !== 'create' && activeProject)) && activeProject && phase !== 'final' && (
                    <div style={{ animation: 'slideUp 0.3s ease-out' }}>

                        {/* Project header */}
                        <div style={{
                            background: 'rgba(15,23,42,0.7)', borderRadius: '1.25rem',
                            border: '1px solid rgba(255,255,255,0.07)',
                            padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
                        }}>
                            <div>
                                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    {activeProject.title}
                                </h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
                                    {activeProject.brand_name} • {activeProject.scenes?.length} cenas
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {/* Regenerate anchor button */}
                                {(activeProject.anchor_status === 'rejected' || activeProject.anchor_status === 'pending') && (
                                    <button
                                        onClick={() => handleRegenerateAnchor()}
                                        disabled={isGeneratingAnchor}
                                        style={{
                                            padding: '0.5rem 1rem', borderRadius: '0.75rem',
                                            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                                            color: '#f59e0b', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
                                            opacity: isGeneratingAnchor ? 0.6 : 1,
                                        }}
                                    >
                                        {isGeneratingAnchor ? '⚙️ Gerando...' : '🔄 Regerar Âncora'}
                                    </button>
                                )}

                                {/* Generate scenes button */}
                                {anchorApproved && (
                                    <button
                                        onClick={handleGenerateScenes}
                                        disabled={isGeneratingScenes}
                                        style={{
                                            padding: '0.5rem 1rem', borderRadius: '0.75rem',
                                            background: isGeneratingScenes
                                                ? 'rgba(124,58,237,0.2)'
                                                : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                            border: 'none', color: '#fff', fontWeight: 700,
                                            cursor: isGeneratingScenes ? 'not-allowed' : 'pointer',
                                            fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        }}
                                    >
                                        {isGeneratingScenes ? (
                                            <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> Gerando...</>
                                        ) : (
                                            '🎨 Gerar Cenas'
                                        )}
                                    </button>
                                )}

                                {/* Merge button */}
                                {allScenesDone && (
                                    <button
                                        onClick={handleMerge}
                                        disabled={isMerging}
                                        style={{
                                            padding: '0.5rem 1rem', borderRadius: '0.75rem',
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            border: 'none', color: '#fff', fontWeight: 800,
                                            cursor: isMerging ? 'not-allowed' : 'pointer',
                                            fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                        }}
                                    >
                                        {isMerging ? (
                                            <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> Montando...</>
                                        ) : (
                                            '🎞️ Montar Vídeo Final'
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {(activeProject.copy_angle || activeProject.caption) && (
                            <div style={{
                                background: 'rgba(15,23,42,0.55)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: '1.25rem',
                                padding: '1.25rem',
                                marginBottom: '1.5rem',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                gap: '1rem',
                            }}>
                                {activeProject.copy_angle && (
                                    <div>
                                        <div style={{ color: '#a78bfa', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                                            Ângulo de Copy
                                        </div>
                                        <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55, margin: 0 }}>
                                            {activeProject.copy_angle}
                                        </p>
                                    </div>
                                )}
                                {activeProject.caption && (
                                    <div>
                                        <div style={{ color: '#a78bfa', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                                            Legenda sugerida
                                        </div>
                                        <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {activeProject.caption}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Generating anchor loader */}
                        {isGeneratingAnchor && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.04) 100%)',
                                border: '1px solid rgba(124,58,237,0.3)',
                                borderRadius: '1.25rem', padding: '2rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                marginBottom: '1.5rem',
                            }}>
                                <span style={{ fontSize: '2rem', animation: 'spin 2s linear infinite', display: 'inline-block' }}>⚙️</span>
                                <div>
                                    <div style={{ color: '#e2e8f0', fontWeight: 700 }}>Gerando imagem âncora...</div>
                                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Criando identidade visual mestre com Gemini AI</div>
                                </div>
                            </div>
                        )}

                        {/* Anchor Card */}
                        {!isGeneratingAnchor && activeProject.anchor_status !== 'not_started' && (
                            <AnchorCard
                                project={activeProject}
                                onApprove={handleApproveAnchor}
                                onReject={handleRejectAnchor}
                                onSavePrompt={handleSaveAnchorPrompt}
                                onRegenerate={handleRegenerateAnchor}
                                isLoading={isApprovingAnchor}
                                isRegenerating={isGeneratingAnchor}
                            />
                        )}

                        {/* Pipeline progress bar */}
                        {activeProject.scenes?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Progresso da Pipeline</span>
                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                        {activeProject.scenes.filter(s => s.video_status === 'done').length} / {activeProject.scenes.length} cenas prontas
                                    </span>
                                </div>
                                <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: '999px',
                                        width: `${activeProject.scenes.length > 0 ? (activeProject.scenes.filter(s => s.video_status === 'done').length / activeProject.scenes.length) * 100 : 0}%`,
                                        background: 'linear-gradient(90deg, #7c3aed 0%, #10b981 100%)',
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Generating scenes loader */}
                        {isGeneratingScenes && (
                            <div style={{
                                background: 'rgba(15,23,42,0.6)', borderRadius: '1.25rem',
                                border: '1px solid rgba(255,255,255,0.07)',
                                padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                marginBottom: '1.5rem',
                            }}>
                                <span style={{ fontSize: '2rem', animation: 'spin 2s linear infinite', display: 'inline-block' }}>🎨</span>
                                <div>
                                    <div style={{ color: '#e2e8f0', fontWeight: 700 }}>Gerando imagens de cena...</div>
                                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Usando âncora como referência visual para consistência</div>
                                </div>
                            </div>
                        )}

                        {/* Scene Grid */}
                        {!isGeneratingScenes && activeProject.scenes?.length > 0 && anchorApproved && (
                            <div>
                                <h3 style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                                    Cenas do Reel
                                </h3>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                    gap: '1rem',
                                }}>
                                    {activeProject.scenes.map(scene => (
                                        <SceneCard
                                            key={scene.id}
                                            scene={scene}
                                            onApprove={handleApproveScene}
                                            onReject={handleRejectScene}
                                            onRetryVideo={handleRetryVideo}
                                            onSave={handleSaveScene}
                                            onRegenerateImage={handleRegenerateSceneImage}
                                            isLoading={isApprovingScene}
                                            isGeneratingImage={scene.image_status === 'regenerating'}
                                        />
                                    ))}
                                </div>

                                {/* Polling indicator */}
                                {activeProject.scenes.some(s => s.video_status === 'generating' || s.image_status === 'regenerating') && (
                                    <div style={{
                                        marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                                        color: '#64748b', fontSize: '0.8rem',
                                    }}>
                                        <span style={{ animation: 'pulse 1.5s ease infinite', display: 'inline-block' }}>●</span>
                                        Atualizando automaticamente a cada 5 segundos...
                                    </div>
                                )}

                                {/* ── MERGE CTA — big and impossible to miss ── */}
                                {allScenesDone && (
                                    <div style={{
                                        marginTop: '2.5rem',
                                        background: alreadyRendered
                                            ? 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(139,92,246,0.06) 100%)'
                                            : 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(5,150,105,0.06) 100%)',
                                        border: `2px solid ${alreadyRendered ? 'rgba(139,92,246,0.4)' : 'rgba(16,185,129,0.4)'}`,
                                        borderRadius: '1.5rem',
                                        padding: '2.5rem',
                                        textAlign: 'center',
                                        animation: 'slideUp 0.4s ease-out',
                                    }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                                            {alreadyRendered ? '🎉' : '🎞️'}
                                        </div>
                                        <h3 style={{
                                            color: alreadyRendered ? '#a78bfa' : '#10b981',
                                            fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.5rem', letterSpacing: '-0.02em'
                                        }}>
                                            {alreadyRendered ? 'Reel já montado!' : 'Todas as cenas prontas!'}
                                        </h3>
                                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                                            {alreadyRendered
                                                ? 'O vídeo final já foi gerado com narração. Clique abaixo para assistir e baixar.'
                                                : `${activeProject.scenes.length} vídeos gerados com sucesso. Clique abaixo para montar o reel final com narração ElevenLabs.`
                                            }
                                        </p>
                                        <button
                                            onClick={handleMerge}
                                            disabled={isMerging}
                                            style={{
                                                padding: '1rem 2.5rem',
                                                borderRadius: '1rem',
                                                background: isMerging
                                                    ? 'rgba(16,185,129,0.3)'
                                                    : alreadyRendered
                                                        ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                border: 'none',
                                                color: '#fff',
                                                fontWeight: 800,
                                                fontSize: '1.1rem',
                                                cursor: isMerging ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                letterSpacing: '-0.01em',
                                                boxShadow: isMerging ? 'none' : alreadyRendered
                                                    ? '0 8px 32px rgba(124,58,237,0.4)'
                                                    : '0 8px 32px rgba(16,185,129,0.4)',
                                                transition: 'all 0.2s',
                                            }}
                                            onMouseEnter={e => { if (!isMerging) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                                        >
                                            {isMerging ? (
                                                <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> Montando vídeo final...</>
                                            ) : alreadyRendered ? (
                                                <>🎬 Ver Reel Final</>
                                            ) : (
                                                <>🎙️ Montar Vídeo com Narração</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── PHASE 3: Final video ────────────────────── */}
                {phase === 'final' && activeProject?.final_url && (
                    <div style={{ animation: 'slideUp 0.3s ease-out', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(15,23,42,0.8) 100%)',
                            border: '1px solid rgba(16,185,129,0.3)', borderRadius: '1.5rem', padding: '2.5rem',
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
                                Reel Pronto!
                            </h2>
                            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
                                {activeProject.title}
                            </p>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginBottom: '1.25rem',
                                padding: '0.45rem 0.75rem',
                                borderRadius: '999px',
                                background: activeProject.final_has_narration ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                                color: activeProject.final_has_narration ? '#10b981' : '#f59e0b',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                            }}>
                                {activeProject.final_has_narration ? '🎙️ Narração ElevenLabs incluída' : '⚠️ Sem narração no arquivo final'}
                            </div>

                            {activeProject.final_url.startsWith('http') && (
                                <div style={{ borderRadius: '1rem', overflow: 'hidden', marginBottom: '1.5rem', aspectRatio: '9/16', maxHeight: '500px' }}>
                                    <video
                                        src={activeProject.final_url}
                                        controls
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                {activeProject.final_url.startsWith('http') && (
                                    <a
                                        href={activeProject.final_url}
                                        download={`${activeProject.title || 'reel'}.mp4`}
                                        style={{
                                            padding: '0.75rem 1.5rem', borderRadius: '0.875rem',
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: '#fff', fontWeight: 700, textDecoration: 'none',
                                            fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                        }}
                                    >
                                        ⬇️ Download MP4
                                    </a>
                                )}
                                <button
                                    onClick={() => { setActiveProject(null); setPhase('create'); setScript(''); }}
                                    style={{
                                        padding: '0.75rem 1.5rem', borderRadius: '0.875rem',
                                        background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
                                        color: '#a78bfa', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                                    }}
                                >
                                    ➕ Novo Reel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
