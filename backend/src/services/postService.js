import { db, storage } from '../config/firebase.js';
import { getAccount } from './accountService.js';
import { getAccountsByProfile, getBusinessProfile } from './businessProfileService.js';
import { uploadPhotos, uploadVideo, cancelScheduledPost } from './uploadPostService.js';
import { createScheduledPostRecord, normalizeStoredPostRecord } from '../domain/contentModels.js';
import { getCreatablePostTypes, isReelFormat, isStoryFormat, normalizeFormat } from '../domain/formatRules.js';


/**
 * Cria um novo post (imediato ou agendado)
 */
export async function createPost(userId, accountId, postData) {
    try {
        const {
            type,
            format: rawFormat,
            mediaUrls,
            caption,
            scheduledFor, // timestamp ou null para imediato
        } = postData;
        const format = normalizeFormat(rawFormat || type, type || 'static');

        const hasHtmlContent = Boolean(postData.htmlContent || postData.htmlCode);
        if ((!mediaUrls || mediaUrls.length === 0) && !hasHtmlContent) {
            throw new Error('Nenhuma mídia fornecida para o post.');
        }

        const sanitizedCaption = isStoryFormat(format) ? '' : (caption || '');

        // Só valida o tipo quando não for HTML (carousel-html e html são tipos especiais)
        if (!hasHtmlContent && !getCreatablePostTypes().includes(type)) {
            throw new Error(`Tipo inválido. Use: ${getCreatablePostTypes().join(', ')}`);
        }

        // Get account to extract business profile
        // Logic update: Ensure accountId is valid. If it's a Business Profile ID, resolve to the actual Account ID.
        let resolvedAccountId = accountId;
        let account;
        let businessProfileFallback = null;
        try {
            account = await getAccount(resolvedAccountId);
        } catch (error) {
            console.log(`⚠️ Account ${resolvedAccountId} not found directly. Checking if it is a Business Profile ID...`);
            const linkedAccounts = await getAccountsByProfile(resolvedAccountId);

            if (linkedAccounts && linkedAccounts.length > 0) {
                resolvedAccountId = linkedAccounts[0].id;
                account = await getAccount(resolvedAccountId);
                console.log(`✅ Resolved Profile ID ${accountId} to Account ID ${resolvedAccountId}`);
            } else {
                // Fallback: try using the Business Profile's instagram settings directly
                try {
                    const bp = await getBusinessProfile(resolvedAccountId);
                    if (bp && bp.instagram?.username) {
                        console.log(`📤 No linked accounts found. Using Business Profile "${bp.name}" username as virtual account.`);
                        businessProfileFallback = bp;
                        // Synthesize a minimal account object from the Business Profile
                        account = {
                            id: resolvedAccountId,
                            username: bp.instagram.username,
                            businessProfileId: resolvedAccountId,
                            status: 'active'
                        };
                    } else {
                        throw error;
                    }
                } catch (bpError) {
                    throw error; // Re-throw the original account not found error
                }
            }
        }

        const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
        if (scheduledDate && isNaN(scheduledDate.getTime())) {
            throw new Error('Data de agendamento inválida');
        }

        let businessProfile = businessProfileFallback || null;
        if (!businessProfile && account.businessProfileId) {
            try {
                businessProfile = await getBusinessProfile(account.businessProfileId);
            } catch (err) {
                console.warn(`⚠️ Não foi possível carregar perfil ${account.businessProfileId}: ${err.message}`);
            }
        }

        const profileSignals = [
            businessProfile?.name,
            businessProfile?.type,
            businessProfile?.description,
            businessProfile?.branding?.style,
        ];
        // Drafts are never scheduled externally — they wait for approval first
        const isWaitingForHtmlExport = hasHtmlContent && (!mediaUrls || mediaUrls.length === 0);
        const shouldUseUploadPostScheduler = Boolean(scheduledDate) && !postData.isDraft;

        let externalScheduleInfo = null;
        if (shouldUseUploadPostScheduler && !isWaitingForHtmlExport) {
            try {
                externalScheduleInfo = await scheduleWithUploadPost({
                    account,
                    type: format,
                    mediaUrls,
                    caption: sanitizedCaption,
                    scheduledDate,
                    apiKey: businessProfile?.instagram?.uploadPostApiKey,
                    uploadUsername: businessProfile?.instagram?.username || account.username
                });
            } catch (apiError) {
                console.warn(`⚠️ Falha ao agendar via API externa (fallback para local): ${apiError.message}`);
                // externalScheduleInfo permanece null, o que fará o status ser 'pending' (agendamento local)
            }
        }

        const isDraft = postData.isDraft === true;
        const hasValidExternalSchedule = Boolean(externalScheduleInfo?.jobId);

        const post = createScheduledPostRecord({
            userId,
            accountId: resolvedAccountId,
            businessProfileId: account.businessProfileId || null,
            format,
            mediaUrls,
            caption: sanitizedCaption,
            scheduledFor: scheduledDate,
            status: isDraft
                ? 'draft'
                : scheduledDate
                    ? (hasValidExternalSchedule ? 'scheduled' : 'pending')
                    : 'processing',
            libraryItemId: postData.libraryItemId || null,
            htmlContent: postData.htmlContent || postData.htmlCode || null,
            pillarId: postData.pillarId || null,
            pillarName: postData.pillarName || null,
            generatedBy: postData.generatedBy || null,
            generationPrompt: postData.generationPrompt || '',
            externalScheduler: hasValidExternalSchedule ? 'upload-post' : null,
            externalJobId: externalScheduleInfo?.jobId || null,
            externalPayload: externalScheduleInfo?.payload || null,
            extra: {
                isDraft,
                isWaitingForHtmlExport,
                ...(postData.extra || {})
            }
        });

        const postRef = await db.collection('posts').add(post);

        // If linked to a library item, update its status
        if (postData.libraryItemId) {
            await db.collection('library_items').doc(postData.libraryItemId).update({
                isScheduled: Boolean(post.scheduledFor),
                status: post.scheduledFor ? 'scheduled' : 'processing',
                scheduledPostId: postRef.id,
                scheduledFor: post.scheduledFor || null,
                updatedAt: new Date()
            });
            console.log(`🔗 Linked Library Item ${postData.libraryItemId} to Post ${postRef.id}`);
        }

        console.log(`✅ Post criado com ID: ${postRef.id}`);

        if (isWaitingForHtmlExport) {
            console.log(`⏳ Post ${postRef.id} requer exportação de HTML para imagens (em background)...`);
            (async () => {
                try {
                    const { exportHtmlCarouselToImages } = await import('./htmlExportService.js');
                    await exportHtmlCarouselToImages(postRef.id);

                    if (shouldUseUploadPostScheduler) {
                        try {
                            const { scheduleApprovedPost } = await import('./postService.js');
                            await scheduleApprovedPost(postRef.id, resolvedAccountId);
                            console.log(`✅ Post HTML ${postRef.id} exportado e agendado com sucesso.`);
                        } catch (e) {
                            console.error(`❌ Falha ao agendar post ${postRef.id} após exportar HTML:`, e);
                            await postRef.update({ status: 'failed', errorMessage: `Falha ao agendar após exportação: ${e.message}`, updatedAt: new Date() });
                        }
                    } else if (!scheduledDate) {
                        await executePost(postRef.id);
                    }
                } catch (e) {
                    console.error(`❌ Falha na exportação em background do post ${postRef.id}:`, e);
                    await postRef.update({ status: 'failed', errorMessage: `Falha na exportação HTML: ${e.message}`, updatedAt: new Date() }).catch(() => {});
                    // Unmark library item so it can be re-scheduled
                    if (postData.libraryItemId) {
                        await db.collection('library_items').doc(postData.libraryItemId).update({ isScheduled: false, status: 'pronto', scheduledPostId: null, updatedAt: new Date() }).catch(() => {});
                    }
                }
            })();
        }

        return {
            id: postRef.id,
            isWaitingForHtmlExport,
            ...post,
        };
    } catch (error) {
        console.error('❌ Erro ao criar post:', error);
        throw error;
    }
}

