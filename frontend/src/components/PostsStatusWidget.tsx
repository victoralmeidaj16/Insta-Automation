'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';

interface PostStats {
    todayScheduled: number;
    todayPublished: number;
    nextPostTime: string | null;
    totalPending: number;
}

export default function PostsStatusWidget() {
    const [stats, setStats] = useState<PostStats>({
        todayScheduled: 0,
        todayPublished: 0,
        nextPostTime: null,
        totalPending: 0
    });
    const [loading, setLoading] = useState(true);
    const { selectedProfile } = useBusinessProfile();

    useEffect(() => {
        const loadStats = async () => {
            try {
                const res = await api.get('/api/posts', {
                    params: selectedProfile ? { businessProfileId: selectedProfile.id } : undefined
                });
                const allPosts = res.data.posts || [];
                const posts = selectedProfile
                    ? allPosts.filter(p => p.businessProfileId === selectedProfile.id)
                    : allPosts;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const todayScheduled = posts.filter(p => {
                    if (!p.scheduledFor) return false;
                    const postDate = new Date(p.scheduledFor);
                    postDate.setHours(0, 0, 0, 0);
                    return postDate.getTime() === today.getTime()
                        && ['scheduled', 'pending', 'schedule_error'].includes(p.status);
                }).length;

                const todayPublished = posts.filter(p => {
                    const sourceDate = p.postedAt || p.executedAt;
                    if (!sourceDate) return false;
                    const postDate = new Date(sourceDate);
                    postDate.setHours(0, 0, 0, 0);
                    return postDate.getTime() === today.getTime() && p.status === 'success';
                }).length;

                const futurePosts = posts
                    .filter(p => p.scheduledFor
                        && new Date(p.scheduledFor) > new Date()
                        && ['scheduled', 'pending'].includes(p.status))
                    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

                const nextPostTime = futurePosts.length > 0
                    ? new Date(futurePosts[0].scheduledFor).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    : null;

                setStats({
                    todayScheduled,
                    todayPublished,
                    nextPostTime,
                    totalPending: posts.filter(p => ['scheduled', 'pending', 'schedule_error'].includes(p.status)).length
                });
            } catch (error) {
                console.error('Error loading stats:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();

        // Refresh every 60 seconds
        const interval = setInterval(loadStats, 60000);
        return () => clearInterval(interval);
    }, [selectedProfile]);

    if (loading) {
        return (
            <div style={{
                padding: '1rem',
                background: '#25292F',
                border: '1px solid rgba(245, 245, 245, 0.08)',
                borderRadius: '0.75rem',
                minWidth: '200px'
            }}>
                <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'rgba(245, 245, 245, 0.55)' }}>Carregando...</span>
                </div>
            </div>
        );
    }

    return (
        <Link
            href="/dashboard/calendar"
            style={{
                textDecoration: 'none',
                display: 'block'
            }}
        >
            <div style={{
                padding: '1rem',
                background: '#25292F',
                border: '1px solid rgba(245, 245, 245, 0.08)',
                borderRadius: '0.75rem',
                minWidth: '200px',
                cursor: 'pointer',
                transition: 'all 0.2s',
            }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#25292F';
                    e.currentTarget.style.borderColor = 'rgba(245, 245, 245, 0.3)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#25292F';
                    e.currentTarget.style.borderColor = 'rgba(245, 245, 245, 0.08)';
                }}
            >
                <h3 style={{
                    fontSize: '0.875rem',
                    color: 'rgba(245, 245, 245, 0.7)',
                    marginBottom: '1rem',
                    fontWeight: 600
                }}>
                    Posts Hoje
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#F5F5F5',
                            color: '#0C1014',
                        }} />
                        <span style={{ fontSize: '0.875rem', color: '#F5F5F5' }}>
                            {stats.todayScheduled} Agendados
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#22c55e'
                        }} />
                        <span style={{ fontSize: '0.875rem', color: '#F5F5F5' }}>
                            {stats.todayPublished} Publicado{stats.todayPublished !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {stats.nextPostTime && (
                        <div style={{
                            marginTop: '0.5rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid rgba(245, 245, 245, 0.08)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.875rem' }}>⏰</span>
                                <div>
                                    <p style={{ fontSize: '0.75rem', color: 'rgba(245, 245, 245, 0.55)', margin: 0 }}>
                                        Próximo às
                                    </p>
                                    <p style={{
                                        fontSize: '1rem',
                                        color: '#EAEBEB',
                                        fontWeight: 600,
                                        margin: 0
                                    }}>
                                        {stats.nextPostTime}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {stats.totalPending > 0 && (
                        <div style={{
                            marginTop: '0.5rem',
                            fontSize: '0.75rem',
                            color: 'rgba(245, 245, 245, 0.55)'
                        }}>
                            {stats.totalPending} pendente{stats.totalPending !== 1 ? 's' : ''} no total
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
}
