import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.UPLOAD_POST_API_KEY;
const BASE_URL = 'https://api.upload-post.com/api';

if (!API_KEY) {
    console.warn('⚠️ UPLOAD_POST_API_KEY is missing in environment variables.');
}

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Authorization': `Apikey ${API_KEY}`,
        'Content-Type': 'application/json', // Using JSON because we are sending URLs
    },
});

/**
 * Uploads a video to generic platforms (Instagram Reels, TikTok, YouTube, etc.)
 * @param {string} username - The user identifier in Upload-Post
 * @param {string} platform - Platform name (e.g., 'instagram', 'tiktok')
 * @param {string} videoUrl - Direct URL to the video file
 * @param {string} title - Title of the video
 * @param {string} caption - Description/Caption
 * @returns {Promise<Object>} - API Response
 */
export async function uploadVideo(username, platform, videoUrl, title, caption) {
    try {
        console.log(`🚀 Uploading video to ${platform} for user ${username}...`);

        // Ensure platform is in array format as required by API
        const platforms = [platform];

        const payload = {
            user: username,
            platform: platforms,
            video: videoUrl, // Passing URL directly
            title: title || 'New Video',
            description: caption || '',
            // Platform specific params can be added here if needed
            // e.g., instagram_title: title
        };

        // Specific handling for Instagram Reels
        if (platform === 'instagram') {
            payload.media_type = 'REELS';
        }

        const response = await apiClient.post('/upload', payload);

        console.log('✅ Video upload successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Video upload failed:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message);
    }
}

/**
 * Uploads photos (single or carousel) to generic platforms (Instagram, Facebook, etc.)
 * @param {string} username - The user identifier in Upload-Post
 * @param {string} platform - Platform name (e.g., 'instagram', 'facebook')
 * @param {string[]} photoUrls - Array of direct URLs to photo files
 * @param {string} title - Title of the post
 * @param {string} caption - Description/Caption (Note: for Instagram, title is used as caption usually, but we send both)
 * @returns {Promise<Object>} - API Response
 */
export async function uploadPhotos(username, platform, photoUrls, title, caption) {
    try {
        console.log(`🚀 Uploading ${photoUrls.length} photos to ${platform} for user ${username}...`);

        const platforms = [platform];

        const payload = {
            user: username,
            platform: platforms,
            photos: photoUrls, // Array of URLs
            title: title || 'New Post', // Acts as caption for Instagram
            description: caption || '', // Extended description for other platforms
        };

        const response = await apiClient.post('/upload_photos', payload);

        console.log('✅ Photo upload successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Photo upload failed:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to upload photos');
    }
}
