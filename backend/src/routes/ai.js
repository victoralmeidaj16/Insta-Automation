import express from 'express';
import { generateImages, generateCarousel, generateNextCarouselPrompt, generateCarouselPrompts } from '../services/aiService.js';

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
            carouselDescription
        } = req.body;

        console.log('📝 Requisição de geração de IA:', { prompt, aspectRatio, count, mode });

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

            const result = await generateCarousel(description, aspectRatio, count);
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

            imageUrls = await generateImages(prompt, aspectRatio, count);
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
            previousPrompts = []
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
            previousPrompts
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
        const { carouselDescription, totalCards } = req.body;

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

        const prompts = await generateCarouselPrompts(carouselDescription, totalCards);

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
        const { prompt, aspectRatio = '1:1' } = req.body;

        console.log('🎨 Gerando imagem única:', { prompt, aspectRatio });

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

        const imageUrls = await generateImages(prompt, aspectRatio, 1);

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

export default router;
