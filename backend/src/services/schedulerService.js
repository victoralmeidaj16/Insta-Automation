import cron from 'node-cron';
import { getReadyPosts, executePost } from './postService.js';
// import { addToQueue } from '../queues/postQueue.js';

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
                    console.log(`▶️ Executando post ${post.id} diretamente...`);
                    // Executar diretamente (sem fila Redis por enquanto para simplificar deploy)
                    executePost(post.id).catch(err => console.error(`❌ Erro ao executar post ${post.id}:`, err));
                }
            }
        } catch (error) {
            console.error('❌ Erro no scheduler:', error);
        }
    });
}
