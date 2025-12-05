import { db } from './src/config/firebase.js';

async function updatePost() {
    const postId = 'VKz30VDOjr67c5f4TnO1';
    const newUrl = 'https://placehold.co/1080x1920/png';

    try {
        console.log(`🔄 Atualizando post ${postId}...`);

        await db.collection('posts').doc(postId).update({
            mediaUrls: [newUrl],
            status: 'pending', // Resetar status
            errorMessage: null
        });

        console.log('✅ Post atualizado com URL de teste!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

updatePost();
