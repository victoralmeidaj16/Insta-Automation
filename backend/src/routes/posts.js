import express from 'express';
import {
    createPost,
    getPosts,
    getPost,
    deletePost,
    executePost,
} from '../services/postService.js';
import { getCreatablePostTypes, isStoryFormat, normalizeFormat } from '../domain/formatRules.js';
// import { addToQueue, removeFromQueue } from '../queues/postQueue.js';

const router = express.Router();

/**
 * POST /api/posts - Criar novo post
 */
router.post('/', async (req, res) => {
    try {
        const { accountId, type, format, mediaUrls, caption, scheduledFor, libraryItemId, htmlCode } = req.body;
        const isHtmlType = type === 'carousel-html' || type === 'html';
        const hasHtmlContent = Boolean(htmlCode);

        // Se o tipo é HTML mas não tem htmlCode, retorna erro claro
        if (isHtmlType && !hasHtmlContent) {
            return res.status(400).json({
                error: 'Posts do tipo carousel-html requerem o campo htmlCode com o conteúdo HTML.',
            });
        }

        // Se tem HTML, força o tipo carousel-html; senão normaliza normalmente
        const resolvedType = hasHtmlContent
            ? 'carousel-html'
            : normalizeFormat(type, 'static');
        const resolvedFormat = hasHtmlContent ? 'carousel-html' : normalizeFormat(format || type, resolvedType);
        const sanitizedCaption = isStoryFormat(resolvedFormat) ? '' : caption;

        console.log('📝 Criando post:', { accountId, type: resolvedType, format: resolvedFormat, mediaUrlsCount: mediaUrls?.length, caption, hasHtmlContent });

        if (!accountId || !resolvedType || ((!mediaUrls || !Array.isArray(mediaUrls)) && !hasHtmlContent)) {
            return res.status(400).json({
                error: 'accountId, type e mediaUrls são obrigatórios, exceto para posts HTML',
            });
        }

        // Só valida o tipo quando não for HTML
        if (!hasHtmlContent) {
            const validTypes = getCreatablePostTypes();
            if (!validTypes.includes(resolvedType)) {
                return res.status(400).json({
                    error: `Tipo inválido. Use: ${validTypes.join(', ')}`,
                });
            }
        }

        const post = await createPost(req.userId, accountId, {
            type: resolvedType,
            format: resolvedFormat,
            mediaUrls: hasHtmlContent ? [] : mediaUrls,
            caption: sanitizedCaption,
            scheduledFor,
            libraryItemId,
            htmlContent: htmlCode,
        });

        // Executar imediatamente se for now() e não tiver HTML export
        if (!scheduledFor && !post.isWaitingForHtmlExport) {
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
        const { accountId, businessProfileId, status, type, limit } = req.query;

        const filters = {};
        if (accountId) filters.accountId = accountId;
        if (businessProfileId) filters.businessProfileId = businessProfileId;
        if (status) filters.status = status;
        if (type) filters.type = type;
        if (limit) filters.limit = limit;

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

        const nextFormat = normalizeFormat(type || post.format || post.type, post.format || post.type || 'static');
        if (type) updateData.type = type;
        if (caption !== undefined || isStoryFormat(nextFormat)) updateData.caption = isStoryFormat(nextFormat) ? '' : caption;
        if (scheduledFor) {
            // Firestore não compara string com Timestamp — gravar como string
            // faria getReadyPosts() nunca encontrar este post.
            const parsedDate = new Date(scheduledFor);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ error: 'Data de agendamento inválida' });
            }
            updateData.scheduledFor = parsedDate;
        }

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