/**
 * Lista posts de um usuário
 */
export async function getPosts(userId, filters = {}) {
    try {
        const resultLimit = Math.min(Math.max(parseInt(filters.limit, 10) || 300, 1), 1000);

        // Start with userId filter only to avoid composite index requirements
        let query = db.collection('posts').where('userId', '==', userId);

        // Apply accountId in Firestore if present (usually safe as a single additional filter)
        if (filters.accountId) {
            query = query.where('accountId', '==', filters.accountId);
        }

        // Fetch a larger window before in-memory filtering so calendar views do not
        // hide scheduled HTML/premium carousels created earlier than recent drafts.
        const snapshot = await query.orderBy('createdAt', 'desc').limit(resultLimit).get();

        let posts = [];
        snapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                ...normalizeStoredPostRecord(doc.data()),
            });
        });

        // Apply secondary filters in memory to avoid ANY composite index requirements
        if (filters.businessProfileId) {
            posts = posts.filter(post => post.businessProfileId === filters.businessProfileId);
        }
        if (filters.status) {
            posts = posts.filter(post => post.status === filters.status);
        }
        if (filters.type) {
            posts = posts.filter(post => post.type === filters.type || post.format === filters.type);
        }

        return posts.slice(0, resultLimit);
    } catch (error) {
        console.error('❌ Erro ao listar posts:', error);
        throw error;
    }
}

