import { auth } from '../config/firebase.js';

export const PRIMARY_ADMIN_UID = 'urL2RUboHscN40FGOwXtt0vYfdt1';

function getAllowedUids() {
    const configured = process.env.ALLOWED_USER_UIDS || process.env.AUTHORIZED_USER_UID || PRIMARY_ADMIN_UID;
    return new Set(configured.split(',').map(value => value.trim()).filter(Boolean));
}

export async function authenticate(req, res, next) {
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        return res.status(401).json({ error: 'Token de autenticação obrigatório.' });
    }

    try {
        const decoded = await auth.verifyIdToken(match[1]);
        if (!getAllowedUids().has(decoded.uid)) {
            return res.status(403).json({ error: 'Usuário não autorizado.' });
        }

        req.userId = decoded.uid;
        req.user = decoded;
        return next();
    } catch (error) {
        console.warn('⚠️ Token Firebase rejeitado:', error.code || error.message);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}
