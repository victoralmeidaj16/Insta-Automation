import { db, storage } from './src/config/firebase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createStoryPost() {
    try {
        const userId = 'A9NJto9KIOSgYJg8uRj8u5xAvAg1';
        const accountId = 'GGpUHF7XgkuBOW89C2w8';

        // Caminho da imagem fornecido pelo usuário
        const imagePath = process.argv[2] || '/Users/victoralmeidaj16/Downloads/Falas citaçoes da aula (Post para Instagram..png';

        if (!fs.existsSync(imagePath)) {
            console.error(`❌ Imagem não encontrada no caminho: ${imagePath}`);
            console.log('\nUso: node create-story.js "/caminho/para/imagem.png"');
            process.exit(1);
        }

        console.log(`📸 Fazendo upload da imagem: ${path.basename(imagePath)}...`);

        // Upload para Firebase Storage
        const fileName = `posts/${userId}/${Date.now()}_${path.basename(imagePath)}`;

        await storage.upload(imagePath, {
            destination: fileName,
            metadata: {
                contentType: 'image/png',
            },
        });

        // Gerar URL pública
        const file = storage.file(fileName);
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2500', // URL válida por muito tempo
        });

        console.log('✅ Upload concluído!');
        console.log(`   URL: ${url.substring(0, 50)}...`);

        // Criar post no Firestore
        const postData = {
            userId,
            accountId,
            type: 'story',
            mediaUrls: [url],
            caption: '',
            scheduledFor: null,
            status: 'processing', // Processar imediatamente
            errorMessage: null,
            postedAt: null,
            createdAt: new Date(),
        };

        const postRef = await db.collection('posts').add(postData);

        console.log('\n✅ Post de Story criado com sucesso!');
        console.log(`   Post ID: ${postRef.id}`);
        console.log(`   Conta: @viverpsicologiastreaming`);
        console.log(`   Status: ${postData.status} (será processado automaticamente)`);
        console.log(`\n📝 Acompanhe o processamento na plataforma em http://localhost:3000`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao criar Story:', error);
        process.exit(1);
    }
}

createStoryPost();
