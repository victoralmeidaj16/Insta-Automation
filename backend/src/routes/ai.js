import express from 'express';
import { generateImages, generateCarousel, generateNextCarouselPrompt, generateCarouselPrompts, generateImageCaption, generatePostIdeas, extractStyleFromPrompt } from '../services/aiService.js';

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
 * POST /api/ai/generate-single-image - Gera UMA imagem a partir de um prompt
 */
router.post('/generate-single-image', async (req, res) => {
    try {
        const { prompt, aspectRatio = '1:1', brandingStyle, isEditorial, context, referenceImage } = req.body;

        console.log('🎨 Gerando imagem única:', { prompt, aspectRatio, brandingStyle, isEditorial, hasReferenceImage: !!referenceImage });

        if (!prompt) {
            return res.status(400).json({
                error: 'Prompt é obrigatório',
            });
        }

        // Validar aspect ratio
        const validAspectRatios = ['1:1', '4:5', '16:9', '9:16'];
        if (!validAspectRatios.includes(aspectRatio)) {
            return res.status(400).json({
                error: `Aspect ratio inválido. Use: ${validAspectRatios.join(', ')}`,
            });
        }

        const imageUrls = await generateImages(prompt, aspectRatio, 1, brandingStyle, isEditorial, context, referenceImage);

        res.json({
            success: true,
            image: imageUrls[0],
            prompt,
            aspectRatio
        });

    } catch (error) {
        console.error('❌ Erro ao gerar imagem:', error);
        res.status(500).json({
            error: 'Erro ao gerar imagem',
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
        const { profileName, profileDescription, guidelines, brandingStyle } = req.body;

        console.log('💡 Requisição para gerar ideias:', { profileName });

        if (!profileDescription) {
            return res.status(400).json({
                error: 'Descrição do perfil é necessária para gerar ideias relevantes.',
            });
        }

        const ideas = await generatePostIdeas({
            profileName,
            profileDescription,
            guidelines,
            brandingStyle
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

export default router;