/**
 * Busca um post específico
 */
export async function getPost(postId) {
    try {
        const doc = await db.collection('posts').doc(postId).get();

        if (!doc.exists) {
            throw new Error('Post não encontrado');
        }

        return {
            id: doc.id,
            ...normalizeStoredPostRecord(doc.data()),
        };
    } catch (error) {
        console.error('❌ Erro ao buscar post:', error);
        throw error;
    }
}

async function resolveLibraryItemIdForPost(postId, postData = null) {
    if (postData?.libraryItemId) {
        return postData.libraryItemId;
    }

    const libSnapshot = await db.collection('library_items')
        .where('scheduledPostId', '==', postId)
        .limit(1)
        .get();

    if (!libSnapshot.empty) {
        const libraryItemId = libSnapshot.docs[0].id;
        console.log(`🔗 Link de library recuperado: Post ${postId} -> Library Item ${libraryItemId}`);
        return libraryItemId;
    }

    return null;
}

async function syncLibraryItemFromPostStatus(postId, status, postData = null, postedAt = null) {
    const libraryItemId = await resolveLibraryItemIdForPost(postId, postData);
    if (!libraryItemId) {
        return false;
    }

    const updateData = {
        updatedAt: postedAt || new Date()
    };

    if (status === 'processing') {
        updateData.isScheduled = false;
        updateData.status = 'processing';
    }

    if (status === 'scheduled') {
        updateData.isScheduled = true;
        updateData.isPosted = false;
        updateData.status = 'scheduled';
        updateData.scheduledPostId = postId;
        updateData.scheduledFor = postData?.scheduledFor || null;
    }

    if (status === 'error' || status === 'failed' || status === 'rejected') {
        updateData.isScheduled = false;
        updateData.isPosted = false;
        updateData.status = 'pronto';
        updateData.scheduledPostId = null;
        updateData.scheduledFor = null;
    }

    if (status === 'success' || status === 'posted') {
        updateData.isPosted = true;
        updateData.isScheduled = false;
        updateData.status = 'posted';
        updateData.tag = 'postado';
        updateData.scheduledFor = null;
    }

    if (Object.keys(updateData).length === 1) {
        return false;
    }

    await db.collection('library_items').doc(libraryItemId).update(updateData);
    console.log(`✅ Library Item ${libraryItemId} sincronizado com status ${status}.`);
    return true;
}

/**
 * Atualiza status de um post
 */
