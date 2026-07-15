import { db } from '../config/firebase.js';
import { generateWeeklyPlan } from '../services/contentGeneratorService.js';

/**
 * Script para gerar toda a semana de conteúdo automaticamente.
 * Deve ser agendado para rodar toda Sexta-feira ou Domingo via Render Cron Job.
 */
export async function runWeeklyGeneration() {
    console.log('⏳ Iniciando geração semanal automática de posts...');
    
    // Obter todos os perfis ativos
    const snapshot = await db.collection('businessProfiles').get();
    const profiles = snapshot.docs;
    
    console.log(`Encontrados ${profiles.length} perfis para processar.`);

    // Calcular data da próxima semana (Segunda-feira)
    const today = new Date();
    const nextWeekStart = new Date(today);
    nextWeekStart.setDate(today.getDate() + (7 - today.getDay()) % 7 + 1);
    nextWeekStart.setHours(0, 0, 0, 0);

    for (const doc of profiles) {
        const profileId = doc.id;
        console.log(`\n🚀 Gerando plano automático para: ${doc.data().name || profileId}`);
        
        try {
            // Chama o pipeline principal sem um plano customizado (usa o padrão do perfil)
            const result = await generateWeeklyPlan(profileId, nextWeekStart);
            console.log(`✅ Sucesso para ${doc.data().name}: ${result.generated} posts gerados em rascunho.`);
        } catch (error) {
            console.error(`❌ Erro ao gerar para ${doc.data().name}: ${error.message}`);
        }
    }
    
    console.log('\n🏁 Geração semanal automática concluída!');
}

// Executa se rodado diretamente (Render Cron)
if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1]?.endsWith('weeklyGenerator.js')) {
    runWeeklyGeneration().then(() => process.exit(0)).catch(err => {
        console.error('Falha crítica no cron:', err);
        process.exit(1);
    });
}
