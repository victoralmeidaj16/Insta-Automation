import { db, storage } from '../config/firebase.js';
import axios from 'axios';
import { getAccount, updateAccount } from './accountService.js';
import {
    createStaticPost,
    createCarousel,
    createReel,
    createStory,
} from '../automation/instagram.js';
import fs from 'fs';
import path from 'path';

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

        const post = {
            userId,
            accountId,
            type,
            mediaUrls,
            caption: caption || '',
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            status: scheduledFor ? 'pending' : 'processing',
            errorMessage: null,
            postedAt: null,
            createdAt: new Date(),
        };

        const postRef = await db.collection('posts').add(post);

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
        let query = db.collection('posts').where('userId', '==', userId);

        // Aplicar filtros
        if (filters.accountId) {
            query = query.where('accountId', '==', filters.accountId);
        }
        if (filters.status) {
            query = query.where('status', '==', filters.status);
        }
        if (filters.type) {
            query = query.where('type', '==', filters.type);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').limit(50).get();

        const posts = [];
        snapshot.forEach(doc => {
            posts.push({
                id: doc.id,
                ...doc.data(),
            });
        });

        return posts;
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

        console.log(`✅ Post ${postId} deletado`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao deletar post:', error);
        throw error;
    }
}

/**
 * Executa um post (faz o upload no Instagram)
 */
export async function executePost(postId) {
    console.log(`🚀 Executando post ${postId}...`);

    try {
        const post = await getPost(postId);
        const account = await getAccount(post.accountId);

        // Atualizar status para "processando"
        await updatePostStatus(postId, 'processing');

        // Baixar mídias do Firebase Storage temporariamente
        const localMediaPaths = [];
        const tempDir = path.join(process.cwd(), 'uploads', postId);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }



        // ... (imports)

        // ... (inside executePost)

        for (let i = 0; i < post.mediaUrls.length; i++) {
            const url = post.mediaUrls[i];
            const ext = url.includes('.mp4') ? 'mp4' : 'jpg';
            const localPath = path.join(tempDir, `media_${i}.${ext}`);

            if (url.includes('firebasestorage')) {
                // Baixar do Firebase Storage
                const filePath = url.split('/o/')[1]?.split('?')[0];
                if (filePath) {
                    const decodedPath = decodeURIComponent(filePath);
                    await storage.file(decodedPath).download({ destination: localPath });
                    localMediaPaths.push(localPath);
                }
            } else {
                // Baixar URL genérica
                const response = await axios({
                    url,
                    responseType: 'stream',
                });

                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                localMediaPaths.push(localPath);
            }
        }

        // Executar automação baseado no tipo
        let result;

        switch (post.type) {
            case 'static':
                result = await createStaticPost(account.username, account.password, localMediaPaths[0], post.caption, account.sessionState);
                break;

            case 'carousel':
                result = await createCarousel(account.username, account.password, localMediaPaths, post.caption, account.sessionState);
                break;

            case 'video':
            case 'reel':
                result = await createReel(account.username, account.password, localMediaPaths[0], post.caption, account.sessionState);
                break;

            case 'story':
                result = await createStory(account.username, account.password, localMediaPaths[0], account.sessionState);
                break;

            default:
                throw new Error(`Tipo de post inválido: ${post.type}`);
        }

        // Limpar arquivos temporários
        fs.rmSync(tempDir, { recursive: true, force: true });

        // Atualizar status
        if (result.success) {
            await updatePostStatus(postId, 'success', null, new Date());

            // Atualizar sessão da conta se houver
            if (result.sessionState) {
                await updateAccount(account.id, {
                    sessionState: JSON.stringify(result.sessionState),
                    lastVerified: new Date(),
                });
                console.log('🔄 Sessão da conta atualizada');
            }

            // Deletar mídias do Storage após sucesso (economia de espaço)
            for (const url of post.mediaUrls) {
                try {
                    const filePath = url.split('/o/')[1]?.split('?')[0];
                    if (filePath) {
                        const decodedPath = decodeURIComponent(filePath);
                        await storage.file(decodedPath).delete();
                        console.log(`🗑️ Mídia deletada do Storage: ${decodedPath}`);
                    }
                } catch (e) {
                    console.warn('⚠️ Erro ao deletar mídia:', e.message);
                }
            }
        } else {
            await updatePostStatus(postId, 'error', result.message);
        }

        return result;

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
