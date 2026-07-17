import { db } from '../src/config/firebase.js';
import { mergeBrandProfileDefaults } from '../src/utils/brandProfiles.js';

const USER_ID = 'A9NJto9KIOSgYJg8uRj8u5xAvAg1';

async function backfillBusinessProfiles() {
    const snapshot = await db.collection('businessProfiles')
        .where('userId', '==', USER_ID)
        .get();

    if (snapshot.empty) {
        console.log('Nenhum perfil encontrado para backfill.');
        return;
    }

    console.log(`Backfill de ${snapshot.size} perfil(is) iniciado.`);

    for (const doc of snapshot.docs) {
        const rawProfile = { id: doc.id, ...doc.data() };
        const mergedProfile = mergeBrandProfileDefaults(rawProfile);
        const now = new Date();

        await db.collection('businessProfiles').doc(doc.id).update({
            brandKey: mergedProfile.brandKey || '',
            brandContext: mergedProfile.brandContext || '',
            contentStrategy: mergedProfile.contentStrategy || '',
            targetAudience: mergedProfile.targetAudience || '',
            productService: mergedProfile.productService || '',
            instagram: mergedProfile.instagram || { username: '', password: '' },
            branding: mergedProfile.branding || {},
            aiPreferences: mergedProfile.aiPreferences || {},
            brandKit: mergedProfile.brandKit || {},
            editorialPillars: mergedProfile.editorialPillars || [],
            contentSchedule: mergedProfile.contentSchedule || {},
            updatedAt: now
        });

        console.log(`✓ ${mergedProfile.name} (${doc.id})`);
    }

    console.log('Backfill concluído.');
}

backfillBusinessProfiles()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Erro no backfill:', error);
        process.exit(1);
    });
