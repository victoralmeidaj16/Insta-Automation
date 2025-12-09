'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import BackButton from '@/components/BackButton';

import CalendarView from '@/components/CalendarView';

export default function PostsPage() {
    const [posts, setPosts] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null); // null = selection screen, 'all' = all accounts, id = specific account
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'processing', 'success', 'error', 'calendar'
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAccounts();
    }, []);

    useEffect(() => {
        if (selectedAccount) {
            loadPosts();
        }
    }, [selectedAccount, filter]);

    const loadAccounts = async () => {
        try {
            const res = await api.get('/api/accounts');
            setAccounts(res.data.accounts);
            setLoading(false);
        } catch (error) {
            toast.error('Erro ao carregar contas');
            setLoading(false);
        }
    };

    const loadPosts = async () => {
        setLoading(true);
        try {
            // Se for calendário, queremos ver todos os posts (ou pelo menos os agendados)
            // Mas a API filtra por status. Vamos pegar 'all' se for calendar e filtrar no front ou pedir 'pending'
            // Para simplificar, se for calendar, pegamos 'all' e o componente filtra

            let statusFilter = filter;
            if (filter === 'calendar') statusFilter = 'all';

            let url = '/api/posts';
            const params = new URLSearchParams();

            if (selectedAccount !== 'all') {
                params.append('accountId', selectedAccount);
            }
            if (statusFilter !== 'all') {
                params.append('status', statusFilter);
            }

            const queryString = params.toString();
            if (queryString) {
                url += `?${queryString}`;
            }

            const res = await api.get(url);
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

    const formatDate = (dateValue) => {
        if (!dateValue) return '';
        try {
            if (dateValue.seconds) {
                return format(new Date(dateValue.seconds * 1000), 'dd/MM/yyyy HH:mm');
            }
            return format(new Date(dateValue), 'dd/MM/yyyy HH:mm');
        } catch (e) {
            return 'Data inválida';
        }
    };

    const getAccountUsername = (accountId) => {
        const account = accounts.find(a => a.id === accountId);
        return account ? `@${account.username}` : 'Desconhecido';
    };

    // Render Selection Screen
    if (!selectedAccount) {
        return (
            <div style={{ minHeight: '100vh', padding: '2rem' }}>
                <div className="container">
                    <BackButton href="/dashboard" />
                    <h1 className="mb-lg">Selecione uma Conta</h1>

                    {loading ? (
                        <p>Carregando contas...</p>
                    ) : (
                        <div className="grid grid-3">
                            {/* All Accounts Option */}
                            <div
                                className="card-glass cursor-pointer hover-scale"
                                onClick={() => setSelectedAccount('all')}
                                style={{ textAlign: 'center', padding: '2rem', border: '1px solid var(--border-color)' }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                                <h3>Todas as Contas</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>Ver posts de todos os perfis</p>
                            </div>

                            {/* Individual Accounts */}
                            {accounts.map(acc => (
                                <div
                                    key={acc.id}
                                    className="card-glass cursor-pointer hover-scale"
                                    onClick={() => setSelectedAccount(acc.id)}
                                    style={{ textAlign: 'center', padding: '2rem', border: '1px solid var(--border-color)' }}
                                >
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📸</div>
                                    <h3>@{acc.username}</h3>
                                    <span className={`badge badge-${acc.status === 'active' ? 'success' : 'error'}`}>
                                        {acc.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Render Posts List
    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <div className="flex-between mb-lg">
                    <div className="flex gap-md align-center">
                        <button
                            onClick={() => setSelectedAccount(null)}
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem' }}
                        >
                            ← Trocar Conta
                        </button>
                        <div>
                            <h1 style={{ marginBottom: '0.25rem' }}>Meus Posts</h1>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {selectedAccount === 'all' ? 'Todas as contas' : getAccountUsername(selectedAccount)}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-sm">
                        {['all', 'pending', 'processing', 'success', 'error', 'calendar'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.5rem 1rem', textTransform: 'capitalize' }}
                            >
                                {f === 'calendar' ? '📅 Calendário' : f === 'all' ? 'Todos' : f}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="text-center" style={{ padding: '3rem' }}>
                        <p>Carregando...</p>
                    </div>
                ) : filter === 'calendar' ? (
                    <CalendarView posts={posts} />
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
                                    <div className="flex gap-sm align-center">
                                        <span style={{ fontSize: '1.5rem' }}>{getTypeEmoji(post.type)}</span>
                                        <div className="flex column">
                                            {selectedAccount === 'all' && (
                                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                                                    {getAccountUsername(post.accountId)}
                                                </span>
                                            )}
                                            <span className={`badge ${getStatusBadge(post.status)}`}>
                                                {post.status}
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                        {formatDate(post.createdAt)}
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
                                        📅 Agendado: {formatDate(post.scheduledFor)}
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
