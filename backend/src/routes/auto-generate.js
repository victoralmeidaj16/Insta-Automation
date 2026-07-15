import express from 'express';
import { db } from '../config/firebase.js';
import {
    generateWeeklyPlan,
    generateDraftPost,
    previewWeeklyPlan,
    getDraftPosts,
    approveDraftPost,
    rejectDraftPost,
    updateDraftCaption,
    updateDraftPremiumLayout,
    regenerateDraftPost,
    regenerateDraftSlide,
    syncDraftToLibrary
} from '../services/contentGeneratorService.js';
import { getBusinessProfile } from '../services/businessProfileService.js';
import { scheduleApprovedPost } from '../services/postService.js';

const router = express.Router();
const runningJobs = new Map();

async function requireOwnedProfile(profileId, userId) {
    const profile = await getBusinessProfile(profileId);
    if (profile.userId !== userId) {
        const error = new Error('Acesso negado ao perfil informado.');
        error.statusCode = 403;
        throw error;
    }
    return profile;
}

async function requireOwnedDraft(postId, userId) {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) {
        const error = new Error('Rascunho não encontrado.');
        error.statusCode = 404;
        throw error;
    }

    const draft = { id: doc.id, ...doc.data() };
    if (draft.userId !== userId) {
        const error = new Error('Acesso negado ao rascunho informado.');
        error.statusCode = 403;
        throw error;
    }

    return draft;
}

function sendAutoGenerateError(scope, error, res) {
    console.error(`❌ [${scope}]`, error.message);
    res.status(error.statusCode || 500).json({ error: error.message });
}

/**
 * POST /api/auto-generate/preview
 * Retorna o plano da semana SEM chamar IA — para o usuário revisar antes de gerar
 * Body: { businessProfileId, weekStartDate? }
 */
router.post('/preview', async (req, res) => {
    try {
        const { businessProfileId, weekStartDate } = req.body;
        const userId = req.user?.uid;
        if (!businessProfileId) {
            return res.status(400).json({ error: 'businessProfileId é obrigatório.' });
        }
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedProfile(businessProfileId, userId);

        const startDate = weekStartDate ? new Date(weekStartDate) : new Date();
        const preview = await previewWeeklyPlan(businessProfileId, startDate);
        res.json({ success: true, ...preview });
    } catch (error) {
        sendAutoGenerateError('auto-generate/preview', error, res);
    }
});

/**
 * POST /api/auto-generate/weekly
 * Gera o plano semanal completo de rascunhos para um perfil de negócio
 * Body: { businessProfileId, weekStartDate?, plan? }
 */
router.post('/weekly', async (req, res) => {
    const { businessProfileId, weekStartDate, customPlan, generationContextOverrides } = req.body;
    const userId = req.user?.uid;

    if (!businessProfileId) {
        return res.status(400).json({ error: 'businessProfileId é obrigatório.' });
    }
    if (!userId) {
        return res.status(401).json({ error: 'Não autenticado.' });
    }

    try {
        await requireOwnedProfile(businessProfileId, userId);
    } catch (error) {
        return sendAutoGenerateError('auto-generate/weekly', error, res);
    }

    // Evita rodar dois jobs simultâneos para o mesmo perfil
    if (runningJobs.get(businessProfileId)?.status === 'running') {
        return res.json({ success: true, background: true, status: 'running', message: 'Geração já em andamento para este perfil.' });
    }

    const startDate = weekStartDate ? new Date(weekStartDate) : new Date();
    runningJobs.set(businessProfileId, {
        status: 'running', started: new Date(),
        generated: 0, failed: 0, errors: [],
        totalPosts: 0, currentIndex: -1,
        currentPostTitle: '', completedItems: []
    });

    // Responde imediatamente — geração roda em background
    res.json({ success: true, background: true, status: 'running', message: 'Geração iniciada em background. Acompanhe via /status.' });

    // Roda geração sem bloquear a resposta
    const onProgress = (event) => {
        const current = runningJobs.get(businessProfileId) || {};
        runningJobs.set(businessProfileId, { ...current, ...event });
    };

    generateWeeklyPlan(businessProfileId, startDate, customPlan, generationContextOverrides || {}, onProgress)
        .then(result => {
            runningJobs.set(businessProfileId, { status: 'done', finished: new Date(), ...result });
            console.log(`✅ [auto-generate] Plano concluído para ${businessProfileId}: ${result.generated} gerados`);
        })
        .catch(err => {
            runningJobs.set(businessProfileId, { status: 'error', finished: new Date(), error: err.message });
            console.error(`❌ [auto-generate] Falha para ${businessProfileId}: ${err.message}`);
        });
});

