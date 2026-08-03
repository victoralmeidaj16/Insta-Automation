import crypto from 'crypto';
import express from 'express';
import { dispatchExternalSchedulerTick } from '../services/schedulerService.js';

const router = express.Router();

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function authenticateCron(req, res, next) {
    const expectedUser = process.env.CRON_USERNAME;
    const expectedPassword = process.env.CRON_PASSWORD;
    if (!expectedUser || !expectedPassword) {
        return res.status(503).json({ status: 'error', error: 'Cron externo não configurado.' });
    }

    const match = (req.headers.authorization || '').match(/^Basic\s+(.+)$/i);
    if (!match) return res.status(401).json({ status: 'error', error: 'Autenticação obrigatória.' });

    let decoded = '';
    try {
        decoded = Buffer.from(match[1], 'base64').toString('utf8');
    } catch {
        return res.status(401).json({ status: 'error', error: 'Credencial inválida.' });
    }
    const separator = decoded.indexOf(':');
    const username = separator >= 0 ? decoded.slice(0, separator) : '';
    const password = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPassword)) {
        return res.status(401).json({ status: 'error', error: 'Credencial inválida.' });
    }
    return next();
}

async function tick(req, res) {
    try {
        const result = await dispatchExternalSchedulerTick();
        return res.status(result.accepted ? 202 : 200).json({ status: 'ok', ...result });
    } catch (error) {
        return res.status(500).json({ status: 'error', error: error.message });
    }
}

router.get('/tick', authenticateCron, tick);
router.post('/tick', authenticateCron, tick);

export default router;
