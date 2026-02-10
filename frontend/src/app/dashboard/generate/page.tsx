'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import ImageLightbox from '@/components/ImageLightbox';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';

interface CarouselCard {
    prompt: string;
    image?: string;
    isGeneratingImage: boolean;
}

interface PostIdea {
    title: string;
    description: string;
    type: 'carousel' | 'static';
    slideCount: number;
    reason: string;
}

// Icons
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
);

const CalendarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
);

const MagicIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
    </svg>
);

const SaveIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
);

const RocketIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
    </svg>
);

const RefreshIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
);

const LayoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
);

export default function GeneratePage() {
    const router = useRouter();
    const { selectedProfile } = useBusinessProfile();

    // Simple mode states
    const [prompt, setPrompt] = useState('');

    // Carousel mode states  
    const [carouselDescription, setCarouselDescription] = useState('');
    const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([]);
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [referenceImage, setReferenceImage] = useState<string | null>(null); // New state for reference image

    // Idea Generation states
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
    const [ideas, setIdeas] = useState<PostIdea[]>([]);
    const [showIdeasModal, setShowIdeasModal] = useState(false);

    // Common states
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '16:9' | '9:16'>('1:1');
    const [imageCount, setImageCount] = useState<number>(1);
    const [selectedDate] = useState<string>('');
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

    const [generationMode, setGenerationMode] = useState<'standard' | 'editorial'>('standard');

    // Reference Image Upload Handler
    const onDrop = (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        const reader = new FileReader();
        reader.onload = () => {
            setReferenceImage(reader.result as string);
            toast.success('Imagem de referência carregada!');
        };
        reader.readAsDataURL(file);
    };

    const { getRootProps: getReferenceRootProps, getInputProps: getReferenceInputProps } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        maxFiles: 1
    });

    useEffect(() => {
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
                // Create a lean version of cards without the heavy image data to avoid QuotaExceededError
                const leanCards = carouselCards.map(card => ({
                    ...card,
                    image: undefined, // Do not save base64 images in localStorage
                }));

                const draft = {
                    description: carouselDescription,
                    cards: leanCards,
                    aspectRatio,
                    imageCount,
                    lastSaved: new Date().toISOString()
                };

                try {
                    localStorage.setItem('carouselDraft', JSON.stringify(draft));
                    console.log('💾 Auto-save: Draft saved (Lite Mode)');
                } catch (e) {
                    console.error('Auto-save failed:', e);
                }
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
        // Removed reset for imageCount === 1 to allow advanced mode for single images
    }, [imageCount]);

    const looksLikeEditorialTemplatePrompt = (p: string) => {
        const t = (p || '').trim();
        if (!t) return false;
        // Heuristic: prompts gerados no modo editorial já vêm no template completo.
        return (
            t.startsWith('A premium') &&
            (t.includes('The upper 60% of the image') || t.includes('TEXT AREA:') || t.includes('MANDATORY RESTRICTIONS'))
        );
    };

    const getApiErrorMessage = (error: unknown, fallback: string) => {
        if (error && typeof error === 'object') {
            const maybeAxios = error as { response?: { data?: { error?: string } } };
            const msg = maybeAxios.response?.data?.error;
            if (msg && typeof msg === 'string') return msg;
        }
        return fallback;
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
                aspectRatio,
                profileDescription: selectedProfile?.description,
                guidelines: selectedProfile?.branding?.guidelines,
                savedPrompts: selectedProfile?.aiPreferences?.favoritePrompts,
                isEditorial: generationMode === 'editorial',
                brandName: selectedProfile?.name || 'VIVER MAIS PSICOLOGIA STREAMING',
                context: {
                    primaryColor: selectedProfile?.branding?.primaryColor,
                    secondaryColor: selectedProfile?.branding?.secondaryColor,
                    brandTone: selectedProfile?.branding?.tone, // Assuming tone is in branding or aiPreferences? checking profile structure...
                    // Actually profile structure has tone in aiPreferences usually, but let's check profile object.
                    // For now, let's pass what we know exists on the profile object based on my updates.
                    targetAudience: selectedProfile?.targetAudience,
                    productService: selectedProfile?.productService,
                    brandingStyle: selectedProfile?.branding?.style
                },
                referenceImage // Pass the reference image to the API
            }, {
                timeout: 120000 // 2 minutes timeout for AI generation
            });

            if (response.data.success && response.data.prompts) {
                const newCards = response.data.prompts.map((prompt: string) => ({
                    prompt,
                    isGeneratingImage: false
                }));
                setCarouselCards(newCards);
                toast.success(`${newCards.length} prompts gerados com sucesso!`);
            }
        } catch (error: unknown) {
            console.error('Error generating prompts:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao gerar prompts'));
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    // Generate Post Ideas
    const handleGenerateIdeas = async () => {
        if (!selectedProfile) {
            toast.error('Selecione um perfil de negócio primeiro');
            return;
        }

        setIsGeneratingIdeas(true);
        try {
            const response = await api.post('/api/ai/generate-ideas', {
                profileName: selectedProfile.name,
                profileDescription: selectedProfile.description,
                guidelines: selectedProfile.branding?.guidelines,
                brandingStyle: selectedProfile.branding?.style
            });

            if (response.data.success && response.data.ideas) {
                setIdeas(response.data.ideas);
                setShowIdeasModal(true);
                toast.success('💡 3 Ideias geradas com sucesso!');
            }
        } catch (error: unknown) {
            console.error('Error generating ideas:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao gerar ideias'));
        } finally {
            setIsGeneratingIdeas(false);
        }
    };

    // Select an Idea
    const handleSelectIdea = (idea: PostIdea) => {
        setCarouselDescription(idea.description); // Use description as the main prompt context
        setImageCount(idea.slideCount);
        setAspectRatio('4:5'); // Default for carousels
        setShowIdeasModal(false);
        toast.success(`✅ Ideia "${idea.title}" selecionada!`);
    };

    // Generate image for a specific card with retry logic
    const handleGenerateImageForCard = async (cardIndex: number, retryCount: number = 0, cardsState?: CarouselCard[]) => {
        // Use provided state or current state
        const currentCards = cardsState || carouselCards;
        const card = currentCards[cardIndex];

        if (!card || (card.image && !cardsState)) return; // Only skip if image exists AND we are not overriding (implied by passing cardsState)

        // Update card state to show loading if not already updated (when passing cardsState we typically already set it)
        if (!cardsState) {
            const updatedCards = [...carouselCards];
            updatedCards[cardIndex] = { ...card, isGeneratingImage: true };
            setCarouselCards(updatedCards);
        }

        try {
            // Build enhanced prompt with profile template
            let enhancedPrompt = card.prompt;

            // If in Editorial Mode, the prompt is likely already formatted (by Auto-Generate or Manual Button)
            if (generationMode === 'editorial') {
                // We use the prompt as-is because we ensure it is built correctly when created
                enhancedPrompt = card.prompt;
            } else if (selectedProfile?.aiPreferences?.promptTemplate) {
                enhancedPrompt = `${selectedProfile.aiPreferences.promptTemplate}\n\n${card.prompt}`;
            }

            // Construct rich branding context
            let brandingContext = selectedProfile?.branding?.style || '';
            if (selectedProfile?.branding?.primaryColor) {
                brandingContext += `. Primary Brand Color: ${selectedProfile.branding.primaryColor}`;
            }
            if (selectedProfile?.branding?.colors && Array.isArray(selectedProfile.branding.colors)) {
                brandingContext += `. Color Palette: ${selectedProfile.branding.colors.join(', ')}`;
            }

            const response = await api.post('/api/ai/generate-single-image', {
                prompt: enhancedPrompt,
                aspectRatio,
                brandingStyle: brandingContext,
                // Se o prompt já estiver no template editorial completo, não transformar novamente no backend.
                isEditorial: generationMode === 'editorial' && !looksLikeEditorialTemplatePrompt(enhancedPrompt),
                context: {
                    primaryColor: selectedProfile?.branding?.primaryColor,
                    targetAudience: selectedProfile?.targetAudience,
                    productService: selectedProfile?.productService,
                    brandName: selectedProfile?.name
                },
                referenceImage // Pass reference image directly to image generation model
            }, {
                timeout: 120000 // 120 seconds timeout (longer for multimodal)
            });

            if (response.data.success) {
                // We need to fetch latest state here again because other cards might have finished
                setCarouselCards(prev => {
                    const newCards = [...prev];
                    newCards[cardIndex] = {
                        ...newCards[cardIndex],
                        image: response.data.image,
                        isGeneratingImage: false
                    };
                    return newCards;
                });
                toast.success(`✅ Imagem do card ${cardIndex + 1} gerada!`);
            }
        } catch (error: unknown) {
            console.error(`Error generating image for card ${cardIndex + 1}:`, error);

            // Retry logic - max 3 attempts
            if (retryCount < 2) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                toast.error(`⚠️ Erro no card ${cardIndex + 1}, tentando novamente em ${delay / 1000}s...`);

                setTimeout(() => {
                    handleGenerateImageForCard(cardIndex, retryCount + 1);
                }, delay);
            } else {
                setCarouselCards(prev => {
                    const newCards = [...prev];
                    newCards[cardIndex] = { ...newCards[cardIndex], isGeneratingImage: false };
                    return newCards;
                });
                toast.error(`❌ Falha ao gerar card ${cardIndex + 1} após 3 tentativas`);
            }
        }
    };

    // Regenerate a specific card
    const handleRegenerateCard = async (cardIndex: number) => {
        if (!confirm('Tem certeza? A imagem atual será perdida.')) return;

        const newCards = [...carouselCards];
        newCards[cardIndex] = { ...newCards[cardIndex], image: undefined, isGeneratingImage: true };
        setCarouselCards(newCards);

        await handleGenerateImageForCard(cardIndex, 0, newCards);
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

        // Use localStorage to pass data to avoid URL length limits
        const postData = {
            caption: `Generated carousel: ${carouselDescription.substring(0, 100)}...${generatedCaption ? '\n\n' + generatedCaption : ''}`,
            mediaUrls: images,
            type: images.length > 1 ? 'carousel' : 'static',
            scheduledFor: selectedDate ? `${selectedDate}T12:00` : undefined
        };

        localStorage.setItem('params_createPost', JSON.stringify(postData));

        // Clear draft after successful send
        localStorage.removeItem('carouselDraft');
        toast.success('✅ Rascunho limpo!');

        router.push('/dashboard/create-post?source=generated');
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
        } catch (error: unknown) {
            console.error('Error generating caption:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao gerar caption'));
        } finally {
            setIsGeneratingCaption(false);
        }
    };

    // Download a single image
    const handleDownloadImage = async (imageUrl: string, cardIndex: number) => {
        try {
            let blob: Blob;
            if (imageUrl.startsWith('data:')) {
                const [meta, data] = imageUrl.split(',', 2);
                const mimeMatch = meta.match(/^data:(.*?)(;base64)?$/);
                const mime = mimeMatch?.[1] || 'image/png';
                const isBase64 = meta.includes(';base64');
                const bytes = isBase64
                    ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
                    : new TextEncoder().encode(decodeURIComponent(data));
                blob = new Blob([bytes], { type: mime });
            } else {
                const response = await fetch(imageUrl);
                blob = await response.blob();
            }
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
        } catch {
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
        } catch (error: unknown) {
            console.error('Error saving to history:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao salvar no histórico'));
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

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>

            <div className="container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <PageHeader
                    title="AI Generator"
                    subtitle="Gere imagens com IA para suas redes sociais"
                    actions={
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
                    }
                />

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
                            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', background: '#27272a', padding: '0.5rem', borderRadius: '0.5rem' }}>
                                <button
                                    onClick={() => setGenerationMode('standard')}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        background: generationMode === 'standard' ? '#22c55e' : 'transparent', // Custom Green for standard? Or keep purple
                                        // Let's stick to the app's purple for active, or maybe a distinct color for editorial.
                                        backgroundColor: generationMode === 'standard' ? '#3f3f46' : 'transparent',
                                        color: generationMode === 'standard' ? '#fff' : '#a1a1aa',
                                        padding: '0.75rem',
                                        borderRadius: '0.25rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    ✨ Padrão
                                </button>
                                <button
                                    onClick={() => {
                                        setGenerationMode('editorial');
                                        setAspectRatio('4:5'); // Force 4:5 for editorial
                                    }}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        background: generationMode === 'editorial' ? '#7c3aed' : 'transparent',
                                        color: generationMode === 'editorial' ? '#fff' : '#a1a1aa',
                                        padding: '0.75rem',
                                        borderRadius: '0.25rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    <LayoutIcon /> Editorial (Cinematic)
                                </button>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem' }}>
                                    {generationMode === 'editorial' ? 'Modo Editorial (Template Ativo)' : (imageCount > 1 ? 'Modo Carrossel Progressivo' : 'Modo Avançado (Post Único)')}
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

                            {/* Advanced Mode: Description + Progressive Cards (Now for both Single and Carousel) */}

                            {generationMode === 'editorial' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>

                                    {/* EDITORIAL: Description Input for Auto-Generate */}
                                    <div>
                                        <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            📝 Descrição Geral (Para Geração Automática)
                                            <span style={{ fontSize: '0.7rem', color: '#71717a' }}>(Opcional: Preencha para criar prompts automaticamente)</span>
                                        </label>
                                        <textarea
                                            value={carouselDescription} // Use the SAME state as Standard Mode
                                            onChange={(e) => setCarouselDescription(e.target.value)}
                                            placeholder="Ex: 5 dicas estoicas para controlar a ansiedade..."
                                            className="input"
                                            rows={2}
                                            style={{ width: '100%' }}
                                        />
                                    </div>

                                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 text-sm text-zinc-400">
                                        <p>✨ <strong>Modo Editorial Ativo:</strong> O sistema irá gerar automaticamente o Assunto Visual, Títulos e Estilo Cinematográfico baseados na sua descrição e na marca do perfil selecionado.</p>
                                    </div>

                                    {/* EDITORIAL: Reference Image Upload */}
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            🖼️ Imagem de Referência (Opcional)
                                            <span style={{ fontSize: '0.7rem', color: '#71717a' }}>(O estilo visual desta imagem será copiado)</span>
                                        </label>

                                        {!referenceImage ? (
                                            <div
                                                {...getReferenceRootProps()}
                                                style={{
                                                    border: '2px dashed #3f3f46',
                                                    borderRadius: '0.5rem',
                                                    padding: '2rem',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    background: 'rgba(24, 24, 27, 0.5)',
                                                    transition: 'border-color 0.2s'
                                                }}
                                            >
                                                <input {...getReferenceInputProps()} />
                                                <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
                                                    Arraste uma imagem ou clique para selecionar
                                                </p>
                                            </div>
                                        ) : (
                                            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                                                <img
                                                    src={referenceImage}
                                                    alt="Referência"
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        borderRadius: '0.5rem',
                                                        border: '1px solid #7c3aed'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => setReferenceImage(null)}
                                                    style={{
                                                        position: 'absolute',
                                                        top: '-0.5rem',
                                                        right: '-0.5rem',
                                                        background: '#ef4444',
                                                        color: '#fff',
                                                        border: 'none',
                                                        borderRadius: '50%',
                                                        width: '20px',
                                                        height: '20px',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* STANDARD MODE INPUTS */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block' }}>
                                            {imageCount > 1 ? 'Descrição Geral do Carrossel' : 'Descrição do Post'}
                                        </label>
                                        <button
                                            onClick={handleGenerateIdeas}
                                            disabled={isGeneratingIdeas || !selectedProfile}
                                            className="btn"
                                            style={{
                                                fontSize: '0.75rem',
                                                padding: '0.25rem 0.75rem',
                                                background: 'linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)',
                                                border: 'none',
                                                borderRadius: '999px',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                opacity: isGeneratingIdeas ? 0.7 : 1
                                            }}
                                        >
                                            {isGeneratingIdeas ? '✨ Gerando...' : '✨ Gerar Ideias'}
                                        </button>
                                    </div>
                                    <textarea
                                        value={carouselDescription}
                                        onChange={(e) => setCarouselDescription(e.target.value)}
                                        placeholder={imageCount > 1 ? "Ex: Tutorial em 8 passos de como fazer café perfeito..." : "Ex: Uma foto minimalista de uma xícara de café com vapor..."}
                                        className="input"
                                        rows={3}
                                        style={{ width: '100%', marginBottom: '1rem' }}
                                    />
                                </>
                            )}

                            {generationMode === 'standard' && (
                                <button
                                    onClick={handleGenerateAllPrompts}
                                    disabled={isGeneratingPrompt || !carouselDescription}
                                    className="btn btn-primary"
                                    style={{ width: '100%', marginBottom: '0.5rem' }}
                                >
                                    {isGeneratingPrompt ? `🤖 Gerando ${imageCount} prompts...` :
                                        carouselCards.length > 0 ? `🔄 Regenerar ${imageCount} Prompts` :
                                            `🚀 Gerar ${imageCount} Prompts`}
                                </button>
                            )}

                            {generationMode === 'editorial' && (
                                <button
                                    onClick={() => {
                                        if (!carouselDescription || carouselDescription.trim().length < 3) {
                                            toast.error('Por favor, descreva o conteúdo do carrossel!');
                                            return;
                                        }
                                        handleGenerateAllPrompts();
                                    }}
                                    disabled={isGeneratingPrompt}
                                    className="btn btn-primary"
                                    style={{ width: '100%', marginBottom: '0.5rem', background: isGeneratingPrompt ? '#db2777' : '#ec4899' }}
                                >
                                    {isGeneratingPrompt ? '🧠 Criando Conceito Editorial...' : '✨ Gerar Cards Editoriais (Auto)'}
                                </button>
                            )}

                            {/* Bulk Image Generation Button */}
                            {
                                carouselCards.length > 0 && carouselCards.some(c => !c.image) && (
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
                                )
                            }

                            {/* Carousel Cards */}
                            {
                                carouselCards.length > 0 && (
                                    <div style={{ marginTop: '2rem' }}>
                                        <h3 style={{ marginBottom: '1rem', color: '#a78bfa' }}>
                                            {imageCount > 1 ? `Cards do Carrossel (${carouselCards.length}/${imageCount})` : 'Card do Post'}
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
                                                                style={{ width: '100%', fontSize: '0.75rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                                                            >
                                                                <DownloadIcon /> Baixar
                                                            </button>
                                                            <button
                                                                onClick={() => handleRegenerateCard(index)}
                                                                className="btn"
                                                                style={{
                                                                    width: '100%',
                                                                    fontSize: '0.75rem',
                                                                    padding: '0.5rem',
                                                                    marginTop: '0.5rem',
                                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                                    color: '#f87171',
                                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem'
                                                                }}
                                                            >
                                                                <RefreshIcon /> Regenerar
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
                                                    style={{
                                                        flex: '1 1 auto',
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: '#e4e4e7',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem',
                                                        transition: 'all 0.2s ease'
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
                                                    <DownloadIcon /> Baixar Todas ({carouselCards.filter(c => c.image).length})
                                                </button>
                                                <button
                                                    onClick={() => setShowCaptionGenerator(true)}
                                                    style={{
                                                        flex: '1 1 auto',
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: '#e4e4e7',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem',
                                                        transition: 'all 0.2s ease'
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
                                                    <MagicIcon /> Gerar Caption
                                                </button>
                                                <button
                                                    onClick={handleSaveToHistory}
                                                    style={{
                                                        flex: '1 1 auto',
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: '#e4e4e7',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem',
                                                        transition: 'all 0.2s ease'
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
                                                    <SaveIcon /> Salvar Histórico
                                                </button>
                                                <button
                                                    onClick={handleSendToCalendar}
                                                    style={{
                                                        flex: '1 1 auto',
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #3f3f46',
                                                        borderRadius: '0.5rem',
                                                        color: '#e4e4e7',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem',
                                                        transition: 'all 0.2s ease'
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
                                                    <CalendarIcon /> Calendar ({carouselCards.filter(c => c.image).length})
                                                </button>
                                                <button
                                                    onClick={handleSendToPost}
                                                    style={{
                                                        flex: '1 1 auto',
                                                        padding: '0.625rem',
                                                        background: '#27272a',
                                                        border: '1px solid #22c55e',
                                                        borderRadius: '0.5rem',
                                                        color: '#4ade80',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.5rem',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: '0 0 10px rgba(34, 197, 94, 0.1)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#27272a';
                                                    }}
                                                >
                                                    <RocketIcon /> Postar ({carouselCards.filter(c => c.image).length})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            }
                        </section>
                    </>
                ) : (
                    /* CALENDAR VIEW */
                    <div className="card-glass" style={{ padding: '2rem' }}>
                        <p style={{ textAlign: 'center', color: '#a1a1aa' }}>Calendar view is available in the Calendar tab.</p>
                        <button onClick={() => router.push('/dashboard/calendar')} className="btn" style={{ margin: '1rem auto', display: 'block', background: '#7c3aed', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '999px' }}>
                            Go to Calendar
                        </button>
                    </div>
                )}

                {/* AI Caption Generator Modal */}
                {
                    showCaptionGenerator && (
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
                    )
                }



                {/* Ideas Modal */}
                {
                    showIdeasModal && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.8)',
                            zIndex: 2000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2rem'
                        }} onClick={() => setShowIdeasModal(false)}>
                            <div style={{
                                background: '#18181b',
                                border: '1px solid #27272a',
                                borderRadius: '1rem',
                                padding: '2rem',
                                maxWidth: '900px',
                                width: '100%',
                                maxHeight: '85vh',
                                overflow: 'auto',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #27272a', paddingBottom: '1rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                                            ✨ Brainstorm de Ideias
                                        </h2>
                                        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                                            Sugestões baseadas no perfil <b>{selectedProfile?.name}</b>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowIdeasModal(false)}
                                        style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.5rem' }}
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* Ideas Grid equivalent to the requested logical flow */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                                    {ideas.map((idea, index) => (
                                        <div key={index} style={{
                                            background: '#09090b',
                                            border: '1px solid #27272a',
                                            borderRadius: '0.75rem',
                                            padding: '1.5rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1rem',
                                            transition: 'transform 0.2s, border-color 0.2s',
                                            cursor: 'pointer'
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = '#7c3aed';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = '#27272a';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                            }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{
                                                    background: idea.type === 'carousel' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                    color: idea.type === 'carousel' ? '#a78bfa' : '#34d399',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    padding: '0.25rem 0.75rem',
                                                    borderRadius: '999px',
                                                }}>
                                                    {idea.type === 'carousel' ? `🎠 Carrossel (${idea.slideCount})` : '📸 Post Único'}
                                                </div>
                                            </div>

                                            <div>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem', lineHeight: '1.3' }}>
                                                    {idea.title}
                                                </h3>
                                                <p style={{ fontSize: '0.875rem', color: '#d4d4d8', lineHeight: '1.5' }}>
                                                    {idea.description}
                                                </p>
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: '#71717a', fontStyle: 'italic', borderTop: '1px solid #27272a', paddingTop: '1rem', marginTop: 'auto' }}>
                                                💡 {idea.reason}
                                            </div>

                                            <button
                                                onClick={() => handleSelectIdea(idea)}
                                                className="btn"
                                                style={{
                                                    width: '100%',
                                                    marginTop: '1rem',
                                                    padding: '0.75rem',
                                                    background: '#7c3aed',
                                                    border: 'none',
                                                    borderRadius: '0.5rem',
                                                    color: '#fff',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Usar essa Ideia
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Preview Modal */}
                {
                    showPreview && (
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
                    )
                }

                {/* Image Lightbox */}
                {
                    lightboxOpen && (
                        <ImageLightbox
                            images={lightboxImages}
                            currentIndex={lightboxIndex}
                            onClose={() => setLightboxOpen(false)}
                            onNavigate={setLightboxIndex}
                            onDownload={handleDownloadImage}
                        />
                    )
                }
            </div >
        </div >
    );
}