/**
 * GET /api/auto-generate/status/:profileId
 * Retorna o status do job de geração em background
 */
router.get('/status/:profileId', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedProfile(req.params.profileId, userId);

        const job = runningJobs.get(req.params.profileId);
        if (!job) return res.json({ status: 'idle' });
        res.json(job);
    } catch (error) {
        sendAutoGenerateError('auto-generate/status', error, res);
    }
});

/**
 * POST /api/auto-generate/single
 * Gera um único post rascunho para um pilar específico
 * Body: { businessProfileId, pillarId, format, scheduledFor, accountId }
 */
router.post('/single', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { businessProfileId, pillarId, format, scheduledFor, accountId } = req.body;

        if (!businessProfileId || !pillarId) {
            return res.status(400).json({ error: 'businessProfileId e pillarId são obrigatórios.' });
        }
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedProfile(businessProfileId, userId);

        const post = await generateDraftPost(
            businessProfileId,
            pillarId,
            format || 'static',
            scheduledFor ? new Date(scheduledFor) : null,
            accountId || null
        );

        res.json({ success: true, post });
    } catch (error) {
        sendAutoGenerateError('auto-generate/single', error, res);
    }
});

/**
 * GET /api/auto-generate/drafts
 * Retorna todos os rascunhos pendentes de revisão do usuário
 */
router.get('/drafts', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Não autenticado.' });

        const drafts = await getDraftPosts(userId);
        res.json({ success: true, drafts });
    } catch (error) {
        console.error('❌ [auto-generate/drafts]', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/auto-generate/drafts/:postId/approve
 * Aprova um rascunho, ativando o agendamento
 */
router.post('/drafts/:postId/approve', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        const draft = await requireOwnedDraft(req.params.postId, userId);
        const { accountId, destination } = req.body;

        if (destination === 'schedule') {
            const scheduledDate = draft.scheduledFor?.toDate?.() || (draft.scheduledFor ? new Date(draft.scheduledFor) : null);
            if (!scheduledDate || isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
                return res.status(400).json({ error: 'A data de agendamento deve ser no futuro para agendar o post.' });
            }
        }

        const approval = await approveDraftPost(req.params.postId, accountId, { destination });

        if (approval.destination !== 'library') {
            await scheduleApprovedPost(req.params.postId, approval.accountId);
        }

        res.json({ success: true, destination: approval.destination });
    } catch (error) {
        sendAutoGenerateError('auto-generate/approve', error, res);
    }
});

/**
 * POST /api/auto-generate/drafts/:postId/reject
 * Rejeita e arquiva um rascunho
 */
router.post('/drafts/:postId/reject', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedDraft(req.params.postId, userId);
        await rejectDraftPost(req.params.postId);
        res.json({ success: true });
    } catch (error) {
        sendAutoGenerateError('auto-generate/reject', error, res);
    }
});

/**
 * PATCH /api/auto-generate/drafts/:postId/media
 * Updates the array of mediaUrls (useful to replace with baked overlay images)
 */
