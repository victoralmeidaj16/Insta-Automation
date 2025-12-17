'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import BackButton from '@/components/BackButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';

export default function LibraryPage() {
    const router = useRouter();
    const { profiles, selectedProfile, setSelectedProfile } = useBusinessProfile();

    // States
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedPost, setSelectedPost] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);

    // Edit modal states
    const [editCaption, setEditCaption] = useState('');
    const [editScheduledFor, setEditScheduledFor] = useState('');
    const [editTag, setEditTag] = useState('');

    // Upload states
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploadCaption, setUploadCaption] = useState('');
    const [uploadTag, setUploadTag] = useState('editar');
    const [uploading, setUploading] = useState(false);

    // Schedule modal states
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    useEffect(() => {
        if (selectedProfile) {
            loadPosts();
        }
    }, [selectedProfile, typeFilter, statusFilter]);

    const loadPosts = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();

            if (selectedProfile) {
                params.append('businessProfileId', selectedProfile.id);
            }

            const response = await api.get(`/api/library?${params}`);
            let items = response.data;

            // Apply filters on frontend
            if (typeFilter !== 'all') {
                items = items.filter(item => item.type === typeFilter);
            }
            if (tagFilter !== 'all') {
                items = items.filter(item => item.tag === tagFilter);
            }

            setPosts(items);

            // Calculate stats
            setStats({
                total: items.length,
                published: 0,  // Library items are not published
                scheduled: items.filter(item => item.isScheduled).length,
            });
        } catch (error) {
            console.error('Error loading library items:', error);
            toast.error('Erro ao carregar biblioteca');
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePost = async (id) => {
        if (!confirm('Tem certeza que deseja deletar este item?')) return;

        try {
            await api.delete(`/api/library/${id}`);
            toast.success('Item deletado com sucesso!');
            loadPosts();
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Erro ao deletar item');
        }
    };

    const handleScheduleClick = (item) => {
        setSelectedItem(item);
        setShowScheduleModal(true);
        // Set default to tomorrow at 10:00
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setScheduleDate(tomorrow.toISOString().split('T')[0]);
        setScheduleTime('10:00');
    };

    const handleScheduleSubmit = async () => {
        if (!scheduleDate || !scheduleTime) {
            toast.error('Preencha data e hora');
            return;
        }

        try {
            const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`);

            // Create a post from the library item
            await api.post('/api/posts', {
                accountId: selectedProfile.id,
                type: selectedItem.type,
                mediaUrls: selectedItem.mediaUrls,
                caption: selectedItem.caption,
                scheduledFor: scheduledFor.toISOString(),
                tag: selectedItem.tag,
            });

            // Update library item as scheduled
            await api.put(`/api/library/${selectedItem.id}`, {
                isScheduled: true,
            });

            toast.success('Post agendado com sucesso!');
            setShowScheduleModal(false);
            setSelectedItem(null);
            loadPosts();
        } catch (error) {
            console.error('Schedule error:', error);
            toast.error('Erro ao agendar post');
        }
    };

    const handleEditPost = (post) => {
        setSelectedPost(post);
        setEditCaption(post.caption || '');
        setEditScheduledFor(post.scheduledFor ? formatDateForInput(post.scheduledFor) : '');
        setEditTag(post.tag || 'editar');
        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        try {
            await api.put(`/api/posts/${selectedPost.id}`, {
                caption: editCaption,
                scheduledFor: editScheduledFor || null,
                tag: editTag
            });
            toast.success('Conteúdo atualizado!');
            setShowEditModal(false);
            loadPosts();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao atualizar');
        }
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files || []);
        setSelectedFiles(files);
        if (files.length > 0) {
            setShowUploadModal(true);
        }
    };

    const handleUpload = async () => {
        if (!selectedProfile) {
            toast.error('Selecione um perfil de negócio primeiro');
            return;
        }
        if (selectedFiles.length === 0) {
            toast.error('Selecione pelo menos um arquivo');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            formData.append('businessProfileId', selectedProfile.id);
            formData.append('caption', uploadCaption);
            formData.append('tag', uploadTag);
            formData.append('type', selectedFiles.length > 1 ? 'carousel' : 'static');

            await api.post('/api/library/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            toast.success('Upload realizado com sucesso!');
            setShowUploadModal(false);
            setSelectedFiles([]);
            setUploadCaption('');
            setUploadTag('editar');
            loadPosts();
        } catch (error) {
            console.error('Upload error:', error);
            toast.error(error.response?.data?.error || 'Erro ao fazer upload');
        } finally {
            setUploading(false);
        }
    };

    const formatDate = (dateValue) => {
        if (!dateValue) return '';
        try {
            if (dateValue.seconds) {
                return format(new Date(dateValue.seconds * 1000), 'dd/MM/yyyy HH:mm');
            }
            return format(new Date(dateValue), 'dd/MM/yyyy HH:mm');
        } catch (e) {
            return '';
        }
    };

    const formatDateForInput = (dateValue) => {
        if (!dateValue) return '';
        try {
            const date = dateValue.seconds
                ? new Date(dateValue.seconds * 1000)
                : new Date(dateValue);
            return format(date, "yyyy-MM-dd'T'HH:mm");
        } catch (e) {
            return '';
        }
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

    const getStatusBadgeStyle = (status) => {
        const styles = {
            pending: { background: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa' },
            success: { background: 'rgba(74, 222, 128, 0.2)', color: '#4ade80' },
            processing: { background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' },
            error: { background: 'rgba(248, 113, 113, 0.2)', color: '#f87171' },
        };
        return styles[status] || styles.pending;
    };

    const getTagBadgeStyle = (tag) => {
        if (tag === 'pronto') {
            return { background: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa' };
        }
        return { background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' };
    };

    // Calculate stats
    const [stats, setStats] = useState({
        total: posts.length,
        published: posts.filter(p => p.status === 'success').length,
        scheduled: posts.filter(p => p.status === 'pending').length,
    });

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <div className="container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <BackButton />
                <Breadcrumbs />

                <h1 style={{ marginBottom: '1.5rem' }}>📚 Content Library</h1>

                {selectedProfile && (
                    <>
                        {/* Compact Stats Row */}
                        <section style={{
                            display: 'flex',
                            gap: '1rem',
                            marginBottom: '1.5rem'
                        }}>
                            <div style={{
                                padding: '0.75rem 1.25rem',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '0.5rem',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <span style={{ fontSize: '1.25rem' }}>📊</span>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{stats.total}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Total</div>
                                </div>
                            </div>
                            <div style={{
                                padding: '0.75rem 1.25rem',
                                background: 'rgba(74, 222, 128, 0.08)',
                                borderRadius: '0.5rem',
                                border: '1px solid rgba(74, 222, 128, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <span style={{ fontSize: '1.25rem' }}>✅</span>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#4ade80' }}>{stats.published}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Publicados</div>
                                </div>
                            </div>
                            <div style={{
                                padding: '0.75rem 1.25rem',
                                background: 'rgba(167, 139, 250, 0.08)',
                                borderRadius: '0.5rem',
                                border: '1px solid rgba(167, 139, 250, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <span style={{ fontSize: '1.25rem' }}>⏰</span>
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#a78bfa' }}>{stats.scheduled}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Agendados</div>
                                </div>
                            </div>
                        </section>

                        {/* Filters & Upload */}
                        <section style={{
                            padding: '1.25rem',
                            marginBottom: '2rem',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '0.75rem',
                            border: '1px solid rgba(255, 255, 255, 0.05)'
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '1.5rem', alignItems: 'end' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                                        📁 Tipo
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {['all', 'static', 'carousel'].map((type) => (
                                            <button
                                                key={type}
                                                onClick={() => setTypeFilter(type)}
                                                style={{
                                                    padding: '0.5rem 0.875rem',
                                                    background: typeFilter === type
                                                        ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                        : '#27272a',
                                                    border: typeFilter === type ? '2px solid #a78bfa' : '2px solid transparent',
                                                    borderRadius: '0.5rem',
                                                    color: '#fff',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {type === 'all' ? 'Todos' : type === 'static' ? 'Post' : 'Carrossel'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                                        🏷️ Status
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {['all', 'pending', 'success'].map((status) => (
                                            <button
                                                key={status}
                                                onClick={() => setStatusFilter(status)}
                                                style={{
                                                    padding: '0.5rem 0.875rem',
                                                    background: statusFilter === status
                                                        ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                        : '#27272a',
                                                    border: statusFilter === status ? '2px solid #a78bfa' : '2px solid transparent',
                                                    borderRadius: '0.5rem',
                                                    color: '#fff',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {status === 'all' ? 'Todos' : status === 'pending' ? 'Agendados' : 'Publicados'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <label style={{
                                        padding: '0.625rem 1.25rem',
                                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        📤 Upload
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*,video/*"
                                            onChange={handleFileSelect}
                                            style={{ display: 'none' }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* Content Grid */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem' }}>
                                <p>Carregando conteúdos...</p>
                            </div>
                        ) : posts.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '4rem 2rem',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '0.75rem',
                                border: '1px dashed rgba(255, 255, 255, 0.1)'
                            }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                                <h2 style={{ marginBottom: '0.5rem' }}>Nenhum conteúdo encontrado</h2>
                                <p style={{ color: '#a1a1aa' }}>Crie seu primeiro post para começar!</p>
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '1.5rem'
                            }}>
                                {posts.map(post => (
                                    <div
                                        key={post.id}
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '0.75rem',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            overflow: 'hidden',
                                            transition: 'all 0.3s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        {/* Thumbnail */}
                                        {post.mediaUrls && post.mediaUrls[0] && (
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={post.mediaUrls[0]}
                                                    alt="Preview"
                                                    style={{
                                                        width: '100%',
                                                        height: '240px',
                                                        objectFit: 'cover'
                                                    }}
                                                />
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '0.75rem',
                                                    left: '0.75rem',
                                                    fontSize: '2rem'
                                                }}>
                                                    {getTypeEmoji(post.type)}
                                                </div>
                                                {post.tag && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '0.75rem',
                                                        right: '0.75rem',
                                                        padding: '0.375rem 0.75rem',
                                                        borderRadius: '9999px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600,
                                                        ...getTagBadgeStyle(post.tag)
                                                    }}>
                                                        {post.tag === 'pronto' ? '✓ Pronto' : '✎ A Editar'}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Content */}
                                        <div style={{ padding: '1.25rem' }}>
                                            {/* Status Badge */}
                                            <div style={{ marginBottom: '0.75rem' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '0.25rem 0.75rem',
                                                    borderRadius: '9999px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    ...getStatusBadgeStyle(post.status)
                                                }}>
                                                    {post.status === 'pending' ? '⏰ Agendado' :
                                                        post.status === 'success' ? '✅ Publicado' :
                                                            post.status === 'processing' ? '⚙️ Processando' :
                                                                '❌ Erro'}
                                                </span>
                                            </div>

                                            {/* Caption */}
                                            {post.caption && (
                                                <p style={{
                                                    fontSize: '0.875rem',
                                                    marginBottom: '1rem',
                                                    lineHeight: 1.5,
                                                    color: '#d4d4d8',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden'
                                                }}>
                                                    {post.caption}
                                                </p>
                                            )}

                                            {/* Scheduled Date */}
                                            {post.scheduledFor && (
                                                <p style={{
                                                    fontSize: '0.75rem',
                                                    color: '#a78bfa',
                                                    marginBottom: '1rem'
                                                }}>
                                                    📅 {formatDate(post.scheduledFor)}
                                                </p>
                                            )}

                                            {/* Actions */}
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {post.tag === 'pronto' && !post.isScheduled && (
                                                    <button
                                                        onClick={() => handleScheduleClick(post)}
                                                        style={{
                                                            flex: 1,
                                                            padding: '0.625rem',
                                                            background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                                                            border: 'none',
                                                            borderRadius: '0.5rem',
                                                            color: '#fff',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            transition: 'transform 0.2s ease'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                    >
                                                        📅 Agendar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleEditPost(post)}
                                                    style={{
                                                        flex: post.tag === 'pronto' && !post.isScheduled ? 'none' : 1,
                                                        padding: '0.625rem',
                                                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                                        border: 'none',
                                                        borderRadius: '0.5rem',
                                                        color: '#fff',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        transition: 'transform 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    ✏️ Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePost(post.id)}
                                                    style={{
                                                        padding: '0.625rem 1rem',
                                                        background: 'rgba(248, 113, 113, 0.2)',
                                                        border: '1px solid rgba(248, 113, 113, 0.3)',
                                                        borderRadius: '0.5rem',
                                                        color: '#f87171',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(248, 113, 113, 0.3)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(248, 113, 113, 0.2)';
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Upload Modal */}
                {showUploadModal && selectedFiles.length > 0 && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '2rem'
                    }}
                        onClick={() => !uploading && setShowUploadModal(false)}
                    >
                        <div
                            style={{
                                background: '#18181b',
                                borderRadius: '1rem',
                                padding: '2rem',
                                maxWidth: '600px',
                                width: '100%',
                                maxHeight: '90vh',
                                overflow: 'auto',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 style={{ marginBottom: '1.5rem', color: '#a78bfa' }}>📤 Upload de Conteúdo</h2>

                            {/* File Previews */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                    {selectedFiles.length} arquivo(s) selecionado(s)
                                </label>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                                    gap: '0.5rem'
                                }}>
                                    {selectedFiles.map((file, index) => (
                                        <div key={index} style={{
                                            width: '80px',
                                            height: '80px',
                                            background: '#27272a',
                                            borderRadius: '0.5rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '2rem'
                                        }}>
                                            {file.type.startsWith('image/') ? '🖼️' : '🎥'}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Caption */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                    Caption (opcional)
                                </label>
                                <textarea
                                    value={uploadCaption}
                                    onChange={(e) => setUploadCaption(e.target.value)}
                                    rows={4}
                                    placeholder="Adicione uma legenda..."
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: '#27272a',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '0.875rem',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Tag */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                    Tag
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {['pronto', 'editar'].map((tag) => (
                                        <button
                                            key={tag}
                                            onClick={() => setUploadTag(tag)}
                                            disabled={uploading}
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: uploadTag === tag
                                                    ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                    : '#27272a',
                                                border: uploadTag === tag ? '2px solid #a78bfa' : '2px solid transparent',
                                                borderRadius: '0.5rem',
                                                color: '#fff',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                cursor: uploading ? 'not-allowed' : 'pointer',
                                                opacity: uploading ? 0.5 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {tag === 'pronto' ? '✓ Pronto' : '✎ A Editar'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    style={{
                                        flex: 1,
                                        padding: '0.875rem',
                                        background: uploading
                                            ? '#27272a'
                                            : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        fontWeight: 600,
                                        cursor: uploading ? 'not-allowed' : 'pointer',
                                        opacity: uploading ? 0.7 : 1
                                    }}
                                >
                                    {uploading ? '🔄 Enviando...' : '💾 Fazer Upload'}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowUploadModal(false);
                                        setSelectedFiles([]);
                                        setUploadCaption('');
                                        setUploadTag('editar');
                                    }}
                                    disabled={uploading}
                                    style={{
                                        padding: '0.875rem 1.5rem',
                                        background: '#27272a',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#a1a1aa',
                                        fontSize: '0.95rem',
                                        fontWeight: 600,
                                        cursor: uploading ? 'not-allowed' : 'pointer',
                                        opacity: uploading ? 0.5 : 1
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Modal */}
                {
                    showEditModal && selectedPost && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.8)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '2rem'
                        }}
                            onClick={() => setShowEditModal(false)}
                        >
                            <div
                                style={{
                                    background: '#18181b',
                                    borderRadius: '1rem',
                                    padding: '2rem',
                                    maxWidth: '600px',
                                    width: '100%',
                                    maxHeight: '90vh',
                                    overflow: 'auto',
                                    border: '1px solid rgba(255, 255, 255, 0.1)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 style={{ marginBottom: '1.5rem', color: '#a78bfa' }}>✏️ Editar Conteúdo</h2>

                                {/* Image Preview */}
                                {selectedPost.mediaUrls && selectedPost.mediaUrls[0] && (
                                    <img
                                        src={selectedPost.mediaUrls[0]}
                                        alt="Preview"
                                        style={{
                                            width: '100%',
                                            height: '300px',
                                            objectFit: 'cover',
                                            borderRadius: '0.75rem',
                                            marginBottom: '1.5rem'
                                        }}
                                    />
                                )}

                                {/* Caption */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                        Caption
                                    </label>
                                    <textarea
                                        value={editCaption}
                                        onChange={(e) => setEditCaption(e.target.value)}
                                        rows={5}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: '#27272a',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '0.5rem',
                                            color: '#fff',
                                            fontSize: '0.875rem',
                                            resize: 'vertical'
                                        }}
                                    />
                                </div>

                                {/* Scheduled Date */}
                                {selectedPost.status === 'pending' && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                            Data/Hora Agendada
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={editScheduledFor}
                                            onChange={(e) => setEditScheduledFor(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                background: '#27272a',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '0.5rem',
                                                color: '#fff',
                                                fontSize: '0.875rem'
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Tag */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                        Tag
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {['pronto', 'editar'].map((tag) => (
                                            <button
                                                key={tag}
                                                onClick={() => setEditTag(tag)}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.75rem',
                                                    background: editTag === tag
                                                        ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                        : '#27272a',
                                                    border: editTag === tag ? '2px solid #a78bfa' : '2px solid transparent',
                                                    borderRadius: '0.5rem',
                                                    color: '#fff',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {tag === 'pronto' ? '✓ Pronto' : '✎ A Editar'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button
                                        onClick={handleSaveEdit}
                                        style={{
                                            flex: 1,
                                            padding: '0.875rem',
                                            background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            color: '#fff',
                                            fontSize: '0.95rem',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        💾 Salvar
                                    </button>
                                    <button
                                        onClick={() => setShowEditModal(false)}
                                        style={{
                                            padding: '0.875rem 1.5rem',
                                            background: '#27272a',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '0.5rem',
                                            color: '#a1a1aa',
                                            fontSize: '0.95rem',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >
        </div >
    );
}
