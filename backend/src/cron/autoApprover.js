import { db } from '../config/firebase.js';
import { approveDraftPost } from '../services/contentGeneratorService.js';
import { scheduleApprovedPost } from '../services/postService.js';
import { getAccountsByProfile, getBusinessProfile } from '../services/businessProfileService.js';
import { normalizeScheduleConfig } from '../utils/scheduleConfig.js';
import { isHtmlFormat } from '../domain/formatRules.js';

// Carrosséis HTML só viram imagem na aprovação (approveDraftPost dispara o
// export), então até lá é normal não terem mídia. Exigir mediaUrls aqui
// bloquearia o formato inteiro.
function hasPublishableContent(draft) {
    if (Array.isArray(draft.mediaUrls) && draft.mediaUrls.filter(Boolean).length > 0) return true;
    if (isHtmlFormat(draft.format || draft.type)) {
        return Boolean(draft.htmlCode || draft.htmlContent);
    }
    return false;
}

/**
 * Script para aprovar automaticamente rascunhos cuja data agendada 
 * está se aproximando e o usuário esqueceu de revisar.
 * Deve ser agendado para rodar a cada hora ou diariamente.
 */
export async function runAutoApprover() {
    console.log('⏰ Verificando rascunhos próximos da hora para auto-aprovação...');

    const now = new Date();

    try {
        const snapshot = await db.collection('posts')
            .where('isDraft', '==', true)
            .where('status', '==', 'draft')
            .get();

        let approvedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        let waitingCount = 0;
        let overdueCount = 0;
        const scheduleCache = new Map();

        for (const doc of snapshot.docs) {
            const draft = doc.data();
            const scheduledFor = draft.scheduledFor?.toDate?.() || new Date(draft.scheduledFor);

            if (!draft.businessProfileId) {
                skippedCount++;
                continue;
            }

            let schedule = scheduleCache.get(draft.businessProfileId);
            if (!schedule) {
                const profile = await getBusinessProfile(draft.businessProfileId);
                schedule = normalizeScheduleConfig(profile.contentSchedule || {});
                scheduleCache.set(draft.businessProfileId, schedule);
            }

            // Opt-in explícito por perfil. Sem a flag, revisão continua exigindo
            // uma ação humana e nada é publicado sozinho.
            if (!schedule.autoApproveFallbackEnabled) {
                skippedCount++;
                continue;
            }

            // Sem mídia nem HTML não há o que publicar; aprovar geraria erro no provedor.
            if (!hasPublishableContent(draft)) {
                console.warn(`⚠️ Rascunho ${doc.id} ignorado: sem mídia e sem HTML.`);
                skippedCount++;
                continue;
            }

            const thresholdDate = new Date(now.getTime() + schedule.autoApproveLeadHours * 60 * 60 * 1000);

            if (isNaN(scheduledFor.getTime())) {
                skippedCount++;
                continue;
            }
            // Conteúdo vencido nunca é autoaprovado; expire-overdue-drafts cuida dele.
            if (scheduledFor <= now) {
                overdueCount++;
                continue;
            }
            if (scheduledFor > thresholdDate) {
                waitingCount++;
                continue;
            }

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
                    failedCount++;
                    continue;
                }

                // Aprovar o rascunho (destination schedule)
                await approveDraftPost(doc.id, accountId, { destination: 'schedule' });

                try {
                    // Disparar agendamento real para o provedor (Upload-Post)
                    await scheduleApprovedPost(doc.id, accountId);
                } catch (scheduleErr) {
                    // approveDraftPost já marcou o post como 'scheduled'. Sem job_id
                    // do provedor ele viraria um zumbi que nenhum sync resolve, então
                    // devolvemos para rascunho e tentamos de novo no próximo tick.
                    await doc.ref.update({
                        isDraft: true,
                        status: 'draft',
                        approvedAt: null,
                        autoApproveError: scheduleErr.message,
                        autoApproveFailedAt: new Date(),
                        updatedAt: new Date()
                    });
                    throw scheduleErr;
                }

                console.log(`✅ Rascunho ${doc.id} auto-aprovado e agendado com sucesso!`);
                approvedCount++;
            } catch (err) {
                console.error(`❌ Erro ao auto-aprovar rascunho ${doc.id}:`, err.message);
                failedCount++;
            }
        }

        console.log(
            `\n🏁 Verificação concluída. ${approvedCount} auto-aprovados; ${failedCount} com falha; `
            + `${waitingCount} aguardando a janela; ${overdueCount} vencidos; ${skippedCount} sem opt-in/inválidos.`
        );

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
