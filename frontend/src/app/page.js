'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function HomePage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { user, login, register } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (user) {
            router.push('/dashboard');
        }
    }, [user, router]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
                toast.success('Login realizado com sucesso!');
            } else {
                await register(email, password);
                toast.success('Conta criada com sucesso!');
            }
            router.push('/dashboard');
        } catch (error) {
            toast.error(error.message || 'Erro ao autenticar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-center" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="card-glass fade-in" style={{ maxWidth: '450px', width: '100%', padding: '2.5rem' }}>
                <div className="text-center mb-lg">
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📸 InstaBot</h1>
                    <p>Automação inteligente para Instagram</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <input
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="seu@email.com"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Senha</label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '1rem' }}
                        disabled={loading}
                    >
                        {loading ? 'Carregando...' : isLogin ? 'Entrar' : 'Criar Conta'}
                    </button>
                </form>

                <div className="text-center mt-md">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="btn btn-secondary"
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)' }}
                    >
                        {isLogin ? 'Criar nova conta' : 'Já tenho conta'}
                    </button>
                </div>

                <div className="mt-lg" style={{ padding: '1rem', background: 'rgba(231, 76, 60, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--accent-secondary)', textAlign: 'center' }}>
                        ⚠️ Este software viola os Termos de Serviço do Instagram. Use por sua conta e risco.
                    </p>
                </div>
            </div>
        </div>
    );
}
