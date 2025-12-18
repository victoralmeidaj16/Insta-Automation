'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';
import { useRouter } from 'next/navigation';

export default function UploadManagerPage() {
    const [files, setFiles] = useState([]);
    const [selectedIndices, setSelectedIndices] = useState([]);
    const [uploading, setUploading] = useState(false);
    const { profiles, selectedProfile, setSelectedProfile } = useBusinessProfile();
    const router = useRouter();

    const handleFileSelect = (e) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files).map(file => ({
                file,
                preview: URL.createObjectURL(file),
                type: file.type.startsWith('video') ? 'video' : 'image'
            }));
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const toggleSelection = (index) => {
        setSelectedIndices(prev => {
            if (prev.includes(index)) {
                return prev.filter(i => i !== index);
            }
            return [...prev, index];
        });
    };

    const handleSelectAll = () => {
        if (selectedIndices.length === files.length) {
            setSelectedIndices([]);
        } else {
            setSelectedIndices(files.map((_, i) => i));
        }
    };

    const handleRemoveSelected = () => {
        setFiles(prev => prev.filter((_, i) => !selectedIndices.includes(i)));
        setSelectedIndices([]);
    };

    const handleUploadToLibrary = async (asCarousel = false) => {
        if (!selectedProfile) {
            toast.error('Selecione uma conta de destino');
            return;
        }

        if (selectedIndices.length === 0) {
            toast.error('Selecione ao menos um arquivo');
            return;
        }

        setUploading(true);
        const toastId = toast.loading('Enviando arquivos...');

        try {
            const filesToUpload = files.filter((_, i) => selectedIndices.includes(i));

            // If sending as individual items
            if (!asCarousel) {
                // Determine if we should send them one by one or batch
                // The backend endpoint accepts multiple files but creates ONE item if they are sent together unless handled.
                // The current backend endpoint `api/library/upload` creates ONE item with multiple files if sent together.
                // So if the user wants "Separate Items", we must loop.

                for (const fileObj of filesToUpload) {
                    const formData = new FormData();
                    formData.append('files', fileObj.file);
                    formData.append('businessProfileId', selectedProfile.id);
                    formData.append('type', fileObj.type === 'video' ? 'reel' : 'static');
                    formData.append('tag', 'pronto'); // Default to pronto or edit? Let's say edit for new uploads

                    await api.post('/api/library/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                }
                toast.success(`${filesToUpload.length} itens enviados para a Library!`, { id: toastId });
            }
            else {
                // Send as One Carousel
                const formData = new FormData();
                filesToUpload.forEach(f => {
                    formData.append('files', f.file);
                });
                formData.append('businessProfileId', selectedProfile.id);
                formData.append('type', 'carousel');
                formData.append('tag', 'pronto');

                await api.post('/api/library/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toast.success('Carrossel criado na Library!', { id: toastId });
            }

            // Cleanup uploaded files from list
            setFiles(prev => prev.filter((_, i) => !selectedIndices.includes(i)));
            setSelectedIndices([]);

        } catch (error) {
            console.error(error);
            toast.error('Erro ao fazer upload', { id: toastId });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <div className="container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <BackButton />
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Gerenciador de Uploads</h1>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>

                    {/* Left: Staging Area */}
                    <div style={{
                        background: '#18181b',
                        borderRadius: '0.75rem',
                        padding: '1.5rem',
                        border: '1px solid #27272a',
                        minHeight: '600px'
                    }}>
                        {/* Dropzone / Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Arquivos em Espera</h2>
                                <p style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>{files.length} arquivos selecionados</p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={handleSelectAll}
                                    style={{ padding: '0.5rem 1rem', background: '#27272a', borderRadius: '0.5rem', border: '1px solid #3f3f46', color: '#fff', cursor: 'pointer' }}
                                >
                                    {selectedIndices.length === files.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                </button>
                                <label style={{
                                    padding: '0.5rem 1rem',
                                    background: '#7c3aed',
                                    borderRadius: '0.5rem',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    + Adicionar Arquivos
                                    <input type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                                </label>
                            </div>
                        </div>

                        {/* Grid */}
                        {files.length === 0 ? (
                            <div style={{
                                border: '2px dashed #27272a',
                                borderRadius: '0.75rem',
                                height: '400px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#52525b'
                            }}>
                                <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</p>
                                <p>Arraste arquivos ou clique em Adicionar</p>
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                                gap: '1rem'
                            }}>
                                {files.map((file, i) => (
                                    <div
                                        key={i}
                                        onClick={() => toggleSelection(i)}
                                        style={{
                                            position: 'relative',
                                            borderRadius: '0.5rem',
                                            overflow: 'hidden',
                                            aspectRatio: '1',
                                            cursor: 'pointer',
                                            border: selectedIndices.includes(i) ? '2px solid #7c3aed' : '2px solid transparent',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <img
                                            src={file.preview}
                                            alt="Preview"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            right: '0.5rem',
                                            width: '1.25rem',
                                            height: '1.25rem',
                                            borderRadius: '50%',
                                            background: selectedIndices.includes(i) ? '#7c3aed' : 'rgba(0,0,0,0.5)',
                                            border: '2px solid #fff'
                                        }} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Actions Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{
                            background: '#18181b',
                            padding: '1.5rem',
                            borderRadius: '0.75rem',
                            border: '1px solid #27272a',
                            position: 'sticky',
                            top: '2rem'
                        }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Ações ({selectedIndices.length})</h3>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Conta de Destino</label>
                                <select
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: '#27272a',
                                        border: '1px solid #3f3f46',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        outline: 'none'
                                    }}
                                    value={selectedProfile?.id || ''}
                                    onChange={(e) => {
                                        const profile = profiles.find(p => p.id === e.target.value);
                                        setSelectedProfile(profile);
                                    }}
                                >
                                    <option value="">Selecione uma conta...</option>
                                    {profiles.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={() => handleUploadToLibrary(false)}
                                disabled={selectedIndices.length === 0 || uploading}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: '#27272a',
                                    border: '1px solid #3f3f46',
                                    borderRadius: '0.5rem',
                                    color: '#fff',
                                    fontWeight: 600,
                                    marginBottom: '0.75rem',
                                    cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    opacity: selectedIndices.length === 0 || uploading ? 0.5 : 1
                                }}
                            >
                                📤 Enviar Separados
                            </button>

                            <button
                                onClick={() => handleUploadToLibrary(true)}
                                disabled={selectedIndices.length < 2 || uploading}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    color: '#fff',
                                    fontWeight: 600,
                                    cursor: selectedIndices.length < 2 ? 'not-allowed' : 'pointer',
                                    opacity: selectedIndices.length < 2 || uploading ? 0.5 : 1
                                }}
                            >
                                🎠 Criar Carrossel
                            </button>

                            {selectedIndices.length > 0 && (
                                <button
                                    onClick={handleRemoveSelected}
                                    style={{
                                        marginTop: '1rem',
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#ef4444',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    Remover Selecionados
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
