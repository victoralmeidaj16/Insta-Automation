import { db } from '../src/config/firebase.js';

// Liga/desliga a rede de segurança que aprova e agenda sozinho os rascunhos que
// ninguém revisou dentro da janela configurada. Sem esta flag o perfil continua
// exigindo aprovação humana e o conteúdo expira ao passar do horário.
//
//   node scripts/set-auto-approve-fallback.js --profile=<id>            # dry-run
//   node scripts/set-auto-approve-fallback.js --profile=<id> --apply
//   node scripts/set-auto-approve-fallback.js --profile=<id> --off --apply
//   node scripts/set-auto-approve-fallback.js --profile=<id> --lead-hours=48 --apply

const applyChanges = process.argv.includes('--apply');
const enable = !process.argv.includes('--off');
const profileArg = process.argv.find(arg => arg.startsWith('--profile='));
const leadArg = process.argv.find(arg => arg.startsWith('--lead-hours='));
const profileId = profileArg?.slice('--profile='.length) || null;
const leadHours = leadArg ? Number(leadArg.slice('--lead-hours='.length)) : null;

if (!profileId) {
    console.error('❌ Informe --profile=<businessProfileId>. Use scripts/list-profiles.js para descobrir os ids.');
    process.exit(1);
}

if (leadHours !== null && (!Number.isFinite(leadHours) || leadHours <= 0 || leadHours > 168)) {
    console.error('❌ --lead-hours deve ser um número entre 1 e 168.');
    process.exit(1);
}

async function main() {
    const ref = db.collection('businessProfiles').doc(profileId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
        throw new Error(`Perfil ${profileId} não encontrado.`);
    }

    const profile = snapshot.data();
    const schedule = profile.contentSchedule || {};

    const updates = {
        'contentSchedule.autoApproveFallbackEnabled': enable,
        updatedAt: new Date()
    };
    if (leadHours !== null) {
        updates['contentSchedule.autoApproveLeadHours'] = leadHours;
    }

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        perfil: profile.name,
        profileId,
        antes: {
            autoApproveFallbackEnabled: schedule.autoApproveFallbackEnabled ?? false,
            autoApproveLeadHours: schedule.autoApproveLeadHours ?? 24
        },
        depois: {
            autoApproveFallbackEnabled: enable,
            autoApproveLeadHours: leadHours ?? schedule.autoApproveLeadHours ?? 24
        }
    }, null, 2));

    if (!applyChanges) return;

    await ref.update(updates);
    console.log(`✅ Rede de segurança ${enable ? 'ATIVADA' : 'desativada'} para "${profile.name}".`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao atualizar o perfil:', error.message);
        process.exit(1);
    });
