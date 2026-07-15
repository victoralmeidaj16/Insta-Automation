import { db } from '../config/firebase.js';
import { approveDraftPost } from '../services/contentGeneratorService.js';
import { scheduleApprovedPost } from '../services/postService.js';
import { getAccountsByProfile } from '../services/contentGeneratorService.js';

/**
 * Script para aprovar automaticamente rascunhos cuja data agendada 
 * está se aproximando e o usuário esqueceu de revisar.
 * Deve ser agendado para rodar a cada hora ou diariamente.
 */
export async function runAutoApprover() {
    console.log('⏰ Verificando rascunhos próximos da hora para auto-aprovação...');

    // Vamos aprovar posts rascunho que estão programados para as próximas 24 horas
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Daqui a 24h

    try {
        const snapshot = await db.collection('posts')
            .where('isDraft', '==', true)
            .where('status', '==', 'draft')
            .get();

        let approvedCount = 0;

        for (const doc of snapshot.docs) {
            const draft = doc.data();
            const scheduledFor = draft.scheduledFor?.toDate?.() || new Date(draft.scheduledFor);

            if (!isNaN(scheduledFor.getTime()) && scheduledFor <= thresholdDate) {
                console.log(`\n⏳ Auto-aprovando rascunho ${doc.id} ("${draft.pillarName}") agendado para ${scheduledFor.toLocaleString('pt-BR')}...`);
                
                try {
                    // Descobrir a conta do Instagram para este perfil
                    let accountId = draft.accountId;
                    if (!accountId && draft.businessProfileId) {
                        const accounts = await getAccountsByProfile(draft.businessProfileId);
                        if (accounts && accounts.length > 0) {
                            accountId = accounts[0].id;
                        } else {
                            // Fallback para usar o próprio businessProfileId como conta virtual (suportado por scheduleApprovedPost)
                            accountId = draft.businessProfileId;
                        }
                    }

                    if (!accountId) {
                        console.error(`❌ Não foi possível auto-aprovar ${doc.id}: Nenhuma conta ou perfil de negócios vinculado.`);
                        continue;
                    }

                    // Aprovar o rascunho (destination schedule)
                    await approveDraftPost(doc.id, accountId, { destination: 'schedule' });
                    
                    // Disparar agendamento real para o provedor (Upload-Post)
                    await scheduleApprovedPost(doc.id, accountId);

                    console.log(`✅ Rascunho ${doc.id} auto-aprovado e agendado com sucesso!`);
                    approvedCount++;
                } catch (err) {
                    console.error(`❌ Erro ao auto-aprovar rascunho ${doc.id}:`, err.message);
                }
            }
        }

        console.log(`\n🏁 Verificação concluída. ${approvedCount} posts foram auto-aprovados.`);

    } catch (error) {
        console.error('❌ Falha geral no autoApprover:', error);
    }
}

// Executa se rodado diretamente
if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1]?.endsWith('autoApprover.js')) {
    runAutoApprover().then(() => process.exit(0)).catch(err => {
        console.error('Falha crítica no cron:', err);
        process.exit(1);
    });
}
