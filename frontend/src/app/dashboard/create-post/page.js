'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';

function CreatePostContent() {
    const [accounts, setAccounts] = useState([]);
    const [formData, setFormData] = useState({
        accountId: '',
        type: 'static',
        caption: '',
        scheduledFor: '',
        files: [],
        externalMediaUrls: [], // New field for URLs passed via query params
    });
    const [previews, setPreviews] = useState([]);
    const [uploading, setUploading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        loadAccounts();

        // Check for query params or localStorage
        const source = searchParams.get('source');

        if (source === 'generated') {
            try {
                const storedData = localStorage.getItem('params_createPost');
                if (storedData) {
                    const data = JSON.parse(storedData);
                    setFormData(prev => ({
                        ...prev,
                        caption: data.caption || prev.caption,
                        type: data.type || 'static',
                        scheduledFor: data.scheduledFor || '',
                        externalMediaUrls: data.mediaUrls || []
                    }));

                    if (data.mediaUrls && data.mediaUrls.length > 0) {
                        setPreviews(data.mediaUrls);
                    }

                    toast.success('Conteúdo importado com sucesso!');
                    // localStorage.removeItem('params_createPost'); // Keep it briefly in case of refresh? Or remove? Better remove to avoid stale data.
                    localStorage.removeItem('params_createPost');
                }
            } catch (e) {
                console.error('Erro ao ler dados do localStorage:', e);
            }
        } else {
            // Fallback to legacy query params
            const captionParam = searchParams.get('caption');
            const mediaUrlsParam = searchParams.get('mediaUrls');
            const typeParam = searchParams.get('type');

            if (captionParam || mediaUrlsParam) {
                const externalUrls = mediaUrlsParam ? mediaUrlsParam.split(',') : [];
                setFormData(prev => ({
                    ...prev,
                    caption: captionParam || prev.caption,
                    type: typeParam || (externalUrls.length > 1 ? 'carousel' : 'static'),
                    externalMediaUrls: externalUrls
                }));

                if (externalUrls.length > 0) {
                    setPreviews(externalUrls);
                }

                toast.success('Conteúdo importado do Dark AI Platform!');
            }
        }
    }, [searchParams]);

    const loadAccounts = async () => {
        try {
            const res = await api.get('/api/accounts');
            setAccounts(res.data.accounts.filter(a => a.status === 'active'));
        } catch (error) {
            toast.error('Erro ao carregar contas');
        }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setFormData({ ...formData, files, externalMediaUrls: [] }); // Clear external URLs if user selects files

        // Create previews
        const newPreviews = files.map(file => URL.createObjectURL(file));
        setPreviews(newPreviews);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.accountId) {
            toast.error('Selecione uma conta');
            return;
        }

        if (formData.files.length === 0 && formData.externalMediaUrls.length === 0) {
            toast.error('Adicione pelo menos uma mídia');
            return;
        }

        setUploading(true);

        try {
            let mediaUrls = formData.externalMediaUrls;

            // Only upload if there are local files
            if (formData.files.length > 0) {
                const uploadFormData = new FormData();
                formData.files.forEach(file => uploadFormData.append('files', file));

                const uploadRes = await api.post('/api/upload', uploadFormData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                mediaUrls = uploadRes.data.urls;
            }

            // Create post
            const postData = {
                accountId: formData.accountId,
                type: formData.type,
                caption: formData.caption,
                mediaUrls: mediaUrls,
                scheduledFor: formData.scheduledFor || null,
            };

            await api.post('/api/posts', postData);

            toast.success(formData.scheduledFor ? 'Post agendado!' : 'Post em processamento!');
            router.push('/dashboard/posts');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container" style={{ maxWidth: '800px' }}>
                <div className="flex justify-between items-center mb-lg">
                    <BackButton />
                    <Link
                        href="/dashboard/generate"
                        className="btn btn-secondary flex items-center gap-2"
                        style={{ textDecoration: 'none' }}
                    >
                        ✨ Gerar com IA
                    </Link>
                </div>

                <h1 className="mb-lg">Criar Novo Post</h1>

                <form onSubmit={handleSubmit} className="card-glass" style={{ padding: '2rem' }}>
                    <div className="input-group">
                        <label className="input-label">Conta Instagram</label>
                        <select className="input" value={formData.accountId} onChange={(e) => setFormData({ ...formData, accountId: e.target.value })} required>
                            <option value="">Selecione...</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>@{acc.username}</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Tipo de Post</label>
                        <select className="input" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                            <option value="static">Post Estático (1 imagem)</option>
                            <option value="carousel">Carrossel (múltiplas imagens)</option>
                            <option value="video">Vídeo</option>
                            <option value="reel">Reel</option>
                            <option value="story">Story</option>
                        </select>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Mídia(s)</label>
                        <div className="flex flex-col gap-sm">
                            <label
                                htmlFor="file-upload"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.75rem',
                                    padding: '1.5rem',
                                    border: '2px dashed rgba(142, 68, 173, 0.4)',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'rgba(142, 68, 173, 0.05)',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    ':hover': {
                                        background: 'rgba(142, 68, 173, 0.1)',
                                        borderColor: 'rgba(142, 68, 173, 0.6)'
                                    }
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(142, 68, 173, 0.1)';
                                    e.currentTarget.style.borderColor = 'rgba(142, 68, 173, 0.6)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(142, 68, 173, 0.05)';
                                    e.currentTarget.style.borderColor = 'rgba(142, 68, 173, 0.4)';
                                }}
                            >
                                <svg
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ color: '#8e44ad' }}
                                >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.25rem', color: '#8e44ad' }}>
                                        {formData.files.length > 0 ? `${formData.files.length} arquivo(s) selecionado(s)` : 'Escolher Arquivo'}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                        Clique ou arraste {formData.type === 'carousel' ? 'seus arquivos' : 'seu arquivo'} aqui
                                    </p>
                                </div>
                            </label>
                            <input
                                id="file-upload"
                                type="file"
                                accept="image/*,video/mp4"
                                multiple={formData.type === 'carousel'}
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                                required={formData.externalMediaUrls.length === 0}
                            />
                            {formData.externalMediaUrls.length > 0 && (
                                <div className="text-sm text-success">
                                    ✅ {formData.externalMediaUrls.length} mídia(s) importada(s) do Dark AI
                                </div>
                            )}
                        </div>
                        {previews.length > 0 && (
                            <div className="flex gap-sm mt-sm" style={{ flexWrap: 'wrap' }}>
                                {previews.map((url, i) => (
                                    <img key={i} src={url} alt={`Preview ${i + 1}`} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
                                ))}
                            </div>
                        )}
                    </div>

                    {formData.type !== 'story' && (
                        <div className="input-group">
                            <label className="input-label">Legenda</label>
                            <textarea
                                className="input"
                                value={formData.caption}
                                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                                placeholder="Escreva sua legenda aqui..."
                                rows={4}
                            />
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label">Agendar (opcional)</label>
                        <input
                            type="datetime-local"
                            className="input"
                            value={formData.scheduledFor}
                            onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                        />
                        <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-tertiary)' }}>
                            Deixe em branco para postar imediatamente
                        </p>
                    </div>

                    <div className="flex gap-md mt-lg">
                        <button type="submit" className="btn btn-primary" disabled={uploading}>
                            {uploading ? 'Processando...' : formData.scheduledFor ? '📅 Agendar' : '🚀 Postar Agora'}
                        </button>
                        <button type="button" onClick={() => router.push('/dashboard')} className="btn btn-secondary">
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function CreatePostPage() {
    return (
        <Suspense fallback={<div>Carregando...</div>}>
            <CreatePostContent />
        </Suspense>
    );
}
