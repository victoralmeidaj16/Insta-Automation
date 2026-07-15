'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';

interface FailedPost {
    id: string;
    caption?: string;
    format?: string;
    errorMessage?: string;
    updatedAt?: string;
    businessProfileId?: string;
}

const DISMISS_KEY = 'dismissed_failed_posts';

function getDismissed(): Set<string> {
    try {
        const raw = sessionStorage.getItem(DISMISS_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

function saveDismissed(ids: Set<string>) {
    try {
        sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
    } catch {}
}

export default function FailedPostsAlert() {
    const [failedPosts, setFailedPosts] = useState<FailedPost[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const { selectedProfile } = useBusinessProfile();

    useEffect(() => {
        setDismissed(getDismissed());
    }, []);

    useEffect(() => {
        const loadFailed = async () => {
            try {
                const res = await api.get('/api/posts');
                const all: FailedPost[] = res.data.posts || [];
                const failed = all.filter(p => {
                    const isFailed = (p as any).status === 'failed' || (p as any).status === 'error';
                    if (!isFailed) return false;
                    if (selectedProfile && p.businessProfileId !== selectedProfile.id) return false;
                    return true;
                });
                setFailedPosts(failed);
            } catch {
                // silently ignore
            }
        };

        loadFailed();
        const interval = setInterval(loadFailed, 120000);
        return () => clearInterval(interval);
    }, [selectedProfile]);

    const dismiss = (id: string) => {
        const next = new Set(dismissed);
        next.add(id);
        setDismissed(next);
        saveDismissed(next);
    };

    const dismissAll = () => {
        const next = new Set([...dismissed, ...failedPosts.map(p => p.id)]);
        setDismissed(next);
        saveDismissed(next);
    };

    const visible = failedPosts.filter(p => !dismissed.has(p.id));

    if (visible.length === 0) return null;

    return (
        <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: visible.length > 1 ? '0.75rem' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>⚠️</span>
                    <span style={{ fontWeight: 600, color: '#f87171', fontSize: '0.9rem' }}>
                        {visible.length} post{visible.length !== 1 ? 's' : ''} com falha
                    </span>
                </div>
                {visible.length > 1 && (
                    <button
                        onClick={dismissAll}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#71717a',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                        }}
                    >
                        Dispensar todos
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {visible.map(post => (
                    <div
                        key={post.id}
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            background: 'rgba(239, 68, 68, 0.06)',
                            borderRadius: '0.5rem',
                            padding: '0.6rem 0.75rem',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#d4d4d8', fontFamily: 'monospace' }}>
                                {post.format || 'post'} · {post.id.slice(0, 8)}
                            </p>
                            {post.caption && (
                                <p style={{
                                    margin: '0.15rem 0 0',
                                    fontSize: '0.8rem',
                                    color: '#a1a1aa',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {post.caption.slice(0, 80)}
                                </p>
                            )}
                            {post.errorMessage && (
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#f87171' }}>
                                    {post.errorMessage}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => dismiss(post.id)}
                            aria-label="Dispensar"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#52525b',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                lineHeight: 1,
                                padding: '0.1rem 0.25rem',
                                flexShrink: 0,
                            }}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
