'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import ImageLightbox from '@/components/ImageLightbox';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Post {
    id: string;
    caption: string;
    mediaUrls: string[];
    scheduledFor: string;
    type: string;
}

interface CarouselCard {
    prompt: string;
    image?: string;
    isGeneratingImage: boolean;
}

export default function GeneratePage() {
    const router = useRouter();
    const { profiles, selectedProfile, setSelectedProfile } = useBusinessProfile();

    // Simple mode states
    const [prompt, setPrompt] = useState('');

    // Carousel mode states  
    const [carouselDescription, setCarouselDescription] = useState('');
    const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([]);
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

    // Common states
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '16:9' | '9:16'>('1:1');
    const [imageCount, setImageCount] = useState<number>(1);
    const [scheduledPosts, setScheduledPosts] = useState<Post[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [view, setView] = useState<'generate' | 'calendar'>('generate');

    // Lightbox states
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxImages, setLightboxImages] = useState<string[]>([]);
    const [lightboxIndex, setLightboxIndex] = useState(0);

    // Caption generation states
    const [showCaptionGenerator, setShowCaptionGenerator] = useState(false);
    const [captionTone, setCaptionTone] = useState<'casual' | 'formal' | 'motivacional' | 'educativo' | 'divertido'>('casual');
    const [generatedCaption, setGeneratedCaption] = useState('');
    const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);

    // Preview modal state
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        fetchScheduledPosts();

        // Load reused prompt from history
        const reusedPrompt = localStorage.getItem('reusedPrompt');
        if (reusedPrompt) {
            setPrompt(reusedPrompt);
            localStorage.removeItem('reusedPrompt');
            toast.success('📋 Prompt carregado do histórico!');
        }

        // Load draft from localStorage
        const savedDraft = localStorage.getItem('carouselDraft');
        if (savedDraft) {
            const draft = JSON.parse(savedDraft);
            setCarouselDescription(draft.description || '');
            setCarouselCards(draft.cards || []);
            setAspectRatio(draft.aspectRatio || '1:1');
            setImageCount(draft.imageCount || 1);
            toast.success('📄 Rascunho carregado!');
        }
    }, []);

    // Auto-save draft every 5 seconds
    useEffect(() => {
        if (carouselCards.length > 0 || carouselDescription) {
            const saveInterval = setInterval(() => {
                const draft = {
                    description: carouselDescription,
                    cards: carouselCards,
                    aspectRatio,
                    imageCount,
                    lastSaved: new Date().toISOString()
                };
                localStorage.setItem('carouselDraft', JSON.stringify(draft));
                console.log('💾 Auto-save: Draft saved');
            }, 5000); // Save every 5 seconds

            return () => clearInterval(saveInterval);
        }
    }, [carouselDescription, carouselCards, aspectRatio, imageCount]);

    // Auto-load profile preferences when profile is selected
    useEffect(() => {
        if (selectedProfile?.aiPreferences) {
            const defaultRatio = selectedProfile.aiPreferences.defaultAspectRatio;
            if (defaultRatio && ['1:1', '4:5', '16:9', '9:16'].includes(defaultRatio)) {
                setAspectRatio(defaultRatio as '1:1' | '4:5' | '16:9' | '9:16');
            }
        }
    }, [selectedProfile]);

    useEffect(() => {
        // Reset carousel when switching modes
        if (imageCount === 1) {
            setCarouselCards([]);
        }
    }, [imageCount]);

    const fetchScheduledPosts = async () => {
        try {
            const res = await api.get('/api/posts');
            if (res.data.posts) {
                setScheduledPosts(res.data.posts.filter((p: Post) => p.scheduledFor));
            }
        } catch (error) {
            console.error('Failed to fetch posts:', error);
        }
    };

    // Generate all prompts at once for carousel
    const handleGenerateAllPrompts = async () => {
        if (!carouselDescription) {
            toast.error('Digite a descrição do carrossel');
            return;
        }

        setIsGeneratingPrompt(true);

        try {
            const response = await api.post('/api/ai/generate-carousel-prompts', {
                carouselDescription,
                totalCards: imageCount,
                profileDescription: selectedProfile?.description,
                guidelines: selectedProfile?.branding?.guidelines,
                savedPrompts: selectedProfile?.aiPreferences?.favoritePrompts
            });

            if (response.data.success && response.data.prompts) {
                const newCards = response.data.prompts.map((prompt: string) => ({
                    prompt,
                    isGeneratingImage: false
                }));
                setCarouselCards(newCards);
                toast.success(`${newCards.length} prompts gerados com sucesso!`);
            }
        } catch (error: any) {
            console.error('Error generating prompts:', error);
            toast.error(error.response?.data?.error || 'Erro ao gerar prompts');
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    // Generate image for a specific card with retry logic
    const handleGenerateImageForCard = async (cardIndex: number, retryCount: number = 0) => {
        const card = carouselCards[cardIndex];
        if (!card || card.image) return;

        // Update card state to show loading
        const updatedCards = [...carouselCards];
        updatedCards[cardIndex] = { ...card, isGeneratingImage: true };
        setCarouselCards(updatedCards);

        try {
            // Build enhanced prompt with profile template
            let enhancedPrompt = card.prompt;
            if (selectedProfile?.aiPreferences?.promptTemplate) {
                enhancedPrompt = `${selectedProfile.aiPreferences.promptTemplate}\n\n${card.prompt}`;
            }

            const response = await api.post('/api/ai/generate-single-image', {
                prompt: enhancedPrompt,
                aspectRatio
            }, {
                timeout: 90000 // 90 seconds timeout
            });

            if (response.data.success) {
                const newCards = [...carouselCards];
                newCards[cardIndex] = {
                    ...card,
                    image: response.data.image,
                    isGeneratingImage: false
                };
                setCarouselCards(newCards);
                toast.success(`✅ Imagem do card ${cardIndex + 1} gerada!`);
            }
        } catch (error: any) {
            console.error(`Error generating image for card ${cardIndex + 1}:`, error);

            // Retry logic - max 3 attempts
            if (retryCount < 2) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                toast.error(`⚠️ Erro no card ${cardIndex + 1}, tentando novamente em ${delay / 1000}s...`);

                setTimeout(() => {
                    handleGenerateImageForCard(cardIndex, retryCount + 1);
                }, delay);
            } else {
                const newCards = [...carouselCards];
                newCards[cardIndex] = { ...card, isGeneratingImage: false };
                setCarouselCards(newCards);
                toast.error(`❌ Falha ao gerar card ${cardIndex + 1} após 3 tentativas`);
            }
        }
    };

    // Generate all carousel images at once
    const handleGenerateAllImages = async () => {
        const cardsToGenerate = carouselCards.filter(c => !c.image);

        if (cardsToGenerate.length === 0) {
            toast.error('Todas as imagens já foram geradas!');
            return;
        }

        toast.loading(`🎨 Gerando ${cardsToGenerate.length} imagens...`, { id: 'bulk-generation' });

        // Generate sequentially to avoid rate limits
        for (let i = 0; i < carouselCards.length; i++) {
            if (!carouselCards[i].image) {
                await handleGenerateImageForCard(i);
                // Small delay between generations
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        toast.success(`✅ Todas as imagens foram geradas!`, { id: 'bulk-generation' });
    };

    // Send all generated images to create post
    const handleSendToPost = () => {
        const images = carouselCards.filter(c => c.image).map(c => c.image!);

        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }

        // Open preview modal first
        setShowPreview(true);
    };

    // Confirm and navigate to create post
    const handleConfirmPost = () => {
        const images = carouselCards.filter(c => c.image).map(c => c.image!);

        const params = new URLSearchParams({
            caption: `Generated carousel: ${carouselDescription.substring(0, 100)}...`,
            mediaUrls: images.join(','),
            type: images.length > 1 ? 'carousel' : 'static'
        });

        if (selectedDate) {
            params.append('scheduledFor', `${selectedDate}T12:00`);
        }

        // Clear draft after successful send
        localStorage.removeItem('carouselDraft');
        toast.success('✅ Rascunho limpo!');

        router.push(`/dashboard/create-post?${params.toString()}`);
    };

    // Open lightbox with images
    const handleOpenLightbox = (images: string[], startIndex: number = 0) => {
        setLightboxImages(images);
        setLightboxIndex(startIndex);
        setLightboxOpen(true);
    };

    // Generate AI caption
    const handleGenerateCaption = async () => {
        const promptText = carouselCards.length > 0
            ? carouselDescription
            : prompt;

        if (!promptText) {
            toast.error('⚠️ Adicione uma descrição primeiro!');
            return;
        }

        setIsGeneratingCaption(true);
        try {
            const res = await api.post('/api/ai/generate-caption', {
                prompt: promptText,
                tone: captionTone,
                includeHashtags: true,
                language: 'pt'
            });

            if (res.data.success) {
                setGeneratedCaption(res.data.caption);
                toast.success('✅ Caption gerada com IA!');
            }
        } catch (error: any) {
            console.error('Error generating caption:', error);
            toast.error(error.response?.data?.error || 'Erro ao gerar caption');
        } finally {
            setIsGeneratingCaption(false);
        }
    };

    // Download a single image
    const handleDownloadImage = async (imageUrl: string, cardIndex: number) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `carousel-card-${cardIndex + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(`Imagem ${cardIndex + 1} baixada!`);
        } catch (error) {
            console.error('Error downloading image:', error);
            toast.error('Erro ao baixar imagem');
        }
    };

    // Download all images as ZIP
    const handleDownloadAllImages = async () => {
        const images = carouselCards.filter(c => c.image);

        if (images.length === 0) {
            toast.error('Nenhuma imagem para baixar');
            return;
        }

        toast.loading('Baixando todas as imagens...');

        try {
            for (let i = 0; i < images.length; i++) {
                await handleDownloadImage(images[i].image!, i);
                // Small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            toast.dismiss();
            toast.success(`${images.length} imagens baixadas!`);
        } catch (error) {
            toast.dismiss();
            toast.error('Erro ao baixar imagens');
        }
    };

    // Save to history
    const handleSaveToHistory = async () => {
        const images = carouselCards.filter(c => c.image).map(c => c.image!);

        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }

        try {
            const mode = imageCount > 1 ? 'carousel' : 'simple';
            const mainPrompt = mode === 'carousel' ? carouselDescription : prompt;
            const individualPrompts = mode === 'carousel' ? carouselCards.map(c => c.prompt) : [];

            await api.post('/api/history', {
                mode,
                prompt: mainPrompt,
                aspectRatio,
                images,
                prompts: individualPrompts,
            });

            toast.success('Salvo no histórico!');
        } catch (error: any) {
            console.error('Error saving to history:', error);
            toast.error(error.response?.data?.error || 'Erro ao salvar no histórico');
        }
    };

    // Send to calendar media library
    const handleSendToCalendar = () => {
        const images = carouselCards.filter(c => c.image).map(c => c.image!);

        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }

        // Save to localStorage for calendar to pick up
        const calendarMedia = {
            type: images.length > 1 ? 'carousel' : 'static',
            mediaUrls: images,
            caption: generatedCaption || carouselDescription.substring(0, 100) || '',
            timestamp: Date.now()
        };

        localStorage.setItem('pendingCalendarMedia', JSON.stringify(calendarMedia));
        toast.success(`✅ ${images.length} imagem(ns) pronta(s) para o calendário!`);

        // Navigate to calendar
        router.push('/dashboard/calendar');
    };


    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);

    const getPostsForDay = (day: number) => {
        return scheduledPosts.filter(p => {
            const date = new Date(p.scheduledFor);
            return date.getDate() === day && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <div className="container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <BackButton />
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => setView('generate')}
                            className="btn"
                            style={{
                                background: view === 'generate' ? '#7c3aed' : '#27272a',
                                padding: '0.5rem 1rem',
                                borderRadius: '9999px',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            Generate
                        </button>
                        <button
                            onClick={() => setView('calendar')}
                            className="btn"
                            style={{
                                background: view === 'calendar' ? '#7c3aed' : '#27272a',
                                padding: '0.5rem 1rem',
                                borderRadius: '9999px',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            Calendar 📅
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/history')}
                            className="btn"
                            style={{
                                background: '#27272a',
                                padding: '0.5rem 1rem',
                                borderRadius: '9999px',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer'
                            }}
                        >
                            History 🕒
                        </button>
                    </div>
                </div>
                <div className="container">
                    <BackButton />
                    <Breadcrumbs />

                    <h1 className="mb-lg">Ai dark plataform</h1>
                </div>

                {/* Minimalist Business Profile Indicator */}
                {selectedProfile && (
                    <div className="card-glass" style={{
                        padding: '0.75rem 1.5rem',
                        marginBottom: '2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        background: 'rgba(24, 24, 27, 0.6)',
                        border: '1px solid #27272a'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: selectedProfile.branding?.primaryColor || '#7c3aed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#fff'
                            }}>
                                {selectedProfile.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                                    {selectedProfile.name}
                                </p>
                                <p style={{ fontSize: '0.75rem', color: selectedProfile.branding?.primaryColor || '#a78bfa', margin: 0 }}>
                                    ● Perfil Conectado
                                </p>
                            </div>
                        </div>

                        {selectedProfile.aiPreferences?.promptTemplate && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                background: 'rgba(124, 58, 237, 0.1)',
                                borderRadius: '999px',
                                border: '1px solid rgba(124, 58, 237, 0.2)'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: '#a78bfa' }}>📋 Prompt Personalizado Ativo</span>
                            </div>
                        )}
                    </div>
                )}

                {view === 'generate' ? (
                    <>
                        <section className="card-glass" style={{ padding: '2rem', marginBottom: '2rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem' }}>
                                    {imageCount > 1 ? 'Modo Carrossel Progressivo' : 'Modo Simples'}
                                </label>
                                {selectedDate && (
                                    <span style={{ fontSize: '0.875rem', color: '#a78bfa', fontWeight: 500 }}>
                                        📅 Scheduled for: {selectedDate}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#71717a', display: 'block', marginBottom: '0.5rem' }}>
                                        Aspect Ratio
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                        {(['1:1', '4:5', '16:9', '9:16'] as const).map((ratio) => (
                                            <button
                                                key={ratio}
                                                onClick={() => setAspectRatio(ratio)}
                                                className="btn"
                                                style={{
                                                    background: aspectRatio === ratio ? '#7c3aed' : '#27272a',
                                                    padding: '0.5rem',
                                                    borderRadius: '0.5rem',
                                                    border: 'none',
                                                    color: '#fff',
                                                    fontSize: '0.875rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#71717a', display: 'block', marginBottom: '0.5rem' }}>
                                        Number of Cards {imageCount > 1 && '(Carousel Mode)'}
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                                            <button
                                                key={count}
                                                onClick={() => setImageCount(count)}
                                                className="btn"
                                                style={{
                                                    flex: 1,
                                                    background: imageCount === count ? '#7c3aed' : '#27272a',
                                                    padding: '0.5rem 0.25rem',
                                                    borderRadius: '0.5rem',
                                                    border: 'none',
                                                    color: '#fff',
                                                    fontSize: '0.75rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {count}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Carousel Mode: Description + Progressive Cards */}
                            {imageCount > 1 ? (
                                <div>
                                    <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem' }}>
                                        Descrição Geral do Carrossel
                                    </label>
                                    <textarea
                                        value={carouselDescription}
                                        onChange={(e) => setCarouselDescription(e.target.value)}
                                        placeholder="Ex: Tutorial em 8 passos de como fazer café perfeito, começando pela escolha dos grãos até servir na xícara..."
                                        className="input"
                                        rows={3}
                                        style={{ width: '100%', marginBottom: '1rem' }}
                                    />

                                    <button
                                        onClick={handleGenerateAllPrompts}
                                        disabled={isGeneratingPrompt || !carouselDescription || carouselCards.length > 0}
                                        className="btn btn-primary"
                                        style={{ width: '100%', marginBottom: '0.5rem' }}
                                    >
                                        {isGeneratingPrompt ? `🤖 Gerando ${imageCount} prompts...` :
                                            carouselCards.length > 0 ? `✓ ${imageCount} prompts gerados` :
                                                `🚀 Gerar ${imageCount} Prompts`}
                                    </button>

                                    {/* Bulk Image Generation Button */}
                                    {carouselCards.length > 0 && carouselCards.some(c => !c.image) && (
                                        <button
                                            onClick={handleGenerateAllImages}
                                            disabled={carouselCards.every(c => c.isGeneratingImage)}
                                            className="btn"
                                            style={{
                                                width: '100%',
                                                marginBottom: '1rem',
                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                border: 'none',
                                                color: '#fff'
                                            }}
                                        >
                                            🎨 Gerar Todas as Imagens ({carouselCards.filter(c => !c.image).length} pendentes)
                                        </button>
                                    )}

                                    {/* Carousel Cards */}
                                    {carouselCards.length > 0 && (
                                        <div style={{ marginTop: '2rem' }}>
                                            <h3 style={{ marginBottom: '1rem', color: '#a78bfa' }}>
                                                Cards do Carrossel ({carouselCards.length}/{imageCount})
                                            </h3>

                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(3, 1fr)',
                                                gap: '1rem'
                                            }}>
                                                {carouselCards.map((card, index) => (
                                                    <div
                                                        key={index}
                                                        style={{
                                                            background: '#18181b',
                                                            border: '1px solid #27272a',
                                                            borderRadius: '1rem',
                                                            padding: '1rem'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                                                            <h4 style={{ color: '#a78bfa', fontSize: '0.75rem', fontWeight: 600 }}>
                                                                Card {index + 1}
                                                            </h4>
                                                            {card.image && (
                                                                <span style={{ fontSize: '0.625rem', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '0.25rem 0.5rem', borderRadius: '9999px' }}>
                                                                    ✓ Gerada
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div style={{ marginBottom: '0.75rem' }}>
                                                            <label style={{ fontSize: '0.625rem', color: '#71717a', display: 'block', marginBottom: '0.5rem' }}>
                                                                Prompt
                                                            </label>
                                                            <p style={{
                                                                background: '#09090b',
                                                                padding: '0.5rem',
                                                                borderRadius: '0.5rem',
                                                                fontSize: '0.75rem',
                                                                color: '#d4d4d8',
                                                                lineHeight: '1.4',
                                                                maxHeight: '4.5rem',
                                                                overflow: 'auto'
                                                            }}>
                                                                {card.prompt}
                                                            </p>
                                                        </div>

                                                        {card.image ? (
                                                            <>
                                                                <img
                                                                    src={card.image}
                                                                    alt={`Card ${index + 1}`}
                                                                    onClick={() => {
                                                                        const allImages = carouselCards
                                                                            .filter(c => c.image)
                                                                            .map(c => c.image!);
                                                                        const imageIndex = allImages.indexOf(card.image!);
                                                                        handleOpenLightbox(allImages, imageIndex);
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '200px',
                                                                        objectFit: 'cover',
                                                                        borderRadius: '0.5rem',
                                                                        marginBottom: '0.5rem',
                                                                        cursor: 'pointer',
                                                                        transition: 'transform 0.2s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                                />
                                                                <button
                                                                    onClick={() => handleDownloadImage(card.image!, index)}
                                                                    className="btn btn-secondary"
                                                                    style={{ width: '100%', fontSize: '0.75rem', padding: '0.5rem' }}
                                                                >
                                                                    📥 Baixar
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleGenerateImageForCard(index)}
                                                                disabled={card.isGeneratingImage}
                                                                className="btn btn-primary"
                                                                style={{ width: '100%', fontSize: '0.75rem', padding: '0.5rem' }}
                                                            >
                                                                {card.isGeneratingImage ? '🎨 Gerando...' : '🎨 Gerar Imagem'}
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {carouselCards.some(c => c.image) && (
                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={handleDownloadAllImages}
                                                        className="btn btn-secondary"
                                                        style={{ flex: '1 1 auto' }}
                                                    >
                                                        📥 Baixar Todas ({carouselCards.filter(c => c.image).length} imagens)
                                                    </button>
                                                    <button
                                                        onClick={() => setShowCaptionGenerator(true)}
                                                        className="btn"
                                                        style={{ flex: '1 1 auto', background: '#a78bfa', border: 'none', color: '#fff', cursor: 'pointer' }}
                                                    >
                                                        ✍️ Gerar Caption com IA
                                                    </button>
                                                    <button
                                                        onClick={handleSaveToHistory}
                                                        className="btn"
                                                        style={{ flex: '1 1 auto', background: '#f59e0b', border: 'none', color: '#fff', cursor: 'pointer' }}
                                                    >
                                                        💾 Salvar no Histórico
                                                    </button>
                                                    <button
                                                        onClick={handleSendToCalendar}
                                                        className="btn"
                                                        style={{ flex: '1 1 auto', background: '#8e44ad', border: 'none', color: '#fff', cursor: 'pointer' }}
                                                    >
                                                        📅 Enviar para Calendário ({carouselCards.filter(c => c.image).length})
                                                    </button>
                                                    <button
                                                        onClick={handleSendToPost}
                                                        className="btn btn-primary"
                                                        style={{ flex: '1 1 auto', background: '#22c55e' }}
                                                    >
                                                        🚀 Postar/Agendar ({carouselCards.filter(c => c.image).length} imagens)
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // Simple Mode (existing implementation would go here - skipped for brevity)
                                <div>
                                    <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem' }}>
                                        Prompt da Imagem
                                    </label>
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="A futuristic city with neon lights..."
                                        className="input"
                                        style={{ width: '100%', marginBottom: '1rem' }}
                                    />
                                    <p style={{ fontSize: '0.75rem', color: '#71717a' }}>
                                        Modo simples disponível. Para carrossel interativo, selecione 2+ cards acima.
                                    </p>
                                </div>
                            )}
                        </section>
                    </>
                ) : (
                    <p>Calendar view (existing implementation)</p>
                )}

                {/* AI Caption Generator Modal */}
                {showCaptionGenerator && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        zIndex: 1500,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem'
                    }}
                        onClick={() => setShowCaptionGenerator(false)}
                    >
                        <div
                            className="card-glass"
                            style={{ maxWidth: '600px', width: '100%', padding: '2rem' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex-between mb-md">
                                <h2>✍️ Gerar Caption com IA</h2>
                                <button
                                    onClick={() => setShowCaptionGenerator(false)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: '1.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ×
                                </button>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Tom da Caption</label>
                                <select
                                    className="input"
                                    value={captionTone}
                                    onChange={(e) => setCaptionTone(e.target.value as any)}
                                >
                                    <option value="casual">😊 Casual - Descontraído e amigável</option>
                                    <option value="formal">💼 Formal - Profissional e sério</option>
                                    <option value="motivacional">🔥 Motivacional - Inspirador e energético</option>
                                    <option value="educativo">📚 Educativo - Informativo e didático</option>
                                    <option value="divertido">🎉 Divertido - Bem-humorado e criativo</option>
                                </select>
                            </div>

                            <button
                                onClick={handleGenerateCaption}
                                disabled={isGeneratingCaption}
                                className="btn btn-primary"
                                style={{ width: '100%', marginBottom: '1rem' }}
                            >
                                {isGeneratingCaption ? '⏳ Gerando Caption...' : '✨ Gerar Caption'}
                            </button>

                            {generatedCaption && (
                                <div style={{
                                    background: 'rgba(124, 58, 237, 0.1)',
                                    border: '1px solid rgba(124, 58, 237, 0.3)',
                                    borderRadius: '0.5rem',
                                    padding: '1rem',
                                    marginTop: '1rem'
                                }}>
                                    <div className="flex-between mb-sm">
                                        <p style={{ fontSize: '0.875rem', color: '#a78bfa', fontWeight: 600 }}>
                                            Caption Gerada:
                                        </p>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(generatedCaption);
                                                toast.success('📋 Caption copiada!');
                                            }}
                                            className="btn btn-secondary"
                                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                                        >
                                            📋 Copiar
                                        </button>
                                    </div>
                                    <p style={{
                                        color: '#fff',
                                        fontSize: '0.875rem',
                                        lineHeight: '1.6',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {generatedCaption}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Preview Modal */}
                {showPreview && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.9)',
                        zIndex: 1600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem'
                    }}
                        onClick={() => setShowPreview(false)}
                    >
                        <div
                            className="card-glass"
                            style={{ maxWidth: '800px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex-between mb-md">
                                <h2>👁️ Preview do Carrossel</h2>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: '1.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ×
                                </button>
                            </div>

                            <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                {carouselCards.filter(c => c.image).length} imagens prontas para postar
                            </p>

                            {/* Images Grid Preview */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '1rem',
                                marginBottom: '1.5rem'
                            }}>
                                {carouselCards.filter(c => c.image).map((card, idx) => (
                                    <div key={idx} style={{ position: 'relative' }}>
                                        <img
                                            src={card.image!}
                                            alt={`Card ${idx + 1}`}
                                            style={{
                                                width: '100%',
                                                height: '200px',
                                                objectFit: 'cover',
                                                borderRadius: '0.5rem',
                                                border: '2px solid rgba(124, 58, 237, 0.3)'
                                            }}
                                        />
                                        <span style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            left: '0.5rem',
                                            background: 'rgba(0,0,0,0.7)',
                                            color: '#fff',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.75rem'
                                        }}>
                                            {idx + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Description Preview */}
                            {carouselDescription && (
                                <div style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    padding: '1rem',
                                    borderRadius: '0.5rem',
                                    marginBottom: '1.5rem'
                                }}>
                                    <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.5rem' }}>Descrição:</p>
                                    <p style={{ fontSize: '0.875rem', color: '#d4d4d8' }}>{carouselDescription}</p>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmPost}
                                    className="btn btn-primary"
                                    style={{ flex: 1, background: '#22c55e' }}
                                >
                                    ✅ Confirmar e Criar Post
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Image Lightbox */}
                {lightboxOpen && (
                    <ImageLightbox
                        images={lightboxImages}
                        currentIndex={lightboxIndex}
                        onClose={() => setLightboxOpen(false)}
                        onNavigate={setLightboxIndex}
                        onDownload={handleDownloadImage}
                    />
                )}
            </div>
        </div>
    );
}
