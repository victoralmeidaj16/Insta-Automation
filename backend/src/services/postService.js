import { db, storage } from '../config/firebase.js';
import { getAccount } from './accountService.js';
import { getAccountsByProfile, getBusinessProfile } from './businessProfileService.js';
import { uploadPhotos, uploadVideo, cancelScheduledPost } from './uploadPostService.js';


/**
 * Cria um novo post (imediato ou agendado)
 */
export async function createPost(userId, accountId, postData) {
    try {
        const {
            type, // 'static', 'carousel', 'video', 'story', 'reel'
            mediaUrls,
            caption,
            scheduledFor, // timestamp ou null para imediato
        } = postData;

        if (!mediaUrls || mediaUrls.length === 0) {
            throw new Error('Nenhuma mídia fornecida para o post.');
        }

        // Get account to extract business profile
        // Logic update: Ensure accountId is valid. If it's a Business Profile ID, resolve to the actual Account ID.
        let resolvedAccountId = accountId;
        let account;
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
                throw error; // Re-throw if no linked account found either
            }
        }

        const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
        if (scheduledDate && isNaN(scheduledDate.getTime())) {
            throw new Error('Data de agendamento inválida');
        }

        let businessProfile = null;
        if (account.businessProfileId) {
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
        const shouldUseUploadPostScheduler = Boolean(scheduledDate);

        let externalScheduleInfo = null;
        if (shouldUseUploadPostScheduler) {
            try {
                externalScheduleInfo = await scheduleWithUploadPost({
                    account,
                    type,
                    mediaUrls,
                    caption,
                    scheduledDate,
                });
            } catch (apiError) {
                console.warn(`⚠️ Falha ao agendar via API externa (fallback para local): ${apiError.message}`);
                // externalScheduleInfo permanece null, o que fará o status ser 'pending' (agendamento local)
            }
        }

        const post = {
            userId,
            accountId: resolvedAccountId,
            businessProfileId: account.businessProfileId || null,
            libraryItemId: postData.libraryItemId || null, // Link to library item
            type,
            mediaUrls,
            caption: caption || '',
            scheduledFor: scheduledDate,
            status: scheduledDate
                ? (externalScheduleInfo ? 'scheduled' : 'pending')
                : 'processing',
            errorMessage: null,
            postedAt: null,
            createdAt: new Date(),
            externalScheduler: externalScheduleInfo ? 'upload-post' : null,
            externalJobId: externalScheduleInfo?.jobId || null,
            externalPayload: externalScheduleInfo?.payload || null,
        };

        const postRef = await db.collection('posts').add(post);

        // If linked to a library item, update its status
        if (postData.libraryItemId) {
            await db.collection('library_items').doc(postData.libraryItemId).update({
                isScheduled: true,
                status: 'scheduled',
                scheduledPostId: postRef.id,
                scheduledFor: post.scheduledFor
            });
            console.log(`🔗 Linked Library Item ${postData.libraryItemId} to Post ${postRef.id}`);
        }

        console.log(`✅ Post criado com ID: ${postRef.id}`);

        return {
            id: postRef.id,
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
        // Start with userId filter only to avoid composite index requirements
        let query = db.collection('posts').where('userId', '==', userId);

        // Apply accountId in Firestore if present (usually safe as a single additional filter)
        if (filters.accountId) {
            query = query.where('accountId', '==', filters.accountId);
        }

        // Fetch the last 100 posts to process in memory
        const snapshot = await query.orderBy('createdAt', 'desc').limit(100).get();

        let posts = [];
        snapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                ...doc.data(),
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
            posts = posts.filter(post => post.type === filters.type);
        }

        // Limit to 50 results
        return posts.slice(0, 50);
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
            ...doc.data(),
        };
    } catch (error) {
        console.error('❌ Erro ao buscar post:', error);
        throw error;
    }
}

/**
 * Atualiza status de um post
 */
