import { db } from '../src/config/firebase.js';

async function backfillIsPosted() {
    console.log('🔄 Iniciando backfill: adicionando isPosted aos itens da biblioteca...');

    try {
        let batch = db.batch();
        let count = 0;
        let totalCount = 0;

        // Buscamos todos os itens da biblioteca
        const snapshot = await db.collection('library_items').get();
        console.log(`Encontrados ${snapshot.size} itens na biblioteca.`);

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Se o campo isPosted não existir (strict undefined)
            if (data.isPosted === undefined) {
                // Inferimos do status atual se já é sabido que foi postado
                const shouldBePosted = data.status === 'posted';
                
                batch.update(doc.ref, { 
                    isPosted: shouldBePosted 
                });
                
                count++;
                totalCount++;

                // Commit em lotes de 400 (limite do Firestore é 500)
                if (count >= 400) {
                    await batch.commit();
                    console.log(`✅ Lote de ${count} itens atualizado.`);
                    batch = db.batch(); // Inicia novo lote
                    count = 0;
                }
            }
        }

        // Commitar os itens restantes
        if (count > 0) {
            await batch.commit();
            console.log(`✅ Lote final de ${count} itens atualizado.`);
        }

        console.log(`🎉 Backfill concluído! Total de itens corrigidos: ${totalCount}`);

    } catch (error) {
        console.error('❌ Erro durante o backfill:', error);
    } finally {
        process.exit();
    }
}

backfillIsPosted();
