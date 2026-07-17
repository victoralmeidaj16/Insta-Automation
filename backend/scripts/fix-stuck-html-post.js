import { db } from './src/config/firebase.js';

// Post 69q0RvF6AuW1migObeCb is carousel-html stuck in 'scheduled' without externalJobId
// This means the local scheduler will never pick it up (it only looks for 'pending')
// The scheduledFor is 2026-05-08 (already past) - so we mark it pending and the scheduler will execute it

const POST_ID = '69q0RvF6AuW1migObeCb';

const doc = await db.collection('posts').doc(POST_ID).get();
const data = doc.data();
console.log('Current status:', data.status);
console.log('scheduledFor:', data.scheduledFor?.toDate?.() || data.scheduledFor);
console.log('format:', data.format);
console.log('type:', data.type);
console.log('mediaUrls count:', data.mediaUrls?.length || 0);
console.log('htmlContent exists:', !!data.htmlContent);

process.exit(0);
