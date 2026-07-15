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
import autoGenerateRouter from './routes/auto-generate.js';
import videoReelsRouter from './routes/video-reels.js';
import competitorsRouter from './routes/competitors.js';
import { getQueueStats } from './queues/postQueue.js';

dotenv.config();

export function createApp() {
    const app = express();

    app.use(loggingMiddleware);
    app.use(cors({
        origin: function (origin, callback) {
            const allowedOrigins = [
                process.env.FRONTEND_URL || 'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:3002'
            ];

            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                return callback(null, true);
            }

            return callback(null, true);
        },
        credentials: true,
    }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            message: 'Instagram Automation API is running',
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/api/stats', async (req, res) => {
        try {
            const stats = await getQueueStats();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/proxy-download', async (req, res) => {
        const { url, filename } = req.query;

        if (!url) {
            return res.status(400).send('Missing url parameter');
        }

        console.log(`📥 Proxy download request for: ${url}`);

        try {
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`❌ Proxy fetch failed (${response.status} ${response.statusText}) for URL: ${url}`);
                return res.status(response.status).send(`Failed to fetch file: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            console.log(`✅ Proxy fetch success (${contentType}). Sending to client...`);

            let finalFilename = filename || 'download';
            if (!finalFilename.includes('.')) {
                if (contentType.includes('image/jpeg')) finalFilename += '.jpg';
                else if (contentType.includes('image/png')) finalFilename += '.png';
                else if (contentType.includes('video/mp4')) finalFilename += '.mp4';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);

            const arrayBuffer = await response.arrayBuffer();
            res.send(Buffer.from(arrayBuffer));
        } catch (error) {
            console.error('❌ Proxy download exception:', error);
            res.status(500).send('Error downloading file');
        }
    });

    app.get('/api/proxy-image', async (req, res) => {
        const { url } = req.query;
        if (!url) return res.status(400).send('Missing url parameter');

        let fetchUrl = url;
        if (url.startsWith('/')) {
            const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
            fetchUrl = `${baseUrl}${url}`;
        }

        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                return res.status(response.status).send('Failed to fetch image');
            }

            const arrayBuffer = await response.arrayBuffer();
            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(Buffer.from(arrayBuffer));
        } catch (error) {
            console.error('❌ Proxy image exception:', error);
            res.status(500).send('Error fetching proxy image');
        }
    });

    app.use('/api/accounts', authenticate, accountsRouter);
    app.use('/api/posts', authenticate, postsRouter);
    app.use('/api/upload', authenticate, uploadRouter);
    app.use('/api/ai', authenticate, aiRouter);
    app.use('/api/history', authenticate, historyRouter);
    app.use('/api/business-profiles', authenticate, businessProfilesRouter);
    app.use('/api/library', authenticate, libraryRouter);
    app.use('/api/auto-generate', authenticate, autoGenerateRouter);
    app.use('/api/video-reels', authenticate, videoReelsRouter);
    app.use('/api/competitors', authenticate, competitorsRouter);

    app.use((req, res) => {
        res.status(404).json({
            error: 'Rota não encontrada',
        });
    });

    app.use(errorLoggingMiddleware);
    app.use((error, req, res, next) => {
        console.error('❌ Erro não tratado:', error);
        res.status(500).json({
            error: 'Erro interno do servidor',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    });

    return app;
}

export default createApp;
