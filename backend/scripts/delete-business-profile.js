import { db, storage } from '../src/config/firebase.js';

// Remove um perfil de negócio e tudo que depende dele. `deleteBusinessProfile`
// apaga apenas o documento do perfil e recusa quando há conta vinculada, o que
// deixaria posts e itens de biblioteca órfãos apontando para um perfil
// inexistente.
//
//   node scripts/delete-business-profile.js --profile=<id>                    # dry-run
//   node scripts/delete-business-profile.js --profile=<id> --apply
//   node scripts/delete-business-profile.js --profile=<a> --profile=<b> --apply
//   node scripts/delete-business-profile.js --profile=<id> --keep-media --apply
//
// AÇÃO IRREVERSÍVEL. O dry-run mostra exatamente o que será apagado.

const applyChanges = process.argv.includes('--apply');
const keepMedia = process.argv.includes('--keep-media');
const profileIds = process.argv
    .filter(arg => arg.startsWith('--profile='))
    .map(arg => arg.slice('--profile='.length))
    .filter(Boolean);

if (profileIds.length === 0) {
    console.error('❌ Informe ao menos um --profile=<businessProfileId>.');
    process.exit(1);
}

const OWNED_COLLECTIONS = ['posts', 'library_items', 'accounts', 'generationRuns'];

// As mídias aparecem em dois formatos de URL conforme como foram enviadas.
function storagePathFromUrl(url) {
    if (typeof url !== 'string') return null;
    try {
        const parsed = new URL(url);
        if (parsed.hostname === 'storage.googleapis.com') {
            const [, ...rest] = parsed.pathname.replace(/^\//, '').split('/');
            return rest.length > 0 ? decodeURIComponent(rest.join('/')) : null;
        }
        if (parsed.hostname === 'firebasestorage.googleapis.com') {
            const encoded = parsed.pathname.split('/o/')[1];
            return encoded ? decodeURIComponent(encoded) : null;
        }
    } catch {
        return null;
    }
    return null; // placeholders e imagens externas não pertencem ao nosso bucket
}

async function collectProfile(profileId) {
    const profileDoc = await db.collection('businessProfiles').doc(profileId).get();
    const docsByCollection = {};
    const mediaPaths = new Set();

    for (const collection of OWNED_COLLECTIONS) {
        const snapshot = await db.collection(collection).where('businessProfileId', '==', profileId).get();
        docsByCollection[collection] = snapshot.docs;
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            [...(data.mediaUrls || []), ...(data.sourceMediaUrls || [])].forEach(url => {
                const path = storagePathFromUrl(url);
                if (path) mediaPaths.add(path);
            });
        });
    }

    return {
        profileId,
        exists: profileDoc.exists,
        name: profileDoc.data()?.name || '(perfil não encontrado)',
        docsByCollection,
        mediaPaths: [...mediaPaths],
    };
}

// Guarda: uma mídia referenciada por outro perfil nunca pode ser removida.
async function findSharedMedia(targets) {
    const targetIds = new Set(targets.map(t => t.profileId));
    const owned = new Set(targets.flatMap(t => t.mediaPaths));
    const foreign = new Set();

    for (const collection of ['posts', 'library_items']) {
        const snapshot = await db.collection(collection).get();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (targetIds.has(data.businessProfileId)) return;
            [...(data.mediaUrls || []), ...(data.sourceMediaUrls || [])].forEach(url => {
                const path = storagePathFromUrl(url);
                if (path && owned.has(path)) foreign.add(path);
            });
        });
    }
    return foreign;
}

async function deleteDocs(docs) {
    for (let offset = 0; offset < docs.length; offset += 400) {
        const batch = db.batch();
        docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

async function main() {
    const targets = [];
    for (const profileId of profileIds) targets.push(await collectProfile(profileId));

    const shared = await findSharedMedia(targets);

    console.log(JSON.stringify({
        mode: applyChanges ? 'apply' : 'dry-run',
        perfis: targets.map(t => ({
            nome: t.name,
            id: t.profileId,
            existe: t.exists,
            ...Object.fromEntries(Object.entries(t.docsByCollection).map(([c, d]) => [c, d.length])),
            midias: t.mediaPaths.length,
        })),
        midiasCompartilhadasPreservadas: shared.size,
        midias: keepMedia ? 'preservadas (--keep-media)' : 'serão apagadas do Storage',
    }, null, 2));

    if (!applyChanges) {
        console.log('\nDry-run: nada foi alterado. Repita com --apply.');
        return;
    }

    for (const target of targets) {
        console.log(`\n🗑️  ${target.name} (${target.profileId})`);

        for (const [collection, docs] of Object.entries(target.docsByCollection)) {
            if (docs.length === 0) continue;
            await deleteDocs(docs);
            console.log(`   ${collection}: ${docs.length} documento(s) removido(s)`);
        }

        if (!keepMedia) {
            let removed = 0;
            let missing = 0;
            for (const path of target.mediaPaths) {
                if (shared.has(path)) continue;
                try {
                    await storage.file(path).delete();
                    removed++;
                } catch (error) {
                    if (error.code === 404) missing++;
                    else console.warn(`   ⚠️ Falha ao apagar ${path}: ${error.message}`);
                }
            }
            console.log(`   storage: ${removed} arquivo(s) removido(s)${missing ? `, ${missing} já ausente(s)` : ''}`);
        }

        if (target.exists) {
            await db.collection('businessProfiles').doc(target.profileId).delete();
            console.log('   perfil removido');
        }
    }

    console.log('\n✅ Exclusão concluída.');
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ Falha ao excluir perfil:', error.message);
        process.exit(1);
    });
