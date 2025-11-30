import { auth } from '../config/firebase.js';

/**
 * Middleware de autenticação
 * Verifica o token JWT do Firebase Auth
 */
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Token de autenticação não fornecido',
            });
        }

        const token = authHeader.split('Bearer ')[1];

        // Verificar token com Firebase
        const decodedToken = await auth.verifyIdToken(token);

        // Adicionar userId ao request
        req.userId = decodedToken.uid;
        req.user = decodedToken;

        next();
    } catch (error) {
        console.error('❌ Erro na autenticação:', error);
        return res.status(401).json({
            error: 'Token inválido ou expirado',
        });
    }
}
