import { executePost } from './src/services/postService.js';

async function processStory() {
    try {
        const postId = 'VKz30VDOjr67c5f4TnO1';

        console.log(`🚀 Processando Story manualmente: ${postId}...\n`);

        const result = await executePost(postId);

        if (result.success) {
            console.log('\n✅ Story publicado com sucesso no Instagram!');
        } else {
            console.log(`\n❌ Falha ao publicar: ${result.message}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Erro ao processar Story:', error.message);
        process.exit(1);
    }
}

processStory();
