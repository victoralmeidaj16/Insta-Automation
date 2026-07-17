/**
 * Remove instagram.password (texto puro) de todos os documentos businessProfiles.
 * A senha real vive criptografada na collection `accounts` (accountService).
 *
 * Uso: node scripts/strip-profile-passwords.js          (dry-run)
 *      node scripts/strip-profile-passwords.js --apply  (executa)
 */
import 'dotenv/config';
import { db } from '../src/config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');

async function run() {
    const snapshot = await db.collection('businessProfiles').get();
    let found = 0;

    for (const doc of snapshot.docs) {
        const instagram = doc.data().instagram;
        if (instagram && typeof instagram.password === 'string' && instagram.password.length > 0) {
            found++;
            console.log(`${apply ? '🧹 Limpando' : '🔍 Encontrado (dry-run)'}: ${doc.id} (${doc.data().name || 'sem nome'})`);
            if (apply) {
                await doc.ref.update({ 'instagram.password': FieldValue.delete() });
            }
        }
    }

    console.log(`\n${found} perfil(is) com senha em texto puro${apply ? ' — limpos.' : '. Rode com --apply para limpar.'}`);
    process.exit(0);
}

run().catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
