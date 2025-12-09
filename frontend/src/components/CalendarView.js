'use client';

import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CalendarView({ posts }) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const days = useMemo(() => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        return eachDayOfInterval({ start, end });
    }, [currentDate]);

    const scheduledPosts = useMemo(() => {
        return posts.filter(p => p.status === 'pending' && p.scheduledFor);
    }, [posts]);

    const getPostsForDay = (day) => {
        return scheduledPosts.filter(post => {
            const postDate = post.scheduledFor.seconds
                ? new Date(post.scheduledFor.seconds * 1000)
                : new Date(post.scheduledFor);
            return isSameDay(postDate, day);
        });
    };

    const getTypeEmoji = (type) => {
        const emojis = {
            static: '📸',
            carousel: '🖼️',
            video: '🎥',
            reel: '🎬',
            story: '📱',
        };
        return emojis[type] || '📸';
    };

    // Calcular dias vazios no início do mês para alinhar corretamente
    const startDay = getDay(startOfMonth(currentDate)); // 0 = Domingo, 1 = Segunda, etc.
    const emptyDays = Array(startDay).fill(null);

    return (
        <div className="card-glass" style={{ padding: '2rem' }}>
            {/* Header */}
            <div className="flex-between mb-lg">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="btn btn-secondary">
                    ← Anterior
                </button>
                <h2 style={{ textTransform: 'capitalize' }}>
                    {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                </h2>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="btn btn-secondary">
                    Próximo →
                </button>
            </div>

            {/* Week Days Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                    <div key={day} style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>{day}</div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
                {/* Empty Cells for previous month */}
                {emptyDays.map((_, i) => (
                    <div key={`empty-${i}`} style={{ height: '120px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}></div>
                ))}

                {/* Days */}
                {days.map(day => {
                    const dayPosts = getPostsForDay(day);
                    return (
                        <div
                            key={day.toString()}
                            style={{
                                height: '120px',
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.5rem',
                                border: isSameDay(day, new Date()) ? '1px solid var(--accent-primary)' : 'none',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ textAlign: 'right', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {format(day, 'd')}
                            </div>

                            <div className="flex column gap-xs">
                                {dayPosts.map(post => {
                                    const postDate = post.scheduledFor.seconds
                                        ? new Date(post.scheduledFor.seconds * 1000)
                                        : new Date(post.scheduledFor);
                                    return (
                                        <div
                                            key={post.id}
                                            style={{
                                                fontSize: '0.7rem',
                                                background: 'rgba(0,0,0,0.3)',
                                                padding: '0.25rem',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                            title={post.caption}
                                        >
                                            <span>{getTypeEmoji(post.type)}</span>
                                            <span>{format(postDate, 'HH:mm')}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
