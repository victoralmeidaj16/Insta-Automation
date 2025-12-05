// import { auth } from '../config/firebase.js';

/**
 * Middleware de autenticação (DESABILITADO)
 * Hardcodea o userId para permitir acesso sem login
 */
export async function authenticate(req, res, next) {
    try {
        // Hardcodear userId do usuário criado manualmente
        req.userId = 'A9NJto9KIOSgYJg8uRj8u5xAvAg1';
        req.user = {
            uid: 'A9NJto9KIOSgYJg8uRj8u5xAvAg1',
            email: 'admin@instabot.com'
        };

        next();
    } catch (error) {
        console.error('❌ Erro no middleware:', error);
        return res.status(500).json({
            error: 'Erro interno',
        });
    }
}
