import { db } from '../config/firebase.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { login } from '../automation/instagram.js';
// import { deleteCookies } from '../automation/browser.js';

/**
 * Adiciona uma nova conta Instagram
 */
export async function addAccount(userId, username, email, password, stayLoggedIn = true) {
    try {
        // Criptografar credenciais sensíveis
        const encryptedEmail = encrypt(email);
        const encryptedPassword = encrypt(password);

        const accountData = {
            userId,
            username,
            email: encryptedEmail,
            password: encryptedPassword,
            stayLoggedIn,
            status: 'pending', // pending, active, error, blocked
            lastVerified: null,
            createdAt: new Date(),
        };

        const accountRef = await db.collection('accounts').add(accountData);

        console.log(`✅ Conta @${username} adicionada com ID: ${accountRef.id}`);

        return {
            id: accountRef.id,
            ...accountData,
            email: email, // Retornar descriptografado
            password: undefined, // Nunca retornar senha
        };
    } catch (error) {
        console.error('❌ Erro ao adicionar conta:', error);
        throw error;
    }
}

/**
 * Lista todas as contas de um usuário
 */
export async function getAccounts(userId) {
    try {
        const snapshot = await db.collection('accounts')
            .where('userId', '==', userId)
            .get();

        const accounts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            accounts.push({
                id: doc.id,
                userId: data.userId,
                username: data.username,
                email: decrypt(data.email),
                status: data.status,
                stayLoggedIn: data.stayLoggedIn,
                lastVerified: data.lastVerified,
                createdAt: data.createdAt,
            });
        });

        return accounts;
    } catch (error) {
        console.error('❌ Erro ao listar contas:', error);
        throw error;
    }
}

/**
 * Busca uma conta específica
 */
export async function getAccount(accountId) {
    try {
        const doc = await db.collection('accounts').doc(accountId).get();

        if (!doc.exists) {
            throw new Error('Conta não encontrada');
        }

        const data = doc.data();
        return {
            id: doc.id,
            userId: data.userId,
            username: data.username,
            email: decrypt(data.email),
            password: decrypt(data.password),
            sessionState: data.sessionState ? decrypt(data.sessionState) : null, // Descriptografar sessão
            status: data.status,
            stayLoggedIn: data.stayLoggedIn,
            lastVerified: data.lastVerified,
            createdAt: data.createdAt,
        };
    } catch (error) {
        console.error('❌ Erro ao buscar conta:', error);
        throw error;
    }
}

/**
 * Atualiza dados de uma conta
 */
export async function updateAccount(accountId, updates) {
    try {
        const updateData = { ...updates };

        // Criptografar se houver alteração de credenciais
        if (updates.email) {
            updateData.email = encrypt(updates.email);
        }
        if (updates.password) {
            updateData.password = encrypt(updates.password);
        }
        if (updates.sessionState) {
            updateData.sessionState = encrypt(updates.sessionState); // Criptografar sessão
        }

        await db.collection('accounts').doc(accountId).update(updateData);

        console.log(`✅ Conta ${accountId} atualizada`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao atualizar conta:', error);
        throw error;
    }
}

/**
 * Remove uma conta
 */
export async function deleteAccount(accountId) {
    try {
        // Deletar cookies salvos
        // deleteCookies(accountId);

        // Deletar do Firestore
        await db.collection('accounts').doc(accountId).delete();

        console.log(`✅ Conta ${accountId} removida`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao deletar conta:', error);
        throw error;
    }
}

/**
 * Verifica login de uma conta
 */
export async function verifyAccount(accountId) {
    try {
        const account = await getAccount(accountId);

        console.log(`🔍 Verificando login da conta @${account.username}...`);

        const result = await login(
            accountId,
            account.username,
            account.password
        );

        // Atualizar status e salvar sessão
        const updates = {
            status: result.success ? 'active' : 'error',
            lastVerified: new Date(),
        };

        if (result.success && result.sessionState) {
            updates.sessionState = JSON.stringify(result.sessionState); // Salvar estado da sessão
        }

        await updateAccount(accountId, updates);

        return result;
    } catch (error) {
        console.error('❌ Erro ao verificar conta:', error);

        // Marcar como erro
        await updateAccount(accountId, {
            status: 'error',
            lastVerified: new Date(),
        });

        throw error;
    }
}
