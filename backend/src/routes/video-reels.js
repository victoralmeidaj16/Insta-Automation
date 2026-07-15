/**
 * video-reels.js
 * Rotas da API para a pipeline de geração de Reels com IA.
 * 
 * Todas as rotas requerem autenticação (via middleware authenticate no server.js)
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { getBusinessProfile } from '../services/businessProfileService.js';
import {
    createReelProject,
    generateReelScriptDescription,
    generateAnchorImage,
    updateAnchorPrompt,
    approveAnchor,
    generateSceneImages,
    generateSceneImage,
    updateScene,
    approveScene,
    regenerateSceneImage,
    animateScene,
    retrySceneVideo,
    mergeScenes,
    getProject,
    listProjects,
    getAssetPath,
} from '../services/videoReelsService.js';

const router = express.Router();

// ─── Helper ───────────────────────────────────────────────────────────────
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
};

function isQuotaError(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 429
        || message.includes('429')
        || message.includes('too many requests')
        || message.includes('resource exhausted')
        || message.includes('quota');
}

function toClientError(error, fallbackMessage) {
    const rawMessage = error?.message || fallbackMessage;

    if (isQuotaError(error)) {
        return {
            status: 429,
            body: {
                error: 'Limite do Gemini atingido. Aguarde alguns minutos ou troque a GEMINI_API_KEY.',
                code: 'GEMINI_QUOTA_EXCEEDED',
            },
        };
    }

    if (/gemini_api_key|api key/i.test(rawMessage)) {
        return {
            status: 500,
            body: {
                error: 'GEMINI_API_KEY não configurada ou inválida.',
                code: 'GEMINI_CONFIG_ERROR',
            },
        };
    }

    return {
        status: error?.status && Number(error.status) >= 400 && Number(error.status) < 600
            ? Number(error.status)
            : 500,
        body: {
            error: rawMessage,
            code: 'VIDEO_REELS_ERROR',
        },
    };
}


/**
 * POST /api/video-reels
 * Inicia a pipeline: cria projeto + plano de produção + gera âncora
 * 
 * Body: {
 *   script: string,
 *   businessProfileId: string,
 *   sceneCount?: number (1-8)
 * }
 */
router.post('/', asyncHandler(async (req, res) => {
    const { script, businessProfileId, sceneCount = 4 } = req.body;

    if (!script?.trim()) {
        return res.status(400).json({ error: 'Campo script é obrigatório' });
    }

    const count = Math.max(1, Math.min(8, Number(sceneCount) || 4));

    // Load business profile context
    let profile = {};
    if (businessProfileId) {
        try {
            profile = await getBusinessProfile(businessProfileId);
        } catch (err) {
            console.warn('⚠️ Business profile não encontrado, usando contexto vazio');
        }
    }

    console.log(`🎬 [POST /api/video-reels] script="${script.substring(0, 60)}..." profile="${profile?.name}" scenes=${count}`);

    const project = await createReelProject(script, profile, { sceneCount: count });

    res.status(201).json({
        success: true,
        project_id: project.id,
        project: getProject(project.id),
    });
}));


/**
 * GET /api/video-reels
 * Lista todos os projetos de reel
 */
router.get('/', asyncHandler(async (req, res) => {
    const projects = listProjects();
    res.json({ success: true, projects });
}));

/**
 * POST /api/video-reels/generate-script
 * Gera ou melhora o campo "Roteiro / Descrição" usando o perfil de negócio.
 */
router.post('/generate-script', asyncHandler(async (req, res) => {
    const { businessProfileId, seed = '', sceneCount = 4 } = req.body;

    let profile = {};
    if (businessProfileId) {
        try {
            profile = await getBusinessProfile(businessProfileId);
        } catch (err) {
            console.warn('⚠️ Business profile não encontrado para roteiro, usando contexto vazio');
        }
    }

    const script = await generateReelScriptDescription(profile, { seed, sceneCount });

    res.json({
        success: true,
        script,
    });
}));


/**
 * GET /api/video-reels/:id
 * Retorna estado completo de um projeto
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const project = getProject(req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    res.json({ success: true, project });
}));


/**
 * POST /api/video-reels/:id/generate-anchor
 * Gera a imagem âncora do projeto (se ainda não gerada)
 */
