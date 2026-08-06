import { listUserProfiles, deleteUserProfile } from '../src/services/uploadPostService.js';

// Remove um perfil da conta Upload-Post. Serviço externo e irreversível: a vaga
// no plano é liberada na hora e a conexão com a rede social se perde.
//
//   node scripts/delete-upload-post-profile.js --username=<perfil>            # dry-run
//   node scripts/delete-upload-post-profile.js --username=<perfil> --apply

const applyChanges = process.argv.includes('--apply');
const usernames = process.argv
    .filter(arg => arg.startsWith('--username='))
    .map(arg => arg.slice('--username='.length))
    .filter(Boolean);

if (usernames.length === 0) {
    console.error('❌ Informe ao menos um --username=<perfil do Upload-Post>.');
    process.exit(1);
}

async function main() {
    const before = await listUserProfiles();
    const existing = new Map(before.map(profile => [profile.username, profile]));

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        perfisNaConta: before.map(p => p.username),
        aExcluir: usernames,
        naoEncontrados: usernames.filter(u => !existing.has(u)),
    }, null, 2));

    for (const username of usernames) {
        const profile = existing.get(username);
        if (!profile) {
            console.log(`\n⏭️  ${username}: não existe na conta, nada a fazer.`);
            continue;
        }
        const instagram = profile.social_accounts?.instagram;
        console.log(`\n${username} | instagram: ${instagram?.handle || '(nenhum)'} | criado em ${profile.created_at}`);
        if (!applyChanges) {
            console.log('   (dry-run) seria excluído');
            continue;
        }
        await deleteUserProfile(username);
    }

    if (!applyChanges) {
        console.log('\nDry-run: nada foi alterado. Repita com --apply.');
        return;
    }

    const after = await listUserProfiles();
    console.log(`\n✅ Perfis restantes (${after.length}): ${after.map(p => p.username).join(', ')}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha:', error.response?.data || error.message);
        process.exit(1);
    });
