import dotenv from 'dotenv';
import { createApp } from './app.js';
import { startScheduler } from './services/schedulerService.js';
dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 3001;

// Iniciar servidor
const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(60) + '\n');

    // Iniciar scheduler para posts agendados
    startScheduler();
    console.log('✅ Scheduler de posts iniciado\n');
});

// Aumenta timeout do servidor para suportar operações longas (ex: Raio-X Profundo com vídeo ~3min)
server.setTimeout(300000); // 5 minutos

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏸️  Encerrando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⏸️  Encerrando servidor...');
    process.exit(0);
});
