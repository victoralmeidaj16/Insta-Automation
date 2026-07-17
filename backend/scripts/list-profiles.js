import { db } from './src/config/firebase.js';

async function listProfiles() {
  try {
    const profilesSnap = await db.collection('business_profiles').get();
    console.log(`Found ${profilesSnap.size} profiles.`);
    profilesSnap.docs.forEach(doc => {
      console.log(doc.id, doc.data().name, doc.data().brandKey);
    });
  } catch (error) {
    console.error('Error fetching profiles:', error);
  }
}
listProfiles().then(() => process.exit(0));
