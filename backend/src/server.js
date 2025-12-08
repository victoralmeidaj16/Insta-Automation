import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authenticate } from './middleware/auth.js';
import accountsRouter from './routes/accounts.js';
import postsRouter from './routes/posts.js';
import uploadRouter from './routes/upload.js';
import aiRouter from './routes/ai.js';
import historyRouter from './routes/history.js';
import { startScheduler } from './services/schedulerService.js';
import { getQueueStats } from './queues/postQueue.js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002'
        ];
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(null, true); // Permissive for dev, strictly should be error
        }
        return callback(null, true);
    },
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
app.use('/api/ai', authenticate, aiRouter);
app.use('/api/history', authenticate, historyRouter);

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
