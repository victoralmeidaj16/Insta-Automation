
import { db } from './src/config/firebase.js';

async function updateNutriverseColor() {
    console.log('🔍 Searching for "Nutriverse" profile...');

    try {
        const snapshot = await db.collection('businessProfiles').get();
        let targetProfile = null;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.name && data.name.toLowerCase().includes('nutriverse')) {
                targetProfile = { id: doc.id, ...data };
            }
        });

        if (!targetProfile) {
            console.error('❌ Profile "Nutriverse" not found.');
            process.exit(1);
        }

        console.log(`✅ Found profile: ${targetProfile.name} (${targetProfile.id})`);
        console.log(`🎨 Current Primary Color: ${targetProfile.branding?.primaryColor}`);

        const newColor = '#A6F000'; // Neon Lime

        // Update the document
        await db.collection('businessProfiles').doc(targetProfile.id).update({
            'branding.primaryColor': newColor,
            updatedAt: new Date()
        });

        console.log(`✨ Successfully updated Primary Color to ${newColor}`);
        process.exit(0);

    } catch (error) {
        console.error('❌ Error updating profile:', error);
        process.exit(1);
    }
}

updateNutriverseColor();
