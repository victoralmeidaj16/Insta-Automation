import { db } from '../config/firebase.js';

const COLLECTION_NAME = 'ai_history';

/**
 * Salva uma geração de IA no histórico do usuário
 * @param {string} userId - ID do usuário
 * @param {Object} generationData - Dados da geração
 * @returns {Promise<Object>} - Documento criado
 */
export async function saveToHistory(userId, generationData) {
    const { mode, prompt, aspectRatio, images, prompts } = generationData;

    if (!userId || !mode || !prompt || !aspectRatio || !images || !Array.isArray(images)) {
        throw new Error('Dados inválidos para salvar no histórico');
    }

    const historyItem = {
        userId,
        mode,
        prompt,
        aspectRatio,
        images,
        prompts: prompts || [],
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
    const { limit = 20, offset = 0, mode, aspectRatio } = options;

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
