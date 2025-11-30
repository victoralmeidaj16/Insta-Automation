'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function CreatePostPage() {
    const [accounts, setAccounts] = useState([]);
    const [formData, setFormData] = useState({
        accountId: '',
        type: 'static',
        caption: '',
        scheduledFor: '',
        files: [],
    });
    const [previews, setPreviews] = useState([]);
    const [uploading, setUploading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        loadAccounts();
    }, []);

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
        setFormData({ ...formData, files });

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

        if (formData.files.length === 0) {
            toast.error('Adicione pelo menos uma mídia');
            return;
        }

        setUploading(true);

        try {
            // Upload files
            const uploadFormData = new FormData();
            formData.files.forEach(file => uploadFormData.append('files', file));

            const uploadRes = await api.post('/api/upload', uploadFormData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            // Create post
            const postData = {
                accountId: formData.accountId,
                type: formData.type,
                caption: formData.caption,
                mediaUrls: uploadRes.data.urls,
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
                        <input
                            type="file"
                            accept="image/*,video/mp4"
                            multiple={formData.type === 'carousel'}
                            onChange={handleFileChange}
                            className="input"
                            style={{ padding: '0.5rem' }}
                            required
                        />
                        {previews.length > 0 && (
                            <div className="flex gap-sm mt-sm" style={{ flexWrap: 'wrap' }}>
                                {previews.map((url, i) => (
                                    <img key={i} src={url} alt={`Preview ${i + 1}`} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
                                ))}
                            </div>
                        )}
                    </div>

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
