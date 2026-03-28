import cron from 'node-cron';
import { getReadyPosts, executePost } from './postService.js';
// import { addToQueue } from '../queues/postQueue.js';

let schedulerStarted = false;
let schedulerTickRunning = false;

/**
 * Inicia o scheduler que verifica posts agendados a cada minuto
 */
export function startScheduler() {
    if (schedulerStarted) {
        console.log('ℹ️ Scheduler já estava iniciado. Ignorando nova inicialização.');
        return;
    }

    schedulerStarted = true;
    console.log('⏰ Scheduler iniciado - verificando posts a cada minuto');

    // Executa a cada minuto
    cron.schedule('* * * * *', async () => {
        if (schedulerTickRunning) {
            console.log('⏳ Scheduler anterior ainda em execução. Pulando este ciclo.');
            return;
        }

        schedulerTickRunning = true;
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

            // Sync posts agendados externamente
            const { syncScheduledPosts } = await import('./postService.js');
            await syncScheduledPosts();

        } catch (error) {
            console.error('❌ Erro no scheduler:', error);
        } finally {
            schedulerTickRunning = false;
        }
    });
}
