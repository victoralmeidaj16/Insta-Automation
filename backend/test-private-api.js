import 'dotenv/config';
import { IgApiClient } from 'instagram-private-api';
import axios from 'axios';

const ig = new IgApiClient();

async function postStory() {
    const username = 'viverpsicologiastreaming';
    const password = 'Viverstreming2024';
    const imageUrl = 'https://placehold.co/1080x1920/png';

    console.log(`🔐 Tentando login com @${username}...`);

    ig.state.generateDevice(username);

    try {
        await ig.account.login(username, password);
        console.log('✅ Login realizado com sucesso!');

        console.log('📥 Baixando imagem...');
        const imageBuffer = (await axios({
            url: imageUrl,
            responseType: 'arraybuffer'
        })).data;

        console.log('📤 Publicando Story...');
        const result = await ig.publish.story({
            file: imageBuffer,
        });

        console.log('✅ Story publicado com sucesso!');
        console.log('Media ID:', result.media.id);
        console.log('Status:', result.status);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        if (error.response) {
            console.error('Detalhes:', JSON.stringify(error.response.body, null, 2));
        }
    }
}

postStory();
