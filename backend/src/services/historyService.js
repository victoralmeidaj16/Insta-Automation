import { db, storage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';

const COLLECTION_NAME = 'ai_history';

/**
 * Upload a base64 image to Firebase Storage and return the URL
 * @param {string} imageInput - Base64 string or URL
 * @returns {Promise<string>} - Public URL of the image
 */
import axios from 'axios';

/**
 * Upload a image (base64 or external URL) to Firebase Storage and return the URL
 * @param {string} imageInput - Base64 string or URL
 * @returns {Promise<string>} - Public URL of the image
 */
export async function uploadImage(imageInput) {
    if (!imageInput || typeof imageInput !== 'string') {
        return imageInput;
    }

    // 1. Handle Base64
    if (imageInput.startsWith('data:')) {
        try {
            const matches = imageInput.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                console.warn('Invalid base64 format, returning original input');
                return imageInput;
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            const extension = mimeType.split('/')[1] || 'png';
            const filename = `history/${uuidv4()}.${extension}`;
            const file = storage.file(filename);

            await file.save(buffer, {
                metadata: { contentType: mimeType },
                public: true,
            });

            return `https://storage.googleapis.com/${storage.name}/${filename}`;
        } catch (error) {
            console.error('Error uploading base64 image to storage:', error);
            return imageInput;
        }
    }

    // 2. Handle External URL (e.g. Replicate) - Persist to own storage
    if (imageInput.startsWith('http')) {
        // Skip if already on our storage
        if (imageInput.includes('firebasestorage.googleapis.com') ||
            imageInput.includes('storage.googleapis.com')) {
            return imageInput;
        }

        try {
            console.log('🔄 Persisting external image to Firebase Storage...', imageInput);
            const response = await axios.get(imageInput, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const contentType = response.headers['content-type'] || 'image/png';
            const extension = contentType.split('/')[1] || 'png';
            const filename = `history/${uuidv4()}.${extension}`;
            const file = storage.file(filename);

            await file.save(buffer, {
                metadata: { contentType },
                public: true,
            });

            const newUrl = `https://storage.googleapis.com/${storage.name}/${filename}`;
            console.log('✅ Image persisted:', newUrl);
            return newUrl;
        } catch (error) {
            console.error('⚠️ Error persisting external image (keeping original):', error.message);
            return imageInput;
        }
    }

    return imageInput;
}

/**
 * Salva uma geração de IA no histórico do usuário
 * @param {string} userId - ID do usuário
 * @param {Object} generationData - Dados da geração
 * @returns {Promise<Object>} - Documento criado
 */
export async function saveToHistory(userId, generationData) {
    const { mode, prompt, aspectRatio, images, prompts, businessProfileId, caption } = generationData;

    if (!userId || !mode || !prompt || !aspectRatio || !images || !Array.isArray(images)) {
        throw new Error('Dados inválidos para salvar no histórico');
    }

    // Process images: Upload base64 images to storage
    const processedImages = await Promise.all(images.map(img => uploadImage(img)));

    const historyItem = {
        userId,
        mode,
        prompt,
        aspectRatio,
        images: processedImages,
        prompts: prompts || [],
        businessProfileId: businessProfileId || null,
        caption: caption || '',
        createdAt: new Date(),
    };

    const docRef = await db.collection(COLLECTION_NAME).add(historyItem);

    return {
        id: docRef.id,
        ...historyItem,
    };
}

/**
 * Busca o histórico de gerações de um usuário
 * @param {string} userId - ID do usuário
 * @param {Object} options - Opções de paginação e filtros
 * @returns {Promise<Array>} - Lista de itens do histórico
 */
export async function getHistory(userId, options = {}) {
    const { limit = 20, offset = 0, mode, aspectRatio, businessProfileId } = options;

    let query = db.collection(COLLECTION_NAME)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

    // Aplicar filtros opcionais
    if (mode) {
        query = query.where('mode', '==', mode);
    }
    if (aspectRatio) {
        query = query.where('aspectRatio', '==', aspectRatio);
    }
    if (businessProfileId) {
        query = query.where('businessProfileId', '==', businessProfileId);
    }

    // Aplicar paginação
    query = query.limit(limit).offset(offset);

    const snapshot = await query.get();

    const items = [];
    snapshot.forEach((doc) => {
        items.push({
            id: doc.id,
            ...doc.data(),
        });
    });

    return items;
}

/**
 * Busca um item específico do histórico
 * @param {string} itemId - ID do item
 * @returns {Promise<Object>} - Item do histórico
 */
export async function getHistoryItem(itemId) {
    const doc = await db.collection(COLLECTION_NAME).doc(itemId).get();

    if (!doc.exists) {
        throw new Error('Item do histórico não encontrado');
    }

    return {
        id: doc.id,
        ...doc.data(),
    };
}

/**
 * Remove um item do histórico
 * @param {string} userId - ID do usuário
 * @param {string} itemId - ID do item
 * @returns {Promise<void>}
 */
export async function deleteHistoryItem(userId, itemId) {
    const item = await getHistoryItem(itemId);

    // Verificar se o item pertence ao usuário
    if (item.userId !== userId) {
        throw new Error('Acesso negado');
    }

    await db.collection(COLLECTION_NAME).doc(itemId).delete();
}
