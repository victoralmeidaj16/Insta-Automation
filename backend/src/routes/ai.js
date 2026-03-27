import express from 'express';
import { generateImages, generateCarousel, generateNextCarouselPrompt, generateCarouselPrompts, generateImageCaption, generatePostIdeas, extractStyleFromPrompt, generateVariations, generateImagePrompt, generateRelatedIdeas, generateHtmlCarousel } from '../services/aiService.js';
import { createScientificComposition } from '../services/scientificCompositionService.js';
import { getBusinessProfile } from '../services/businessProfileService.js';
import { getBrandReferenceImages } from '../utils/brandProfiles.js';

const router = express.Router();

/**
 * POST /api/ai/generate - Gerar imagens com IA (modo legado/completo)
 */
router.post('/generate', async (req, res) => {
    try {
        const {
            prompt,
            aspectRatio = '1:1',
            count = 1,
            mode = 'simple', // 'simple' ou 'carousel'
            carouselDescription,
            brandingStyle
        } = req.body;

        console.log('📝 Requisição de geração de IA:', { prompt, aspectRatio, count, mode, brandingStyle });

        // Validar aspect ratio
        const validAspectRatios = ['1:1', '4:5', '16:9', '9:16'];
        if (!validAspectRatios.includes(aspectRatio)) {
            return res.status(400).json({
                error: `Aspect ratio inválido. Use: ${validAspectRatios.join(', ')}`,
            });
        }

        // Validar count
        if (count < 1 || count > 10) {
            return res.status(400).json({
                error: 'Count deve estar entre 1 e 10',
            });
        }

        let imageUrls, individualPrompts;

        // Modo carrossel inteligente (com OpenAI)
        if (mode === 'carousel' && count > 1) {
            console.log('🎪 Modo: Carrossel Inteligente');

            const description = carouselDescription || prompt;
            if (!description) {
                return res.status(400).json({
                    error: 'Descrição do carrossel é obrigatória no modo carousel',
                });
            }

            const result = await generateCarousel(description, aspectRatio, count, brandingStyle);
            imageUrls = result.images;
            individualPrompts = result.prompts;

        } else {
            // Modo simples (sem OpenAI, apenas Replicate)
            console.log('🎨 Modo: Simples');

            if (!prompt) {
                return res.status(400).json({
                    error: 'Prompt é obrigatório',
                });
            }

            imageUrls = await generateImages(prompt, aspectRatio, count, brandingStyle);
        }

        res.json({
            success: true,
            images: imageUrls,
            count: imageUrls.length,
            mode,
            prompt: mode === 'carousel' ? carouselDescription || prompt : prompt,
            aspectRatio,
            ...(individualPrompts && { individualPrompts })
        });

    } catch (error) {
        console.error('❌ Erro na rota de geração:', error);
        res.status(500).json({
            error: 'Erro ao gerar imagens',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-next-prompt - Gera o PRÓXIMO prompt do carrossel progressivamente
 */
router.post('/generate-next-prompt', async (req, res) => {
    try {
        const {
            carouselDescription,
            totalCards,
            currentCardIndex,
            previousPrompts = [],
            profileDescription,
            guidelines,
            savedPrompts
        } = req.body;

        console.log(`📝 Gerando próximo prompt: card ${currentCardIndex + 1}/${totalCards}`);

        if (!carouselDescription) {
            return res.status(400).json({
                error: 'Descrição do carrossel é obrigatória',
            });
        }

        if (!totalCards || totalCards < 1) {
            return res.status(400).json({
                error: 'Total de cards inválido',
            });
        }

        if (currentCardIndex === undefined || currentCardIndex < 0) {
            return res.status(400).json({
                error: 'Índice do card inválido',
            });
        }

        const nextPrompt = await generateNextCarouselPrompt(
            carouselDescription,
            totalCards,
            currentCardIndex,
            previousPrompts,
            { profileDescription, guidelines, savedPrompts }
        );

        res.json({
            success: true,
            prompt: nextPrompt,
            cardIndex: currentCardIndex,
            totalCards
        });

    } catch (error) {
        console.error('❌ Erro ao gerar próximo prompt:', error);
        res.status(500).json({
            error: 'Erro ao gerar próximo prompt',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-similar-prompts - Gera variações de um prompt salvo
 */
router.post('/generate-similar-prompts', async (req, res) => {
    try {
        const {
            basePrompt,
            count = 3,
            context = {}
        } = req.body;

        console.log(`📝 Gerando variações para o prompt: ${basePrompt?.substring(0, 50)}...`);

        if (!basePrompt) {
            return res.status(400).json({
                error: 'Prompt base é obrigatório',
            });
        }

        const { generateSimilarPrompts } = await import('../services/aiService.js');
        const prompts = await generateSimilarPrompts(basePrompt, count, context);

        res.json({
            success: true,
            prompts
        });

    } catch (error) {
        console.error('❌ Erro ao gerar variações do prompt:', error);
        res.status(500).json({
            error: 'Erro ao gerar variações do modelo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-carousel-concepts - Gera apenas os textos (conceitos) de cada slide do carrossel
 */
router.post('/generate-carousel-concepts', async (req, res) => {
    try {
        const {
            carouselDescription,
            totalCards,
            context
        } = req.body;

        console.log(`📝 Gerando conceitos para carrossel: ${totalCards} cards`);

        if (!carouselDescription) {
            return res.status(400).json({ error: 'Descrição do carrossel é obrigatória' });
        }

        const { generateCarouselSlideConcepts } = await import('../services/aiService.js');
        const concepts = await generateCarouselSlideConcepts(carouselDescription, totalCards, context);

        res.json({
            success: true,
            concepts,
            totalCards
        });

    } catch (error) {
        console.error('❌ Erro ao gerar conceitos do carrossel:', error);
        res.status(500).json({
            error: 'Erro ao gerar conceitos',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-carousel-prompts - Gera TODOS os prompts do carrossel de uma vez
 */
router.post('/generate-carousel-prompts', async (req, res) => {
    try {
        const {
            carouselDescription,
            totalCards,
            profileDescription,
            guidelines,
            savedPrompts,
            isEditorial,
            isPremiumCarousel,
            overlayMode,
            brandName,
            aspectRatio,
            context,
            referenceImage // Extract referenceImage
        } = req.body;

        console.log(`📝 Gerando todos os prompts: ${totalCards} cards`);

        if (!carouselDescription) {
            return res.status(400).json({
                error: 'Descrição do carrossel é obrigatória',
            });
        }

        if (!totalCards || totalCards < 1 || totalCards > 10) {
            return res.status(400).json({
                error: 'Total de cards deve estar entre 1 e 10',
            });
        }

        const prompts = await generateCarouselPrompts(
            carouselDescription,
            totalCards,
            {
                profileDescription,
                guidelines,
                savedPrompts,
                referenceImage,
                isEditorial: Boolean(isEditorial),
                isPremiumCarousel: Boolean(isPremiumCarousel),
                overlayMode,
                brandName,
                aspectRatio,
                ...context
            }
        );

        res.json({
            success: true,
            prompts,
            totalCards
        });

    } catch (error) {
        console.error('❌ Erro ao gerar prompts do carrossel:', error);
        res.status(500).json({
            error: 'Erro ao gerar prompts',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-variations - Gera variações editoriais a partir de uma ideia base
 */
router.post('/generate-variations', async (req, res) => {
    try {
        const { baseIdea, count = 3, context = {} } = req.body;

        if (!baseIdea) {
            return res.status(400).json({
                error: 'Ideia base é obrigatória',
            });
        }

        const variations = await generateVariations(baseIdea, count, context);

        res.json({
            success: true,
            variations
        });
    } catch (error) {
        console.error('❌ Erro ao gerar variações:', error);
        res.status(500).json({
            error: 'Erro ao gerar variações',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-image-prompt - Gera um prompt visual a partir de um conceito
 */
router.post('/generate-image-prompt', async (req, res) => {
    try {
        const { concept, context = {} } = req.body;

        if (!concept) {
            return res.status(400).json({
                error: 'Conceito é obrigatório',
            });
        }

        const prompt = await generateImagePrompt(concept, context);

        res.json({
            success: true,
            prompt
        });
    } catch (error) {
        console.error('❌ Erro ao gerar prompt visual:', error);
        res.status(500).json({
            error: 'Erro ao gerar prompt visual',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-related - Gera ideias relacionadas a uma ideia base
 */
router.post('/generate-related', async (req, res) => {
    try {
        const { baseIdea, count = 1, context = {} } = req.body;

        if (!baseIdea) {
            return res.status(400).json({
                error: 'Ideia base é obrigatória',
            });
        }

        const ideas = await generateRelatedIdeas(baseIdea, count, context);

        res.json({
            success: true,
            ideas
        });
    } catch (error) {
        console.error('❌ Erro ao gerar ideias relacionadas:', error);
        res.status(500).json({
            error: 'Erro ao gerar ideias relacionadas',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-single-image - Gerar uma única imagem com IA
 */
router.post('/generate-single-image', async (req, res) => {
    try {
        console.log('--- REQ.BODY RECEBIDO EM /generate-single-image ---', JSON.stringify({ ...req.body, prompt: req.body.prompt?.substring(0, 50) + '...' }, null, 2));

        const {
            prompt,
            aspectRatio = '1:1',
            brandingStyle,
            model = 'gemini',
            isEditorial = false,
            isPremiumCarousel = false,
            overlayMode,
            businessProfileId,
            referenceImage,
            context,
            brandName,
            brandKit,
            profileDescription,
            guidelines,
            savedPrompts
        } = req.body;

        console.log('📝 Requisição de geração de imagem única:', { prompt: prompt?.substring(0, 50), aspectRatio, brandingStyle, model, isEditorial, businessProfileId });

        // Validar aspect ratio
        const validAspectRatios = ['1:1', '4:5', '16:9', '9:16'];
        if (!validAspectRatios.includes(aspectRatio)) {
            return res.status(400).json({
                error: `Aspect ratio inválido. Use: ${validAspectRatios.join(', ')}`,
            });
        }

        if (!prompt) {
            return res.status(400).json({
                error: 'Prompt é obrigatório',
            });
        }

        let profile = null;
        if (businessProfileId) {
            try {
                profile = await getBusinessProfile(businessProfileId);
            } catch (err) {
                console.warn('⚠️ Could not load profile context:', err.message);
            }
        }

        // FALLBACK: If no reference image provided, try to fetch logo from profile
        let finalReferenceImage = referenceImage;
        if (!finalReferenceImage && businessProfileId && !isPremiumCarousel && overlayMode !== 'premium') {
            try {
                const { getFallbackLogo } = await import('../services/postService.js');
                finalReferenceImage = await getFallbackLogo(businessProfileId);
                if (finalReferenceImage) console.log('✅ Logo fallback attached successfully');
            } catch (err) {
                console.warn('⚠️ Could not grab fallback logo:', err.message);
            }
        }

        const mergedReferenceImages = [
            ...(Array.isArray(finalReferenceImage) ? finalReferenceImage : (finalReferenceImage ? [finalReferenceImage] : [])),
            ...getBrandReferenceImages(profile || {})
        ].filter(Boolean);

        const aiContext = {
            profileDescription: profile?.description || profileDescription,
            guidelines: profile?.branding?.guidelines || guidelines,
            savedPrompts: profile?.aiPreferences?.favoritePrompts || savedPrompts,
            referenceImage: [...new Set(mergedReferenceImages)],
            isEditorial: Boolean(isEditorial),
            isPremiumCarousel: Boolean(isPremiumCarousel || context?.isPremiumCarousel),
            overlayMode: overlayMode || context?.overlayMode,
            brandName: profile?.name || brandName,
            brandKey: profile?.brandKey || context?.brandKey,
            brandContext: profile?.brandContext || context?.brandContext,
            brandKit: profile?.brandKit || context?.brandKit,
            targetAudience: profile?.targetAudience || context?.targetAudience,
            productService: profile?.productService || context?.productService,
            contentStrategy: profile?.contentStrategy || context?.contentStrategy,
            branding: profile?.branding || context?.branding,
            ...context,
            ...profile
        };

        const imageUrls = await generateImages(prompt, aspectRatio, 1, brandingStyle, isEditorial, aiContext, finalReferenceImage, model);

        res.json({
            success: true,
            image: imageUrls[0], // Explicitly return 'image', not 'images', to match frontend expectations
            prompt,
            aspectRatio,
            model,
        });

    } catch (error) {
        console.error('❌ Erro na rota de geração de imagem única:', error);
        res.status(500).json({
            error: 'Erro ao gerar imagem única',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

router.post('/composite-scientific', async (req, res) => {
    try {
        const { imageUrl, prompt, businessProfileId } = req.body;

        if (!imageUrl || !prompt) {
            return res.status(400).json({
                error: 'imageUrl e prompt são obrigatórios',
            });
        }

        let profile = null;
        if (businessProfileId) {
            try {
                profile = await getBusinessProfile(businessProfileId);
            } catch (err) {
                console.warn('⚠️ Could not load profile context for composite-scientific:', err.message);
            }
        }

        const hlMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
        const subMatch = prompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);

        const image = await createScientificComposition(
            imageUrl,
            hlMatch ? hlMatch[1].trim() : '',
            subMatch ? subMatch[1].trim() : '',
            hgMatch ? hgMatch[1].trim().split(',').map(item => item.trim().toUpperCase()) : [],
            profile?.branding?.logoUrl || profile?.branding?.logo || null,
            {
                primaryColor: profile?.branding?.primaryColor,
                brandName: profile?.name || 'Sua Marca'
            }
        );

        res.json({
            success: true,
            image
        });
    } catch (error) {
        console.error('❌ Erro em /api/ai/composite-scientific:', error);
        res.status(500).json({
            error: 'Erro ao compor design científico',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-caption - Gera caption para imagem usando GPT
 */
router.post('/generate-caption', async (req, res) => {
    try {
        const { prompt, tone = 'casual', includeHashtags = true, language = 'pt' } = req.body;

        console.log('✍️ Gerando caption:', { prompt, tone, includeHashtags });

        if (!prompt) {
            return res.status(400).json({
                error: 'Prompt/descrição da imagem é obrigatório',
            });
        }

        // Import OpenAI dynamically
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Tone descriptions
        const toneInstructions = {
            casual: 'Tom casual e descontraído, como se estivesse conversando com um amigo',
            formal: 'Tom profissional e formal, adequado para negócios',
            motivacional: 'Tom inspirador e motivacional, que engaja e emociona',
            educativo: 'Tom educativo e informativo, que ensina algo valioso',
            divertido: 'Tom divertido e bem-humorado, com leveza e criatividade'
        };

        const toneInstruction = toneInstructions[tone] || toneInstructions.casual;

        const systemMessage = `Você é um especialista em criar captions para Instagram. 
Crie captions ${language === 'pt' ? 'em português brasileiro' : 'in English'} que:
- Sejam envolventes e chamem atenção
- Usem ${toneInstruction}
- Tenham entre 2-4 linhas
${includeHashtags ? '- Incluam 5-8 hashtags relevantes no final' : '- NÃO incluam hashtags'}
- Incentivem engajamento (curtidas, comentários, compartilhamentos)`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: `Crie uma caption para esta imagem/post: ${prompt}` }
            ],
            max_tokens: 300,
            temperature: 0.8,
        });

        const caption = completion.choices[0].message.content.trim();

        res.json({
            success: true,
            caption,
            tone,
            includeHashtags,
            language
        });

    } catch (error) {
        console.error('❌ Erro ao gerar caption:', error);
        res.status(500).json({
            error: 'Erro ao gerar caption',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-caption-from-image - Gera caption usando GPT-4o (Vision)
 */
router.post('/generate-caption-from-image', async (req, res) => {
    try {
        const { imageUrl, profileName, profileDescription, guidelines } = req.body;

        console.log('✍️ Gerando caption com visão para:', { imageUrl: imageUrl?.substring(0, 50), profileName });

        if (!imageUrl) {
            return res.status(400).json({
                error: 'URL da imagem é obrigatória',
            });
        }

        const caption = await generateImageCaption(imageUrl, profileName, profileDescription, guidelines);

        res.json({
            success: true,
            caption
        });

    } catch (error) {
        console.error('❌ Erro ao gerar caption com visão:', error);
        res.status(500).json({
            error: 'Erro ao gerar caption',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-ideas - Gera ideias de posts baseadas no perfil
 */
router.post('/generate-ideas', async (req, res) => {
    try {
        const { profileName, profileDescription, guidelines, brandingStyle, brandContext, contentStrategy, brandKey, isBatchMode, count, baseTopic } = req.body;

        console.log('💡 Requisição para gerar ideias:', { profileName, isBatchMode, count, baseTopic });

        if (!profileDescription) {
            return res.status(400).json({
                error: 'Descrição do perfil é necessária para gerar ideias relevantes.',
            });
        }

        const ideas = await generatePostIdeas({
            profileName,
            profileDescription,
            guidelines,
            brandingStyle,
            brandContext,
            brandKey,
            contentStrategy,
            isBatchMode,
            count,
            baseTopic
        });

        res.json({
            success: true,
            ideas
        });

    } catch (error) {
        console.error('❌ Erro ao gerar ideias:', error);
        res.status(500).json({
            error: 'Erro ao gerar ideias de posts',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/extract-style - Extrai estilo visual de um prompt
 */
router.post('/extract-style', async (req, res) => {
    try {
        const { prompt } = req.body;

        console.log('🎨 Requisição de extração de estilo para prompt:', prompt?.substring(0, 50));

        if (!prompt) {
            return res.status(400).json({
                error: 'Prompt é obrigatório',
            });
        }

        const style = await extractStyleFromPrompt(prompt);

        res.json({
            success: true,
            style
        });

    } catch (error) {
        console.error('❌ Erro ao extrair estilo:', error);
        res.status(500).json({
            error: 'Erro ao extrair estilo',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * POST /api/ai/generate-html-carousel - Gera um carrossel em formato HTML/CSS
 */
router.post('/generate-html-carousel', async (req, res) => {
    try {
        const { topic, context, htmlTemplate, libraryImages } = req.body;
        
        if (!topic) {
            return res.status(400).json({ error: 'Tópico é obrigatório' });
        }

        const enrichedContext = {
            ...(context || {}),
            libraryImages: Array.isArray(libraryImages) ? libraryImages.slice(0, 10) : []
        };

        const html = await generateHtmlCarousel(topic, enrichedContext, htmlTemplate);

        res.json({
            success: true,
            html
        });

    } catch (error) {
        console.error('❌ Erro ao gerar carrossel HTML:', error);
        res.status(500).json({
            error: 'Erro ao gerar carrossel HTML',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});



/**
 * POST /api/ai/fix-html-carousel - Corrige / ajusta um carrossel HTML existente com base nas instruções do usuário
 */
router.post('/fix-html-carousel', async (req, res) => {
    try {
        const { html, instruction } = req.body;

        if (!html || !instruction) {
            return res.status(400).json({ error: 'html e instruction são obrigatórios' });
        }

        const { fixHtmlCarousel } = await import('../services/aiService.js');
        const fixedHtml = await fixHtmlCarousel(html, instruction);

        res.json({ success: true, html: fixedHtml });

    } catch (error) {
        console.error('❌ Erro ao corrigir carrossel HTML:', error);
        res.status(500).json({
            error: 'Erro ao corrigir carrossel HTML',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

export default router;
