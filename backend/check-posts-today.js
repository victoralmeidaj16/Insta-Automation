import { db } from './src/config/firebase.js';

async function checkPosts() {
    try {
        console.log('Fetching all posts...');
        const postsSnap = await db.collection('posts').get();

        postsSnap.forEach(doc => {
            const data = doc.data();
            let scheduled = 'None';
            if (data.scheduledAt) {
                scheduled = data.scheduledAt.toDate ? data.scheduledAt.toDate().toISOString() : data.scheduledAt;
            } else if (data.date) {
                scheduled = data.date;
            }

            const isToday = String(scheduled).includes('2026-03-04') || String(scheduled).includes('04/03/2026') || String(scheduled).includes('03-04');

            if (isToday) {
                console.log(`--------------------------------------------------`);
                console.log(`Post ID: ${doc.id}`);
                console.log(`Status: ${data.status}`);
                console.log(`Scheduled At: ${scheduled}`);
                console.log(`Account/Profile: ${data.accountId || data.profileId}`);
                console.log(`Type: ${data.type}`);
                console.log(`Error: ${data.error || 'None'}`);
                console.log(`Caption: ${data.caption ? data.caption.substring(0, 50) + '...' : 'None'}`);
            }
        });

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

checkPosts().then(() => process.exit(0)).catch(() => process.exit(1));
