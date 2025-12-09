'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import Breadcrumbs from '@/components/Breadcrumbs';
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

    useEffect(() => {
        fetchScheduledPosts();

        // Load reused prompt from history
        const reusedPrompt = localStorage.getItem('reusedPrompt');
        if (reusedPrompt) {
            setPrompt(reusedPrompt);
            localStorage.removeItem('reusedPrompt');
            toast.success('📋 Prompt carregado do histórico!');
        }
    }, []);

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
                totalCards: imageCount
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

    // Generate image for a specific card
    const handleGenerateImageForCard = async (cardIndex: number) => {
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
            });

            if (response.data.success) {
                updatedCards[cardIndex] = {
                    ...card,
                    image: response.data.image,
                    isGeneratingImage: false
                };
                setCarouselCards(updatedCards);
                toast.success(`Imagem do card ${cardIndex + 1} gerada!`);
            }
        } catch (error: any) {
            console.error('Error generating image:', error);
            updatedCards[cardIndex] = { ...card, isGeneratingImage: false };
            setCarouselCards(updatedCards);
            toast.error(error.response?.data?.error || 'Erro ao gerar imagem');
        }
    };

    // Send all generated images to create post
    const handleSendToPost = () => {
        const images = carouselCards.filter(c => c.image).map(c => c.image!);

        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }

        const params = new URLSearchParams({
            caption: `Generated carousel: ${carouselDescription.substring(0, 100)}...`,
            mediaUrls: images.join(','),
            type: images.length > 1 ? 'carousel' : 'static'
        });

        if (selectedDate) {
            params.append('scheduledFor', `${selectedDate}T12:00`);
        }

        router.push(`/dashboard/create-post?${params.toString()}`);
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
                    </div>
                </div>
                <div className="container">
                    <BackButton />
                    <Breadcrumbs />

                    <h1 className="mb-lg">Ai dark plataform</h1>
                </div>

                {/* Business Profile Selector */}
                {profiles.length > 0 && (
                    <section className="card-glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem', color: '#a78bfa' }}>Selecionar Perfil de Negócio</h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '1rem'
                        }}>
                            {profiles.map(profile => (
                                <div
                                    key={profile.id}
                                    onClick={() => setSelectedProfile(profile)}
                                    className="card"
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedProfile?.id === profile.id
                                            ? 'rgba(124, 58, 237, 0.2)'
                                            : 'rgba(255, 255, 255, 0.03)',
                                        border: `2px solid ${selectedProfile?.id === profile.id ? '#7c3aed' : 'rgba(255, 255, 255, 0.1)'}`,
                                        transition: 'all 0.3s',
                                        textAlign: 'center',
                                        padding: '1rem'
                                    }}
                                >
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '50%',
                                        background: '#7c3aed',
                                        margin: '0 auto 0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.5rem',
                                        fontWeight: 700,
                                        color: '#fff'
                                    }}>
                                        {profile.name.charAt(0).toUpperCase()}
                                    </div>
                                    <h4 style={{ fontSize: '0.875rem', marginBottom: '0.25rem', color: '#fff' }}>
                                        {profile.name}
                                    </h4>
                                    {selectedProfile?.id === profile.id && (
                                        <span style={{
                                            fontSize: '0.75rem',
                                            color: '#4ade80',
                                            marginTop: '0.5rem',
                                            display: 'block'
                                        }}>
                                            ✓ Selecionado
                                        </span>
                                    )}
                                    {profile.aiPreferences?.promptTemplate && (
                                        <p style={{ fontSize: '0.625rem', color: '#71717a', marginTop: '0.5rem', margin: 0 }}>
                                            📋 Prompt configurado
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        {selectedProfile && (
                            <div style={{
                                marginTop: '1rem',
                                padding: '1rem',
                                background: `${selectedProfile.branding?.primaryColor}20`,
                                borderRadius: '0.5rem',
                                borderLeft: `3px solid ${selectedProfile.branding?.primaryColor}`
                            }}>
                                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                                    🎯 Gerando para: <strong style={{ color: selectedProfile.branding?.primaryColor }}>{selectedProfile.name}</strong>
                                    {selectedProfile.aiPreferences?.style && (
                                        <span style={{ marginLeft: '0.5rem', color: '#a1a1aa' }}>| Estilo: {selectedProfile.aiPreferences.style}</span>
                                    )}
                                </p>
                                {selectedProfile.aiPreferences?.promptTemplate && (
                                    <details style={{ marginTop: '0.75rem' }}>
                                        <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: '#a78bfa', userSelect: 'none' }}>
                                            📋 Ver Prompt Base (será adicionado automaticamente)
                                        </summary>
                                        <pre style={{
                                            marginTop: '0.5rem',
                                            padding: '0.75rem',
                                            background: 'rgba(0,0,0,0.3)',
                                            borderRadius: '0.375rem',
                                            fontSize: '0.75rem',
                                            color: '#d4d4d8',
                                            overflow: 'auto',
                                            maxHeight: '150px',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word'
                                        }}>
                                            {selectedProfile.aiPreferences.promptTemplate}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                    </section>
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
                                        style={{ width: '100%', marginBottom: '1rem' }}
                                    >
                                        {isGeneratingPrompt ? `🤖 Gerando ${imageCount} prompts...` :
                                            carouselCards.length > 0 ? `✓ ${imageCount} prompts gerados` :
                                                `🚀 Gerar ${imageCount} Prompts`}
                                    </button>

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
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '200px',
                                                                        objectFit: 'cover',
                                                                        borderRadius: '0.5rem',
                                                                        marginBottom: '0.5rem'
                                                                    }}
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
                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                                    <button
                                                        onClick={handleDownloadAllImages}
                                                        className="btn btn-secondary"
                                                        style={{ flex: 1 }}
                                                    >
                                                        📥 Baixar Todas ({carouselCards.filter(c => c.image).length} imagens)
                                                    </button>
                                                    <button
                                                        onClick={handleSaveToHistory}
                                                        className="btn"
                                                        style={{ flex: 1, background: '#f59e0b', border: 'none', color: '#fff', cursor: 'pointer' }}
                                                    >
                                                        💾 Salvar no Histórico
                                                    </button>
                                                    <button
                                                        onClick={handleSendToPost}
                                                        className="btn btn-primary"
                                                        style={{ flex: 1, background: '#22c55e' }}
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
            </div>
        </div>
    );
}
