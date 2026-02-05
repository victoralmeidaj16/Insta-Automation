import axios from 'axios';
import FormData from 'form-data';
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
    },
});

/**
 * Uploads a video to generic platforms (Instagram Reels, TikTok, YouTube, etc.)
 * @param {string} username - The user identifier in Upload-Post
 * @param {string} platform - Platform name (e.g., 'instagram', 'tiktok')
 * @param {string} videoUrl - Direct URL to the video file
 * @param {string} title - Title of the video
 * @param {string} caption - Description/Caption
 * @param {Object} options - Optional extra params (scheduledDate, timezone, etc.)
 * @returns {Promise<Object>} - API Response
 */
export async function uploadVideo(username, platform, videoUrl, title, caption, options = {}) {
    try {
        console.log(`🚀 Uploading video to ${platform} for user ${username}...`);

        const platforms = [platform];

        // Upload-Post API requires form-data with 'user' field (not 'username')
        const formData = new FormData();
        formData.append('user', username);  // Changed from 'username' to 'user'
        formData.append('platform[]', platform);  // Use platform[] for array
        formData.append('video', videoUrl);
        formData.append('title', title || 'New Video');
        formData.append('description', caption || '');

        // Specific handling for Instagram Reels
        if (platform === 'instagram') {
            formData.append('media_type', 'REELS');
        }

        if (options.scheduledDate) {
            formData.append('scheduled_date', options.scheduledDate);
        }
        if (options.timezone) {
            formData.append('timezone', options.timezone);
        }
        if (options.extraParams) {
            Object.keys(options.extraParams).forEach(key => {
                formData.append(key, options.extraParams[key]);
            });
        }

        const response = await apiClient.post('/upload', formData, {
            headers: formData.getHeaders(),
        });

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
 * @param {Object} options - Optional extra params (scheduledDate, timezone, etc.)
 * @returns {Promise<Object>} - API Response
 */
export async function uploadPhotos(username, platform, photoUrls, title, caption, options = {}) {
    try {
        console.log(`🚀 Uploading ${photoUrls.length} photos to ${platform} for user ${username}...`);

        // Upload-Post API requires form-data with 'user' field (not 'username')
        const formData = new FormData();
        formData.append('user', username);  // Changed from 'username' to 'user'
        formData.append('platform[]', platform);  // Use platform[] for array

        // For photos, add each URL as photos[]
        photoUrls.forEach(url => {
            formData.append('photos[]', url);
        });

        formData.append('title', title || 'New Post');
        formData.append('description', caption || '');

        if (options.scheduledDate) {
            formData.append('scheduled_date', options.scheduledDate);
        }
        if (options.timezone) {
            formData.append('timezone', options.timezone);
        }
        if (options.extraParams) {
            Object.keys(options.extraParams).forEach(key => {
                formData.append(key, options.extraParams[key]);
            });
        }

        const response = await apiClient.post('/upload_photos', formData, {
            headers: formData.getHeaders(),
        });

        console.log('✅ Photo upload successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Photo upload failed:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to upload photos');
    }
}
/**
 * Cancels a scheduled post in the Upload-Post API
 * @param {string} jobId - The job ID or request ID to cancel
 * @returns {Promise<Object>} - API Response
 */
export async function cancelScheduledPost(jobId) {
    try {
        console.log(`🗑️ Cancelling scheduled job ${jobId} in Upload-Post...`);
        const response = await apiClient.delete(`/uploadposts/schedule/${jobId}`);
        console.log('✅ Job cancellation successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Job cancellation failed:', error.response?.data || error.message);
        // We don't throw here to allow the local deletion to proceed even if external cancel fails
        return { success: false, error: error.message };
    }
}
