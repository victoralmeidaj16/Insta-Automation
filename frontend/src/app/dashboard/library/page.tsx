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
    const [processingPost, setProcessingPost] = useState(null);

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
    const [editType, setEditType] = useState('static');
    const [replaceFiles, setReplaceFiles] = useState([]);

    // AI Refinement states
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isRefining, setIsRefining] = useState(false);
    const [refinedImageUrl, setRefinedImageUrl] = useState(null);
    const [generatingCaption, setGeneratingCaption] = useState(false);
    const [attachLogoToAI, setAttachLogoToAI] = useState(false);

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

    // Bulk Actions State
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [showBulkTagModal, setShowBulkTagModal] = useState(false);
    const [bulkTagTarget, setBulkTagTarget] = useState('pronto');
    const [quickRefiningId, setQuickRefiningId] = useState(null);
    const [quickCaptionId, setQuickCaptionId] = useState(null);

    // Pagination state
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastItemId, setLastItemId] = useState<string | null>(null);

    // Image dimensions state (postId -> { w: number, h: number })
    const [imageDimensions, setImageDimensions] = useState<Record<string, { w: number; h: number }>>({});

    // Reformatting state — tracks which posts are currently being formatted by Gemini
    const [formattingIds, setFormattingIds] = useState<Set<string>>(new Set());

    // Helper: returns true if the image dimension is outside the ideal ratio for the post type
    const isOutOfFormat = (postId: string, postType: string): boolean => {
        const dims = imageDimensions[postId];
        if (!dims || dims.w === 0 || dims.h === 0) return false;
        const currentRatio = dims.w / dims.h;
        const idealRatio = (postType === 'story' || postType === 'stories') ? (9 / 16) : (4 / 5);
        return Math.abs(currentRatio - idealRatio) / idealRatio > 0.10; // > 10% deviation (to accommodate Gemini 3:4 output for 4:5 target)
    };

    // Format a single post via Gemini
    const handleFormatPost = async (post) => {
        if (formattingIds.has(post.id)) return;
        setFormattingIds(prev => new Set(prev).add(post.id));
        const toastId = toast.loading('🎨 Reformatando imagem com Gemini...');
        try {
            const response = await api.post(`/api/library/${post.id}/format`);
            toast.success(response.data.message || 'Imagem reformatada!', { id: toastId });
            // Remove cached dimensions so the badge disappears after reload
            setImageDimensions(prev => { const next = { ...prev }; delete next[post.id]; return next; });
            loadPosts();
        } catch (error) {
            console.error('Format error:', error);
            toast.error(error.response?.data?.error || 'Erro ao formatar imagem', { id: toastId });
        } finally {
            setFormattingIds(prev => { const next = new Set(prev); next.delete(post.id); return next; });
        }
    };

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

    const sortPosts = (items) => {
        return [...items].sort((a, b) => {
            // First criteria: isPosted (false < true)
            if (a.isPosted !== b.isPosted) {
                return a.isPosted ? 1 : -1;
            }

            // Second criteria: Recency
            // For posted items, we use updatedAt (when they were marked as posted)
            // For unposted, we use createdAt
            const getSortTime = (item) => {
                const date = item.isPosted ? (item.updatedAt || item.createdAt) : item.createdAt;
                if (!date) return 0;
                if (date.seconds) return date.seconds * 1000;
                if (date instanceof Date) return date.getTime();
                return new Date(date).getTime();
            };

            return getSortTime(b) - getSortTime(a);
        });
    };

    const loadPosts = async (reset = true) => {
        if (reset) {
            setLoading(true);
            setLastItemId(null);
        } else {
            setLoadingMore(true);
        }
        try {
            const params = new URLSearchParams();
            if (selectedProfile) params.append('businessProfileId', selectedProfile.id);
            if (!reset && lastItemId) params.append('lastId', lastItemId);

            const response = await api.get(`/api/library?${params}`);
            const { items: rawItems, hasMore: more } = response.data;

            // Apply filters on frontend
            let items = rawItems;
            if (typeFilter !== 'all') items = items.filter(item => item.type === typeFilter);
            if (tagFilter !== 'all') items = items.filter(item => item.tag === tagFilter);

            if (reset) {
                setPosts(sortPosts(items));
                setStats({
                    total: items.length,
                    published: 0,
                    scheduled: items.filter(item => item.isScheduled).length,
                });
            } else {
                setPosts(prev => sortPosts([...prev, ...items]));
            }

            setHasMore(more);
            if (rawItems.length > 0) setLastItemId(rawItems[rawItems.length - 1].id);
        } catch (error) {
            console.error('Error loading library items:', error);
            toast.error('Erro ao carregar biblioteca');
        } finally {
            setLoading(false);
            setLoadingMore(false);
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
                libraryItemId: selectedItem.id,
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

    const handlePostNow = async (item) => {
        if (!confirm('Deseja postar este conteúdo imediatamente?')) return;

        try {
            setProcessingPost(item.id);
            toast.loading('Iniciando postagem...', { id: 'post-now' });

            // Create immediate post
            await api.post('/api/posts', {
                accountId: selectedProfile.id,
                type: item.type,
                mediaUrls: item.mediaUrls,
                caption: item.caption,
                scheduledFor: null, // Immediate
                tag: item.tag,
                libraryItemId: item.id // Ensure linkage
            });

            // Update status
            const updatedPosts = posts.map(p => {
                if (p.id === item.id) {
                    return { ...p, status: 'processing' }; // Optimistic update
                }
                return p;
            });
            setPosts(updatedPosts);

            toast.success('Post enviado para processamento!', { id: 'post-now' });
            setProcessingPost(null);

            // Optionally redirect to Posts page or just refresh
            // router.push('/dashboard/posts');
        } catch (error) {
            console.error('Post now error:', error);
            toast.error('Erro ao postar', { id: 'post-now' });
            setProcessingPost(null);
        }
    };

    const handleTogglePosted = async (item) => {
        try {
            const newIsPosted = !item.isPosted;
            const now = new Date();

            // Optimistic update
            const updatedPosts = posts.map(p => {
                if (p.id === item.id) {
                    return {
                        ...p,
                        isPosted: newIsPosted,
                        updatedAt: newIsPosted ? now : p.updatedAt
                    };
                }
                return p;
            });

            // Re-sort locally so the item moves to correct section immediately
            setPosts(sortPosts(updatedPosts));

            await api.put(`/api/library/${item.id}`, {
                isPosted: newIsPosted
            });

            toast.success(newIsPosted ? 'Marcado como Já Postado' : 'Desmarcado como Postado');
        } catch (error) {
            console.error('Toggle posted error:', error);
            toast.error('Erro ao atualizar status');
            // Revert optimistic update
            loadPosts();
        }
    };

    const handleDownload = async (post) => {
        try {
            toast.loading('Iniciando download...', { id: 'download-loading' });
            // Download all images from the post
            for (let i = 0; i < post.mediaUrls.length; i++) {
                const url = post.mediaUrls[i];
                const filename = `${post.type}_${i + 1}`;

                // If URL is base64, download directly. Otherwise use proxy.
                const downloadUrl = url.startsWith('data:')
                    ? url
                    : `${api.defaults.baseURL || 'http://localhost:3001'}/api/proxy-download?url=${encodeURIComponent(url)}&filename=${filename}`;

                const link = document.createElement('a');
                link.href = downloadUrl;
                if (url.startsWith('data:')) {
                    link.download = `${filename}.${url.split(';')[0].split('/')[1] || 'jpg'}`;
                }
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

            // If URL is base64, download directly. Otherwise use proxy.
            const downloadUrl = url.startsWith('data:')
                ? url
                : `${api.defaults.baseURL || 'http://localhost:3001'}/api/proxy-download?url=${encodeURIComponent(url)}&filename=${filename}`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            if (url.startsWith('data:')) {
                link.download = `${filename}.${url.split(';')[0].split('/')[1] || 'jpg'}`;
            }
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

    const handleRefineImage = async () => {
        if (!refinePrompt && !attachLogoToAI) {
            toast.error('Descreva o que deseja mudar na imagem ou opte por anexar a logo.');
            return;
        }

        setIsRefining(true);
        try {
            // Use ideal ratio based on content type (Story vs Feed)
            const targetRatio = (editType === 'story' || editType === 'stories') ? '9:16' : '4:5';
            let formattedPrompt = refinePrompt;

            const response = await api.post('/api/ai/generate-single-image', {
                prompt: formattedPrompt,
                referenceImage: selectedPost.mediaUrls[0],
                aspectRatio: targetRatio,
                businessProfileId: selectedProfile?.id,
                model: 'gemini',
                attachLogo: attachLogoToAI
            });

            if (response.data.success) {
                setRefinedImageUrl(response.data.image);
                toast.success('Imagem refinada com sucesso!');
            }
        } catch (error) {
            console.error('Refine image error:', error);
            toast.error('Erro ao refinar imagem com IA');
        } finally {
            setIsRefining(false);
        }
    };

    const handleAcceptRefinedImage = async () => {
        if (!refinedImageUrl) return;

        try {
            setLoading(true);
            await api.put(`/api/library/${selectedPost.id}`, {
                mediaUrls: [refinedImageUrl],
                tag: 'pronto'
            });

            toast.success('Imagem atualizada e marcada como "pronto"!');
            setRefinedImageUrl(null);
            setRefinePrompt('');
            setShowEditModal(false);
            loadPosts();
        } catch (error) {
            console.error('Error accepting refined image:', error);
            toast.error('Erro ao salvar imagem refinada');
        } finally {
            setLoading(false);
        }
    };

    const handleQuickRefine = async (post) => {
        if (quickRefiningId) return;

        const isInnerBoost = selectedProfile?.name?.toLowerCase().includes('inner boost');
        const confirmMsg = isInnerBoost
            ? "Deseja aplicar o '🪄 Super Prompt: Corrigir Inglês & Design' e anexar a Logo automaticamente?"
            : "Deseja aplicar o '🪄 Super Prompt: Corrigir Inglês & Design' automaticamente?";

        if (!window.confirm(confirmMsg)) return;

        setQuickRefiningId(post.id);
        const toastId = toast.loading('🪄 Refinando imagem...');

        try {
            const response = await api.post('/api/ai/generate-single-image', {
                prompt: `You are a senior creative director and editorial copywriter specialized in premium motivational tech visuals.

Analyze this image and understand the intended message behind the design before making any changes.

Your task:

Identify all incorrect English phrases.
Remove meaningless numbers, random percentages, and unrelated hex codes.
Rewrite the text so it makes grammatical and conceptual sense.
Maintain the futuristic, tech, self-development tone of the design.
Keep the layout balanced — similar text hierarchy and placement.
Do NOT overcrowd the image.
Do NOT change the main visual elements (mirror, silhouettes, lighting, colors).
Replace broken text with refined, natural English that elevates the concept.`,
                referenceImage: post.mediaUrls[0],
                aspectRatio: '4:5',
                businessProfileId: selectedProfile?.id,
                model: 'gemini',
                attachLogo: isInnerBoost // Only attach logo for Inner Boost
            });

            if (response.data.success) {
                const newImageUrl = response.data.image;

                // Automatically accept and mark as ready
                await api.put(`/api/library/${post.id}`, {
                    mediaUrls: [newImageUrl],
                    tag: 'pronto'
                });

                toast.success('✨ Refinado com sucesso!', { id: toastId });
                loadPosts();
            } else {
                throw new Error('Falha na geração da imagem');
            }
        } catch (error) {
            console.error('Quick refine error:', error);
            toast.error('Erro no refinamento rápido', { id: toastId });
        } finally {
            setQuickRefiningId(null);
        }
    };

    const handleQuickCaption = async (post) => {
        if (quickCaptionId || !post?.mediaUrls?.[0]) return;

        setQuickCaptionId(post.id);
        const toastId = toast.loading('🧠 Analisando imagem e gerando legenda...');

        try {
            const response = await api.post('/api/ai/generate-caption-from-image', {
                imageUrl: post.mediaUrls[0],
                profileName: selectedProfile?.name,
                profileDescription: selectedProfile?.description,
                guidelines: selectedProfile?.guidelines
            });

            if (response.data.caption) {
                // Automatically save the generated caption to the post
                await api.put(`/api/library/${post.id}`, {
                    caption: response.data.caption
                });

                toast.success('✨ Legenda gerada e salva!', { id: toastId });
                loadPosts(); // Refresh to show the new caption in the card
            } else {
                throw new Error('Falha na geração da legenda');
            }
        } catch (error) {
            console.error('Quick caption error:', error);
            toast.error('Erro ao gerar legenda: ' + (error.response?.data?.error || error.message), { id: toastId });
        } finally {
            setQuickCaptionId(null);
        }
    };

    const handleEditPost = (post) => {
        setSelectedPost(post);
        setEditCaption(post.caption || '');
        setEditScheduledFor(post.scheduledFor ? formatDateForInput(post.scheduledFor) : '');
        setEditTag(post.tag || 'editar');
        setEditType(post.type || 'static');
        setReplaceFiles([]);

        // Reset refinement states
        setRefinePrompt('');
        setRefinedImageUrl(null);
        setIsRefining(false);
        setAttachLogoToAI(false);

        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        try {
            // Auto-format check: if image is out of ideal ratio for the selected type, reformat first
            if (selectedPost?.id && imageDimensions[selectedPost.id]) {
                const outOfFormat = isOutOfFormat(selectedPost.id, editType);
                if (outOfFormat) {
                    toast.loading('📐 Reformatando imagem para o tamanho ideal...', { id: 'auto-format' });
                    try {
                        // Temporarily override the type in the DB so the format endpoint uses the right ratio
                        await api.put(`/api/library/${selectedPost.id}`, { type: editType });
                        await api.post(`/api/library/${selectedPost.id}/format`);
                        toast.success('✅ Imagem reformatada automaticamente!', { id: 'auto-format' });
                        // Reload updated mediaUrls
                        const updatedDoc = await api.get(`/api/library?businessProfileId=${selectedPost.businessProfileId}`);
                        const updated = updatedDoc.data.items.find(p => p.id === selectedPost.id);
                        if (updated) selectedPost.mediaUrls = updated.mediaUrls;
                    } catch (fmtErr) {
                        toast.dismiss('auto-format');
                        console.warn('Auto-format failed, continuing save:', fmtErr.message);
                    }
                }
            }

            // Update library item with new data
            await api.put(`/api/library/${selectedPost.id}`, {
                caption: editCaption,
                scheduledFor: editScheduledFor || null,
                tag: editTag,
                type: editType,
                mediaUrls: selectedPost.mediaUrls
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
            // Check for duplicate filenames before uploading
            const existingNames = posts.map(p => p.originalName || '').filter(Boolean);
            const duplicateFileNames = selectedFiles
                .filter(file => existingNames.includes(file.name))
                .map(file => file.name);

            if (duplicateFileNames.length > 0) {
                const proceed = window.confirm(
                    `As seguintes imagens já existem na biblioteca:\n\n${duplicateFileNames.join('\n')}\n\nDeseja carregar assim mesmo?`
                );
                if (!proceed) {
                    setUploading(false);
                    return;
                }
            }

            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            formData.append('businessProfileId', selectedProfile.id);
            formData.append('caption', uploadCaption);
            formData.append('tag', uploadTag);
            formData.append('type', uploadType);

            const response = await api.post('/api/library/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            toast.success(response.data.message || 'Upload realizado com sucesso!');
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

    const getTagBadgeStyle = (tag: string, isScheduled?: boolean, isPosted?: boolean) => {
        if (isPosted) {
            return {
                background: '#000000',
                color: '#4ade80', // Green
                border: '1px solid #22c55e',
                boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)'
            };
        }
        if (isScheduled) {
            return {
                background: '#000000',
                color: '#a78bfa', // Purple
                border: '1px solid #8b5cf6',
                boxShadow: '0 0 10px rgba(139, 92, 246, 0.2)'
            };
        }
        if (tag === 'pronto') {
            return {
                background: '#000000',
                color: '#4ade80',
                border: '1px solid #22c55e',
                boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)'
            };
        }
        // Default "A Editar"
        return {
            background: '#000000',
            color: '#60a5fa',
            border: '1px solid #3b82f6',
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.2)'
        };
    };



    const toggleSelection = (id) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedItems.size === posts.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(posts.map(p => p.id)));
        }
    };

    const handleBulkTagUpdate = async () => {
        if (selectedItems.size === 0) return;

        toast.loading(`Atualizando ${selectedItems.size} itens...`, { id: 'bulk-update' });
        try {
            // Since we don't have a bulk endpoint, we'll run parallel requests
            // In a real production app, you should create a bulk endpoint
            const updatePromises = Array.from(selectedItems).map(id =>
                api.put(`/api/library/${id}`, { tag: bulkTagTarget })
            );

            await Promise.all(updatePromises);

            toast.success('Itens atualizados com sucesso!', { id: 'bulk-update' });
            setShowBulkTagModal(false);
            setSelectedItems(new Set());
            loadPosts();
        } catch (error) {
            console.error('Bulk update error:', error);
            toast.error('Erro ao atualizar alguns itens', { id: 'bulk-update' });
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}} />
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

                        {/* Filters & Actions */}
                        <section style={{
                            padding: '1.25rem',
                            marginBottom: '2rem',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '0.75rem',
                            border: '1px solid rgba(255, 255, 255, 0.05)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
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
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    {posts.length > 0 && (
                                        <button
                                            onClick={handleSelectAll}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #3f3f46',
                                                color: '#d4d4d8',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem'
                                            }}
                                        >
                                            {selectedItems.size === posts.length ? 'Deselecionar Todos' : 'Selecionar Todos'}
                                        </button>
                                    )}

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

                        {/* Bulk Action Floating Bar */}
                        {selectedItems.size > 0 && (
                            <div style={{
                                position: 'fixed',
                                bottom: '2rem',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: '#18181b',
                                border: '1px solid #3f3f46',
                                borderRadius: '9999px',
                                padding: '0.75rem 1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.5rem',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                zIndex: 50
                            }}>
                                <span style={{ fontWeight: 600, color: '#fff' }}>
                                    {selectedItems.size} selecionado(s)
                                </span>
                                <div style={{ width: '1px', height: '24px', background: '#3f3f46' }}></div>
                                <button
                                    onClick={() => setShowBulkTagModal(true)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#a78bfa',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    <EditIcon /> Editar Tag
                                </button>
                                <button
                                    onClick={() => setSelectedItems(new Set())}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#71717a',
                                        cursor: 'pointer',
                                        marginLeft: '0.5rem'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        {/* Content Grid */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem' }}>
                                <p>Carregando conteúdos...</p>
                            </div>
                        ) : !selectedProfile ? (
                            profiles.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '0.75rem',
                                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                                    marginTop: '2rem'
                                }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
                                    <h2 style={{ marginBottom: '0.5rem' }}>Nenhum Perfil de Negócio Encontrado</h2>
                                    <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>Você precisa criar um Perfil de Negócio antes de acessar a Library.</p>
                                    <button
                                        onClick={() => router.push('/dashboard/business-profiles')}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        Criar Meu Primeiro Perfil
                                    </button>
                                </div>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '4rem 2rem',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '0.75rem',
                                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                                    marginTop: '2rem'
                                }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
                                    <h2 style={{ marginBottom: '0.5rem' }}>Selecione um Perfil de Negócio</h2>
                                    <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>Escolha um perfil no seletor do topo da página para visualizar seus conteúdos salvos.</p>
                                    {/* Automatically select the first profile as a helper if one exists */}
                                    <button
                                        onClick={() => setSelectedProfile(profiles[0])}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            background: 'rgba(124, 58, 237, 0.2)',
                                            border: '1px solid rgba(124, 58, 237, 0.5)',
                                            borderRadius: '0.5rem',
                                            color: '#fff',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Selecionar "{profiles[0].name}"
                                    </button>
                                </div>
                            )
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
                            <>
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
                                                        objectFit: 'cover',
                                                        filter: post.isPosted ? 'blur(2px) brightness(40%)' : 'none',
                                                        transition: 'all 0.3s ease'
                                                    }}
                                                    onLoad={(e) => {
                                                        const img = e.currentTarget;
                                                        setImageDimensions(prev => ({
                                                            ...prev,
                                                            [post.id]: { w: img.naturalWidth, h: img.naturalHeight }
                                                        }));
                                                    }}
                                                />
                                                {/* Posted Overlay Badge */}
                                                {post.isPosted && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '50%',
                                                        left: '50%',
                                                        transform: 'translate(-50%, -50%)',
                                                        background: 'rgba(34, 197, 94, 0.2)',
                                                        border: '1px solid rgba(34, 197, 94, 0.5)',
                                                        color: '#4ade80',
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '2rem',
                                                        fontWeight: 700,
                                                        fontSize: '1rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                                                        zIndex: 10,
                                                        pointerEvents: 'none'
                                                    }}>
                                                        <CheckIcon /> Já Postada
                                                    </div>
                                                )}

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

                                                {(post.tag || post.isScheduled || post.isPosted) && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '0.75rem',
                                                        right: '0.75rem',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.35rem',
                                                        zIndex: 2,
                                                        ...getTagBadgeStyle(post.tag, post.isScheduled, post.isPosted)
                                                    }}>
                                                        {post.isPosted ? (
                                                            <><CheckIcon /> Publicado</>
                                                        ) : post.isScheduled ? (
                                                            <><CalendarIcon /> Agendado</>
                                                        ) : post.tag === 'pronto' ? (
                                                            <><CheckIcon /> Pronto</>
                                                        ) : (
                                                            <><PencilIcon /> A Editar</>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Dimension Badge + Out-of-Format Warning */}
                                                {imageDimensions[post.id] && (
                                                    <>
                                                        {/* WxH badge — bottom left */}
                                                        <div style={{
                                                            position: 'absolute',
                                                            bottom: '0.5rem',
                                                            left: '0.5rem',
                                                            background: 'rgba(0,0,0,0.72)',
                                                            backdropFilter: 'blur(4px)',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            borderRadius: '4px',
                                                            padding: '0.2rem 0.45rem',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 600,
                                                            color: '#e4e4e7',
                                                            letterSpacing: '0.02em',
                                                            pointerEvents: 'none',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            {imageDimensions[post.id].w} × {imageDimensions[post.id].h}
                                                        </div>

                                                        {/* Out-of-format badge + button — bottom right */}
                                                        {isOutOfFormat(post.id, post.type) && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                bottom: '0.5rem',
                                                                right: '0.5rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                background: 'rgba(0,0,0,0.82)',
                                                                backdropFilter: 'blur(4px)',
                                                                border: '1px solid rgba(251,146,60,0.4)',
                                                                borderRadius: '6px',
                                                                padding: '0.2rem 0.4rem 0.2rem 0.35rem',
                                                                fontSize: '0.62rem',
                                                                fontWeight: 600,
                                                                color: '#fb923c',
                                                            }}>
                                                                {formattingIds.has(post.id) ? (
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                                                                        Formatando...
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        <span>⚠️</span>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleFormatPost(post); }}
                                                                            title="Formatar para o tamanho ideal"
                                                                            style={{
                                                                                background: 'rgba(251,146,60,0.18)',
                                                                                border: '1px solid rgba(251,146,60,0.5)',
                                                                                borderRadius: '4px',
                                                                                color: '#fb923c',
                                                                                fontSize: '0.6rem',
                                                                                fontWeight: 700,
                                                                                padding: '0.1rem 0.3rem',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.15s ease',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center'
                                                                            }}
                                                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251,146,60,0.35)'; }}
                                                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(251,146,60,0.18)'; }}
                                                                        >
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                                                                                <path d="m5 3 1 1" /><path d="m19 3-1 1" /><path d="m5 21 1-1" /><path d="m19 21-1-1" />
                                                                            </svg>
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* Content */}
                                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
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


                                            {/* Actions */}
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleSelection(post.id);
                                                    }}
                                                    style={{
                                                        padding: '0.625rem',
                                                        background: selectedItems.has(post.id) ? '#7c3aed' : '#27272a',
                                                        border: selectedItems.has(post.id) ? '1px solid #a78bfa' : '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: selectedItems.has(post.id) ? '#fff' : '#a1a1aa',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: '2.5rem'
                                                    }}
                                                    title="Selecionar"
                                                >
                                                    {selectedItems.has(post.id) ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    ) : (
                                                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '2px solid rgba(255,255,255,0.3)' }}></div>
                                                    )}
                                                </button>
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
                                                        <CalendarIcon />
                                                    </button>
                                                )}

                                                {/* Post Now Button */}
                                                {post.tag === 'pronto' && !post.isScheduled && (
                                                    <button
                                                        onClick={() => handlePostNow(post)}
                                                        disabled={processingPost === post.id}
                                                        title="Postar Agora"
                                                        style={{
                                                            padding: '0.625rem',
                                                            background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                                            border: 'none',
                                                            borderRadius: '0.5rem',
                                                            color: '#fff',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 500,
                                                            cursor: processingPost === post.id ? 'not-allowed' : 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            opacity: processingPost === post.id ? 0.7 : 1,
                                                            boxShadow: '0 2px 10px rgba(124, 58, 237, 0.3)'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (processingPost !== post.id) {
                                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.5)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                            e.currentTarget.style.boxShadow = '0 2px 10px rgba(124, 58, 237, 0.3)';
                                                        }}
                                                    >
                                                        {processingPost === post.id ? '⏳' : '🚀'}
                                                    </button>
                                                )}

                                                {/* Toggle Posted Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleTogglePosted(post);
                                                    }}
                                                    title={post.isPosted ? "Desmarcar como Postado" : "Marcar como Postado"}
                                                    style={{
                                                        padding: '0.625rem',
                                                        background: post.isPosted ? 'rgba(34, 197, 94, 0.1)' : '#27272a',
                                                        border: post.isPosted ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: post.isPosted ? '#4ade80' : '#a1a1aa',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: '2.5rem'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!post.isPosted) {
                                                            e.currentTarget.style.background = '#3f3f46';
                                                            e.currentTarget.style.color = '#fff';
                                                        } else {
                                                            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!post.isPosted) {
                                                            e.currentTarget.style.background = '#27272a';
                                                            e.currentTarget.style.color = '#a1a1aa';
                                                        } else {
                                                            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                                                        }
                                                    }}
                                                >
                                                    {post.isPosted ? <CheckIcon /> : '👁️‍🗨️'}
                                                </button>

                                                {/* Super Prompt Quick Refine Button */}
                                                {(selectedProfile?.name?.toLowerCase().includes('inner boost') || true) && (
                                                    <button
                                                        onClick={() => handleQuickRefine(post)}
                                                        disabled={!!quickRefiningId}
                                                        title="Super Prompt: Corrigir Inglês & Design + Logo"
                                                        style={{
                                                            padding: '0.625rem',
                                                            background: 'rgba(56, 189, 248, 0.1)',
                                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                                            borderRadius: '0.5rem',
                                                            color: '#38bdf8',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 500,
                                                            cursor: quickRefiningId ? 'not-allowed' : 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            minWidth: '2.5rem',
                                                            opacity: quickRefiningId && quickRefiningId !== post.id ? 0.5 : 1
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!quickRefiningId) {
                                                                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)';
                                                                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!quickRefiningId) {
                                                                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
                                                                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                                                            }
                                                        }}
                                                    >
                                                        {quickRefiningId === post.id ? '⏳' : '🪄'}
                                                    </button>
                                                )}

                                                {/* Quick Caption Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleQuickCaption(post);
                                                    }}
                                                    disabled={!!quickCaptionId}
                                                    title="Gerar Legenda com IA"
                                                    style={{
                                                        padding: '0.625rem',
                                                        background: 'rgba(168, 85, 247, 0.1)',
                                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                                        borderRadius: '0.5rem',
                                                        color: '#d8b4fe',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: quickCaptionId ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: '2.5rem',
                                                        opacity: quickCaptionId && quickCaptionId !== post.id ? 0.5 : 1
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!quickCaptionId) {
                                                            e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)';
                                                            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!quickCaptionId) {
                                                            e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)';
                                                            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                                                        }
                                                    }}
                                                >
                                                    {quickCaptionId === post.id ? '⏳' : '✨'}
                                                </button>

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
                            {hasMore && (
                                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                                    <button
                                        onClick={() => loadPosts(false)}
                                        disabled={loadingMore}
                                        style={{
                                            padding: '0.75rem 2.5rem',
                                            background: 'rgba(124, 58, 237, 0.12)',
                                            border: '1px solid rgba(124, 58, 237, 0.4)',
                                            borderRadius: '0.5rem',
                                            color: '#a78bfa',
                                            fontSize: '0.875rem',
                                            fontWeight: 600,
                                            cursor: loadingMore ? 'default' : 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        {loadingMore ? '⏳ Carregando...' : '+ Carregar mais'}
                                    </button>
                                </div>
                            )}
                            </>
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

                {/* Bulk Tag Update Modal */}
                {showBulkTagModal && (
                    <div className="modal-overlay" onClick={() => setShowBulkTagModal(false)}
                        style={{
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
                            zIndex: 60
                        }}
                    >
                        <div className="card-glass" style={{
                            width: '100%',
                            maxWidth: '400px',
                            background: '#18181b',
                            padding: '1.5rem',
                            borderRadius: '1rem',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 style={{ marginBottom: '1rem', color: '#fff' }}>
                                Editar Tags em Lote
                            </h3>
                            <p style={{ color: '#a1a1aa', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                                Selecione a nova tag para os {selectedItems.size} itens selecionados:
                            </p>

                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                <button
                                    onClick={() => setBulkTagTarget('pronto')}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: bulkTagTarget === 'pronto' ? '#000' : '#27272a',
                                        border: bulkTagTarget === 'pronto' ? '1px solid #22c55e' : '1px solid transparent',
                                        borderRadius: '0.5rem',
                                        color: bulkTagTarget === 'pronto' ? '#4ade80' : '#a1a1aa',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                    }}
                                >
                                    ✓ Pronto
                                </button>
                                <button
                                    onClick={() => setBulkTagTarget('editar')}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: bulkTagTarget === 'editar' ? '#000' : '#27272a',
                                        border: bulkTagTarget === 'editar' ? '1px solid #3b82f6' : '1px solid transparent',
                                        borderRadius: '0.5rem',
                                        color: bulkTagTarget === 'editar' ? '#60a5fa' : '#a1a1aa',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                    }}
                                >
                                    ✎ A Editar
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={handleBulkTagUpdate}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Confirmar
                                </button>
                                <button
                                    onClick={() => setShowBulkTagModal(false)}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        background: 'transparent',
                                        border: '1px solid #3f3f46',
                                        borderRadius: '0.5rem',
                                        color: '#d4d4d8',
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



                                {/* AI Refinement Section */}
                                <div style={{
                                    marginBottom: '1.5rem',
                                    padding: '1.25rem',
                                    background: 'rgba(124, 58, 237, 0.05)',
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(124, 58, 237, 0.2)'
                                }}>
                                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: '#a78bfa' }}>
                                        ✨ Refinar com IA (Banana Pro)
                                    </label>
                                    <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>
                                        Descreva ajustes (ex: "Corrigir texto para ...", "Mudar cor de ...")
                                    </p>

                                    {/* Preset Prompts */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => setRefinePrompt(`You are a senior creative director and editorial copywriter specialized in premium motivational tech visuals.

Analyze this image and understand the intended message behind the design before making any changes.

Your task:

Identify all incorrect English phrases.
Remove meaningless numbers, random percentages, and unrelated hex codes.
Rewrite the text so it makes grammatical and conceptual sense.
Maintain the futuristic, tech, self-development tone of the design.
Keep the layout balanced — similar text hierarchy and placement.
Do NOT overcrowd the image.
Do NOT change the main visual elements (mirror, silhouettes, lighting, colors).
Replace broken text with refined, natural English that elevates the concept.`)}
                                            style={{
                                                padding: '0.35rem 0.75rem',
                                                background: 'rgba(56, 189, 248, 0.1)',
                                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                                borderRadius: '0.5rem',
                                                color: '#38bdf8',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)';
                                                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
                                                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                                            }}
                                        >
                                            🪄 Super Prompt: Corrigir Inglês & Design
                                        </button>
                                    </div>

                                    {/* Checklist/Toggle para a Logo Inner Boost */}
                                    {selectedProfile?.name?.toLowerCase().includes('inner boost') && (
                                        <div
                                            onClick={() => setAttachLogoToAI(!attachLogoToAI)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.75rem 1rem',
                                                background: attachLogoToAI
                                                    ? 'linear-gradient(135deg, rgba(0, 112, 243, 0.15) 0%, rgba(0, 200, 150, 0.15) 100%)'
                                                    : 'rgba(255, 255, 255, 0.03)',
                                                border: attachLogoToAI
                                                    ? '1px solid rgba(0, 200, 150, 0.4)'
                                                    : '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '0.5rem',
                                                marginBottom: '1rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <div style={{
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '4px',
                                                border: attachLogoToAI ? 'none' : '2px solid rgba(255, 255, 255, 0.3)',
                                                background: attachLogoToAI ? '#0070f3' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {attachLogoToAI && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                                            </div>
                                            <img src="/logos/inner-boost-logo.png" alt="" style={{ width: '18px', height: '18px', borderRadius: '50%' }} />
                                            <span style={{ fontSize: '0.875rem', color: attachLogoToAI ? '#67e8f9' : '#a1a1aa', fontWeight: attachLogoToAI ? 600 : 400 }}>
                                                Anexar Logo Inner Boost na imagem
                                            </span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input
                                            type="text"
                                            value={refinePrompt}
                                            onChange={(e) => setRefinePrompt(e.target.value)}
                                            placeholder="Ex: Corrigir o texto para 'Novo Título'... (Opcional se anexar logo)"
                                            style={{
                                                flex: 1,
                                                padding: '0.75rem',
                                                background: '#18181b',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '0.5rem',
                                                color: '#fff',
                                                fontSize: '0.875rem'
                                            }}
                                        />
                                        <button
                                            onClick={handleRefineImage}
                                            disabled={isRefining || (!refinePrompt && !attachLogoToAI)}
                                            style={{
                                                padding: '0.75rem 1.25rem',
                                                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                color: '#fff',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                cursor: (isRefining || !refinePrompt) ? 'not-allowed' : 'pointer',
                                                opacity: (isRefining || !refinePrompt) ? 0.6 : 1,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {isRefining ? '⏳ Processando...' : '🚀 Refinar'}
                                        </button>
                                    </div>

                                    {refinedImageUrl && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <p style={{ fontSize: '0.875rem', color: '#fff', marginBottom: '0.75rem', fontWeight: 600 }}>
                                                Nova versão gerada:
                                            </p>
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={refinedImageUrl}
                                                    alt="Refined Preview"
                                                    style={{
                                                        width: '100%',
                                                        height: 'auto',
                                                        borderRadius: '0.5rem',
                                                        border: '2px solid #7c3aed'
                                                    }}
                                                />
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '0.75rem',
                                                    marginTop: '1rem',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    <button
                                                        onClick={handleAcceptRefinedImage}
                                                        style={{
                                                            flex: 1,
                                                            padding: '0.75rem',
                                                            background: '#22c55e',
                                                            border: 'none',
                                                            borderRadius: '0.5rem',
                                                            color: '#fff',
                                                            fontSize: '0.875rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✅ Usar esta versão
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedPost({
                                                                ...selectedPost,
                                                                mediaUrls: [refinedImageUrl]
                                                            });
                                                            setRefinedImageUrl(null);
                                                            setRefinePrompt('');
                                                        }}
                                                        style={{
                                                            padding: '0.75rem 1rem',
                                                            background: '#7c3aed',
                                                            border: 'none',
                                                            borderRadius: '0.5rem',
                                                            color: '#fff',
                                                            fontSize: '0.875rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✏️ Editar esta imagem
                                                    </button>
                                                    <button
                                                        onClick={() => setRefinedImageUrl(null)}
                                                        style={{
                                                            padding: '0.75rem 1rem',
                                                            background: 'rgba(255, 255, 255, 0.1)',
                                                            border: 'none',
                                                            borderRadius: '0.5rem',
                                                            color: '#fff',
                                                            fontSize: '0.875rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Descartar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
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
        </div >
    );
}
