// import Queue from 'bull';
import { executePost } from '../services/postService.js';

// Conectar ao Redis
// const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Criar fila de posts
// const postQueue = new Queue('instagram-posts', redisUrl, { ... });

/**
 * Processa jobs da fila
 */
/*
postQueue.process(async (job) => {
    // ...
});
*/

/**
 * Adiciona um post à fila
 */
export async function addToQueue(postId) {
    console.log(`⚠️ Fila desativada. Post ${postId} não adicionado ao Redis.`);
    // Em modo sem Redis, o post deve ser executado diretamente pelo caller
    return { id: 'mock-job-id' };
}

/**
 * Remove um post da fila (cancela agendamento)
 */
export async function removeFromQueue(postId) {
    console.log(`⚠️ Fila desativada. Post ${postId} não removido do Redis.`);
    return true;
}

/**
 * Retorna estatísticas da fila
 */
export async function getQueueStats() {
    return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        message: 'Fila Redis desativada (Modo Serverless)'
    };
}

// export default postQueue;
export default {};
