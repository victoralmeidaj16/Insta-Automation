'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function DashboardPage() {
    const [stats, setStats] = useState({ accounts: 0, posts: 0, pending: 0 });
    const [loading, setLoading] = useState(true);
    const { user, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const [accountsRes, postsRes] = await Promise.all([
                api.get('/api/accounts'),
                api.get('/api/posts'),
            ]);

            const pending = postsRes.data.posts.filter(p => p.status === 'pending').length;

            setStats({
                accounts: accountsRes.data.accounts.length,
                posts: postsRes.data.posts.length,
                pending,
            });
        } catch (error) {
            toast.error('Erro ao carregar estatísticas');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            router.push('/');
        } catch (error) {
            toast.error('Erro ao sair');
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <h1 className="mb-lg">Home Page</h1>

                {/* Stats Cards */}
                <div className="grid grid-3 mb-lg">
                    <div className="card-glass">
                        <h3 style={{ color: 'var(--accent-primary)' }}>Contas</h3>
                        <p style={{ fontSize: '2.5rem', fontWeight: '700', margin: '1rem 0' }}>{stats.accounts}</p>
                        <p style={{ fontSize: '0.875rem' }}>Contas Instagram conectadas</p>
                    </div>

                    <div className="card-glass">
                        <h3 style={{ color: 'var(--accent-success)' }}>Posts Totais</h3>
                        <p style={{ fontSize: '2.5rem', fontWeight: '700', margin: '1rem 0' }}>{stats.posts}</p>
                        <p style={{ fontSize: '0.875rem' }}>Posts criados</p>
                    </div>

                    <div className="card-glass">
                        <h3 style={{ color: 'var(--accent-warning)' }}>Agendados</h3>
                        <p style={{ fontSize: '2.5rem', fontWeight: '700', margin: '1rem 0' }}>{stats.pending}</p>
                        <p style={{ fontSize: '0.875rem' }}>Posts pendentes</p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="card-glass">
                    <h2 className="mb-md">Ações Rápidas</h2>
                    <div className="grid grid-2">
                        <Link href="/dashboard/generate" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <h3>✨ AI Generator</h3>
                            <p>Gerar imagens com IA e agendar posts</p>
                        </Link>

                        <Link href="/dashboard/create-post" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <h3>📸 Criar Post</h3>
                            <p>Novo post estático, carrossel, vídeo, story ou reel</p>
                        </Link>

                        <Link href="/dashboard/posts" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <h3>📋 Ver Posts</h3>
                            <p>Histórico completo de posts e status</p>
                        </Link>

                        <Link href="/dashboard/accounts" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <h3>🔐 Gerenciar Contas</h3>
                            <p>Adicionar, verificar e remover contas Instagram</p>
                        </Link>
                    </div>
                </div>

                {/* Welcome Message */}
                {stats.accounts === 0 && (
                    <div className="card-glass mt-lg" style={{ padding: '2rem', textAlign: 'center' }}>
                        <h2 style={{ marginBottom: '1rem' }}>👋 Bem-vindo ao InstaBot!</h2>
                        <p style={{ marginBottom: '1.5rem' }}>Comece adicionando sua primeira conta Instagram</p>
                        <Link href="/dashboard/accounts" className="btn btn-primary">
                            Adicionar Conta
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