router.patch('/drafts/:postId/media', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { mediaUrls, premiumLayout, premiumLayouts, markPremiumBaked } = req.body;
        if (!userId) return res.status(401).json({ error: 'Não autenticado.' });
        if (!mediaUrls || !Array.isArray(mediaUrls)) return res.status(400).json({ error: 'mediaUrls inválido.' });

        await requireOwnedDraft(req.params.postId, userId);

        const updates = {
            mediaUrls,
            updatedAt: new Date()
        };

        if (premiumLayout && typeof premiumLayout === 'object') {
            updates.premiumLayout = premiumLayout;
            updates.overlayData = {
                headline: premiumLayout.title || '',
                subheadline: '',
                highlights: String(premiumLayout.highlightText || '')
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean),
                layout: 'premium'
            };
        }

        if (Array.isArray(premiumLayouts)) {
            updates.premiumLayouts = premiumLayouts;
        }

        if (markPremiumBaked) {
            updates.premiumOverlayBakedAt = new Date();
        }

        await db.collection('posts').doc(req.params.postId).update(updates);
        await syncDraftToLibrary(req.params.postId).catch(err => {
            console.warn(`⚠️ Falha ao sincronizar mídia com Library (postId: ${req.params.postId}):`, err.message);
        });
        res.json({ success: true });
    } catch (error) {
        sendAutoGenerateError('auto-generate/media', error, res);
    }
});

/**
 * PATCH /api/auto-generate/drafts/:postId/premium-layout
 * Salva o layout premium customizado do rascunho para revisão antes da aprovação.
 */
router.patch('/drafts/:postId/premium-layout', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { layout, slideIndex } = req.body;
        if (!userId) return res.status(401).json({ error: 'Não autenticado.' });
        if (!layout || typeof layout !== 'object') return res.status(400).json({ error: 'layout inválido.' });

        const draft = await requireOwnedDraft(req.params.postId, userId);
        const profile = draft.businessProfileId ? await getBusinessProfile(draft.businessProfileId).catch(() => null) : null;
        const savedLayout = await updateDraftPremiumLayout(req.params.postId, layout, profile, slideIndex);

        res.json({ success: true, layout: savedLayout });
    } catch (error) {
        sendAutoGenerateError('auto-generate/premium-layout', error, res);
    }
});

/**
 * PATCH /api/auto-generate/drafts/:postId/caption
 * Atualiza a caption de um rascunho antes de aprovar
 * Body: { caption }
 */
router.patch('/drafts/:postId/caption', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { caption } = req.body;
        if (caption === undefined) return res.status(400).json({ error: 'caption é obrigatório.' });
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedDraft(req.params.postId, userId);
        await updateDraftCaption(req.params.postId, caption);
        res.json({ success: true });
    } catch (error) {
        sendAutoGenerateError('auto-generate/caption', error, res);
    }
});

/**
 * POST /api/auto-generate/drafts/:postId/regenerate
 * Regera um rascunho com um novo prompt
 * Body: { prompt }
 */
router.post('/drafts/:postId/regenerate', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'prompt é obrigatório.' });
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedDraft(req.params.postId, userId);
        const post = await regenerateDraftPost(req.params.postId, prompt);
        res.json({ success: true, post });
    } catch (error) {
        sendAutoGenerateError('auto-generate/regenerate', error, res);
    }
});

/**
 * POST /api/auto-generate/drafts/:postId/regenerate-slide
 * Regera um único slide de um rascunho de carrossel
 * Body: { slideIndex }
 */
router.post('/drafts/:postId/regenerate-slide', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { slideIndex } = req.body;
        if (typeof slideIndex !== 'number') return res.status(400).json({ error: 'slideIndex numérico é obrigatório.' });
        if (!userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        await requireOwnedDraft(req.params.postId, userId);
        const post = await regenerateDraftSlide(req.params.postId, slideIndex);
        res.json({ success: true, post });
    } catch (error) {
        sendAutoGenerateError('auto-generate/regenerate-slide', error, res);
    }
});

/**
 * PATCH /api/auto-generate/drafts/:postId/schedule
 * Atualiza a data de agendamento de um rascunho
 * Body: { scheduledFor } — ISO string
 */
