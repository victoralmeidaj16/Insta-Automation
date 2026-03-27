'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import ImageLightbox from '@/components/ImageLightbox';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';

// Internal Imports
import { CarouselCard, PostIdea, PremiumLayout } from './types';
import {
    buildPremiumLayoutFromPrompt,
    extractPremiumBackgroundPrompt,
    isPremiumPrompt,
    PremiumEditorModal,
    renderPremiumPostToDataUrl
} from './components/PremiumCarouselEditor';

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
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

const HistoryIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
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
    const [referenceImage, setReferenceImage] = useState<string | null>(null);

    // Idea Generation states
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
    const [ideas, setIdeas] = useState<PostIdea[]>([]);
    const [showIdeasModal, setShowIdeasModal] = useState(false);

    // Common states
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '16:9' | '9:16'>('4:5');
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

    const [showPreview, setShowPreview] = useState(false);
    const [generationMode, setGenerationMode] = useState<'standard' | 'premium' | 'html'>('premium');
    const [premiumEditorIndex, setPremiumEditorIndex] = useState<number | null>(null);
    const [generatedHtml, setGeneratedHtml] = useState<string>('');
    const [isGeneratingHtml, setIsGeneratingHtml] = useState<boolean>(false);
    const [htmlTemplate, setHtmlTemplate] = useState<'template1' | 'free' | 'fitswap_minimal'>('template1');
    const [showHtmlFixer, setShowHtmlFixer] = useState(false);
    const [htmlFixInstruction, setHtmlFixInstruction] = useState('');
    const [isFixingHtml, setIsFixingHtml] = useState(false);
    const selectedModel: 'gemini' | 'seedream' = 'gemini';

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
        const reusedPrompt = localStorage.getItem('reusedPrompt');
        if (reusedPrompt) {
            setPrompt(reusedPrompt);
            localStorage.removeItem('reusedPrompt');
            toast.success('📋 Prompt carregado do histórico!');
        }

        const savedDraft = localStorage.getItem('carouselDraft');
        if (savedDraft) {
            try {
                const draft = JSON.parse(savedDraft);
                setCarouselDescription(draft.description || '');
                setCarouselCards(draft.cards || []);
                setAspectRatio(draft.aspectRatio || '1:1');
                setImageCount(draft.imageCount || 1);
                toast.success('📄 Rascunho carregado!');
            } catch (e) {
                console.error('Failed to load draft:', e);
            }
        }
    }, []);

    useEffect(() => {
        if (carouselCards.length > 0 || carouselDescription) {
            const saveInterval = setInterval(() => {
                const leanCards = carouselCards.map(card => ({
                    ...card,
                    image: undefined,
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
                } catch (e) {
                    console.error('Auto-save failed:', e);
                }
            }, 5000);

            return () => clearInterval(saveInterval);
        }
    }, [carouselDescription, carouselCards, aspectRatio, imageCount]);

    useEffect(() => {
        if (selectedProfile?.aiPreferences) {
            const defaultRatio = selectedProfile.aiPreferences.defaultAspectRatio;
            if (defaultRatio && ['1:1', '4:5', '16:9', '9:16'].includes(defaultRatio)) {
                setAspectRatio(defaultRatio as '1:1' | '4:5' | '16:9' | '9:16');
            }
        }

        const logoUrl = selectedProfile?.branding?.logoUrl || selectedProfile?.branding?.logo;
        if (logoUrl && !referenceImage) {
            fetch(logoUrl)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setReferenceImage(reader.result as string);
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(err => console.error('❌ Error loading brand logo:', err));
        }
    }, [selectedProfile]);



    const getApiErrorMessage = (error: unknown, fallback: string) => {
        if (error && typeof error === 'object') {
            const maybeAxios = error as { response?: { data?: { error?: string } } };
            const msg = maybeAxios.response?.data?.error;
            if (msg && typeof msg === 'string') return msg;
        }
        return fallback;
    };

    const extractStructuredBackgroundPrompt = (rawPrompt: string) => {
        const backgroundMatch = (rawPrompt || '').match(/\[BACKGROUND:\s*(.*?)\]/i);
        return backgroundMatch ? backgroundMatch[1].trim() : rawPrompt;
    };

    const normalizePremiumPrompt = (rawPrompt: string) => {
        const prompt = String(rawPrompt || '').trim();
        if (!prompt) return prompt;

        return prompt
            .replace(/\[WHITE_OVERLAY\]/gi, '[PREMIUM_OVERLAY]')
            .replace(/\[HEADLINE:/gi, '[TITLE:');
    };

    const getBrandKey = () => {
        const raw = (((selectedProfile as any)?.brandKey || selectedProfile?.name) || '').toLowerCase();
        if (raw.includes('fitswap') || raw.includes('nutriverse')) return 'fitswap';
        return (selectedProfile as any)?.brandKey || '';
    };

    const getProfileReferenceImages = (options?: { premiumOnly?: boolean }) => {
        const profile = selectedProfile as any;
        const visualRefs = Array.isArray(profile?.brandKit?.visualReferenceUrls) ? profile.brandKit.visualReferenceUrls : [];
        const appRefs = Array.isArray(profile?.brandKit?.appUiReferenceUrls) ? profile.brandKit.appUiReferenceUrls : [];
        const logoUrl = selectedProfile?.branding?.logoUrl || profile?.branding?.logo;

        if (options?.premiumOnly) {
            return [...new Set([
                ...(referenceImage ? [referenceImage] : [])
            ].filter(Boolean))];
        }

        return [...new Set([
            ...(referenceImage ? [referenceImage] : []),
            ...(logoUrl ? [logoUrl] : []),
            ...visualRefs,
            ...appRefs
        ].filter(Boolean))];
    };

    const buildSelectedProfileContext = () => ({
        brandKey: getBrandKey(),
        brandName: selectedProfile?.name,
        brandContext: (selectedProfile as any)?.brandContext,
        brandKit: (selectedProfile as any)?.brandKit,
        contentStrategy: (selectedProfile as any)?.contentStrategy,
        targetAudience: selectedProfile?.targetAudience,
        productService: selectedProfile?.productService,
        tone: selectedProfile?.branding?.tone,
        profileDescription: selectedProfile?.description,
        primaryColor: selectedProfile?.branding?.primaryColor,
        secondaryColor: selectedProfile?.branding?.secondaryColor,
        guidelines: selectedProfile?.branding?.guidelines,
        brandingStyle: selectedProfile?.branding?.style,
        branding: selectedProfile?.branding,
        aiPreferences: selectedProfile?.aiPreferences
    });

    const getDefaultPremiumLayout = (card: CarouselCard) => {
        const brandKey = getBrandKey();
        const defaultIcon = brandKey === 'fitswap' ? '🍎' : brandKey === 'viver-mais' ? '✨' : '🧠';
        const logoUrl = selectedProfile?.branding?.logoUrl || (selectedProfile?.branding as any)?.logo || undefined;
        return buildPremiumLayoutFromPrompt(card.prompt || '', {
            brandName: selectedProfile?.name || 'Inner Boost',
            primaryColor: selectedProfile?.branding?.primaryColor || '#00C2FF',
            logoIcon: (selectedProfile?.branding as any)?.logoIcon || defaultIcon,
            logoUrl,
            description: card.concept || ''
        });
    };

    const buildPremiumCards = (cards: CarouselCard[]) => {
        if (generationMode !== 'premium') return cards;
        return cards.map(card => ({
            ...card,
            prompt: normalizePremiumPrompt(card.prompt || ''),
            premiumLayout: card.premiumLayout || getDefaultPremiumLayout(card)
        }));
    };

    const getCardPremiumLayout = (card?: CarouselCard) => {
        if (!card) {
            return buildPremiumLayoutFromPrompt('', {
                brandName: selectedProfile?.name || 'Inner Boost',
                primaryColor: selectedProfile?.branding?.primaryColor || '#00C2FF',
                logoIcon: '🧠'
            });
        }
        return card.premiumLayout || getDefaultPremiumLayout(card);
    };

    const parsePremiumCardBriefs = (rawBrief: string) => {
        const normalized = (rawBrief || '').trim();
        if (!normalized) return [];

        const numberedBlocks = normalized
            .split(/\n(?=(?:card|slide|slid|c[aá]rd)?\s*\d+[\)\.\:\-\s])/i)
            .map(block => block.trim())
            .filter(Boolean)
            .map(block => block.replace(/^(?:card|slide|slid|c[aá]rd)?\s*\d+[\)\.\:\-\s]*/i, '').trim())
            .filter(Boolean);

        if (numberedBlocks.length > 1) {
            return numberedBlocks;
        }

        return normalized
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => line.replace(/^[-*•]\s*/, '').trim())
            .filter(Boolean);
    };

    const normalizeCardText = (value: string) => value
        .replace(/\r/g, '')
        .replace(/\n{2,}/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();

    const parseStructuredCarouselCards = (rawDescription: string, options?: { ideaTitle?: string }) => {
        const normalized = String(rawDescription || '').replace(/\r/g, '').trim();
        if (!normalized) return [];

        const backgroundMatch = normalized.match(/\*\*Imagem de Fundo:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Card\s+\d+:\*\*|$)/i);
        const background = normalizeCardText(backgroundMatch?.[1] || '');
        const cardRegex = /\*\*Card\s+(\d+):\*\*\s*([\s\S]*?)(?=\n\s*\*\*Card\s+\d+:\*\*|$)/gi;
        const cards: Array<{ index: number; concept: string }> = [];

        let match: RegExpExecArray | null;
        while ((match = cardRegex.exec(normalized)) !== null) {
            const cardIndex = Number(match[1]);
            const cardText = normalizeCardText(match[2] || '');

            if (!cardText) continue;

            const contextParts = [
                options?.ideaTitle ? `**Tema Central:** ${options.ideaTitle}` : '',
                background ? `**Imagem de Fundo:** ${background}` : '',
                `**Card ${cardIndex}:** ${cardText}`
            ].filter(Boolean);

            cards.push({
                index: cardIndex,
                concept: contextParts.join('\n\n')
            });
        }

        return cards.sort((a, b) => a.index - b.index);
    };

    const composePremiumCardImage = async (card: CarouselCard, layoutOverride?: PremiumLayout) => {
        const layout = layoutOverride || getCardPremiumLayout(card);
        const backgroundImage = layout.backgroundImage || card.premiumBaseImage || card.image;

        if (!backgroundImage) {
            return card.image || '';
        }

        return renderPremiumPostToDataUrl({
            layout,
            backgroundImage,
            apiBaseUrl: api.defaults.baseURL || 'http://localhost:3001'
        });
    };

    const isPremiumOverlayApplied = (card: CarouselCard) => Boolean(card.premiumOverlayApplied && card.premiumBaseImage);

    const handleApplyPremiumOverlay = async (index: number) => {
        const card = carouselCards[index];
        if (!card || !card.premiumBaseImage) {
            toast.error('Gere a imagem do card antes de aplicar o modelo premium.');
            return;
        }

        try {
            const finalImage = await composePremiumCardImage(card);
            setCarouselCards(prev => prev.map((currentCard, cardIndex) => (
                cardIndex === index
                    ? {
                        ...currentCard,
                        image: finalImage,
                        premiumOverlayApplied: true
                    }
                    : currentCard
            )));
            toast.success(`Modelo premium aplicado no card ${index + 1}.`);
        } catch (error) {
            console.error('Erro ao aplicar overlay premium:', error);
            toast.error('Não foi possível aplicar o modelo premium.');
        }
    };

    const handleApplyPremiumOverlayToAll = async () => {
        const premiumCards = carouselCards
            .map((card, index) => ({ card, index }))
            .filter(({ card }) => card.premiumBaseImage && !isPremiumOverlayApplied(card));

        if (premiumCards.length === 0) {
            toast.error('Nenhum card premium pendente para aprovação.');
            return;
        }

        toast.loading('Aplicando modelo premium...', { id: 'premium-apply-all' });
        try {
            for (const { index } of premiumCards) {
                await handleApplyPremiumOverlay(index);
            }
            toast.success('Modelo premium aplicado aos cards aprovados.', { id: 'premium-apply-all' });
        } catch (error) {
            console.error('Erro ao aplicar overlay premium em lote:', error);
            toast.error('Falha ao aplicar o modelo premium em todos os cards.', { id: 'premium-apply-all' });
        }
    };

    const handleUpdatePremiumLayout = async (index: number, field: keyof PremiumLayout, value: string | boolean) => {
        const currentCard = carouselCards[index];
        if (!currentCard) return;

        const nextLayout: PremiumLayout = {
            ...getCardPremiumLayout(currentCard),
            [field]: value
        };

        setCarouselCards(prev => prev.map((card, cardIndex) => (
            cardIndex === index
                ? {
                    ...card,
                    premiumLayout: nextLayout
                }
                : card
        )));

        if (generationMode === 'premium' && (currentCard.premiumBaseImage || currentCard.image)) {
            try {
                const nextImage = await composePremiumCardImage(currentCard, nextLayout);
                setCarouselCards(prev => prev.map((card, cardIndex) => (
                    cardIndex === index
                        ? {
                            ...card,
                            image: nextImage,
                            premiumOverlayApplied: true
                        }
                        : card
                )));
            } catch (error) {
                console.error('Erro ao recompor card premium:', error);
                toast.error('Não foi possível atualizar o overlay premium.');
            }
        }
    };

    const getRenderedCards = () => carouselCards
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => Boolean(card.image));

    const getResolvedOutputImages = async () => {
        const renderedCards = getRenderedCards();
        if (generationMode !== 'premium') {
            return renderedCards.map(({ card }) => card.image!).filter(Boolean);
        }

        return renderedCards.map(({ card }) => card.image!).filter(Boolean);
    };

    const handleGenerateAllPrompts = async () => {
        if (!carouselDescription) {
            toast.error('Digite a descrição do carrossel');
            return;
        }
        setIsGeneratingPrompt(true);
        try {
            const profileContext = buildSelectedProfileContext();
            const response = await api.post('/api/ai/generate-carousel-prompts', {
                carouselDescription,
                totalCards: imageCount,
                guidelines: selectedProfile?.branding?.guidelines,
                savedPrompts: selectedProfile?.aiPreferences?.favoritePrompts,
                isEditorial: generationMode === 'premium',
                isPremiumCarousel: generationMode === 'premium',
                overlayMode: generationMode === 'premium' ? 'premium' : undefined,
                isScientific: false, // Unified into Editorial/Carousel mode
                businessProfileId: selectedProfile?.id,
                brandName: selectedProfile?.name || 'VIVER MAIS PSICOLOGIA STREAMING',
                context: {
                    ...profileContext,
                    brandTone: selectedProfile?.branding?.tone,
                },
                referenceImage: getProfileReferenceImages({ premiumOnly: generationMode === 'premium' })
            }, { timeout: 120000 });

            if (response.data.success && response.data.prompts) {
                const newCards = response.data.prompts.map((prompt: string) => ({
                    prompt: generationMode === 'premium' ? normalizePremiumPrompt(prompt) : prompt,
                    isGeneratingImage: false
                }));
                setCarouselCards(buildPremiumCards(newCards));
                toast.success(`${newCards.length} prompts gerados com sucesso!`);
            }
        } catch (error: unknown) {
            console.error('Error generating prompts:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao gerar prompts'));
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    const handleGenerateIdeas = async () => {
        if (!selectedProfile) {
            toast.error('Selecione um perfil de negócio primeiro');
            return;
        }

        const ideasCount = generationMode === 'premium' ? 3 : imageCount;
        setIsGeneratingIdeas(true);
        try {
            const response = await api.post('/api/ai/generate-ideas', {
                profileName: selectedProfile.name,
                profileDescription: selectedProfile.description,
                guidelines: selectedProfile.branding?.guidelines,
                brandingStyle: selectedProfile.branding?.style,
                brandContext: (selectedProfile as any).brandContext,
                brandKey: getBrandKey(),
                contentStrategy: (selectedProfile as any)?.contentStrategy,
                isBatchMode: generationMode === 'standard',
                count: ideasCount,
                baseTopic: carouselDescription
            });

            if (response.data.success && response.data.ideas) {
                if (generationMode === 'standard') {
                    const newCards = response.data.ideas.map((idea: any) => ({
                        concept: idea.description,
                        prompt: '',
                        isGeneratingImage: false
                    }));
                    setCarouselCards(newCards);
                    toast.success(`💡 ${ideasCount} Ideias geradas e aplicadas com sucesso!`);
                } else {
                    setIdeas(response.data.ideas);
                    setShowIdeasModal(true);
                    toast.success(`💡 ${ideasCount} Ideias geradas com sucesso!`);
                }
            }
        } catch (error: unknown) {
            console.error('Error generating ideas:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao gerar ideias'));
        } finally {
            setIsGeneratingIdeas(false);
        }
    };

    const handleGeneratePromptsFromConcepts = async () => {
        const cardsToProcess = carouselCards.filter(c => c.concept && !c.prompt);
        if (cardsToProcess.length === 0) {
            toast.error('Gere ou escreva conceitos para os cards primeiro.');
            return;
        }

        setIsGeneratingPrompt(true);
        toast.loading(`Gerando ${cardsToProcess.length} prompts visuais...`, { id: 'prompts-gen' });

        try {
            const updatedCards = [...carouselCards];
            const promises = updatedCards.map(async (card, index) => {
                if (card.concept && !card.prompt) {
                    try {
                        const res = await api.post('/api/ai/generate-image-prompt', {
                            concept: card.concept,
                            context: {
                                ...buildSelectedProfileContext(),
                                savedPrompts: (selectedProfile as any)?.aiPreferences?.savedPrompts,
                                isPremiumCarousel: generationMode === 'premium'
                            }
                        });
                        if (res.data.success) {
                            updatedCards[index] = { ...updatedCards[index], prompt: res.data.prompt };
                        }
                    } catch (err) {
                        console.error(`Falha no card ${index + 1}`, err);
                    }
                }
            });

            await Promise.all(promises);
            setCarouselCards(generationMode === 'premium' ? buildPremiumCards(updatedCards) : updatedCards);
            toast.success('Prompts gerados com sucesso!', { id: 'prompts-gen' });
        } catch (error) {
            console.error('Error in batch prompt generation:', error);
            toast.error('Erro ao gerar prompts.');
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    const handleSelectIdea = async (idea: PostIdea) => {
        setCarouselDescription(idea.description);

        if (!selectedProfile) {
            toast.error('Selecione um Perfil de Negócio para continuar.');
            return;
        }
        const count = idea.slideCount || 5;
        setImageCount(count);
        setAspectRatio('4:5');
        setShowIdeasModal(false);

        const structuredCards = parseStructuredCarouselCards(idea.description, { ideaTitle: idea.title });
        if (structuredCards.length > 0) {
            setCarouselCards(structuredCards.slice(0, count).map(card => ({
                concept: card.concept,
                prompt: '',
                isGeneratingImage: false
            })));
            return;
        }

        const initialCards: CarouselCard[] = [{
            concept: idea.description,
            prompt: '',
            isGeneratingImage: false
        }];

        setCarouselCards(initialCards);

        if (count > 1) {
            toast.loading('Expandindo para mais ideias relacionadas...', { id: 'batch-expand' });
            try {
                const response = await api.post('/api/ai/generate-related', {
                    baseIdea: idea.description,
                    count: count - 1,
                    context: buildSelectedProfileContext()
                });

                if (response.data.success) {
                    const related = response.data.ideas.map((rel: any) => ({
                        concept: rel.description || rel.title,
                        prompt: '',
                        isGeneratingImage: false
                    }));
                    setCarouselCards([...initialCards, ...related]);
                    toast.success('Ideias relacionadas geradas!', { id: 'batch-expand' });
                }
            } catch (error) {
                console.error('Error generating related ideas:', error);
                toast.error('Erro ao expandir ideias.', { id: 'batch-expand' });
            }
        }
    };

    const handleGenerateBatchConcepts = async () => {
        if (!selectedProfile) {
            toast.error('Selecione um Perfil de Negócio primeiro.');
            return;
        }
        if (!carouselDescription) {
            toast.error('Descreva o tema primeiro');
            return;
        }
        setIsGeneratingPrompt(true);
        try {
            if (generationMode === 'premium') {
                const structuredCards = parseStructuredCarouselCards(carouselDescription);
                if (structuredCards.length > 0) {
                    const newCards = structuredCards.slice(0, imageCount).map(card => ({
                        concept: card.concept,
                        prompt: '',
                        isGeneratingImage: false
                    }));
                    setCarouselCards(newCards);
                    toast.success(`Brief de ${newCards.length} slides aplicado com sucesso!`, { id: 'carousel-script' });
                    return;
                }

                const parsedBriefs = parsePremiumCardBriefs(carouselDescription);
                if (parsedBriefs.length > 1) {
                    const newCards = parsedBriefs.slice(0, imageCount).map((conceptStr: string) => ({
                        concept: conceptStr,
                        prompt: '',
                        isGeneratingImage: false
                    }));
                    setCarouselCards(newCards);
                    toast.success(`Brief de ${newCards.length} slides aplicado com sucesso!`, { id: 'carousel-script' });
                    return;
                }

                toast.loading(`Gerando roteiro de ${imageCount} slides...`, { id: 'carousel-script' });
                const response = await api.post('/api/ai/generate-carousel-concepts', {
                    carouselDescription,
                    totalCards: imageCount,
                    context: buildSelectedProfileContext()
                });

                if (response.data.success && response.data.concepts) {
                    const newCards = response.data.concepts.map((conceptStr: string) => ({
                        concept: conceptStr,
                        prompt: '',
                        isGeneratingImage: false
                    }));
                    setCarouselCards(newCards);
                    toast.success('Roteiro do carrossel gerado com sucesso!', { id: 'carousel-script' });
                }
            } else {
                const structuredCards = parseStructuredCarouselCards(carouselDescription);
                if (structuredCards.length > 0) {
                    setCarouselCards(structuredCards.slice(0, imageCount).map(card => ({
                        concept: card.concept,
                        prompt: '',
                        isGeneratingImage: false
                    })));
                    toast.success(`Roteiro de ${Math.min(structuredCards.length, imageCount)} cards aplicado com sucesso!`, { id: 'carousel-script' });
                    return;
                }

                const initialCards: CarouselCard[] = [{
                    concept: carouselDescription,
                    prompt: '',
                    isGeneratingImage: false
                }];
                setCarouselCards(initialCards);

                if (imageCount > 1) {
                    toast.loading('Expandindo para mais ideias relacionadas...', { id: 'batch-expand-manual' });
                    const response = await api.post('/api/ai/generate-related', {
                        baseIdea: carouselDescription,
                        count: imageCount - 1,
                        context: buildSelectedProfileContext()
                    });
                    if (response.data.success) {
                        const related = response.data.ideas.map((rel: any) => ({
                            concept: rel.description || rel.title,
                            prompt: '',
                            isGeneratingImage: false
                        }));
                        setCarouselCards([...initialCards, ...related]);
                        toast.success('Ideias geradas!', { id: 'batch-expand-manual' });
                    }
                }
            }
        } catch (error) {
            console.error('Error generating concepts:', error);
            toast.error('Erro ao gerar conceitos do roteiro.');
        } finally {
            setIsGeneratingPrompt(false);
            toast.dismiss('batch-expand-manual');
            toast.dismiss('carousel-script');
        }
    };

    const handleGenerateImageForCard = async (cardIndex: number, retryCount: number = 0, cardsState?: CarouselCard[]) => {
        const currentCards = cardsState || carouselCards;
        const card = currentCards[cardIndex];
        if (!card || (card.image && !cardsState)) return;

        if (!cardsState) {
            setCarouselCards(prev => {
                const updated = [...prev];
                updated[cardIndex] = { ...updated[cardIndex], isGeneratingImage: true };
                return updated;
            });
        }

        try {
            const normalizedPrompt = generationMode === 'premium'
                ? normalizePremiumPrompt(card.prompt || '')
                : (card.prompt || '');
            const premiumStructuredPrompt = generationMode === 'premium' && isPremiumPrompt(normalizedPrompt);
            const premiumAnyStructuredPrompt = generationMode === 'premium' && /\[(PREMIUM_OVERLAY|WHITE_OVERLAY)\]/i.test(normalizedPrompt);
            let enhancedPrompt = premiumStructuredPrompt
                ? extractPremiumBackgroundPrompt(normalizedPrompt)
                : premiumAnyStructuredPrompt
                    ? extractStructuredBackgroundPrompt(normalizedPrompt)
                    : normalizedPrompt;
            // Detect if the prompt is already a structured template (e.g. [WHITE_OVERLAY] / [BACKGROUND:])
            // These must be sent as-is — the backend will parse and process them correctly
            const isStructuredPrompt = enhancedPrompt.includes('[WHITE_OVERLAY]') || 
                (enhancedPrompt.includes('[BACKGROUND:') && enhancedPrompt.includes('[HEADLINE:'));

            if (!isStructuredPrompt) {
                if (generationMode !== 'premium' && selectedProfile?.aiPreferences?.promptTemplate) {
                    enhancedPrompt = `${selectedProfile.aiPreferences.promptTemplate}\n\n${card.prompt}`;
                }
            }

            let brandingContext = selectedProfile?.branding?.style || '';
            
            // For Premium Carousel, we must NOT use the full branding style template
            // because it forces a specific scene (e.g. woman + phone + kitchen) on every card.
            // Instead, send ONLY the brand colors and a strict no-text rule.
            // Text/overlay is applied via Canvas on the client side, not in the generated image.
            if (generationMode === 'premium') {
                // Build a minimal branding context with just colors and guardrails
                const colorParts: string[] = [];
                if (selectedProfile?.branding?.primaryColor) colorParts.push(`Primary Brand Color: ${selectedProfile.branding.primaryColor}`);
                if (selectedProfile?.branding?.colors && Array.isArray(selectedProfile.branding.colors)) colorParts.push(`Color Palette: ${selectedProfile.branding.colors.join(', ')}`);
                brandingContext = colorParts.join('. ') + '.\n\nCRITICAL RULES FOR THIS IMAGE:\n- DO NOT generate any readable text, letters, words, headlines, or typography on the image.\n- DO NOT add any UI elements, overlays, or text areas.\n- Generate ONLY the background scene/photo. Text will be added via overlay later.\n- Focus on creating a clean, premium, editorial-quality photograph.\n- Leave plenty of clean space in the lower half for overlay composition.';
            } else {
                if (selectedProfile?.branding?.primaryColor) brandingContext += `. Primary Brand Color: ${selectedProfile.branding.primaryColor}`;
                if (selectedProfile?.branding?.colors && Array.isArray(selectedProfile.branding.colors)) brandingContext += `. Color Palette: ${selectedProfile.branding.colors.join(', ')}`;
            }
            const profileContext = buildSelectedProfileContext();

            const response = await api.post('/api/ai/generate-single-image', {
                prompt: enhancedPrompt,
                aspectRatio,
                brandingStyle: brandingContext,
                model: selectedModel,
                isPremiumCarousel: generationMode === 'premium',
                overlayMode: generationMode === 'premium' ? 'premium' : undefined,
                // If the prompt is a structured template, never apply editorial transformation on top of it
                isEditorial: false, // No longer supporting purely editorial mode here, fallback to backend standard
                businessProfileId: selectedProfile?.id,
                context: {
                    ...profileContext,
                    isPremiumCarousel: generationMode === 'premium',
                    overlayMode: generationMode === 'premium' ? 'premium' : undefined,
                    skipLegacyOverlayComposition: generationMode === 'premium'
                },
                referenceImage: getProfileReferenceImages({ premiumOnly: generationMode === 'premium' })
            }, { timeout: 120000 });

            if (response.data.success) {
                const existingLayout = card.premiumLayout;
                const defaultLayout = getDefaultPremiumLayout(card);
                // Always ensure logoUrl is current from profile, even on existing layouts
                const premiumLayout = generationMode === 'premium'
                    ? {
                        ...(existingLayout || defaultLayout),
                        logoUrl: existingLayout?.logoUrl || defaultLayout.logoUrl
                    }
                    : card.premiumLayout;

                const baseImage = response.data.image;

                // Set base image immediately so user sees the photo
                setCarouselCards(prev => {
                    const newCards = [...prev];
                    newCards[cardIndex] = {
                        ...newCards[cardIndex],
                        image: baseImage,
                        premiumBaseImage: generationMode === 'premium' ? baseImage : newCards[cardIndex].premiumBaseImage,
                        premiumOverlayApplied: false,
                        premiumLayout,
                        isGeneratingImage: false
                    };
                    return newCards;
                });

                // Auto-apply premium overlay right after the base image arrives
                if (generationMode === 'premium' && baseImage && premiumLayout) {
                    try {
                        const composedImage = await renderPremiumPostToDataUrl({
                            layout: premiumLayout,
                            backgroundImage: baseImage,
                            apiBaseUrl: api.defaults.baseURL || 'http://localhost:3001'
                        });
                        setCarouselCards(prev => {
                            const newCards = [...prev];
                            newCards[cardIndex] = {
                                ...newCards[cardIndex],
                                image: composedImage,
                                premiumBaseImage: baseImage,
                                premiumOverlayApplied: true,
                            };
                            return newCards;
                        });
                        toast.success(`✅ Card ${cardIndex + 1} gerado!`);
                    } catch (overlayErr) {
                        console.error(`Overlay error on card ${cardIndex + 1}:`, overlayErr);
                        toast.success(`✅ Imagem do card ${cardIndex + 1} gerada!`);
                    }
                } else {
                    toast.success(`✅ Imagem do card ${cardIndex + 1} gerada!`);
                }
            }
        } catch (error: unknown) {
            console.error(`Error generating image for card ${cardIndex + 1}:`, error);
            if (retryCount < 2) {
                const delay = Math.pow(2, retryCount) * 1000;
                toast.error(`⚠️ Erro no card ${cardIndex + 1}, tentando novamente em ${delay / 1000}s...`);
                setTimeout(() => handleGenerateImageForCard(cardIndex, retryCount + 1), delay);
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

    const handleRegenerateCard = async (cardIndex: number) => {
        if (!confirm('Tem certeza? A imagem atual será perdida.')) return;
        const newCards = [...carouselCards];
        newCards[cardIndex] = { ...newCards[cardIndex], image: undefined, premiumBaseImage: undefined, premiumOverlayApplied: false, isGeneratingImage: true };
        setCarouselCards(newCards);
        await handleGenerateImageForCard(cardIndex, 0, newCards);
    };

    const handleGenerateAllImages = async () => {
        const indicesToGenerate: number[] = [];
        carouselCards.forEach((card, i) => { if (!card.image) indicesToGenerate.push(i); });

        if (indicesToGenerate.length === 0) {
            toast.error('Todas as imagens já foram geradas!');
            return;
        }

        toast.loading(`🎨 Gerando ${indicesToGenerate.length} imagens em paralelo...`, { id: 'bulk-generation' });
        await Promise.allSettled(indicesToGenerate.map(i => handleGenerateImageForCard(i)));
        toast.success(`✅ Todas as imagens foram geradas!`, { id: 'bulk-generation' });
    };

    const handleSendToPost = () => {
        const images = getRenderedCards();
        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }
        setShowPreview(true);
    };

    const handleConfirmPost = async () => {
        const images = await getResolvedOutputImages();
        const postData = {
            caption: `Generated carousel: ${carouselDescription.substring(0, 100)}...${generatedCaption ? '\n\n' + generatedCaption : ''}`,
            mediaUrls: images,
            type: images.length > 1 ? 'carousel' : 'static',
            scheduledFor: selectedDate ? `${selectedDate}T12:00` : undefined
        };
        localStorage.setItem('params_createPost', JSON.stringify(postData));
        localStorage.removeItem('carouselDraft');
        toast.success('✅ Rascunho limpo!');
        router.push('/dashboard/create-post?source=generated');
    };

    const handleOpenLightbox = (images: string[], startIndex: number = 0) => {
        setLightboxImages(images);
        setLightboxIndex(startIndex);
        setLightboxOpen(true);
    };

    const handleGenerateCaption = async () => {
        const promptText = carouselCards.length > 0 ? carouselDescription : prompt;
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

    const handleDownloadImage = async (imageUrl: string, cardIndex: number) => {
        try {
            let finalImageUrl = imageUrl;
            if (generationMode === 'premium') {
                const card = carouselCards[cardIndex];
                if (card) {
                    finalImageUrl = await renderPremiumPostToDataUrl({
                        layout: getCardPremiumLayout(card),
                        backgroundImage: getCardPremiumLayout(card).backgroundImage || card.premiumBaseImage || imageUrl,
                        apiBaseUrl: api.defaults.baseURL || 'http://localhost:3001'
                    });

                    setCarouselCards(prev => prev.map((currentCard, index) => (
                        index === cardIndex
                            ? { ...currentCard, image: finalImageUrl, premiumOverlayApplied: true }
                            : currentCard
                    )));
                }
            }

            let blob: Blob;
            if (finalImageUrl.startsWith('data:')) {
                const [meta, data] = finalImageUrl.split(',', 2);
                const mimeMatch = meta.match(/^data:(.*?)(;base64)?$/);
                const mime = mimeMatch?.[1] || 'image/png';
                const isBase64 = meta.includes(';base64');
                const bytes = isBase64
                    ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
                    : new TextEncoder().encode(decodeURIComponent(data));
                blob = new Blob([bytes], { type: mime });
            } else {
                const proxyUrl = `${api.defaults.baseURL || 'http://localhost:3001'}/api/proxy-download?url=${encodeURIComponent(finalImageUrl)}&filename=post-${cardIndex + 1}.jpg`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Fetch via proxy falhou: ${response.statusText}`);
                blob = await response.blob();
            }
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `post-gerado-${cardIndex + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(`Post ${cardIndex + 1} pronto!`);
        } catch (error) {
            console.error('Error downloading image:', error);
            toast.error('Erro ao baixar imagem');
        }
    };

    const handleDownloadAllImages = async () => {
        const renderedCards = getRenderedCards();
        if (renderedCards.length === 0) {
            toast.error('Nenhuma imagem para baixar');
            return;
        }
        toast.loading('Baixando todas as imagens...');
        try {
            for (let i = 0; i < renderedCards.length; i++) {
                await handleDownloadImage(renderedCards[i].card.image!, renderedCards[i].index);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            toast.dismiss();
            toast.success(`${renderedCards.length} imagens baixadas!`);
        } catch {
            toast.dismiss();
            toast.error('Erro ao baixar imagens');
        }
    };

    const handleSaveToHistory = async () => {
        const images = await getResolvedOutputImages();
        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }
        try {
            const mode = imageCount > 1 ? 'carousel' : 'simple';
            const mainPrompt = mode === 'carousel' ? carouselDescription : (prompt || carouselCards[0]?.prompt || '');
            const individualPrompts = mode === 'carousel' ? carouselCards.map(c => c.prompt) : [];
            await api.post('/api/history', {
                mode,
                prompt: mainPrompt,
                aspectRatio,
                images,
                prompts: individualPrompts,
                caption: generatedCaption,
                businessProfileId: selectedProfile?.id,
            });
            toast.success('Salvo no histórico!');
        } catch (error: unknown) {
            console.error('Error saving to history:', error);
            toast.error(getApiErrorMessage(error, 'Erro ao salvar no histórico'));
        }
    };

    const handleSendToCalendar = async () => {
        const images = await getResolvedOutputImages();
        if (images.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }
        const calendarMedia = {
            type: images.length > 1 ? 'carousel' : 'static',
            mediaUrls: images,
            caption: generatedCaption || carouselDescription.substring(0, 100) || '',
            timestamp: Date.now()
        };
        localStorage.setItem('pendingCalendarMedia', JSON.stringify(calendarMedia));
        toast.success(`✅ ${images.length} imagem(ns) pronta(s) para o calendário!`);
        router.push('/dashboard/calendar');
    };

    const handleSaveToLibrary = async () => {
        const renderedCards = getRenderedCards();
        const resolvedImages = await getResolvedOutputImages();
        const imagesToSave = renderedCards.map(({ card }, index) => ({
            url: resolvedImages[index],
            prompt: card.prompt || carouselDescription || prompt || ''
        }));
        if (imagesToSave.length === 0) {
            toast.error('Gere pelo menos uma imagem primeiro');
            return;
        }
        if (!selectedProfile) {
            toast.error('Selecione um perfil de negócio primeiro');
            return;
        }
        const toastId = toast.loading(`Salvando ${imagesToSave.length} imagem(ns)...`);
        try {
            let savedCount = 0;
            const mode = (imageCount > 1 || imagesToSave.length > 1) ? 'carousel' : 'static';
            
            if (mode === 'carousel') {
                await api.post('/api/library', {
                    businessProfileId: selectedProfile.id,
                    mediaUrls: imagesToSave.map(img => img.url),
                    caption: generatedCaption || carouselDescription || prompt || '',
                    tag: 'pronto',
                    type: 'carousel'
                });
                savedCount = imagesToSave.length;
            } else {
                await Promise.all(imagesToSave.map(async (img) => {
                    await api.post('/api/library', {
                        businessProfileId: selectedProfile.id,
                        mediaUrls: [img.url],
                        caption: generatedCaption || img.prompt || '',
                        tag: 'pronto',
                        type: 'static'
                    });
                    savedCount++;
                }));
            }
            toast.dismiss(toastId);
            toast.success(`${savedCount} imagem(ns) salva(s) na Biblioteca no formato ${mode === 'carousel' ? 'Carrossel' : 'Post Simples'}!`);
        } catch (error: unknown) {
            console.error('Error saving to library:', error);
            toast.dismiss(toastId);
            toast.error(getApiErrorMessage(error, 'Erro ao salvar na biblioteca'));
        }
    };

    const handleGenerateHtmlCarousel = async () => {
        if (!carouselDescription) {
            toast.error('⚠️ Adicione um roteiro/tema primeiro!');
            return;
        }
        if (!selectedProfile) {
            toast.error('Selecione um perfil de negócio primeiro');
            return;
        }

        setIsGeneratingHtml(true);
        setGeneratedHtml('');

        try {
            // Step 1: Fetch library images from the selected profile
            let libraryImages: string[] = [];
            try {
                toast.loading('🖼️ Buscando imagens da biblioteca...', { id: 'html-fetch-lib' });
                const libRes = await api.get('/api/library', {
                    params: {
                        businessProfileId: selectedProfile.id,
                        limit: 20
                    }
                });
                if (libRes.data?.items) {
                    // Flatten all media URLs from static and carousel items
                    libraryImages = (libRes.data.items as Array<{ mediaUrls?: string[]; type?: string }>)
                        .filter(item => item.type !== 'html' && Array.isArray(item.mediaUrls))
                        .flatMap(item => item.mediaUrls || [])
                        .filter(Boolean)
                        .slice(0, 10);
                }
                toast.dismiss('html-fetch-lib');
                if (libraryImages.length > 0) {
                    toast.success(`✅ ${libraryImages.length} imagens encontradas na biblioteca!`, { duration: 2000 });
                } else {
                    toast(`ℹ️ Nenhuma imagem na biblioteca — usando design com CSS`, { duration: 2000 });
                }
            } catch (libErr) {
                toast.dismiss('html-fetch-lib');
                console.warn('⚠️ Could not fetch library images:', libErr);
            }

            // Step 2: Generate HTML carousel with library images
            toast.loading('🎨 Gerando Carrossel HTML...', { id: 'html-gen' });
            const res = await api.post('/api/ai/generate-html-carousel', {
                topic: carouselDescription,
                context: buildSelectedProfileContext(),
                htmlTemplate,
                libraryImages
            }, {
                timeout: 120000 // 2 minutes
            });

            toast.dismiss('html-gen');
            if (res.data.success && res.data.html) {
                setGeneratedHtml(res.data.html);
                toast.success('✅ Carrossel HTML gerado com sucesso!');
            }
        } catch (error: unknown) {
            console.error('Error generating HTML carousel:', error);
            toast.dismiss('html-gen');
            toast.dismiss('html-fetch-lib');
            toast.error(getApiErrorMessage(error, 'Erro ao gerar carrossel HTML'));
        } finally {
            setIsGeneratingHtml(false);
        }
    };

    const handleSaveHtmlToLibrary = async () => {
        if (!generatedHtml) {
            toast.error('Gere o HTML primeiro');
            return;
        }
        if (!selectedProfile) {
            toast.error('Selecione um perfil de negócio primeiro');
            return;
        }

        const toastId = toast.loading('Salvando Carrossel HTML na Biblioteca...');
        try {
            await api.post('/api/library', {
                businessProfileId: selectedProfile.id,
                htmlCode: generatedHtml,
                caption: carouselDescription || prompt || '',
                tag: 'pronto',
                type: 'html'
            });

            toast.dismiss(toastId);
            toast.success('Carrossel HTML salvo na Biblioteca com sucesso!');
        } catch (error: unknown) {
            console.error('Error saving HTML to library:', error);
            toast.dismiss(toastId);
            toast.error(getApiErrorMessage(error, 'Erro ao salvar na biblioteca'));
        }
    };

    const handleFixHtml = async () => {
        if (!generatedHtml) {
            toast.error('Não há HTML gerado para corrigir');
            return;
        }
        if (!htmlFixInstruction.trim()) {
            toast.error('Descreva o que deve ser corrigido');
            return;
        }

        setIsFixingHtml(true);
        const toastId = toast.loading('🔧 Corrigindo o HTML...');
        try {
            const res = await api.post('/api/ai/fix-html-carousel', {
                html: generatedHtml,
                instruction: htmlFixInstruction
            }, { timeout: 120000 });

            if (res.data.success && res.data.html) {
                setGeneratedHtml(res.data.html);
                setHtmlFixInstruction('');
                setShowHtmlFixer(false);
                toast.dismiss(toastId);
                toast.success('✅ HTML corrigido com sucesso!');
            }
        } catch (error: unknown) {
            toast.dismiss(toastId);
            toast.error(getApiErrorMessage(error, 'Erro ao corrigir HTML'));
        } finally {
            setIsFixingHtml(false);
        }
    };


    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: '#000', color: '#fff' }}>
            <div className="container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <PageHeader
                    title="Gerador de Conteúdo IA"
                    subtitle="Crie imagens e carrosséis incríveis para suas redes sociais"
                    actions={
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setView('generate')} className="btn" style={{ background: view === 'generate' ? '#7c3aed' : '#27272a', padding: '0.5rem 1rem', borderRadius: '9999px', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MagicIcon /> Gerar
                            </button>
                            <button onClick={() => setView('calendar')} className="btn" style={{ background: view === 'calendar' ? '#7c3aed' : '#27272a', padding: '0.5rem 1rem', borderRadius: '9999px', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CalendarIcon /> Calendário
                            </button>
                            <button onClick={() => router.push('/dashboard/history')} className="btn" style={{ background: '#27272a', padding: '0.5rem 1rem', borderRadius: '9999px', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <HistoryIcon /> Histórico
                            </button>
                        </div>
                    }
                />

                {selectedProfile && (
                    <div className="card-glass" style={{ padding: '0.75rem 1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'rgba(24, 24, 27, 0.6)', border: '1px solid #27272a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: selectedProfile.branding?.primaryColor || '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                                {selectedProfile.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff', margin: 0 }}>{selectedProfile.name}</p>
                                <p style={{ fontSize: '0.75rem', color: selectedProfile.branding?.primaryColor || '#a78bfa', margin: 0 }}>● Perfil Conectado</p>
                            </div>
                        </div>
                        {selectedProfile.aiPreferences?.promptTemplate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', background: 'rgba(124, 58, 237, 0.1)', borderRadius: '999px', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                                <span style={{ fontSize: '0.75rem', color: '#a78bfa' }}>📋 Prompt Personalizado Ativo</span>
                            </div>
                        )}
                    </div>
                )}

                {view === 'generate' ? (
                    <>
                        <section className="card-glass" style={{ padding: '2rem', marginBottom: '2rem', background: '#0a0a0a' }}>
                            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', background: '#27272a', padding: '0.5rem', borderRadius: '0.5rem' }}>
                                <button
                                    onClick={() => setGenerationMode('standard')}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        background: generationMode === 'standard' ? '#3f3f46' : 'transparent',
                                        color: generationMode === 'standard' ? '#fff' : '#a1a1aa',
                                        padding: '0.75rem',
                                        borderRadius: '0.25rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    ✨ Geração em Lote
                                </button>

                                <button
                                    onClick={() => {
                                        setGenerationMode('premium');
                                        setImageCount(5);
                                        setAspectRatio('4:5');
                                    }}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        background: generationMode === 'premium' ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' : 'transparent',
                                        color: generationMode === 'premium' ? '#000' : '#a1a1aa',
                                        padding: '0.75rem',
                                        borderRadius: '0.25rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 700
                                    }}
                                >
                                    💎 Carrossel Premium
                                </button>
                                
                                <button
                                    onClick={() => {
                                        setGenerationMode('html');
                                        setAspectRatio('4:5');
                                    }}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        background: generationMode === 'html' ? 'linear-gradient(135deg, #FF0080 0%, #7928CA 100%)' : 'transparent',
                                        color: generationMode === 'html' ? '#fff' : '#a1a1aa',
                                        padding: '0.75rem',
                                        borderRadius: '0.25rem',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 700
                                    }}
                                >
                                    🌐 Carrossel HTML
                                </button>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block', marginBottom: '0.5rem' }}>
                                    {generationMode === 'html'
                                        ? '🌐 Modo HTML: gera código HTML pronto para Satori/Puppeteer com a identidade da marca.'
                                        : generationMode === 'premium'
                                            ? '👑 Modo Premium: a IA gera os fundos e o template premium é aplicado apenas após aprovação.'
                                            : 'Modo Geração em Lote: crie variações de posts independentes sem alterar o layout da página.'}
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#71717a', display: 'block', marginBottom: '0.5rem' }}>
                                        Proporção (Aspect Ratio)
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
                                        {generationMode === 'standard' ? 'Quantidade de Posts' : 'Quantidade de Slides'}
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                                            <button
                                                key={count}
                                                onClick={() => setImageCount(count)}
                                                className="btn"
                                                style={{
                                                    flex: '1 0 calc(20% - 0.5rem)',
                                                    minWidth: '44px',
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

                            {generationMode === 'premium' || generationMode === 'html' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label className="input-label" style={{ marginBottom: 0 }}>
                                            📝 Brief do Carrossel por Card
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
                                        placeholder={`Card 1: Gancho principal sobre dietas restritivas\nCard 2: Explique o ciclo restricao -> compulsao\nCard 3: Mostre o impacto nos objetivos\nCard 4: Apresente a alternativa Fitswap\nCard 5: CTA final`}
                                        className="input"
                                        rows={6}
                                        style={{ width: '100%' }}
                                    />

                                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 text-sm text-zinc-400">
                                        <p>
                                            {generationMode === 'premium' 
                                                ? '💎 Modo Premium Ativo: escreva uma breve descrição por card, uma linha por slide. O sistema usa esse roteiro para gerar cada fundo e só aplica o template premium depois da sua aprovação.' 
                                                : '🌐 Modo HTML Ativo: escreva o roteiro do seu carrossel detalhadamente. A IA processará e montará o código HTML estruturado contendo todos os slides baseados nesse roteiro.'}
                                        </p>
                                    </div>

                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            🖼️ Imagem de Referência (Opcional)
                                            <span style={{ fontSize: '0.7rem', color: '#71717a' }}>(O estilo visual desta imagem será considerado pela IA)</span>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <label style={{ fontSize: '0.875rem', color: '#a1a1aa', display: 'block' }}>
                                            {imageCount > 1 ? '💡 Temas Base Específicos (Em Lote)' : 'Descrição do Post Único'}
                                        </label>
                                        <button
                                            onClick={handleGenerateIdeas}
                                            disabled={isGeneratingIdeas || !selectedProfile}
                                            className="btn"
                                            style={{
                                                fontSize: '0.75rem',
                                                padding: '0.25rem 0.75rem',
                                                background: 'linear-gradient(90deg, #10b981, #059669)',
                                                border: 'none',
                                                borderRadius: '999px',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                opacity: isGeneratingIdeas ? 0.7 : 1
                                            }}
                                        >
                                            {isGeneratingIdeas ? '✨ Gerando...' : '💡 Sugerir Temas IA'}
                                        </button>
                                    </div>
                                    <textarea
                                        value={carouselDescription}
                                        onChange={(e) => setCarouselDescription(e.target.value)}
                                        placeholder="Ex: Sugestões de posts sobre..."
                                        className="input"
                                        rows={3}
                                        style={{ width: '100%', marginBottom: '1rem' }}
                                    />
                                </>
                            )}

                            {generationMode === 'html' && (
                                <div style={{ marginBottom: '1.5rem', background: 'rgba(236, 72, 153, 0.05)', border: '1px solid rgba(236, 72, 153, 0.2)', padding: '1rem', borderRadius: '0.75rem' }}>
                                        <label style={{
                                        display: 'block',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                        color: '#e4e4e7',
                                        marginBottom: '0.75rem'
                                    }}>
                                        🎨 Design do Carrossel HTML
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        {selectedProfile?.name?.toLowerCase().includes('fitswap') && (
                                            <div
                                                onClick={() => setHtmlTemplate('fitswap_minimal')}
                                                style={{
                                                    padding: '1rem',
                                                    background: htmlTemplate === 'fitswap_minimal' ? 'rgba(166, 240, 0, 0.15)' : '#18181b', /* Lime accent */
                                                    border: `1px solid ${htmlTemplate === 'fitswap_minimal' ? '#A6F000' : '#27272a'}`,
                                                    borderRadius: '0.5rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                    gridColumn: '1 / -1' /* Make it span both columns since it's the premium brand choice */
                                                }}
                                            >
                                                <h4 style={{ margin: '0 0 0.5rem 0', color: htmlTemplate === 'fitswap_minimal' ? '#fff' : '#a1a1aa', fontSize: '0.875rem' }}>🟢 Fitswap Minimal (Branding)</h4>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a' }}>Fundo branco, tipografia bold escura, overlay minimalista com marca e barra de progresso (Oficial da marca).</p>
                                            </div>
                                        )}
                                        <div
                                            onClick={() => setHtmlTemplate('template1')}
                                            style={{
                                                padding: '1rem',
                                                background: htmlTemplate === 'template1' ? 'rgba(236, 72, 153, 0.15)' : '#18181b',
                                                border: `1px solid ${htmlTemplate === 'template1' ? '#ec4899' : '#27272a'}`,
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: htmlTemplate === 'template1' ? '#fff' : '#a1a1aa', fontSize: '0.875rem' }}>🔥 Template 1: Bold Overlay</h4>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a' }}>Design moderno com sombras intensas, overlay de gradiente e texto em destaque.</p>
                                        </div>
                                        <div
                                            onClick={() => setHtmlTemplate('free')}
                                            style={{
                                                padding: '1rem',
                                                background: htmlTemplate === 'free' ? 'rgba(236, 72, 153, 0.15)' : '#18181b',
                                                border: `1px solid ${htmlTemplate === 'free' ? '#ec4899' : '#27272a'}`,
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                position: 'relative'
                                            }}
                                        >
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: htmlTemplate === 'free' ? '#fff' : '#a1a1aa', fontSize: '0.875rem' }}>✨ Livre (Criado pela IA)</h4>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a' }}>Estrutura gerada do zero pela IA com criatividade solta baseada na marca.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {generationMode === 'html' ? (
                                <button
                                    onClick={handleGenerateHtmlCarousel}
                                    disabled={isGeneratingHtml || !carouselDescription}
                                    className="btn btn-primary"
                                    style={{
                                        width: '100%',
                                        marginBottom: '0.5rem',
                                        padding: '1rem',
                                        background: 'linear-gradient(135deg, #FF0080 0%, #7928CA 100%)',
                                        color: '#fff',
                                        border: 'none',
                                        fontWeight: 700,
                                        borderRadius: '0.75rem',
                                        opacity: isGeneratingHtml ? 0.7 : 1
                                    }}
                                >
                                    {isGeneratingHtml ? '🌐 Gerando HTML...' : '🌐 Gerar Carrossel HTML'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleGenerateBatchConcepts}
                                    disabled={isGeneratingPrompt || !carouselDescription}
                                    className="btn btn-primary"
                                    style={{
                                        width: '100%',
                                        marginBottom: '0.5rem',
                                        padding: '1rem',
                                        background: generationMode === 'premium' ? 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)' : 'linear-gradient(90deg, #10b981, #059669)',
                                        color: generationMode === 'premium' ? '#000' : '#fff',
                                        border: 'none',
                                        fontWeight: 700,
                                        borderRadius: '0.75rem',
                                        opacity: isGeneratingPrompt ? 0.7 : 1
                                    }}
                                >
                                    {isGeneratingPrompt ? '🧠 Processando roteiro...' : `🧠 Montar ${imageCount} Cards`}
                                </button>
                            )}

                            {carouselCards.length > 0 && carouselCards.some(card => card.concept && !card.prompt) && (
                                <button
                                    onClick={handleGeneratePromptsFromConcepts}
                                    disabled={isGeneratingPrompt}
                                    className="btn"
                                    style={{ width: '100%', marginBottom: '0.5rem', background: '#7c3aed', border: 'none', color: '#fff' }}
                                >
                                    {isGeneratingPrompt ? '🧠 Gerando Prompts...' : '🧠 Gerar Todos os Prompts Visuais'}
                                </button>
                            )}

                            {carouselCards.length > 0 && carouselCards.some(card => !card.image && card.prompt) && (
                                <button
                                    onClick={handleGenerateAllImages}
                                    disabled={carouselCards.some(card => !card.prompt)}
                                    className="btn"
                                    style={{
                                        width: '100%',
                                        marginBottom: '1rem',
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        border: 'none',
                                        color: '#fff',
                                        opacity: carouselCards.some(card => !card.prompt) ? 0.5 : 1
                                    }}
                                >
                                    🎨 Gerar Todas as Imagens ({carouselCards.filter(card => !card.image && card.prompt).length} pendentes)
                                </button>
                            )}

                            {generationMode === 'premium' && carouselCards.length > 0 && (
                                <button
                                    onClick={handleApplyPremiumOverlayToAll}
                                    disabled={!carouselCards.some(card => card.premiumBaseImage && !isPremiumOverlayApplied(card))}
                                    className="btn"
                                    style={{
                                        width: '100%',
                                        marginBottom: '1rem',
                                        background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
                                        border: 'none',
                                        color: '#111',
                                        fontWeight: 700,
                                        opacity: !carouselCards.some(card => card.premiumBaseImage && !isPremiumOverlayApplied(card)) ? 0.5 : 1
                                    }}
                                >
                                    💎 Aplicar Modelo Premium em Todos
                                </button>
                            )}

                            {generationMode === 'html' && generatedHtml && (
                                <div style={{ marginTop: '2rem' }}>
                                    <h3 style={{ marginBottom: '1rem', color: '#ec4899' }}>Resultado HTML Gerado</h3>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: '2rem', alignItems: 'start' }}>
                                        <div style={{
                                            background: '#18181b',
                                            borderRadius: '0.75rem',
                                            border: '1px solid #27272a',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            height: '525px'
                                        }}>
                                            <div style={{ padding: '1rem', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#27272a' }}>
                                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e4e4e7' }}>Código Fonte</span>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(generatedHtml);
                                                            toast.success('HTML copiado para a área de transferência!');
                                                        }}
                                                        className="btn"
                                                        style={{
                                                            background: '#3f3f46',
                                                            border: 'none',
                                                            color: '#fff',
                                                            padding: '0.25rem 0.75rem',
                                                            borderRadius: '0.25rem',
                                                            cursor: 'pointer',
                                                            fontSize: '0.75rem'
                                                        }}
                                                    >
                                                        📋 Copiar HTML
                                                    </button>
                                                    <button
                                                        onClick={handleSaveHtmlToLibrary}
                                                        className="btn"
                                                        style={{
                                                            background: 'linear-gradient(135deg, #FF0080 0%, #7928CA 100%)',
                                                            border: 'none',
                                                            color: '#fff',
                                                            padding: '0.25rem 0.75rem',
                                                            borderRadius: '0.25rem',
                                                            cursor: 'pointer',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        💾 Salvar na Biblioteca
                                                    </button>
                                                </div>
                                            </div>
                                            <pre style={{
                                                margin: 0,
                                                padding: '1rem',
                                                overflow: 'auto',
                                                color: '#d4d4d8',
                                                fontSize: '0.75rem',
                                                flex: 1
                                            }}>
                                                <code>{generatedHtml}</code>
                                            </pre>
                                        </div>

                                        <div>
                                            <div style={{
                                                border: '1px solid #3f3f46',
                                                borderRadius: '0.5rem',
                                                overflow: 'hidden',
                                                width: '420px',
                                                height: '525px',
                                                background: '#fff',
                                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                                            }}>
                                                <iframe
                                                    srcDoc={generatedHtml}
                                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                                    title="Preview HTML"
                                                />
                                            </div>
                                            <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                                Preview interativo (Arraste para rolar o carrossel se aplicável)
                                            </p>

                                            {/* Fix HTML button */}
                                            <button
                                                onClick={() => setShowHtmlFixer(prev => !prev)}
                                                style={{
                                                    width: '100%',
                                                    marginTop: '1rem',
                                                    padding: '0.5rem 1rem',
                                                    background: showHtmlFixer
                                                        ? 'rgba(239, 68, 68, 0.15)'
                                                        : 'rgba(251, 191, 36, 0.12)',
                                                    border: showHtmlFixer
                                                        ? '1px solid rgba(239, 68, 68, 0.3)'
                                                        : '1px solid rgba(251, 191, 36, 0.3)',
                                                    borderRadius: '0.5rem',
                                                    color: showHtmlFixer ? '#f87171' : '#fbbf24',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.4rem'
                                                }}
                                            >
                                                {showHtmlFixer ? '✕ Fechar' : '🔧 Consertar HTML'}
                                            </button>

                                            {/* Fix panel */}
                                            {showHtmlFixer && (
                                                <div style={{
                                                    marginTop: '0.75rem',
                                                    background: '#18181b',
                                                    border: '1px solid rgba(251, 191, 36, 0.25)',
                                                    borderRadius: '0.75rem',
                                                    padding: '1rem'
                                                }}>
                                                    <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>
                                                        Descreva o que deve ser corrigido ou ajustado no carrossel:
                                                    </p>
                                                    <textarea
                                                        value={htmlFixInstruction}
                                                        onChange={e => setHtmlFixInstruction(e.target.value)}
                                                        placeholder={`Ex: "Aumentar o tamanho da fonte dos títulos"\n"Mudar a cor de fundo do slide 2 para preto"\n"Adicionar bordas arredondadas nas imagens"`}
                                                        rows={4}
                                                        style={{
                                                            width: '100%',
                                                            background: '#09090b',
                                                            border: '1px solid #3f3f46',
                                                            borderRadius: '0.5rem',
                                                            color: '#e4e4e7',
                                                            padding: '0.625rem',
                                                            fontSize: '0.8rem',
                                                            resize: 'vertical',
                                                            outline: 'none',
                                                            fontFamily: 'inherit',
                                                            lineHeight: 1.5
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleFixHtml();
                                                        }}
                                                    />
                                                    <button
                                                        onClick={handleFixHtml}
                                                        disabled={isFixingHtml || !htmlFixInstruction.trim()}
                                                        style={{
                                                            marginTop: '0.75rem',
                                                            width: '100%',
                                                            padding: '0.625rem',
                                                            background: isFixingHtml ? '#3f3f46' : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                                            border: 'none',
                                                            borderRadius: '0.5rem',
                                                            color: '#111',
                                                            fontWeight: 700,
                                                            fontSize: '0.8rem',
                                                            cursor: isFixingHtml ? 'not-allowed' : 'pointer',
                                                            opacity: !htmlFixInstruction.trim() ? 0.5 : 1
                                                        }}
                                                    >
                                                        {isFixingHtml ? '🔄 Corrigindo...' : '🔧 Aplicar Correção'}
                                                    </button>
                                                    <p style={{ fontSize: '0.7rem', color: '#52525b', marginTop: '0.5rem', textAlign: 'center' }}>
                                                        Dica: Cmd/Ctrl + Enter para enviar
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {generationMode !== 'html' && carouselCards.length > 0 && (
                                <div style={{ marginTop: '2rem' }}>
                                    <h3 style={{ marginBottom: '1rem', color: generationMode === 'premium' ? '#facc15' : '#a78bfa' }}>
                                        {imageCount > 1 ? `Cards do Carrossel (${carouselCards.length}/${imageCount})` : 'Card do Post'}
                                    </h3>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
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
                                                    <h4 style={{ color: generationMode === 'premium' ? '#facc15' : '#a78bfa', fontSize: '0.75rem', fontWeight: 600 }}>
                                                        Card {index + 1}
                                                    </h4>
                                                    {card.image && (
                                                        <span
                                                            style={{
                                                                fontSize: '0.625rem',
                                                                background: generationMode === 'premium'
                                                                    ? (isPremiumOverlayApplied(card) ? 'rgba(250, 204, 21, 0.18)' : 'rgba(59, 130, 246, 0.18)')
                                                                    : 'rgba(34, 197, 94, 0.2)',
                                                                color: generationMode === 'premium'
                                                                    ? (isPremiumOverlayApplied(card) ? '#facc15' : '#93c5fd')
                                                                    : '#4ade80',
                                                                padding: '0.25rem 0.5rem',
                                                                borderRadius: '9999px'
                                                            }}
                                                        >
                                                            {generationMode === 'premium'
                                                                ? (isPremiumOverlayApplied(card) ? '💎 Premium Aplicado' : '🖼️ Fundo Gerado')
                                                                : '✓ Gerada'}
                                                        </span>
                                                    )}
                                                </div>

                                                {card.concept && (
                                                    <div style={{ marginBottom: '0.75rem' }}>
                                                        <label style={{ fontSize: '0.625rem', color: '#71717a', display: 'block', marginBottom: '0.5rem' }}>
                                                            Conceito
                                                        </label>
                                                        <p style={{
                                                            background: '#09090b',
                                                            padding: '0.5rem',
                                                            borderRadius: '0.5rem',
                                                            fontSize: '0.75rem',
                                                            color: '#d4d4d8',
                                                            lineHeight: '1.4'
                                                        }}>
                                                            {card.concept}
                                                        </p>
                                                    </div>
                                                )}

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
                                                        minHeight: '4.5rem',
                                                        maxHeight: '7rem',
                                                        overflow: 'auto'
                                                    }}>
                                                        {card.prompt || 'Prompt ainda não gerado.'}
                                                    </p>
                                                </div>

                                                {card.image ? (
                                                    <>
                                                        <img
                                                            src={card.image}
                                                            alt={`Card ${index + 1}`}
                                                            onClick={() => {
                                                                const allImages = carouselCards.filter(item => item.image).map(item => item.image!);
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

                                                        {generationMode === 'premium' && (
                                                            !isPremiumOverlayApplied(card) ? (
                                                                <button
                                                                    onClick={() => handleApplyPremiumOverlay(index)}
                                                                    className="btn"
                                                                    style={{
                                                                        width: '100%',
                                                                        fontSize: '0.75rem',
                                                                        marginBottom: '0.5rem',
                                                                        background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
                                                                        color: '#111',
                                                                        border: 'none',
                                                                        fontWeight: 700
                                                                    }}
                                                                >
                                                                    💎 Aprovar e Aplicar Modelo
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setPremiumEditorIndex(index)}
                                                                    className="btn"
                                                                    style={{
                                                                        width: '100%',
                                                                        fontSize: '0.75rem',
                                                                        marginBottom: '0.5rem',
                                                                        background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
                                                                        color: '#111',
                                                                        border: 'none',
                                                                        fontWeight: 700
                                                                    }}
                                                                >
                                                                    💎 Editar Overlay
                                                                </button>
                                                            )
                                                        )}

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
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '0.3rem'
                                                            }}
                                                        >
                                                            <RefreshIcon /> Regenerar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => handleGenerateImageForCard(index)}
                                                        disabled={card.isGeneratingImage || !card.prompt}
                                                        className="btn btn-primary"
                                                        style={{ width: '100%', fontSize: '0.75rem', padding: '0.5rem', opacity: !card.prompt ? 0.5 : 1 }}
                                                    >
                                                        {card.isGeneratingImage ? '🎨 Gerando...' : '🎨 Gerar Imagem'}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {carouselCards.some(card => card.image) && (
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
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <DownloadIcon /> Baixar Zip
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
                                                    gap: '0.5rem'
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
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <SaveIcon /> Salvar Histórico
                                            </button>
                                            <button
                                                onClick={handleSaveToLibrary}
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
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <LayoutIcon /> Biblioteca
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
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <CalendarIcon /> Calendário
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
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <RocketIcon /> Postar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </>
                ) : (
                    <div className="card-glass" style={{ padding: '2rem', textAlign: 'center' }}>
                        <p style={{ textAlign: 'center', color: '#a1a1aa' }}>Visualização de calendário disponível na aba de Calendário.</p>
                        <button onClick={() => router.push('/dashboard/calendar')} className="btn" style={{ margin: '1rem auto', display: 'block', background: '#7c3aed', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '999px' }}>
                            Ir para o Calendário
                        </button>
                    </div>
                )}

                {showCaptionGenerator && (
                    <div
                        style={{
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

                {showIdeasModal && (
                    <div
                        style={{
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
                        }}
                        onClick={() => setShowIdeasModal(false)}
                    >
                        <div
                            style={{
                                background: '#18181b',
                                border: '1px solid #27272a',
                                borderRadius: '1rem',
                                padding: '2rem',
                                maxWidth: '900px',
                                width: '100%',
                                maxHeight: '85vh',
                                overflow: 'auto',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
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

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                                {ideas.map((idea, index) => (
                                    <div
                                        key={index}
                                        style={{
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
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{
                                                background: idea.type === 'carousel' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                                color: idea.type === 'carousel' ? '#a78bfa' : '#34d399',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '999px'
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
                )}

                {showPreview && (
                    <div
                        style={{
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
                                {carouselCards.filter(card => card.image).length} imagens prontas para postar
                            </p>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '1rem',
                                marginBottom: '1.5rem'
                            }}>
                                {carouselCards.filter(card => card.image).map((card, index) => (
                                    <div key={index} style={{ position: 'relative' }}>
                                        <img
                                            src={card.image!}
                                            alt={`Card ${index + 1}`}
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
                                            {index + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>

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

                <PremiumEditorModal
                    isOpen={premiumEditorIndex !== null}
                    layout={premiumEditorIndex !== null ? getCardPremiumLayout(carouselCards[premiumEditorIndex]) : null}
                    backgroundImage={premiumEditorIndex !== null ? (getCardPremiumLayout(carouselCards[premiumEditorIndex]).backgroundImage || carouselCards[premiumEditorIndex]?.premiumBaseImage || carouselCards[premiumEditorIndex]?.image) : undefined}
                    onClose={() => setPremiumEditorIndex(null)}
                    onChange={(field, value) => {
                        if (premiumEditorIndex === null) return;
                        handleUpdatePremiumLayout(premiumEditorIndex, field, value);
                    }}
                    onDownload={() => {
                        if (premiumEditorIndex === null) return;
                        const imageUrl = carouselCards[premiumEditorIndex]?.image;
                        if (!imageUrl) return;
                        handleDownloadImage(imageUrl, premiumEditorIndex);
                    }}
                />

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
