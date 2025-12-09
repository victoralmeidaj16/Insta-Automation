import express from 'express';
import {
    saveToHistory,
    getHistory,
    getHistoryItem,
    deleteHistoryItem,
} from '../services/historyService.js';

const router = express.Router();

/**
 * POST /api/history - Salvar geração no histórico
 */
router.post('/', async (req, res) => {
    try {
        const { mode, prompt, aspectRatio, images, prompts, businessProfileId } = req.body;

        console.log('💾 Salvando no histórico:', { userId: req.userId, mode, imagesCount: images?.length });

        if (!mode || !prompt || !aspectRatio || !images || !Array.isArray(images)) {
            return res.status(400).json({
                error: 'mode, prompt, aspectRatio e images (array) são obrigatórios',
            });
        }

        const validModes = ['simple', 'carousel'];
        if (!validModes.includes(mode)) {
            return res.status(400).json({
                error: `Modo inválido. Use: ${validModes.join(', ')}`,
            });
        }

        const validAspectRatios = ['1:1', '4:5', '16:9', '9:16'];
        if (!validAspectRatios.includes(aspectRatio)) {
            return res.status(400).json({
                error: `Aspect ratio inválido. Use: ${validAspectRatios.join(', ')}`,
            });
        }

        const historyItem = await saveToHistory(req.userId, {
            mode,
            prompt,
            aspectRatio,
            images,
            prompts,
            businessProfileId,
        });

        res.status(201).json({
            message: 'Salvo no histórico com sucesso',
            item: historyItem,
        });
    } catch (error) {
        console.error('❌ Erro ao salvar no histórico:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/history - Listar histórico do usuário
 */
router.get('/', async (req, res) => {
    try {
        const { limit, offset, mode, aspectRatio, businessProfileId } = req.query;

        const options = {
            limit: limit ? parseInt(limit) : 20,
            offset: offset ? parseInt(offset) : 0,
            mode,
            aspectRatio,
            businessProfileId,
        };

        console.log('📖 Buscando histórico:', { userId: req.userId, options });

        const items = await getHistory(req.userId, options);

        res.json({
            items,
            count: items.length,
            limit: options.limit,
            offset: options.offset,
        });
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/history/:id - Buscar item específico do histórico
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const item = await getHistoryItem(id);

        // Verificar se o item pertence ao usuário
        if (item.userId !== req.userId) {
            return res.status(403).json({
                error: 'Acesso negado',
            });
        }

        res.json({ item });
    } catch (error) {
        console.error('❌ Erro ao buscar item do histórico:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/history/:id - Deletar item do histórico
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🗑️ Deletando do histórico:', { userId: req.userId, itemId: id });

        await deleteHistoryItem(req.userId, id);

        res.json({
            message: 'Item removido do histórico com sucesso',
        });
    } catch (error) {
        console.error('❌ Erro ao deletar do histórico:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
