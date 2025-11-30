'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function PostsPage() {
    const [posts, setPosts] = useState([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPosts();
    }, [filter]);

    const loadPosts = async () => {
        setLoading(true);
        try {
            const params = filter !== 'all' ? `?status=${filter}` : '';
            const res = await api.get(`/api/posts${params}`);
            setPosts(res.data.posts);
        } catch (error) {
            toast.error('Erro ao carregar posts');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Deseja cancelar/deletar este post?')) return;
        try {
            await api.delete(`/api/posts/${id}`);
            toast.success('Post deletado');
            loadPosts();
        } catch (error) {
            toast.error('Erro ao deletar post');
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: 'badge-pending',
            processing: 'badge-warning',
            success: 'badge-success',
            error: 'badge-error',
        };
        return badges[status] || 'badge-pending';
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

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <div className="flex-between mb-lg">
                    <h1>Meus Posts</h1>
                    <div className="flex gap-sm">
                        {['all', 'pending', 'processing', 'success', 'error'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.5rem 1rem', textTransform: 'capitalize' }}
                            >
                                {f === 'all' ? 'Todos' : f}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="text-center" style={{ padding: '3rem' }}>
                        <p>Carregando...</p>
                    </div>
                ) : posts.length === 0 ? (
                    <div className="card-glass text-center" style={{ padding: '3rem' }}>
                        <h2>Nenhum post encontrado</h2>
                        <p>Crie seu primeiro post para começar!</p>
                    </div>
                ) : (
                    <div className="grid grid-2">
                        {posts.map(post => (
                            <div key={post.id} className="card-glass">
                                <div className="flex-between mb-md">
                                    <div className="flex gap-sm">
                                        <span style={{ fontSize: '1.5rem' }}>{getTypeEmoji(post.type)}</span>
                                        <span className={`badge ${getStatusBadge(post.status)}`}>
                                            {post.status}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                        {format(new Date(post.createdAt.seconds * 1000), 'dd/MM/yyyy HH:mm')}
                                    </span>
                                </div>

                                {post.mediaUrls && post.mediaUrls[0] && (
                                    <img
                                        src={post.mediaUrls[0]}
                                        alt="Preview"
                                        style={{
                                            width: '100%',
                                            height: '200px',
                                            objectFit: 'cover',
                                            borderRadius: 'var(--radius-md)',
                                            marginBottom: '1rem',
                                        }}
                                    />
                                )}

                                {post.caption && (
                                    <p style={{
                                        fontSize: '0.875rem',
                                        marginBottom: '1rem',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                    }}>
                                        {post.caption}
                                    </p>
                                )}

                                {post.scheduledFor && post.status === 'pending' && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--accent-warning)', marginBottom: '1rem' }}>
                                        📅 Agendado: {format(new Date(post.scheduledFor.seconds * 1000), 'dd/MM/yyyy HH:mm')}
                                    </p>
                                )}

                                {post.errorMessage && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', marginBottom: '1rem' }}>
                                        ❌ Erro: {post.errorMessage}
                                    </p>
                                )}

                                <div className="flex gap-sm">
                                    {(post.status === 'pending' || post.status === 'error') && (
                                        <button
                                            onClick={() => handleDelete(post.id)}
                                            className="btn btn-danger"
                                            style={{ padding: '0.5rem 1rem' }}
                                        >
                                            Deletar
                                        </button>
                                    )}
                                    {post.status === 'success' && (
                                        <span className="badge badge-success">✅ Publicado com sucesso</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