export async function updatePostStatus(postId, status, errorMessage = null, postedAt = null) {
    try {
        const postSnapshot = await db.collection('posts').doc(postId).get();
        const postData = postSnapshot.exists ? postSnapshot.data() : null;
        const updateData = { status, updatedAt: new Date() };

        if (['success', 'posted', 'error', 'failed', 'rejected', 'scheduled'].includes(status)) {
            updateData.executionLeaseUntil = null;
            updateData.executionWorker = null;
        }

        if (errorMessage) {
            updateData.errorMessage = errorMessage;
        }
        if (postedAt) {
            updateData.postedAt = postedAt;
        }

        await db.collection('posts').doc(postId).update(updateData);

        // Always sync the library item, including on errors so it gets unlocked
        await syncLibraryItemFromPostStatus(postId, status, postData, postedAt);

        console.log(`✅ Post ${postId} atualizado: ${status}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        throw error;
    }
}

async function claimPostExecution(postId) {
    const ref = db.collection('posts').doc(postId);
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 15 * 60 * 1000);
    const worker = process.env.RENDER_INSTANCE_ID || `pid-${process.pid}`;

    return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Error('Post não encontrado.');

        const post = { id: snapshot.id, ...snapshot.data() };
        if (post.externalScheduler && post.externalJobId) {
            return { claimed: false, reason: 'external-scheduler', post };
        }

        if (!['pending', 'processing'].includes(post.status) || post.isDraft === true) {
            return { claimed: false, reason: `status-${post.status}`, post };
        }

        const currentLease = post.executionLeaseUntil?.toDate?.() || null;
        if (currentLease && currentLease > now) {
            return { claimed: false, reason: 'leased', post };
        }

        transaction.update(ref, {
            status: 'processing',
            executionLeaseUntil: leaseUntil,
            executionWorker: worker,
            executionAttempt: Number(post.executionAttempt || 0) + 1,
            updatedAt: now
        });
        return { claimed: true, post: { ...post, status: 'processing' } };
    });
}

/**
 * Deleta um post (cancela se agendado)
 */
export async function deletePost(postId) {
    try {
        const post = await getPost(postId);

        // Se estiver agendado no Upload-Post, cancelar lá também
        if (post.externalScheduler === 'upload-post' && post.externalJobId) {
            console.log(`⏳ Cancelando job externo ${post.externalJobId} antes de deletar...`);
            let apiKey = null;
            if (post.businessProfileId) {
                try {
                    const businessProfile = await getBusinessProfile(post.businessProfileId);
                    apiKey = businessProfile?.instagram?.uploadPostApiKey;
                } catch (e) {
                    console.warn('⚠️ Falha ao buscar apiKey do perfil de negócios ao deletar post', e.message);
                }
            }
            await cancelScheduledPost(post.externalJobId, apiKey);
        }

        // Deletar mídias do Storage
        if (post.mediaUrls && post.mediaUrls.length > 0) {
            for (const url of post.mediaUrls) {
                try {
                    // Extrair caminho do arquivo da URL
                    const filePath = url.split('/o/')[1]?.split('?')[0];
                    if (filePath) {
                        const decodedPath = decodeURIComponent(filePath);
                        await storage.file(decodedPath).delete();
                        console.log(`🗑️ Mídia deletada: ${decodedPath}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Erro ao deletar mídia:', e.message);
                }
            }
        }

        // Deletar post do Firestore
        await db.collection('posts').doc(postId).delete();

        // Se tiver um libraryItemId, resetar o status dele
        if (post.libraryItemId) {
            await db.collection('library_items').doc(post.libraryItemId).update({
                isScheduled: false,
                status: 'available', // Or 'pronto'
                scheduledPostId: null,
                scheduledFor: null
            });
            console.log(`🔄 Library Item ${post.libraryItemId} status reset to available`);
        }

        console.log(`✅ Post ${postId} deletado`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao deletar post:', error);
        throw error;
    }
}

/**
 * Executa um post (faz o upload via Upload-Post API)
 */
