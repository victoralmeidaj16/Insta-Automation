import dotenv from 'dotenv';
import { addAccount } from '../src/services/accountService.js';

dotenv.config();

const required = {
    TARGET_USER_ID: process.env.TARGET_USER_ID,
    ACCOUNT_USERNAME: process.env.ACCOUNT_USERNAME,
    ACCOUNT_PASSWORD: process.env.ACCOUNT_PASSWORD,
};

const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missing.length > 0) {
    console.error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);
    console.error('Use variáveis de ambiente; nunca grave credenciais neste arquivo ou passe senhas pela linha de comando.');
    process.exit(1);
}

try {
    const account = await addAccount(
        required.TARGET_USER_ID,
        required.ACCOUNT_USERNAME,
        process.env.ACCOUNT_EMAIL || null,
        required.ACCOUNT_PASSWORD,
        true,
        process.env.ACCOUNT_BUSINESS_PROFILE_ID || null,
    );
    console.log(`Conta @${account.username} criada com ID ${account.id}.`);
    process.exit(0);
} catch (error) {
    console.error('Erro ao adicionar conta:', error.message);
    process.exit(1);
}