router.patch('/drafts/:postId/schedule', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { scheduledFor } = req.body;
        if (!scheduledFor) return res.status(400).json({ error: 'scheduledFor é obrigatório.' });
        if (!userId) return res.status(401).json({ error: 'Não autenticado.' });

        await requireOwnedDraft(req.params.postId, userId);

        const newDate = new Date(scheduledFor);
        if (isNaN(newDate.getTime())) return res.status(400).json({ error: 'Data inválida.' });

        await db.collection('posts').doc(req.params.postId).update({
            scheduledFor: newDate,
            updatedAt: new Date()
        });
        await syncDraftToLibrary(req.params.postId).catch(err => {
            console.warn(`⚠️ Falha ao sincronizar data com Library (postId: ${req.params.postId}):`, err.message);
        });

        res.json({ success: true, scheduledFor: newDate.toISOString() });
    } catch (error) {
        sendAutoGenerateError('auto-generate/schedule', error, res);
    }
});

/**
 * GET /api/auto-generate/analytics/:profileId
 * Retorna dados históricos de geração para o perfil
 * Query: ?weeks=4 (default 4)
 */
router.get('/analytics/:profileId', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Não autenticado.' });

        await requireOwnedProfile(req.params.profileId, userId);

        const weeks = parseInt(req.query.weeks) || 4;
        const since = new Date();
        since.setDate(since.getDate() - (weeks * 7));

        const snapshot = await db.collection('posts')
            .where('businessProfileId', '==', req.params.profileId)
            .where('generatedBy', '==', 'auto')
            .get();

        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));

        // Filter by date range in JS (to avoid composite index)
        const filtered = posts.filter(p => {
            const d = p.createdAt?.toDate?.() || new Date(p.createdAt || 0);
            return d >= since;
        });

        // Aggregate by status
        const byStatus = { draft: 0, approved: 0, rejected: 0, pending: 0, posted: 0, failed: 0 };
        filtered.forEach(p => {
            if (p.isDraft && p.status === 'draft') byStatus.draft++;
            else if (p.status === 'rejected') byStatus.rejected++;
            else if (p.status === 'pending' || p.status === 'processing') byStatus.approved++;
            else if (p.status === 'posted') { byStatus.approved++; byStatus.posted++; }
            else if (p.status === 'failed') byStatus.failed++;
        });

        // Aggregate by pillar
        const byPillar = {};
        filtered.forEach(p => {
            const key = p.pillarName || 'Sem Pilar';
            if (!byPillar[key]) byPillar[key] = { total: 0, approved: 0, rejected: 0, regenerated: 0 };
            byPillar[key].total++;
            if (p.status === 'rejected') byPillar[key].rejected++;
            else if (!p.isDraft) byPillar[key].approved++;
            if (p.generationPromptHistory?.length > 0) byPillar[key].regenerated++;
        });

        // Aggregate by format
        const byFormat = {};
        filtered.forEach(p => {
            const fmt = p.format || p.type || 'static';
            byFormat[fmt] = (byFormat[fmt] || 0) + 1;
        });

        // Week-by-week totals
        const weekBuckets = [];
        for (let w = weeks - 1; w >= 0; w--) {
            const start = new Date();
            start.setDate(start.getDate() - (w + 1) * 7);
            const end = new Date();
            end.setDate(end.getDate() - w * 7);
            const label = start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            const weekPosts = filtered.filter(p => {
                const d = p.createdAt?.toDate?.() || new Date(p.createdAt || 0);
                return d >= start && d < end;
            });

            weekBuckets.push({
                label,
                total: weekPosts.length,
                approved: weekPosts.filter(p => !p.isDraft && p.status !== 'rejected').length,
                rejected: weekPosts.filter(p => p.status === 'rejected').length,
            });
        }

        // Regeneration count
        const regenerated = filtered.filter(p => p.generationPromptHistory?.length > 0).length;

        res.json({
            success: true,
            period: { weeks, since: since.toISOString() },
            totals: {
                total: filtered.length,
                ...byStatus,
                regenerated,
                approvalRate: filtered.length > 0
                    ? Math.round(((byStatus.approved + byStatus.posted) / filtered.length) * 100)
                    : 0
            },
            byPillar,
            byFormat,
            weekBuckets
        });
    } catch (error) {
        sendAutoGenerateError('auto-generate/analytics', error, res);
    }
});

export default router;
