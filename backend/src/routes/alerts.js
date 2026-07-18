import express from 'express';
import { getOperationalAlerts } from '../services/operationalAlertsService.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const alerts = await getOperationalAlerts(req.userId, req.query.profileId || null);
        res.json({ alerts, checkedAt: new Date() });
    } catch (error) {
        console.error('Erro ao carregar alertas operacionais:', error);
        res.status(500).json({ error: 'Não foi possível carregar os alertas operacionais.' });
    }
});

export default router;
