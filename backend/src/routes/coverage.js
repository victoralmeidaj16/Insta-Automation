import express from 'express';
import { getContentCoverage } from '../services/contentCoverageService.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const coverage = await getContentCoverage(req.userId, req.query.profileId || null);
        res.json({ coverage, checkedAt: new Date() });
    } catch (error) {
        console.error('Erro ao calcular a cobertura de conteúdo:', error);
        res.status(500).json({ error: 'Não foi possível calcular a cobertura de conteúdo.' });
    }
});

export default router;
