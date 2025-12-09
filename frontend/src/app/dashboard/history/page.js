'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import BackButton from '@/components/BackButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function HistoryPage() {
    const router = useRouter();
    const { selectedProfile } = useBusinessProfile();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, [selectedProfile]); // Reload when profile changes

    const loadHistory = async () => {
        try {
            setLoading(true);
            const params = {};
            if (selectedProfile) {
                params.businessProfileId = selectedProfile.id;
            }

            const res = await api.get('/api/history', { params });
            setHistory(res.data.items || []);
        } catch (error) {
            console.error('Error loading history:', error);
            toast.error('Erro ao carregar histórico');
        } finally {
            setLoading(false);
        }
    };

    const handleReusePrompt = (prompt) => {
        // Store prompt in localStorage and navigate to AI Generator
        localStorage.setItem('reusedPrompt', prompt);
        router.push('/dashboard/generate');
        toast.success('Prompt carregado! 📋');
    };

    const handleDelete = async (id) => {
        if (!confirm('Excluir esta geração do histórico?')) return;

        try {
            await api.delete(`/api/history/${id}`);
            toast.success('Geração removida do histórico');
            loadHistory();
        } catch (error) {
            toast.error('Erro ao excluir');
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <BackButton />
                <Breadcrumbs />

                <div className="flex-between mb-lg">
                    <div>
                        <h1 style={{ marginBottom: '0.25rem' }}>Histórico de Gerações</h1>
                        {selectedProfile && (
                            <p style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>
                                🎯 Filtrado por: <strong style={{ color: '#7c3aed' }}>{selectedProfile.name}</strong>
                            </p>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="card-glass text-center" style={{ padding: '3rem' }}>
                        <p>Carregando histórico...</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="card-glass text-center" style={{ padding: '3rem' }}>
                        <h2>Nenhuma geração encontrada</h2>
                        <p style={{ color: '#a1a1aa', marginTop: '0.5rem' }}>
                            {selectedProfile
                                ? `Ainda não há gerações para o perfil "${selectedProfile.name}"`
                                : 'Comece gerando imagens no AI Generator'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-2">
                        {history.map((item) => (
                            <div key={item.id} className="card-glass">
                                <div className="flex-between mb-md">
                                    <span className="badge badge-primary">
                                        {item.mode === 'carousel' ? '🎠 Carrossel' : '🖼️ Simples'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                                        {new Date(item.createdAt?.seconds * 1000 || item.createdAt).toLocaleDateString('pt-BR', {
                                            day: '2-digit',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>

                                <p style={{
                                    fontSize: '0.875rem',
                                    color: '#d4d4d8',
                                    marginBottom: '1rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical'
                                }}>
                                    {item.prompt}
                                </p>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${Math.min(item.images?.length || 1, 4)}, 1fr)`,
                                    gap: '0.5rem',
                                    marginBottom: '1rem'
                                }}>
                                    {item.images?.slice(0, 4).map((img, idx) => (
                                        <div key={idx} style={{
                                            width: '100%',
                                            paddingTop: '100%',
                                            position: 'relative',
                                            borderRadius: '0.5rem',
                                            overflow: 'hidden'
                                        }}>
                                            <img
                                                src={img}
                                                alt={`Generated ${idx + 1}`}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-sm">
                                    <button
                                        onClick={() => handleReusePrompt(item.prompt)}
                                        className="btn btn-primary"
                                        style={{ flex: 1, fontSize: '0.875rem', padding: '0.5rem' }}
                                    >
                                        🔄 Reusar Prompt
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="btn btn-danger"
                                        style={{ fontSize: '0.875rem', padding: '0.5rem' }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
