import { db } from './src/config/firebase.js';

async function checkPosts() {
    try {
        console.log('Fetching all profiles to find "inner boost"...');
        const profilesSnap = await db.collection('businessProfiles').get();
        let innerBoostProfileId = null;
        profilesSnap.forEach(doc => {
            const data = doc.data();
            if (data.name && data.name.toLowerCase().includes('inner boost')) {
                innerBoostProfileId = doc.id;
                console.log(`Found "inner boost" profile: ${doc.id} - ${data.name}`);
            }
        });

        console.log('\nFetching posts containing "inner boost"...');
        const postsSnap = await db.collection('posts').get();
        let foundPosts = [];

        postsSnap.forEach(doc => {
            const data = doc.data();

            const isInnerBoost = (innerBoostProfileId && (data.profileId === innerBoostProfileId || data.accountId === innerBoostProfileId)) ||
                (data.username && data.username.toLowerCase().includes('inner boost'));

            if (isInnerBoost) {
                foundPosts.push({ id: doc.id, ...data });
            }
        });

        console.log(`Found ${foundPosts.length} related posts for Inner Boost.`);
        foundPosts.forEach(post => {
            let scheduled = 'None';
            if (post.scheduledAt) {
                scheduled = post.scheduledAt.toDate ? post.scheduledAt.toDate().toISOString() : post.scheduledAt;
            }

            console.log(`--------------------------------------------------`);
            console.log(`Post ID: ${post.id}`);
            console.log(`Status: ${post.status}`);
            console.log(`Scheduled At: ${scheduled}`);
            console.log(`Account/Profile: ${post.accountId || post.profileId}`);
            console.log(`Error: ${post.error || 'None'}`);
            console.log(`Caption: ${post.caption ? post.caption.substring(0, 50) + '...' : 'None'}`);
        });

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

checkPosts().then(() => process.exit(0)).catch(() => process.exit(1));
