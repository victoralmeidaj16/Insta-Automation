
import { updateBusinessProfile, getBusinessProfile } from './src/services/businessProfileService.js';
import { db } from './src/config/firebase.js';

const profileId = '70jvSL4Trm7zt1ifIs0p';
const newApiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InZpY3Rvci5hbG1laWRhLmplcmVtaWFzQGdtYWlsLmNvbSIsImV4cCI6NDkyNDMzNTU4NiwianRpIjoiOWQ3ZGE1ZTctNDgwMC00YTRjLWE3NDctNmE4YjFmZTRiOGIwIn0.v3BVI4z_9mUMYIPdahXfi_fLw1mLKxnaqfq5OIehyNk';
const username = 'viverpsicologiastreaming';

async function updateKey() {
    console.log(`Updating profile ${profileId}...`);
    try {
        // Fetch current profile to preserve existing data
        const currentProfile = await getBusinessProfile(profileId);

        const currentInstagram = currentProfile.instagram || {};

        const updates = {
            instagram: {
                ...currentInstagram,
                username: username,
                apiKey: newApiKey
            }
        };

        await updateBusinessProfile(profileId, updates);
        console.log('✅ Profile updated successfully with new API Key and Username!');

        // Verify
        const updated = await getBusinessProfile(profileId);
        console.log('Verification:', {
            id: updated.id,
            username: updated.instagram.username,
            apiKeyLength: updated.instagram.apiKey ? updated.instagram.apiKey.length : 0
        });

    } catch (error) {
        console.error('Error updating profile:', error);
    }
}

updateKey();
