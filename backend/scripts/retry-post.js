import { db } from './src/config/firebase.js';
import { executePost } from './src/services/postService.js';

async function retryPost(postId) {
    console.log(`Retrying post: ${postId}`);
    try {
        await db.collection('posts').doc(postId).update({
            status: 'pending',
            externalScheduler: null,
            externalJobId: null,
            errorMessage: null
        });
        console.log(`Cleared external job info and set status to pending for ${postId}`);
        
        const result = await executePost(postId);
        console.log('Execute Post Result:', result);
    } catch (e) {
        console.error('Error retrying post:', e);
    }
}

retryPost('evAkfG83XH92YpChcHAs').then(() => process.exit(0));
