'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';

interface HistoryItem {
    id: string;
    mode: 'simple' | 'carousel';
    prompt: string;
    aspectRatio: string;
    images: string[];
    prompts: string[];
    createdAt: { _seconds: number; _nanoseconds: number } | Date;
}

export default function HistoryPage() {
    const router = useRouter();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'simple' | 'carousel'>('all');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const response = await api.get('/api/history', {
                params: {
                    limit: 50,
                    mode: selectedFilter !== 'all' ? selectedFilter : undefined,
                },
            });

            if (response.data.items) {
                setHistory(response.data.items);
            }
        } catch (error: any) {
            console.error('Error fetching history:', error);
            toast.error('Erro ao carregar histórico');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (itemId: string) => {
        if (!confirm('Tem certeza que deseja remover este item do histórico?')) {
            return;
        }

        try {
            await api.delete(`/api/history/${itemId}`);
            toast.success('Item removido do histórico');
            setHistory(history.filter((item) => item.id !== itemId));
        } catch (error: any) {
            console.error('Error deleting item:', error);
            toast.error(error.response?.data?.error || 'Erro ao deletar item');
        }
    };

    const handleReusePrompt = (item: HistoryItem) => {
        // Copy prompt to clipboard and redirect to generate page
        const promptText = item.mode === 'carousel' ? item.prompt : item.prompt;
        navigator.clipboard.writeText(promptText);
        toast.success('Prompt copiado!');
        router.push('/dashboard/generate');
    };

    const handleDownloadImage = async (imageUrl: string, index: number) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `history-image-${index + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Imagem baixada!');
        } catch (error) {
            console.error('Error downloading image:', error);
            toast.error('Erro ao baixar imagem');
        }
    };

    const formatDate = (timestamp: any) => {
        try {
            let date: Date;
            if (timestamp?._seconds) {
                date = new Date(timestamp._seconds * 1000);
            } else {
                date = new Date(timestamp);
            }
            return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (error) {
            return 'Data desconhecida';
        }
    };

    const filteredHistory = selectedFilter === 'all'
        ? history
        : history.filter(item => item.mode === selectedFilter);

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <div className="container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <BackButton />
                    <h1 className="mb-lg">🕒 Histórico de Gerações</h1>
                    <div style={{ width: '100px' }} /> {/* Spacer for alignment */}
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center' }}>
                    {(['all', 'simple', 'carousel'] as const).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setSelectedFilter(filter)}
                            className="btn"
                            style={{
                                background: selectedFilter === filter ? '#7c3aed' : '#27272a',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '9999px',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                            }}
                        >
                            {filter === 'all' ? 'Todos' : filter === 'simple' ? 'Simples' : 'Carrossel'}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <div className="loading" style={{ width: '50px', height: '50px' }}></div>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem' }}>
                        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎨</p>
                        <h2 style={{ color: '#a1a1aa', marginBottom: '0.5rem' }}>Nenhum item no histórico</h2>
                        <p style={{ color: '#71717a' }}>Gere imagens e salve no histórico para vê-las aqui</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                        {filteredHistory.map((item) => (
                            <div
                                key={item.id}
                                className="card-glass"
                                style={{ padding: '1.5rem', background: '#18181b', border: '1px solid #27272a' }}
                            >
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                    <div>
                                        <span
                                            style={{
                                                fontSize: '0.75rem',
                                                background: item.mode === 'carousel' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                                color: item.mode === 'carousel' ? '#a78bfa' : '#4ade80',
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '9999px',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {item.mode === 'carousel' ? '🎪 Carrossel' : '🎨 Simples'}
                                        </span>
                                        <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.5rem' }}>
                                            {formatDate(item.createdAt)}
                                        </p>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: '0.75rem',
                                            background: 'rgba(59, 130, 246, 0.2)',
                                            color: '#60a5fa',
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '9999px',
                                        }}
                                    >
                                        {item.aspectRatio}
                                    </span>
                                </div>

                                {/* Images Grid */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: item.images.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                                        gap: '0.5rem',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    {item.images.slice(0, 4).map((image, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setSelectedImage(image)}
                                            style={{
                                                position: 'relative',
                                                cursor: 'pointer',
                                                borderRadius: '0.5rem',
                                                overflow: 'hidden',
                                                aspectRatio: '1',
                                            }}
                                        >
                                            <img
                                                src={image}
                                                alt={`Generated ${idx + 1}`}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                }}
                                            />
                                            {idx === 3 && item.images.length > 4 && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        right: 0,
                                                        bottom: 0,
                                                        background: 'rgba(0, 0, 0, 0.7)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '1.5rem',
                                                        fontWeight: 'bold',
                                                        color: '#fff',
                                                    }}
                                                >
                                                    +{item.images.length - 4}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Prompt */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <p
                                        style={{
                                            fontSize: '0.875rem',
                                            color: '#d4d4d8',
                                            lineHeight: '1.5',
                                            maxHeight: '3rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                        }}
                                    >
                                        {item.prompt}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => handleReusePrompt(item)}
                                        className="btn"
                                        style={{
                                            background: '#7c3aed',
                                            border: 'none',
                                            color: '#fff',
                                            padding: '0.5rem',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        🔄 Reutilizar
                                    </button>
                                    <button
                                        onClick={() => handleDownloadImage(item.images[0], 0)}
                                        className="btn btn-secondary"
                                        style={{ padding: '0.5rem', fontSize: '0.75rem' }}
                                    >
                                        📥 Baixar
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="btn"
                                        style={{
                                            background: '#dc2626',
                                            border: 'none',
                                            color: '#fff',
                                            padding: '0.5rem',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            gridColumn: 'span 2',
                                        }}
                                    >
                                        🗑️ Remover
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Image Modal */}
                {selectedImage && (
                    <div
                        onClick={() => setSelectedImage(null)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.9)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '2rem',
                        }}
                    >
                        <img
                            src={selectedImage}
                            alt="Full size"
                            style={{
                                maxWidth: '90%',
                                maxHeight: '90%',
                                objectFit: 'contain',
                                borderRadius: '1rem',
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
