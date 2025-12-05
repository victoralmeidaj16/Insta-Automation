import { db } from './src/config/firebase.js';
import { encrypt } from './src/utils/encryption.js';

async function addInstagramAccount() {
    try {
        const userId = 'A9NJto9KIOSgYJg8uRj8u5xAvAg1';
        const username = 'viverpsicologiastreaming';
        const email = 'viver@streaming.com';
        const password = 'Viverstreming2024';
        
        // Criptografar credenciais
        const encryptedEmail = encrypt(email);
        const encryptedPassword = encrypt(password);
        
        const accountData = {
            userId,
            username,
            email: encryptedEmail,
            password: encryptedPassword,
            stayLoggedIn: true,
            status: 'pending',
            lastVerified: null,
            createdAt: new Date(),
        };
        
        const accountRef = await db.collection('accounts').add(accountData);
        
        console.log('✅ Conta Instagram adicionada com sucesso!');
        console.log(`   ID: ${accountRef.id}`);
        console.log(`   Username: @${username}`);
        console.log(`   Status: ${accountData.status}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao adicionar conta:', error);
        process.exit(1);
    }
}

addInstagramAccount();
