'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function HomePage() {
    const { user, loading, login } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    useEffect(() => {
        // Se o usuário já estiver logado e for o autorizado, envia direto para o dashboard
        if (!loading && user && user.email === '123indiozinhos@gmail.com') {
            router.push('/dashboard');
        }
    }, [user, loading, router]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (email.trim().toLowerCase() !== '123indiozinhos@gmail.com') {
            toast.error('Acesso restrito. E-mail não autorizado.');
            return;
        }

        if (!password) {
            toast.error('Por favor, insira sua senha.');
            return;
        }

        setAuthLoading(true);

        try {
            await login(email, password);
            toast.success('Acesso autorizado!');
            router.push('/dashboard');
        } catch (loginErr) {
            toast.error(loginErr.message || 'E-mail ou senha incorretos.');
        } finally {
            setAuthLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '100vh', padding: '2rem' }}>
                <div className="card-glass fade-in" style={{ maxWidth: '450px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
                    <h2 style={{ marginBottom: '1rem' }}>📸 InstaBot</h2>
                    <p>Carregando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-center animate-fade-in" style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
            <div className="card-glass" style={{ maxWidth: '420px', width: '100%', padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
                <div className="text-center" style={{ marginBottom: '2.5rem' }}>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', background: 'var(--gradient-instagram)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        📸 InstaBot
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Acesse sua conta para gerenciar e agendar posts</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label" htmlFor="email">E-mail Autorizado</label>
                        <input
                            id="email"
                            type="email"
                            className="input"
                            placeholder="seuemail@exemplo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={authLoading}
                        />
                    </div>

                    <div className="input-group" style={{ marginBottom: '2rem' }}>
                        <label className="input-label" htmlFor="password">Senha</label>
                        <input
                            id="password"
                            type="password"
                            className="input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={authLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '1rem', fontWeight: '600' }}
                        disabled={authLoading}
                    >
                        {authLoading ? 'Verificando...' : 'Entrar na Plataforma'}
                    </button>
                </form>
            </div>
        </div>
    );
}
