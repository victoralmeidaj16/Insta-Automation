import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.UPLOAD_POST_API_KEY;
const BASE_URL = 'https://api.upload-post.com/api';

async function checkJob(jobId) {
    try {
        console.log(`Checking status for job: ${jobId}`);
        const response = await axios.get(`${BASE_URL}/uploadposts/status?job_id=${jobId}`, {
            headers: { 'Authorization': `Apikey ${API_KEY}` }
        });
        console.log("Job status response:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("Error getting job status:", error.response?.data || error.message);
    }
}

const jobId = '8c4bf9a9b98c457cab231657ad9e5491';
checkJob(jobId);
