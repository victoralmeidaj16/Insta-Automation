import { IgApiClient } from 'instagram-private-api';
import axios from 'axios';
import fs from 'fs';

/**
 * Faz login no Instagram e retorna o cliente autenticado
 */
async function getIgClient(username, password) {
    const ig = new IgApiClient();
    ig.state.generateDevice(username);

    // Aqui poderíamos carregar o estado salvo (cookies) se existisse
    // Por enquanto, faremos login sempre

    console.log(`🔐 Autenticando @${username}...`);
    await ig.account.login(username, password);
    console.log('✅ Autenticado com sucesso!');

    return ig;
}

/**
 * Faz login no Instagram (apenas verificação)
 */
export async function login(accountId, username, password) {
    try {
        await getIgClient(username, password);
        return { success: true, message: 'Login realizado com sucesso' };
    } catch (error) {
        console.error('❌ Erro no login:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Cria um Story
 */
export async function createStory(username, password, mediaPath) {
    console.log(`📱 Criando Story para @${username}...`);

    try {
        const ig = await getIgClient(username, password);

        console.log('📤 Lendo arquivo de mídia...');
        const imageBuffer = fs.readFileSync(mediaPath);

        console.log('🚀 Publicando Story...');
        const result = await ig.publish.story({
            file: imageBuffer,
        });

        console.log('✅ Story publicado com sucesso!');
        console.log('Media ID:', result.media.id);

        return { success: true, message: 'Story criado com sucesso', mediaId: result.media.id };

    } catch (error) {
        console.error('❌ Erro ao criar story:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Cria um post estático (imagem única)
 */
export async function createStaticPost(username, password, imagePath, caption) {
    console.log(`📸 Criando post estático para @${username}...`);

    try {
        const ig = await getIgClient(username, password);

        console.log('📤 Lendo arquivo de mídia...');
        const imageBuffer = fs.readFileSync(imagePath);

        console.log('🚀 Publicando Post...');
        const result = await ig.publish.photo({
            file: imageBuffer,
            caption: caption,
        });

        console.log('✅ Post publicado com sucesso!');
        return { success: true, message: 'Post criado com sucesso', mediaId: result.media.id };

    } catch (error) {
        console.error('❌ Erro ao criar post:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Cria um carrossel (múltiplas imagens)
 */
export async function createCarousel(username, password, imagePaths, caption) {
    console.log(`🖼️ Criando carrossel para @${username}...`);

    try {
        const ig = await getIgClient(username, password);

        const items = imagePaths.map(path => ({
            file: fs.readFileSync(path),
        }));

        console.log('🚀 Publicando Carrossel...');
        const result = await ig.publish.album({
            items: items,
            caption: caption,
        });

        console.log('✅ Carrossel publicado com sucesso!');
        return { success: true, message: 'Carrossel criado com sucesso', mediaId: result.media.id };

    } catch (error) {
        console.error('❌ Erro ao criar carrossel:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Cria um Reel (vídeo)
 */
export async function createReel(username, password, videoPath, caption) {
    console.log(`🎬 Criando Reel para @${username}...`);

    try {
        const ig = await getIgClient(username, password);

        console.log('📤 Lendo arquivo de vídeo...');
        const videoBuffer = fs.readFileSync(videoPath);

        // Para vídeo, precisamos da capa (cover). 
        // O instagram-private-api pode gerar automaticamente ou podemos passar.
        // Por simplificação, vamos tentar publicar como vídeo normal que vira Reel/Video.

        console.log('🚀 Publicando Vídeo/Reel...');
        const result = await ig.publish.video({
            video: videoBuffer,
            caption: caption,
        });

        console.log('✅ Reel publicado com sucesso!');
        return { success: true, message: 'Reel criado com sucesso', mediaId: result.media.id };

    } catch (error) {
        console.error('❌ Erro ao criar reel:', error);
        return { success: false, message: error.message };
    }
}