export async function updatePostStatus(postId, status, errorMessage = null, postedAt = null) {
    try {
        const updateData = { status };

        if (errorMessage) {
            updateData.errorMessage = errorMessage;
        }
        if (postedAt) {
            updateData.postedAt = postedAt;
        }

        await db.collection('posts').doc(postId).update(updateData);

        console.log(`✅ Post ${postId} atualizado: ${status}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        throw error;
    }
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
            await cancelScheduledPost(post.externalJobId);
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
        const post = await getPost(postId);
        const account = await getAccount(post.accountId);

        if (post.externalScheduler === 'upload-post' && post.externalJobId) {
            console.log(`⏭️ Post ${postId} já está programado no Upload-Post (job ${post.externalJobId}). Ignorando execução local.`);
            return { success: true, message: 'Post scheduled via Upload-Post' };
        }

        // Atualizar status para "processando"
        await updatePostStatus(postId, 'processing');

        // Validar mídias
        if (!post.mediaUrls || post.mediaUrls.length === 0) {
            throw new Error('Post sem mídias para upload.');
        }

        let result;
        const platform = 'instagram'; // Default target platform

        // Executar automação baseado no tipo
        if (post.type === 'video' || post.type === 'reel') {
            // Upload Video/Reel
            const videoUrl = post.mediaUrls[0];
            result = await uploadVideo(account.username, platform, videoUrl, post.caption, post.caption);
        } else {
            // Static, Carousel, Story
            // Upload Photos serves for single image and carousel
            // Note: Story logic might be different in Upload-Post (media_type param?), checking docs...
            // Docs say for Instagram: media_type: "IMAGE" (feed) or "STORIES".
            // However upload_photos endpoint has common params. 
            // We'll stick to feed posts for 'static' and 'carousel'.
            // For 'story', Upload-Post has specific handling? 
            // upload-photo.md: "Instagram... media_type: 'IMAGE' or 'STORIES'"
            // BUT implementation in uploadPostService currently sends default payload.
            // Let's assume standard feed post for now for simplification, or we handle 'story' specifically if critical.
            // Given 'static' and 'carousel' are 99% of use cases here.

            // For now, treat everything as feed upload
            result = await uploadPhotos(account.username, platform, post.mediaUrls, post.caption, post.caption);
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

            // Mark the associated Library Item accordingly
            if (post.libraryItemId) {
                try {
                    await db.collection('library_items').doc(post.libraryItemId).update({
                        isPosted: !isAsync, // Se for síncrono, já foi postado
                        status: isAsync ? 'processing' : 'posted'
                    });
                    console.log(`✅ Library Item ${post.libraryItemId} atualizado (${isAsync ? 'processing' : 'posted'}).`);
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

async function scheduleWithUploadPost({ account, type, mediaUrls, caption, scheduledDate }) {
    if (!scheduledDate) {
        throw new Error('Data de agendamento é obrigatória para o Upload-Post.');
    }

    console.log(`📆 Programando post no Upload-Post para ${scheduledDate.toISOString()}...`);

    const platform = 'instagram';
    const options = {
        scheduledDate: scheduledDate.toISOString(),
    };

    let response;
    if (type === 'video' || type === 'reel') {
        const videoUrl = mediaUrls[0];
        if (!videoUrl) {
            throw new Error('Vídeo não encontrado para agendamento.');
        }
        response = await uploadVideo(
            account.username,
            platform,
            videoUrl,
            caption || 'Scheduled Video',
            caption,
            options
        );
    } else {
        response = await uploadPhotos(
            account.username,
            platform,
            mediaUrls,
            caption || 'Scheduled Post',
            caption,
            options
        );
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
        const now = new Date();
        // Check posts that are 'scheduled' and filter the rest in memory to avoid Firebase Composite Index requirement
        // Using limit(10) to avoid memory overload if there are too many scheduled posts pending sync
        const snapshot = await db.collection('posts')
            .where('status', '==', 'scheduled')
            .limit(20)
            .get();

        if (snapshot.empty) {
            return;
        }

        let postsToCheck = [];

        snapshot.forEach(doc => {
            const post = { id: doc.id, ...doc.data() };
            if (post.externalScheduler === 'upload-post' && post.externalJobId) {
                // Removemos o bloqueio de "scheduledTime <= now" porque se a API
                // externa já tiver processado o post (ou houver bugs de fuso horário),
                // nós ainda queremos atualizar a UI para "Postado".
                postsToCheck.push(post);
            }
        });

        if (postsToCheck.length === 0) {
            return;
        }

        console.log(`📌 Verificando status de ${postsToCheck.length} post(s) agendado(s)...`);

        const { checkJobStatus } = await import('./uploadPostService.js');

        for (const post of postsToCheck) {
            if (post.externalJobId) {
                const jobStatus = await checkJobStatus(post.externalJobId);

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

                    // Update library item if it exists
                    // Fallback: If libraryItemId is missing in the post, try to find it in library_items via scheduledPostId
                    let libraryItemId = post.libraryItemId;
                    if (!libraryItemId) {
                        const libSnapshot = await db.collection('library_items')
                            .where('scheduledPostId', '==', post.id)
                            .limit(1)
                            .get();
                        if (!libSnapshot.empty) {
                            libraryItemId = libSnapshot.docs[0].id;
                            console.log(`🔗 Refeito o link perdido: Post ${post.id} -> Library Item ${libraryItemId}`);
                        }
                    }

                    if (libraryItemId) {
                        try {
                            await db.collection('library_items').doc(libraryItemId).update({
                                isPosted: true,
                                status: 'posted' // Também atualizamos o status string para consistência
                            });
                        } catch (libraryErr) {
                            console.error(`⚠️ Falha ao atualizar Library Item no Sync:`, libraryErr);
                        }
                    }
                } else if (jobStatus && jobStatus.status === 'failed') {
                    console.log(`❌ Post ${post.id} falhou no upload externo.`);
                    await updatePostStatus(post.id, 'error', 'External upload failed.');
                }
            }
        }
    } catch (error) {
        console.error('❌ Erro na sincronização de posts agendados:', error);
    }
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
