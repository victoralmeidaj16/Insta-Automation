import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key-change-this';

/**
 * Criptografa texto sensível (credenciais)
 */
export function encrypt(text) {
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

/**
 * Descriptografa texto
 */
export function decrypt(encryptedText) {
    const bytes = CryptoJS.AES.decrypt(encryptedText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}
