import { db } from './src/config/firebase.js';

async function checkPosts() {
    try {
        const postsSnap = await db.collection('posts').get();
        console.log(`Checking ${postsSnap.size} posts for any scheduled today...`);

        let docs = [];
        postsSnap.forEach(doc => {
            const data = doc.data();
            let scheduledStr = '';
            if (data.scheduledFor && data.scheduledFor._seconds) {
                scheduledStr = new Date(data.scheduledFor._seconds * 1000).toISOString();
            } else if (data.externalPayload && data.externalPayload.scheduledDate) {
                scheduledStr = data.externalPayload.scheduledDate;
            }

            if (scheduledStr.includes("2026-03-04") || scheduledStr.includes("04/03/2026")) {
                console.log(`------------- MATCH FOUND -------------`);
                console.log(`Post ID: ${doc.id}`);
                console.log(`Profile/Account ID: ${data.profileId || data.accountId}`);
                console.log(`Status: ${data.status}`);
                console.log(`Scheduled: ${scheduledStr}`);
                console.log(`Caption: ${data.caption ? data.caption.substring(0, 50) + '...' : 'None'}`);
            }
        });

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

checkPosts().then(() => process.exit(0)).catch(() => process.exit(1));
