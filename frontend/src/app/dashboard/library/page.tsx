'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import ImageLightbox from '@/components/ImageLightbox';
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
    const [editType, setEditType] = useState('');
    const [replaceFiles, setReplaceFiles] = useState([]);
    const [generatingCaption, setGeneratingCaption] = useState(false);

    // Upload states
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploadCaption, setUploadCaption] = useState('');
    const [uploadTag, setUploadTag] = useState('editar');
    const [uploadType, setUploadType] = useState('static');
    const [uploading, setUploading] = useState(false);

    // Lightbox State
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Schedule modal states
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    // Stats state
    const [stats, setStats] = useState({
        total: 0,
        published: 0,
        scheduled: 0,
    });

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

    const handleDownload = async (post) => {
        try {
            toast.loading('Iniciando download...', { id: 'download-loading' });
            // Download all images from the post
            for (let i = 0; i < post.mediaUrls.length; i++) {
                const url = post.mediaUrls[i];
                const filename = `${post.type}_${i + 1}`;

                // Use the backend proxy endpoint
                const baseUrl = api.defaults.baseURL || 'http://localhost:3001';
                const proxyUrl = `${baseUrl}/api/proxy-download?url=${encodeURIComponent(url)}&filename=${filename}`;

                const link = document.createElement('a');
                link.href = proxyUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Small delay between downloads if multiple files
                if (i < post.mediaUrls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
            toast.dismiss('download-loading');
            toast.success('Download iniciado!');
        } catch (error) {
            console.error('Download error:', error);
            toast.dismiss('download-loading');
            toast.error('Erro ao fazer download');
        }
    };

    const handleLightboxDownload = (url, index) => {
        try {
            const filename = `image_${index + 1}`;
            const baseUrl = api.defaults.baseURL || 'http://localhost:3001';
            const proxyUrl = `${baseUrl}/api/proxy-download?url=${encodeURIComponent(url)}&filename=${filename}`;

            const link = document.createElement('a');
            link.href = proxyUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success('Download iniciado!');
        } catch (error) {
            console.error(error);
            toast.error('Erro ao iniciar download');
        }
    };

    const handleGenerateCaption = async () => {
        if (!selectedPost?.mediaUrls?.[0]) {
            toast.error('Nenhuma imagem encontrada para gerar legenda');
            return;
        }

        try {
            setGeneratingCaption(true);
            toast.loading('Analisando imagem e gerando legenda...', { id: 'caption-loading' });

            const response = await api.post('/api/ai/generate-caption-from-image', {
                imageUrl: selectedPost.mediaUrls[0],
                profileName: selectedProfile?.name,
                profileDescription: selectedProfile?.description,
                guidelines: selectedProfile?.guidelines
            });

            if (response.data.caption) {
                setEditCaption(response.data.caption);
                toast.success('Legenda gerada com sucesso!', { id: 'caption-loading' });
            }

        } catch (error) {
            console.error('Generar caption error:', error);
            toast.error('Erro ao gerar legenda', { id: 'caption-loading' });
        } finally {
            setGeneratingCaption(false);
        }
    };

    const handleEditPost = (post) => {
        setSelectedPost(post);
        setEditCaption(post.caption || '');
        setEditScheduledFor(post.scheduledFor ? formatDateForInput(post.scheduledFor) : '');
        setEditTag(post.tag || 'editar');
        setEditType(post.type || 'static');
        setReplaceFiles([]);
        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        try {
            // If there are files to replace, upload them first
            let updatedMediaUrls = selectedPost.mediaUrls;

            if (replaceFiles.length > 0) {
                const formData = new FormData();
                replaceFiles.forEach(file => {
                    formData.append('files', file);
                });
                formData.append('businessProfileId', selectedPost.businessProfileId);

                const uploadResponse = await api.post('/api/library/upload-files', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                });

                updatedMediaUrls = uploadResponse.data.mediaUrls;
            }

            // Update library item with new data
            await api.put(`/api/library/${selectedPost.id}`, {
                caption: editCaption,
                scheduledFor: editScheduledFor || null,
                tag: editTag,
                type: editType,
                mediaUrls: updatedMediaUrls
            });

            toast.success('Conteúdo atualizado!');
            setShowEditModal(false);
            setReplaceFiles([]);
            loadPosts();
        } catch (error) {
            console.error('Save edit error:', error);
            toast.error(error.response?.data?.error || 'Erro ao atualizar');
        }
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files || []);
        setSelectedFiles(files);

        // Auto-detect type based on file count
        if (files.length > 1) {
            setUploadType('carousel');
        } else if (files.length === 1) {
            setUploadType('static');
        }

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
            formData.append('type', uploadType);

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
            setUploadType('static');
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


    const CalendarIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
    );

    const EditIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
    );

    const DownloadIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
    );

    const TrashIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    );



    const CheckIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    );

    const PencilIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
    );

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
            return {
                background: '#000000', // Solid black (not translucent)
                color: '#4ade80', // Green text
                border: '1px solid #22c55e',
                boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)'
            };
        }
        // Default "A Editar"
        return {
            background: '#000000', // Solid black (not translucent)
            color: '#60a5fa', // Blue text
            border: '1px solid #3b82f6',
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.2)'
        };
    };



    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <div className="container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <BackButton />
                <Breadcrumbs />

                <h1 style={{ marginBottom: '1.5rem' }}>📚 Content Library</h1>

                {!selectedProfile && (
                    <div style={{
                        textAlign: 'center',
                        padding: '4rem 2rem',
                        background: 'rgba(124, 58, 237, 0.08)',
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(124, 58, 237, 0.2)'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
                        <h2 style={{ marginBottom: '0.5rem', color: '#a78bfa' }}>Selecione um Perfil de Negócio</h2>
                        <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
                            Escolha um perfil no seletor acima para visualizar seus conteúdos salvos.
                        </p>
                    </div>
                )}

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
                                        {['all', 'static', 'carousel', 'story'].map((type) => (
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
                                                {type === 'all' ? 'Todos' :
                                                    type === 'static' ? 'Post' :
                                                        type === 'carousel' ? 'Carrossel' :
                                                            'Stories'}
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
                                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
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
                                            transition: 'all 0.3s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: '100%'
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
                                            <div
                                                style={{ position: 'relative', cursor: 'pointer' }}
                                                onClick={() => {
                                                    // Find the index of this post in the current list to open lightbox correctly
                                                    const index = posts.indexOf(post);
                                                    setCurrentImageIndex(index);
                                                    setLightboxOpen(true);
                                                }}
                                            >
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
                                                    fontSize: '1.5rem',
                                                    background: 'rgba(0, 0, 0, 0.7)',
                                                    borderRadius: '50%',
                                                    width: '3rem',
                                                    height: '3rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                                                }}>
                                                    {getTypeEmoji(post.type)}
                                                </div>
                                                {post.tag && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '0.75rem',
                                                        right: '0.75rem',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 500,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        ...getTagBadgeStyle(post.tag)
                                                    }}>
                                                        {post.tag === 'pronto' ? <><CheckIcon /> Pronto</> : <><PencilIcon /> A Editar</>}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Content */}
                                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            {/* Status Badge */}


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
                                                    overflow: 'hidden',
                                                    flex: 1
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
                                                            background: '#27272a',
                                                            border: '1px solid #3f3f46',
                                                            borderRadius: '0.5rem',
                                                            color: '#e4e4e7',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 500,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '0.5rem'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = '#3f3f46';
                                                            e.currentTarget.style.color = '#fff';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = '#27272a';
                                                            e.currentTarget.style.color = '#e4e4e7';
                                                        }}
                                                    >
                                                        <CalendarIcon /> Agendar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleEditPost(post)}
                                                    style={{
                                                        flex: post.tag === 'pronto' && !post.isScheduled ? 'none' : 1,
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: '#e4e4e7',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        opacity: 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#3f3f46';
                                                        e.currentTarget.style.color = '#fff';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#27272a';
                                                        e.currentTarget.style.color = '#e4e4e7';
                                                    }}
                                                >
                                                    <EditIcon /> Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDownload(post)}
                                                    title="Baixar arquivos"
                                                    style={{
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: '#e4e4e7',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#3f3f46';
                                                        e.currentTarget.style.color = '#fff';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#27272a';
                                                        e.currentTarget.style.color = '#e4e4e7';
                                                    }}
                                                >
                                                    <DownloadIcon />
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePost(post.id)}
                                                    title="Excluir"
                                                    style={{
                                                        padding: '0.625rem',
                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                        borderRadius: '0.5rem',
                                                        color: '#ef4444',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                                    }}
                                                >
                                                    <TrashIcon />
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
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                                    gap: '0.5rem'
                                }}>
                                    {selectedFiles.map((file, index) => (
                                        <div key={index} style={{
                                            width: '100%',
                                            aspectRatio: '1',
                                            background: '#27272a',
                                            borderRadius: '0.5rem',
                                            overflow: 'hidden',
                                            position: 'relative'
                                        }}>
                                            {file.type.startsWith('image/') ? (
                                                <img
                                                    src={URL.createObjectURL(file)}
                                                    alt={`Preview ${index + 1}`}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover'
                                                    }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '2rem'
                                                }}>
                                                    🎥
                                                </div>
                                            )}
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

                            {/* Type */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                    Tipo de Conteúdo
                                </label>
                                {selectedFiles.length > 1 && (
                                    <p style={{ fontSize: '0.75rem', color: '#a78bfa', marginBottom: '0.5rem' }}>
                                        💡 Múltiplos arquivos detectados - sugerimos "Carrossel"
                                    </p>
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {[
                                        { value: 'static', label: '📸 Post' },
                                        { value: 'carousel', label: '🖼️ Carrossel' },
                                        { value: 'story', label: '📱 Stories' }
                                    ].map((typeOption) => (
                                        <button
                                            key={typeOption.value}
                                            onClick={() => setUploadType(typeOption.value)}
                                            disabled={uploading}
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: uploadType === typeOption.value
                                                    ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                    : '#27272a',
                                                border: uploadType === typeOption.value ? '2px solid #a78bfa' : '2px solid transparent',
                                                borderRadius: '0.5rem',
                                                color: '#fff',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                cursor: uploading ? 'not-allowed' : 'pointer',
                                                opacity: uploading ? 0.5 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {typeOption.label}
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
                                        setUploadType('static');
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

                {/* Schedule Modal */}
                {showScheduleModal && selectedItem && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '1rem'
                    }}>
                        <div style={{
                            background: '#18181b',
                            borderRadius: '1rem',
                            padding: '2rem',
                            maxWidth: '500px',
                            width: '100%',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>📅 Agendar Publicação</h2>

                            {/* Preview */}
                            <div style={{
                                marginBottom: '1.5rem',
                                padding: '1rem',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '0.5rem',
                                border: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                                <img
                                    src={selectedItem.mediaUrls[0]}
                                    alt="Preview"
                                    style={{
                                        width: '100%',
                                        height: '200px',
                                        objectFit: 'cover',
                                        borderRadius: '0.5rem',
                                        marginBottom: '0.5rem'
                                    }}
                                />
                                {selectedItem.caption && (
                                    <p style={{ fontSize: '0.875rem', color: '#d4d4d8', lineHeight: 1.5 }}>
                                        {selectedItem.caption}
                                    </p>
                                )}
                            </div>

                            {/* Date Input */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#d4d4d8' }}>
                                    📅 Data
                                </label>
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: '#27272a',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </div>

                            {/* Time Input */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#d4d4d8' }}>
                                    ⏰ Hora
                                </label>
                                <input
                                    type="time"
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: '#27272a',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={handleScheduleSubmit}
                                    style={{
                                        flex: 1,
                                        padding: '0.875rem',
                                        background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    ✅ Confirmar Agendamento
                                </button>
                                <button
                                    onClick={() => {
                                        setShowScheduleModal(false);
                                        setSelectedItem(null);
                                    }}
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

                                {/* Replace Image */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                        🔄 Substituir Imagem(s)
                                    </label>
                                    <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.75rem' }}>
                                        Faça upload da versão corrigida para substituir a imagem atual
                                    </p>
                                    <label style={{
                                        display: 'block',
                                        padding: '1rem',
                                        background: '#27272a',
                                        border: '2px dashed rgba(124, 58, 237, 0.5)',
                                        borderRadius: '0.5rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = '#a78bfa';
                                            e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                                            e.currentTarget.style.background = '#27272a';
                                        }}
                                    >
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*,video/*"
                                            onChange={(e) => setReplaceFiles(Array.from(e.target.files || []))}
                                            style={{ display: 'none' }}
                                        />
                                        <div style={{ color: '#a78bfa', fontWeight: 600, marginBottom: '0.25rem' }}>
                                            {replaceFiles.length > 0
                                                ? `✓ ${replaceFiles.length} arquivo(s) selecionado(s)`
                                                : '+ Selecionar Imagens'}
                                        </div>
                                        {replaceFiles.length === 0 && (
                                            <div style={{ fontSize: '0.75rem', color: '#71717a' }}>
                                                Clique para escolher arquivos
                                            </div>
                                        )}
                                    </label>
                                    {replaceFiles.length > 0 && (
                                        <button
                                            onClick={() => setReplaceFiles([])}
                                            style={{
                                                marginTop: '0.5rem',
                                                padding: '0.5rem 1rem',
                                                background: 'rgba(248, 113, 113, 0.2)',
                                                border: '1px solid rgba(248, 113, 113, 0.3)',
                                                borderRadius: '0.375rem',
                                                color: '#f87171',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Limpar seleção
                                        </button>
                                    )}
                                </div>

                                {/* Caption */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>
                                            Caption
                                        </label>
                                        <button
                                            onClick={handleGenerateCaption}
                                            disabled={generatingCaption}
                                            style={{
                                                padding: '0.25rem 0.75rem',
                                                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                                border: 'none',
                                                borderRadius: '0.375rem',
                                                color: '#fff',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: generatingCaption ? 'not-allowed' : 'pointer',
                                                opacity: generatingCaption ? 0.7 : 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }}
                                        >
                                            {generatingCaption ? '🧠 Pensando...' : '✨ Gerar Legenda IA'}
                                        </button>
                                    </div>
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

                                {/* Type */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
                                        Tipo de Conteúdo
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {[
                                            { value: 'static', label: '📸 Post' },
                                            { value: 'carousel', label: '🖼️ Carrossel' },
                                            { value: 'story', label: '📱 Stories' }
                                        ].map((typeOption) => (
                                            <button
                                                key={typeOption.value}
                                                onClick={() => setEditType(typeOption.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.75rem',
                                                    background: editType === typeOption.value
                                                        ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                                        : '#27272a',
                                                    border: editType === typeOption.value ? '2px solid #a78bfa' : '2px solid transparent',
                                                    borderRadius: '0.5rem',
                                                    color: '#fff',
                                                    fontSize: '0.875rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {typeOption.label}
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

                {/* Lightbox */}
                {lightboxOpen && (
                    <ImageLightbox
                        images={posts.map(p => p.mediaUrls[0]).filter(Boolean)}
                        currentIndex={currentImageIndex}
                        onClose={() => setLightboxOpen(false)}
                        onNavigate={setCurrentImageIndex}
                        onDownload={handleLightboxDownload}
                    />
                )}
            </div>
        </div>
    );
}
