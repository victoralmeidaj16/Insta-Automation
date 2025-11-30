import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authenticate } from './middleware/auth.js';
import accountsRouter from './routes/accounts.js';
import postsRouter from './routes/posts.js';
import uploadRouter from './routes/upload.js';
import { startScheduler } from './services/schedulerService.js';
import { getQueueStats } from './queues/postQueue.js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rota de health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Instagram Automation API is running',
        timestamp: new Date().toISOString(),
    });
});

// Rota de estatísticas (não requer autenticação para debug)
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getQueueStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rotas protegidas por autenticação
app.use('/api/accounts', authenticate, accountsRouter);
app.use('/api/posts', authenticate, postsRouter);
app.use('/api/upload', authenticate, uploadRouter);

// Rota 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Rota não encontrada',
    });
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('❌ Erro não tratado:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(60) + '\n');

    // Iniciar scheduler para posts agendados
    startScheduler();
    console.log('✅ Scheduler de posts iniciado\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏸️  Encerrando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⏸️  Encerrando servidor...');
    process.exit(0);
});