export async function executePost(postId) {
    console.log(`🚀 Executando post ${postId}...`);

    try {
        const claim = await claimPostExecution(postId);
        if (!claim.claimed) {
            console.log(`⏭️ Post ${postId} não executado: ${claim.reason}.`);
            return { success: true, skipped: true, reason: claim.reason };
        }
        const post = claim.post;

        // Resolve account — fall back to Business Profile if no direct account linked
        let account;
        try {
            account = await getAccount(post.accountId);
        } catch (_) {
            // Try resolving via Business Profile username
            const bid = post.businessProfileId || post.accountId;
            try {
                const bp = await getBusinessProfile(bid);
                if (bp?.instagram?.username) {
                    console.log(`📤 executePost: sem conta real, usando BP "${bp.name}" como conta virtual.`);
                    account = { id: bid, username: bp.instagram.username, businessProfileId: bid, status: 'active' };
                } else {
                    throw new Error(`Post ${postId}: sem conta nem perfil com username definido.`);
                }
            } catch (bpErr) {
                throw new Error(`Conta não encontrada para o post ${postId}: ${bpErr.message}`);
            }
        }

        if (post.externalScheduler === 'upload-post' && post.externalJobId) {
            console.log(`⏭️ Post ${postId} já está programado no Upload-Post (job ${post.externalJobId}). Ignorando execução local.`);
            return { success: true, message: 'Post scheduled via Upload-Post' };
        }

        // Validar mídias
        if (!post.mediaUrls || post.mediaUrls.length === 0) {
            throw new Error('Post sem mídias para upload.');
        }

        let result;
        const platform = 'instagram'; // Default target platform

        let businessProfile = null;
        if (post.businessProfileId) {
            try {
                businessProfile = await getBusinessProfile(post.businessProfileId);
            } catch (err) {
                console.warn(`⚠️ Não foi possível carregar perfil do post ao executar: ${err.message}`);
            }
        }
        const apiKey = businessProfile?.instagram?.uploadPostApiKey;
        const uploadUsername = businessProfile?.instagram?.username || account.username;

        // Executar automação baseado no tipo
        const postFormat = post.format || post.type;
        const isStory = isStoryFormat(postFormat);
        const isVideoCarousel = postFormat === 'carousel-html-video' ||
            (post.exportMode === 'video') ||
            (post.mediaUrls?.length > 1 && post.mediaUrls[0]?.endsWith('.mp4'));

        if (isReelFormat(postFormat) || postFormat === 'video') {
            const videoUrl = post.mediaUrls[0];
            result = await uploadVideo(uploadUsername, platform, videoUrl, post.caption, post.caption, { apiKey });
        } else if (isVideoCarousel) {
            // Each slide is an MP4 — send as carousel via upload_photos (Upload-Post handles mixed media)
            console.log(`🎦 Uploading video carousel (${post.mediaUrls.length} clips)...`);
            result = await uploadPhotos(uploadUsername, platform, post.mediaUrls, post.caption || '', post.caption || '', { apiKey });
        } else if (isStory) {
            console.log(`📱 Uploading as Instagram Story...`);
            // Stories have no caption and must be flagged with media_type STORIES
            result = await uploadPhotos(uploadUsername, platform, post.mediaUrls, '', '', { apiKey, mediaType: 'STORIES' });
        } else {
            result = await uploadPhotos(uploadUsername, platform, post.mediaUrls, post.caption || '', post.caption || '', { apiKey });
        }

        // Verificar sucesso na resposta do Upload-Post
        // Formato Síncrono: { success: true, results: { instagram: { success: true, ... } } }
        // Formato Assíncrono (Handoff): { success: true, job_id: '...', message: '...' }
        const instagramResult = result.results && result.results[platform];
        const isBackgroundSuccess = result.success && result.job_id && !result.results;
        const isSynchronousSuccess = result.success && instagramResult && instagramResult.success;

        if (isSynchronousSuccess || isBackgroundSuccess) {
            const isAsync = isBackgroundSuccess;
            console.log(`✅ Upload ${isAsync ? 'iniciado em background' : 'sucesso'} para ${account.username}`);

            // Se for assíncrono, salvamos o job_id para o sync monitorar
            if (isAsync && result.job_id) {
                await db.collection('posts').doc(postId).update({
                    externalJobId: result.job_id,
                    externalScheduler: 'upload-post',
                    status: 'processing'
                });
            } else {
                await updatePostStatus(postId, 'success', null, new Date());
            }

            // Deletar mídias do Storage após sucesso (apensar se for síncrono ou se confiarmos no worker)
            // Se for assíncrono, talvez devêssemos manter até o worker terminar? 
            // Mas o Upload-Post já baixou as mídias (conforme logs "Downloading photo 1/1").
            // Então podemos deletar.
            for (const url of post.mediaUrls) {
                try {
                    if (url.includes('/o/')) {
                        const filePath = url.split('/o/')[1]?.split('?')[0];
                        if (filePath) {
                            const decodedPath = decodeURIComponent(filePath);
                            await storage.file(decodedPath).delete();
                            console.log(`🗑️ Mídia deletada do Storage: ${decodedPath}`);
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Erro ao deletar mídia:', e.message);
                }
            }

            // Keep the library card marked as in-flight while the worker finishes.
            if (isAsync && post.libraryItemId) {
                try {
                    await db.collection('library_items').doc(post.libraryItemId).update({
                        isScheduled: false,
                        isPosted: false,
                        status: 'processing',
                        updatedAt: new Date()
                    });
                    console.log(`✅ Library Item ${post.libraryItemId} atualizado (processing).`);
                } catch (libraryErr) {
                    console.error(`⚠️ Falha ao atualizar Library Item ${post.libraryItemId}:`, libraryErr);
                }
            }

            return { success: true, async: isAsync, ...result };

        } else {
            // Falha
            const errorMsg = instagramResult?.error || result.message || 'Erro desconhecido na API de Upload';
            console.error(`❌ Falha no upload: ${errorMsg}`);
            await updatePostStatus(postId, 'error', errorMsg);
            return { success: false, message: errorMsg };
        }

    } catch (error) {
        console.error('❌ Erro ao executar post:', error);
        await updatePostStatus(postId, 'error', error.message);
        return { success: false, message: error.message };
    }
}

export async function scheduleApprovedPost(postId, accountId = null) {
    const post = await getPost(postId);
    const resolvedAccountId = accountId || post.accountId || post.businessProfileId || null;

    if (!resolvedAccountId) {
        throw new Error('Conta Instagram é obrigatória para enviar ao Upload-Post.');
    }

    // Resolve account with the same fallback as createPost (supports businessProfileId as virtual account)
    let account;
    try {
        account = await getAccount(resolvedAccountId);
    } catch {
        const linkedAccounts = await getAccountsByProfile(resolvedAccountId);
        if (linkedAccounts && linkedAccounts.length > 0) {
            account = await getAccount(linkedAccounts[0].id);
        } else {
            const bp = await getBusinessProfile(resolvedAccountId);
            if (bp?.instagram?.username) {
                account = { id: resolvedAccountId, username: bp.instagram.username, businessProfileId: resolvedAccountId, status: 'active' };
            } else {
                throw new Error('Conta Instagram não encontrada para este perfil.');
            }
        }
    }

    const scheduledDate = post.scheduledFor ? new Date(post.scheduledFor) : null;
    const now = new Date();
    const shouldScheduleForFuture = scheduledDate && !isNaN(scheduledDate.getTime()) && scheduledDate > now;

    await db.collection('posts').doc(postId).update({
        accountId: resolvedAccountId,
        needsAccount: false,
        updatedAt: now
    });

    let businessProfile = null;
    if (post.businessProfileId) {
        try {
            businessProfile = await getBusinessProfile(post.businessProfileId);
        } catch (err) {
            console.warn(`⚠️ Não foi possível carregar perfil ao agendar post aprovado: ${err.message}`);
        }
    }

    if (shouldScheduleForFuture) {
        // Mesmo fallback do createPost: se a API externa falhar, o post fica
        // 'pending' e o scheduler local publica no horário. Propagar o erro
        // aqui deixaria o post preso em 'scheduled' sem job externo (o sync
        // ignora posts sem externalJobId).
        let externalScheduleInfo = null;
        try {
            externalScheduleInfo = await scheduleWithUploadPost({
                account,
                type: post.format || post.type,
                mediaUrls: post.mediaUrls,
                caption: post.caption,
                scheduledDate,
                apiKey: businessProfile?.instagram?.uploadPostApiKey,
                uploadUsername: businessProfile?.instagram?.username || account.username
            });
        } catch (apiError) {
            console.warn(`⚠️ Falha ao agendar via Upload-Post (fallback para agendamento local): ${apiError.message}`);
        }

        const hasValidJobId = Boolean(externalScheduleInfo?.jobId);

        await db.collection('posts').doc(postId).update({
            status: hasValidJobId ? 'scheduled' : 'pending',
            externalScheduler: hasValidJobId ? 'upload-post' : null,
            externalJobId: externalScheduleInfo?.jobId || null,
            externalPayload: externalScheduleInfo?.payload || null,
            updatedAt: new Date()
        });

        return {
            status: hasValidJobId ? 'scheduled' : 'pending',
            scheduledFor: scheduledDate,
            accountId: resolvedAccountId,
            externalJobId: externalScheduleInfo?.jobId || null
        };
    }

    const result = await executePost(postId);
    return {
        status: result?.success ? (result.async ? 'processing' : 'success') : 'error',
        scheduledFor: scheduledDate,
        accountId: resolvedAccountId,
        result
    };
}

/**
 * Busca posts prontos para serem executados (agendados para agora ou antes)
 */
export async function getReadyPosts() {
    try {
        const now = new Date();

        const snapshot = await db.collection('posts')
            .where('status', '==', 'pending')
            .where('scheduledFor', '<=', now)
            .get();

        const posts = [];
        snapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                ...doc.data(),
            });
        });

        return posts;
    } catch (error) {
        console.error('❌ Erro ao buscar posts prontos:', error);
        throw error;
    }
}

