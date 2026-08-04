import { db } from '../src/config/firebase.js';
import { mergeBrandProfileDefaults } from '../src/utils/brandProfiles.js';

const USER_ID = process.env.TARGET_USER_ID;
const applyChanges = process.argv.includes('--apply');

async function backfillBusinessProfiles() {
    if (!USER_ID) {
        throw new Error('Defina TARGET_USER_ID. O script não usa mais UIDs fixos.');
    }

    const snapshot = await db.collection('businessProfiles')
        .where('userId', '==', USER_ID)
        .get();

    if (snapshot.empty) {
        console.log('Nenhum perfil encontrado para backfill.');
        return;
    }

    console.log(`${applyChanges ? 'Backfill' : 'Dry-run'} de ${snapshot.size} perfil(is) iniciado.`);

    for (const doc of snapshot.docs) {
        const rawProfile = { id: doc.id, ...doc.data() };
        const mergedProfile = mergeBrandProfileDefaults(rawProfile);
        const now = new Date();

        const { password: _legacyPassword, ...safeInstagram } = mergedProfile.instagram || {};
        const updates = {
            brandKey: mergedProfile.brandKey || '',
            brandContext: mergedProfile.brandContext || '',
            contentStrategy: mergedProfile.contentStrategy || '',
            targetAudience: mergedProfile.targetAudience || '',
            productService: mergedProfile.productService || '',
            instagram: safeInstagram,
            branding: mergedProfile.branding || {},
            aiPreferences: mergedProfile.aiPreferences || {},
            brandKit: mergedProfile.brandKit || {},
            editorialPillars: mergedProfile.editorialPillars || [],
            contentSchedule: mergedProfile.contentSchedule || {},
            updatedAt: now
        };

        if (applyChanges) {
            await db.collection('businessProfiles').doc(doc.id).update(updates);
        }

        console.log(`✓ ${mergedProfile.name} (${doc.id})`);
    }

    console.log(applyChanges ? 'Backfill concluído.' : 'Dry-run concluído. Use --apply para persistir.');
}

backfillBusinessProfiles()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Erro no backfill:', error);
        process.exit(1);
    });
