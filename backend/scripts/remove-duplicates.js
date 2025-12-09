import { db } from '../src/config/firebase.js';

async function removeDuplicates() {
    console.log('🔍 Buscando contas duplicadas...');

    try {
        const snapshot = await db.collection('accounts').get();
        const accounts = [];

        snapshot.forEach(doc => {
            accounts.push({ id: doc.id, ...doc.data() });
        });

        // Agrupar por username
        const grouped = accounts.reduce((acc, account) => {
            const username = account.username;
            if (!acc[username]) {
                acc[username] = [];
            }
            acc[username].push(account);
            return acc;
        }, {});

        let deletedCount = 0;

        for (const username in grouped) {
            const userAccounts = grouped[username];

            if (userAccounts.length > 1) {
                console.log(`⚠️ Encontradas ${userAccounts.length} contas para @${username}`);

                // Ordenar: manter a que tem status 'active' ou a mais recente
                userAccounts.sort((a, b) => {
                    if (a.status === 'active' && b.status !== 'active') return -1;
                    if (b.status === 'active' && a.status !== 'active') return 1;
                    // Se ambos iguais, manter o mais recente (maior data)
                    return b.createdAt?.toMillis() - a.createdAt?.toMillis();
                });

                // A primeira é a que vamos manter
                const toKeep = userAccounts[0];
                const toDelete = userAccounts.slice(1);

                console.log(`✅ Mantendo conta ID: ${toKeep.id} (Status: ${toKeep.status})`);

                for (const acc of toDelete) {
                    console.log(`🗑️ Deletando duplicata ID: ${acc.id} (Status: ${acc.status})`);
                    await db.collection('accounts').doc(acc.id).delete();
                    deletedCount++;
                }
            }
        }

        if (deletedCount === 0) {
            console.log('✅ Nenhuma duplicata encontrada.');
        } else {
            console.log(`🎉 Removidas ${deletedCount} contas duplicadas.`);
        }

    } catch (error) {
        console.error('❌ Erro ao remover duplicatas:', error);
    } finally {
        process.exit(0);
    }
}

removeDuplicates();
