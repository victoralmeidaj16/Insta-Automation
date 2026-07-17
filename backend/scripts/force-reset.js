import { db } from './src/config/firebase.js';

async function fix() {
  const libSnap = await db.collection('library_items')
    .where('businessProfileId', '==', 'fmCruqm7fnbl4yCwUajY')
    .where('isScheduled', '==', true)
    .get();

  for (const doc of libSnap.docs) {
    await doc.ref.update({ isScheduled: false, status: 'pronto', scheduledPostId: null, scheduledFor: null });
    console.log('Reset', doc.id);
  }
}
fix().then(() => process.exit(0));
