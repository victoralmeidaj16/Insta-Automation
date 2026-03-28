
import { getBusinessProfiles } from './src/services/businessProfileService.js';
import { db } from './src/config/firebase.js';

const userId = 'A9NJto9KIOSgYJg8uRj8u5xAvAg1';

async function listProfiles() {
    console.log('Fetching profiles for user:', userId);
    try {
        const profiles = await getBusinessProfiles(userId);
        console.log(`Found ${profiles.length} profiles:`);
        profiles.forEach(p => {
            console.log(`- ID: ${p.id} | Name: "${p.name}" | Instagram: ${p.instagram?.username || 'N/A'}`);
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

listProfiles();
