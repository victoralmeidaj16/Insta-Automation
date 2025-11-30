import cron from 'node-cron';
import { getReadyPosts } from './postService.js';
import { addToQueue } from '../queues/postQueue.js';

/**
 * Inicia o scheduler que verifica posts agendados a cada minuto
 */
export function startScheduler() {
    console.log('⏰ Scheduler iniciado - verificando posts a cada minuto');

    // Executa a cada minuto
    cron.schedule('* * * * *', async () => {
        try {
            const readyPosts = await getReadyPosts();

            if (readyPosts.length > 0) {
                console.log(`📅 ${readyPosts.length} post(s) pronto(s) para execução`);

                for (const post of readyPosts) {
                    console.log(`➕ Adicionando post ${post.id} à fila`);
                    await addToQueue(post.id);
                }
            }
        } catch (error) {
            console.error('❌ Erro no scheduler:', error);
        }
    });
}
