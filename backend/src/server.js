import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authenticate } from './middleware/auth.js';
import { loggingMiddleware, errorLoggingMiddleware } from './middleware/logging.js';
import accountsRouter from './routes/accounts.js';
import postsRouter from './routes/posts.js';
import uploadRouter from './routes/upload.js';
import aiRouter from './routes/ai.js';
import historyRouter from './routes/history.js';
import businessProfilesRouter from './routes/business-profiles.js';
import libraryRouter from './routes/library.js';
import { startScheduler } from './services/schedulerService.js';
import { getQueueStats } from './queues/postQueue.js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(loggingMiddleware); // Add logging middleware first
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Public Proxy Download Route (must be before auth middleware for <a> tags to work)
app.get('/api/proxy-download', async (req, res) => {
    const { url, filename } = req.query;

    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        // Fetch the remote file
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        // Get headers
        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        // Determine filename/extension
        let finalFilename = filename || 'download';
        if (!finalFilename.includes('.')) {
            if (contentType.includes('image/jpeg')) finalFilename += '.jpg';
            else if (contentType.includes('image/png')) finalFilename += '.png';
            else if (contentType.includes('video/mp4')) finalFilename += '.mp4';
        }

        // Set headers to force download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);

        // Stream the response body to the client
        // Node 18+ fetch returns a ReadableStream, we need to convert or attach to res
        // If using 'node-fetch' or native fetch:
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));

    } catch (error) {
        console.error('Proxy download error:', error);
        res.status(500).send('Error downloading file');
    }
});

// Rotas protegidas por autenticação
app.use('/api/accounts', authenticate, accountsRouter);
app.use('/api/posts', authenticate, postsRouter);
app.use('/api/upload', authenticate, uploadRouter);
app.use('/api/ai', authenticate, aiRouter);
app.use('/api/history', authenticate, historyRouter);
app.use('/api/business-profiles', authenticate, businessProfilesRouter);
app.use('/api/library', authenticate, libraryRouter);

// Rota 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Rota não encontrada',
    });
});

// Error handler global
app.use(errorLoggingMiddleware); // Log errors before handling
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