// Fuso usado nos agendamentos do Upload-Post. A API interpreta o horário de
// scheduled_date como hora local do timezone enviado (o timezone sobrepõe o
// sufixo Z), então o horário precisa ser convertido para o relógio desse fuso.
const UPLOAD_POST_TIMEZONE = process.env.UPLOAD_POST_TIMEZONE || 'America/Sao_Paulo';

function formatDateForUploadPost(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

async function scheduleWithUploadPost({ account, type, mediaUrls, caption, scheduledDate, apiKey, uploadUsername }) {
    if (!scheduledDate) {
        throw new Error('Data de agendamento é obrigatória para o Upload-Post.');
    }

    const localScheduledDate = formatDateForUploadPost(scheduledDate, UPLOAD_POST_TIMEZONE);
    console.log(`📆 Programando post no Upload-Post para ${localScheduledDate} (${UPLOAD_POST_TIMEZONE}) via conta ${uploadUsername}...`);

    const platform = 'instagram';
    const options = {
        scheduledDate: localScheduledDate,
        timezone: UPLOAD_POST_TIMEZONE,
        apiKey
    };

    let response;
    const isStory = isStoryFormat(type);
    const isVideoCarousel = type === 'carousel-html-video' ||
        (mediaUrls?.length > 1 && mediaUrls[0]?.endsWith('.mp4'));

    if (isReelFormat(type) || type === 'video') {
        const videoUrl = mediaUrls[0];
        if (!videoUrl) throw new Error('Vídeo não encontrado para agendamento.');
        response = await uploadVideo(uploadUsername, platform, videoUrl, caption || 'Scheduled Video', caption, options);
    } else if (isVideoCarousel) {
        console.log(`🎬 Agendando video carousel (${mediaUrls.length} clips)...`);
        const sanitizedCaption = caption || '';
        response = await uploadPhotos(uploadUsername, platform, mediaUrls, sanitizedCaption, sanitizedCaption, options);
    } else if (isStory) {
        console.log(`📱 Agendando como Instagram Story...`);
        // Stories have no caption and must be flagged with media_type STORIES
        response = await uploadPhotos(uploadUsername, platform, mediaUrls, '', '', { ...options, mediaType: 'STORIES' });
    } else {
        const sanitizedCaption = caption || '';
        response = await uploadPhotos(uploadUsername, platform, mediaUrls, sanitizedCaption, sanitizedCaption, options);
    }

    const jobId = extractUploadPostJobId(response, platform);

    if (jobId) {
        console.log(`✅ Upload-Post agendamento criado (job ${jobId}) para ${account.username}`);
    } else {
        console.warn('⚠️ Upload-Post não retornou job_id para o agendamento.');
    }

    return {
        jobId,
        payload: {
            provider: 'upload-post',
            scheduledDate: options.scheduledDate,
            response,
        },
    };
}

/**
 * Syncs the status of posts that are scheduled via the external Upload-Post API.
 * This should be called periodically (e.g. by a cron job)
 */
export async function syncScheduledPosts() {
    try {
        console.log('🔄 Sincronizando posts agendados externamente...');
        const [scheduledSnapshot, processingSnapshot] = await Promise.all([
            db.collection('posts')
                .where('status', '==', 'scheduled')
                .limit(20)
                .get(),
            db.collection('posts')
                .where('status', '==', 'processing')
                .limit(20)
                .get()
        ]);

        if (scheduledSnapshot.empty && processingSnapshot.empty) {
            return;
        }

        const postsById = new Map();
        [scheduledSnapshot, processingSnapshot].forEach((snapshot) => {
            snapshot.forEach(doc => {
                const post = { id: doc.id, ...doc.data() };
                if (post.externalScheduler === 'upload-post' && post.externalJobId) {
                    // Removemos o bloqueio de horário porque o provider externo pode
                    // já ter finalizado o job e nós ainda queremos refletir "Postado".
                    postsById.set(post.id, post);
                }
            });
        });

        const postsToCheck = Array.from(postsById.values());

        if (postsToCheck.length === 0) {
            return;
        }

        console.log(`📌 Verificando status de ${postsToCheck.length} post(s) agendado(s)...`);

        const { checkJobStatus } = await import('./uploadPostService.js');

        for (const post of postsToCheck) {
            if (post.externalJobId) {
                let apiKey = null;
                if (post.businessProfileId) {
                    try {
                        const businessProfile = await getBusinessProfile(post.businessProfileId);
                        apiKey = businessProfile?.instagram?.uploadPostApiKey;
                    } catch (e) {
                        console.warn('⚠️ Falha ao buscar apiKey do perfil de negócios', e);
                    }
                }

                const jobStatus = await checkJobStatus(post.externalJobId, apiKey);

                if (jobStatus && (jobStatus.status === 'completed' || (jobStatus.scheduler_status === 'completed' && (jobStatus.status === 'processing' || jobStatus.status === 'queued')))) {
                    console.log(`✅ Post ${post.id} foi publicado externamente com sucesso!`);

                    // Mark as success locally
                    await updatePostStatus(post.id, 'success', null, jobStatus.last_update ? new Date(jobStatus.last_update.$date || jobStatus.last_update) : new Date());

                    // Delete media from storage since it's published
                    if (post.mediaUrls && post.mediaUrls.length > 0) {
                        for (const url of post.mediaUrls) {
                            try {
                                if (url.includes('/o/')) {
                                    const filePath = url.split('/o/')[1]?.split('?')[0];
                                    if (filePath) {
                                        const decodedPath = decodeURIComponent(filePath);
                                        await storage.file(decodedPath).delete();
                                        console.log(`🗑️ Mídia deletada do Storage (Sync): ${decodedPath}`);
                                    }
                                }
                            } catch (e) {
                                console.warn('⚠️ Erro ao deletar mídia no Sync:', e.message);
                            }
                        }
                    }

                } else if (jobStatus && jobStatus.status === 'failed') {
                    console.log(`❌ Post ${post.id} falhou no upload externo.`);
                    await updatePostStatus(post.id, 'error', 'External upload failed.');
                } else if (post.status === 'processing' && isExternalJobScheduled(jobStatus) && isFutureScheduledPost(post)) {
                    console.log(`📆 Post ${post.id} está agendado no Upload-Post. Atualizando status local para scheduled.`);
                    await updatePostStatus(post.id, 'scheduled');
                }
            }
        }
    } catch (error) {
        console.error('❌ Erro na sincronização de posts agendados:', error);
    }
}

function isExternalJobScheduled(jobStatus) {
    if (!jobStatus || jobStatus.success === false) {
        return false;
    }

    const status = String(jobStatus.status || '').toLowerCase();
    const schedulerStatus = String(jobStatus.scheduler_status || '').toLowerCase();
    const scheduledStates = new Set(['scheduled', 'queued', 'pending', 'processing']);

    return scheduledStates.has(status) || scheduledStates.has(schedulerStatus);
}

function isFutureScheduledPost(post) {
    if (!post?.scheduledFor) {
        return false;
    }

    const scheduledFor = post.scheduledFor.toDate ? post.scheduledFor.toDate() : new Date(post.scheduledFor);
    return !Number.isNaN(scheduledFor.getTime()) && scheduledFor > new Date();
}

function extractUploadPostJobId(response, platform) {
    if (!response || typeof response !== 'object') {
        return null;
    }

    if (response.job_id) return response.job_id;
    if (response.request_id) return response.request_id;

    if (response.results) {
        if (response.results.job_id) return response.results.job_id;
        if (platform && response.results[platform]?.job_id) {
            return response.results[platform].job_id;
        }
    }

    return null;
}
