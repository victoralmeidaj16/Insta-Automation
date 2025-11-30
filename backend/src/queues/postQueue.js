import Queue from 'bull';
import { executePost } from '../services/postService.js';

// Conectar ao Redis
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Criar fila de posts
const postQueue = new Queue('instagram-posts', redisUrl, {
    defaultJobOptions: {
        attempts: 3, // Tentar 3 vezes em caso de falha
        backoff: {
            type: 'exponential',
            delay: 60000, // Esperar 1 minuto entre tentativas
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

/**
 * Processa jobs da fila
 */
postQueue.process(async (job) => {
    const { postId } = job.data;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 Processando job ${job.id} - Post ${postId}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        const result = await executePost(postId);

        if (!result.success) {
            throw new Error(result.message);
        }

        console.log(`\n✅ Job ${job.id} concluído com sucesso!\n`);
        return result;

    } catch (error) {
        console.error(`\n❌ Job ${job.id} falhou:`, error.message, '\n');
        throw error;
    }
});

/**
 * Event listeners
 */
postQueue.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completado`);
});

postQueue.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} falhou após ${job.attemptsMade} tentativas:`, err.message);
});

postQueue.on('stalled', (job) => {
    console.warn(`⚠️ Job ${job.id} travado - reiniciando...`);
});

/**
 * Adiciona um post à fila
 */
export async function addToQueue(postId) {
    const job = await postQueue.add({ postId }, {
        jobId: `post-${postId}`,
    });

    console.log(`✅ Post ${postId} adicionado à fila (Job ${job.id})`);
    return job;
}

/**
 * Remove um post da fila (cancela agendamento)
 */
export async function removeFromQueue(postId) {
    const jobId = `post-${postId}`;
    const job = await postQueue.getJob(jobId);

    if (job) {
        await job.remove();
        console.log(`✅ Job ${jobId} removido da fila`);
        return true;
    }

    return false;
}

/**
 * Retorna estatísticas da fila
 */
export async function getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
        postQueue.getWaitingCount(),
        postQueue.getActiveCount(),
        postQueue.getCompletedCount(),
        postQueue.getFailedCount(),
    ]);

    return {
        waiting,
        active,
        completed,
        failed,
    };
}

export default postQueue;