router.post('/:id/generate-anchor', asyncHandler(async (req, res) => {
    const project = await generateAnchorImage(req.params.id);
    res.json({ success: true, project: getProject(project.id) });
}));

/**
 * PATCH /api/video-reels/:id/anchor-prompt
 * Atualiza manualmente o prompt da imagem âncora antes de regenerar.
 */
router.patch('/:id/anchor-prompt', asyncHandler(async (req, res) => {
    const { prompt } = req.body;
    const project = await updateAnchorPrompt(req.params.id, prompt);
    res.json({ success: true, project: getProject(project.id) });
}));


/**
 * POST /api/video-reels/:id/approve-anchor
 * Aprova ou rejeita a imagem âncora
 * 
 * Body: { approved: boolean }
 */
router.post('/:id/approve-anchor', asyncHandler(async (req, res) => {
    const { approved } = req.body;
    if (approved === undefined) {
        return res.status(400).json({ error: 'Campo approved é obrigatório' });
    }

    const project = await approveAnchor(req.params.id, Boolean(approved));
    res.json({ success: true, project: getProject(project.id) });
}));


/**
 * POST /api/video-reels/:id/generate-scenes
 * Gera imagens de todas as cenas (requer âncora aprovada)
 */
router.post('/:id/generate-scenes', asyncHandler(async (req, res) => {
    const project = await generateSceneImages(req.params.id);
    res.json({ success: true, project: getProject(project.id) });
}));

/**
 * PATCH /api/video-reels/:id/scenes/:sceneId
 * Atualiza campos editáveis da cena e invalida assets dependentes quando necessário.
 */
router.patch('/:id/scenes/:sceneId', asyncHandler(async (req, res) => {
    const project = await updateScene(req.params.id, req.params.sceneId, req.body);
    res.json({ success: true, project: getProject(project.id) });
}));

/**
 * POST /api/video-reels/:id/scenes/:sceneId/generate-image
 * Regenera apenas a imagem de uma cena.
 */
router.post('/:id/scenes/:sceneId/generate-image', asyncHandler(async (req, res) => {
    const project = await generateSceneImage(req.params.id, req.params.sceneId);
    res.json({ success: true, project: getProject(project.id) });
}));


/**
 * POST /api/video-reels/:id/scenes/:sceneId/approve
 * Aprova ou rejeita a imagem de uma cena.
 * Se rejeitada com feedback → regeneração automática.
 * Se aprovada → anima automaticamente via Kling.
 * 
 * Body: { approved: boolean, feedback?: string }
 */
router.post('/:id/scenes/:sceneId/approve', asyncHandler(async (req, res) => {
    const { approved, feedback } = req.body;
    if (approved === undefined) {
        return res.status(400).json({ error: 'Campo approved é obrigatório' });
    }

    const project = await approveScene(
        req.params.id,
        req.params.sceneId,
        Boolean(approved),
        feedback || null
    );

    res.json({ success: true, project: getProject(project.id) });
}));


/**
 * POST /api/video-reels/:id/scenes/:sceneId/retry-video
 * Força nova tentativa de geração de vídeo para uma cena
 */
router.post('/:id/scenes/:sceneId/retry-video', asyncHandler(async (req, res) => {
    const project = await retrySceneVideo(req.params.id, req.params.sceneId);
    res.json({ success: true, project: getProject(project.id) });
}));


/**
 * POST /api/video-reels/:id/merge
 * Dispara a montagem do vídeo final via FFmpeg
 * (requer todas as cenas com video_status=done)
 */
router.post('/:id/merge', asyncHandler(async (req, res) => {
    const project = await mergeScenes(req.params.id);
    res.json({ success: true, project: getProject(project.id) });
}));


/**
 * GET /api/video-reels/assets/:id/:filename
 * Serve assets locais do projeto (imagens e vídeos)
 */
router.get('/assets/:id/:filename', (req, res) => {
    const filePath = getAssetPath(req.params.id, req.params.filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Asset não encontrado' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
    };

    const contentType = contentTypeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (ext === '.mp4') {
        // Support range requests for video streaming
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/mp4',
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }
    }

    res.sendFile(path.resolve(filePath));
});

router.use((error, req, res, next) => {
    const { status, body } = toClientError(error, 'Erro ao processar projeto de Reel');
    console.error('❌ [video-reels]', body.error, error);
    res.status(status).json(body);
});


export default router;
