import 'dotenv/config';
import { db } from './src/config/firebase.js';

async function run() {
    console.log('🔄 Sincronizando library_items via mediaUrl...');
    const snapshot = await db.collection('posts')
        .where('status', 'in', ['pending', 'scheduled'])
        .get();
    
    let updatedCount = 0;
    for (const doc of snapshot.docs) {
        const post = doc.data();
        if (post.mediaUrls && post.mediaUrls.length > 0) {
            const mediaUrl = post.mediaUrls[0];
            
            // Procura o library_item que tem essa mesma imagem exata
            const libSnapshot = await db.collection('library_items')
                .where('mediaUrls', 'array-contains', mediaUrl)
                .get();

            if (!libSnapshot.empty) {
                for (const libDoc of libSnapshot.docs) {
                    if (libDoc.data().isScheduled !== true) {
                        await libDoc.ref.update({
                            isScheduled: true,
                            status: 'scheduled',
                            scheduledPostId: doc.id,
                            scheduledFor: post.scheduledFor
                        });
                        console.log(`✅ Library Item ${libDoc.id} atualizado via correspondência de imagem.`);
                        updatedCount++;
                    }
                }
            }
        }
    }
    console.log(`🎉 Finalizado! ${updatedCount} items atualizados.`);
    process.exit(0);
}

run().catch(console.error);
