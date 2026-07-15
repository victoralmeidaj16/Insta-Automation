import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.UPLOAD_POST_API_KEY;
const BASE_URL = 'https://api.upload-post.com/api';

if (!API_KEY) {
    console.warn('⚠️ UPLOAD_POST_API_KEY is missing in environment variables.');
}

const getApiClient = (customApiKey) => {
    return axios.create({
        baseURL: BASE_URL,
        headers: {
            'Authorization': `Apikey ${customApiKey || API_KEY}`,
        },
        timeout: 60000,
    });
};

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

        console.log(`📥 Downloading video from ${videoUrl.substring(0, 50)}...`);
        const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const videoBuffer = Buffer.from(videoResponse.data);
        const contentType = videoResponse.headers['content-type'] || 'video/mp4';

        let filename = 'video.mp4';
        try {
            const urlObj = new URL(videoUrl);
            const basename = path.basename(urlObj.pathname);
            if (basename && basename.includes('.')) filename = basename;
        } catch (e) { }

        formData.append('video', videoBuffer, { filename, contentType });

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

        const client = getApiClient(options.apiKey);
        const response = await client.post('/upload', formData, {
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
 * @param {Object} options - Optional extra params (scheduledDate, timezone, mediaType, etc.)
 *   - options.mediaType: 'STORIES' to publish as Instagram Story instead of feed post
 * @returns {Promise<Object>} - API Response
 */
export async function uploadPhotos(username, platform, photoUrls, title, caption, options = {}) {
    try {
        console.log(`🚀 Uploading ${photoUrls.length} photos to ${platform} for user ${username}...`);

        // Upload-Post API requires form-data with 'user' field (not 'username')
        const formData = new FormData();
        formData.append('user', username);  // Changed from 'username' to 'user'
        formData.append('platform[]', platform);  // Use platform[] for array

        // For photos, download each file and add as buffer
        for (let i = 0; i < photoUrls.length; i++) {
            const url = photoUrls[i];
            console.log(`📥 Downloading photo ${i + 1}/${photoUrls.length} from ${url.substring(0, 50)}...`);
            const photoResponse = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            let photoBuffer = Buffer.from(photoResponse.data);

            // Detect original format from Content-Type header
            const originalContentType = photoResponse.headers['content-type'] || 'image/jpeg';
            const isOriginallyPng = originalContentType.includes('png');

            // Format for upload-post.com with maximum quality preservation
            const isStory = options.mediaType === 'STORIES';
            try {
                const metadata = await sharp(photoBuffer).metadata();
                let sharpInstance = sharp(photoBuffer);

                if (isStory) {
                    // Instagram Stories: 1080×1920 (9:16). Resize to fit within these bounds.
                    const STORY_W = 1080;
                    const STORY_H = 1920;
                    if (metadata.width !== STORY_W || metadata.height !== STORY_H) {
                        console.log(`📐 Resizing for Story: ${metadata.width}×${metadata.height} → ${STORY_W}×${STORY_H}...`);
                        sharpInstance = sharpInstance.resize({ width: STORY_W, height: STORY_H, fit: 'cover', position: 'centre' });
                    } else {
                        console.log(`✅ Story image already at ${STORY_W}×${STORY_H}. No resize needed.`);
                    }
                } else {
                    // Instagram feed posts: min 1080px, max 1350px wide.
                    // Gemini/Imagen 3 can generate at ~1024px (3:4 internal mapping), which causes
                    // visible quality loss on Instagram if not upscaled before upload.
                    const MIN_WIDTH = 1080;
                    const MAX_WIDTH = 1350;
                    if (metadata.width > MAX_WIDTH) {
                        console.log(`📐 Downscaling from ${metadata.width}px to max ${MAX_WIDTH}px width...`);
                        sharpInstance = sharpInstance.resize({ width: MAX_WIDTH });
                    } else if (metadata.width < MIN_WIDTH) {
                        console.log(`📐 Upscaling from ${metadata.width}px to min ${MIN_WIDTH}px width (Instagram minimum)...`);
                        sharpInstance = sharpInstance.resize({ width: MIN_WIDTH });
                    } else {
                        console.log(`✅ Image width (${metadata.width}px) is within Instagram range. No resize needed.`);
                    }
                }

                if (isOriginallyPng) {
                    // Keep as PNG — lossless, no quality degradation
                    console.log(`🖼️ Original is PNG — preserving lossless format...`);
                    photoBuffer = await sharpInstance
                        .png({ compressionLevel: 6, effort: 7 })
                        .toBuffer();
                } else {
                    // JPEG: use quality 100 with mozjpeg encoder for best compression without visible loss
                    console.log(`🖼️ Processing as JPEG at quality 100 (mozjpeg)...`);
                    photoBuffer = await sharpInstance
                        .jpeg({ quality: 100, mozjpeg: true })
                        .toBuffer();
                }
            } catch (sharpError) {
                console.warn(`⚠️ Failed to process image with sharp, sending original buffer:`, sharpError.message);
            }

            const contentType = isOriginallyPng ? 'image/png' : 'image/jpeg';
            let filename = `photo_${i}.${isOriginallyPng ? 'png' : 'jpg'}`;

            formData.append('photos[]', photoBuffer, { filename, contentType });
        }

        formData.append('title', title || 'New Post');
        formData.append('description', caption || '');

        // Set media_type for Instagram-specific post kinds
        if (options.mediaType) {
            formData.append('media_type', options.mediaType);
            console.log(`📌 media_type set to: ${options.mediaType}`);
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

        const client = getApiClient(options.apiKey);
        const response = await client.post('/upload_photos', formData, {
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
export async function cancelScheduledPost(jobId, apiKey = null) {
    try {
        console.log(`🗑️ Cancelling scheduled job ${jobId} in Upload-Post...`);
        const client = getApiClient(apiKey);
        const response = await client.delete(`/uploadposts/schedule/${jobId}`);
        console.log('✅ Job cancellation successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Job cancellation failed:', error.response?.data || error.message);
        // We don't throw here to allow the local deletion to proceed even if external cancel fails
        return { success: false, error: error.message };
    }
}

/**
 * Checks the status of a scheduled post in the Upload-Post API
 * @param {string} jobId - The job ID to check
 * @returns {Promise<Object>} - API Response containing status
 */
export async function checkJobStatus(jobId, apiKey = null) {
    try {
        console.log(`🔍 Checking status for job ${jobId} in Upload-Post...`);
        const client = getApiClient(apiKey);
        const response = await client.get(`/uploadposts/status?job_id=${jobId}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Failed to check job ${jobId} status:`, error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}
