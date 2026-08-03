import fs from 'fs';
import path from 'path';
import { db, storage } from '../src/config/firebase.js';
import { createPost } from '../src/services/postService.js';

const userId = process.env.TARGET_USER_ID;
const accountId = process.env.TARGET_ACCOUNT_ID;
const imagePath = process.argv[2];

if (!userId || !accountId || !imagePath) {
    console.error('Uso: TARGET_USER_ID=... TARGET_ACCOUNT_ID=... node scripts/create-story.js "/caminho/imagem.png"');
    process.exit(1);
}

if (!fs.existsSync(imagePath)) {
    console.error(`Imagem não encontrada: ${imagePath}`);
    process.exit(1);
}

try {
    const account = await db.collection('accounts').doc(accountId).get();
    if (!account.exists || account.data().userId !== userId) {
        throw new Error('A conta informada não pertence ao TARGET_USER_ID.');
    }

    const fileName = `posts/${userId}/${Date.now()}_${path.basename(imagePath)}`;
    await storage.upload(imagePath, {
        destination: fileName,
        metadata: { contentType: 'image/png' },
    });

    const [url] = await storage.file(fileName).getSignedUrl({
        action: 'read',
        expires: '03-01-2500',
    });

    const post = await createPost(userId, accountId, {
        type: 'story',
        format: 'story',
        mediaUrls: [url],
        caption: '',
        scheduledFor: null,
        isDraft: true,
    });

    console.log(`Story criado como rascunho para revisão: ${post.id}`);
    process.exit(0);
} catch (error) {
    console.error('Erro ao criar Story:', error.message);
    process.exit(1);
}
