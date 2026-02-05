import express from 'express';
import {
    createPost,
    getPosts,
    getPost,
    deletePost,
    executePost,
} from '../services/postService.js';
// import { addToQueue, removeFromQueue } from '../queues/postQueue.js';

const router = express.Router();

/**
 * POST /api/posts - Criar novo post
 */
router.post('/', async (req, res) => {
    try {
        const { accountId, type, mediaUrls, caption, scheduledFor } = req.body;
        console.log('📝 Criando post:', { accountId, type, mediaUrlsCount: mediaUrls?.length, caption });

        if (!accountId || !type || !mediaUrls || !Array.isArray(mediaUrls)) {
            return res.status(400).json({
                error: 'accountId, type e mediaUrls (array) são obrigatórios',
            });
        }

        const validTypes = ['static', 'carousel', 'video', 'story', 'reel'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                error: `Tipo inválido. Use: ${validTypes.join(', ')}`,
            });
        }

        const post = await createPost(req.userId, accountId, {
            type,
            mediaUrls,
            caption,
            scheduledFor,
        });

        // Se for imediato, executar agora (sem fila Redis para simplificar)
        if (!scheduledFor) {
            // Executar em background para não travar a resposta
            executePost(post.id).catch(err => console.error(`❌ Erro ao executar post ${post.id}:`, err));
        }

        res.status(201).json({
            message: scheduledFor ? 'Post agendado com sucesso' : 'Post em processamento',
            post,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/posts - Listar posts
 */
router.get('/', async (req, res) => {
    try {
        const { accountId, businessProfileId, status, type } = req.query;

        const filters = {};
        if (accountId) filters.accountId = accountId;
        if (businessProfileId) filters.businessProfileId = businessProfileId;
        if (status) filters.status = status;
        if (type) filters.type = type;

        const posts = await getPosts(req.userId, filters);

        res.json({
            posts,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/posts/:id - Detalhes de um post
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const post = await getPost(id);

        // Verificar se o post pertence ao usuário
        if (post.userId !== req.userId) {
            return res.status(403).json({
                error: 'Acesso negado',
            });
        }

        res.json({
            post,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/posts/:id - Atualizar post agendado
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, caption, scheduledFor } = req.body;

        const post = await getPost(id);

        // Verificar se o post pertence ao usuário
        if (post.userId !== req.userId) {
            return res.status(403).json({
                error: 'Acesso negado',
            });
        }

        // Só permite atualizar posts pendentes
        if (post.status !== 'pending') {
            return res.status(400).json({
                error: 'Só é possível atualizar posts pendentes',
            });
        }

        // Atualizar no Firestore
        const db = (await import('../config/firebase.js')).db;
        const updateData = {
            updatedAt: new Date()
        };

        if (type) updateData.type = type;
        if (caption !== undefined) updateData.caption = caption;
        if (scheduledFor) updateData.scheduledFor = scheduledFor;

        await db.collection('posts').doc(id).update(updateData);

        const updatedPost = await getPost(id);

        res.json({
            message: 'Post atualizado com sucesso',
            post: updatedPost
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar post:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/posts/:id - Cancelar/deletar post
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const post = await getPost(id);

        // Verificar se o post pertence ao usuário
        if (post.userId !== req.userId) {
            return res.status(403).json({
                error: 'Acesso negado',
            });
        }

        // Remover da fila se estiver agendado
        if (post.status === 'pending') {
            // await removeFromQueue(id);
        }

        await deletePost(id);

        res.json({
            message: 'Post deletado com sucesso',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
