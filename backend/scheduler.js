import { getReadyPosts, executePost } from './src/services/postService.js';

console.log('⏰ Iniciando agendador de posts (InstaBot Worker)...');

async function checkPosts() {
    try {
        const now = new Date();
        console.log(`\n🔍 [${now.toLocaleTimeString()}] Verificando posts agendados...`);

        const posts = await getReadyPosts();

        if (posts.length === 0) {
            // console.log('zzZ Nenhum post para agora.');
            return;
        }

        console.log(`⚡ Encontrados ${posts.length} posts para publicar!`);

        for (const post of posts) {
            console.log(`▶️ Iniciando post ${post.id} (Agendado para: ${post.scheduledFor.toDate().toLocaleString()})`);
            await executePost(post.id);
        }

    } catch (error) {
        console.error('❌ Erro no agendador:', error);
    }
}

// Executar imediatamente ao iniciar
checkPosts();

// Executar a cada 60 segundos
setInterval(checkPosts, 60 * 1000);
