/**
 * klingClient.js
 * Wrapper para Kling AI v2.6 — API Direta como primária, Replicate como fallback.
 * 
 * Kling Direct API docs: https://klingai.com/docs
 * Replicate model: kwaivgi/kling-v2.6
 */

import axios from 'axios';
import crypto from 'crypto';
import Replicate from 'replicate';

// ─── JWT Helper for Kling Direct API ────────────────────────────────────────
function generateKlingJWT(accessKey, secretKey) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        iss: accessKey,
        exp: now + 1800, // 30 min
        nbf: now - 5
    })).toString('base64url');

    const signature = crypto
        .createHmac('sha256', secretKey)
        .update(`${header}.${payload}`)
        .digest('base64url');

    return `${header}.${payload}.${signature}`;
}

// ─── Kling Direct API Client ─────────────────────────────────────────────────
const KLING_BASE_URL = 'https://api.klingai.com';

function normalizeProviderDuration(duration) {
    const value = Number(duration);
    return value >= 8 ? 10 : 5;
}

async function klingDirectRequest(method, path, body = null) {
    const accessKey = process.env.KLING_ACCESS_KEY;
    const secretKey = process.env.KLING_SECRET_KEY;

    if (!accessKey || !secretKey) {
        throw new Error('KLING_ACCESS_KEY e KLING_SECRET_KEY não configurados');
    }

    const token = generateKlingJWT(accessKey, secretKey);
    const config = {
        method,
        url: `${KLING_BASE_URL}${path}`,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };

    if (body) config.data = body;

    const response = await axios(config);
    return response.data;
}

/**
 * Cria um job de imagem→vídeo via Kling Direct API
 * @param {string} imageBase64OrUrl - Imagem de entrada (base64 data URI ou URL pública)
 * @param {string} motionPrompt - Descrição da animação
 * @param {object} options - { duration: 5 | 10, cfg_scale: 0.5 }
 * @returns {Promise<string>} taskId
 */
async function createKlingDirectJob(imageBase64OrUrl, motionPrompt, options = {}) {
    const {
        duration = 5,
        cfg_scale = 0.5,
        mode = 'std', // 'std' ou 'pro'
    } = options;

    const normalizedDuration = normalizeProviderDuration(duration);
    const isUrl = typeof imageBase64OrUrl === 'string' && imageBase64OrUrl.startsWith('http');

    const body = {
        model_name: 'kling-v2-master',
        prompt: motionPrompt,
        duration: normalizedDuration,
        cfg_scale,
        mode,
        aspect_ratio: '9:16',
        ...(isUrl
            ? { image: imageBase64OrUrl }
            : { image_tail: imageBase64OrUrl } // fallback — use image field for base64
        )
    };

    // Try with image field for both
    const bodyFinal = {
        model_name: 'kling-v2-master',
        prompt: motionPrompt,
        duration: normalizedDuration,
        cfg_scale,
        mode,
        aspect_ratio: '9:16',
        image: isUrl ? imageBase64OrUrl : imageBase64OrUrl
    };

    console.log(`🎬 Kling Direct: criando job (duration=${normalizedDuration}s, mode=${mode})`);
    const result = await klingDirectRequest('POST', '/v1/videos/image2video', bodyFinal);

    if (result?.data?.task_id) {
        console.log(`✅ Kling job criado: ${result.data.task_id}`);
        return result.data.task_id;
    }

    throw new Error(`Kling API não retornou task_id: ${JSON.stringify(result)}`);
}

/**
 * Aguarda e retorna o URL de download do vídeo gerado (Kling Direct)
 * @param {string} taskId 
 * @param {number} maxWaitMs - Timeout em ms (default: 5 min)
 * @returns {Promise<string>} URL do vídeo
 */
async function waitForKlingDirectJob(taskId, maxWaitMs = 5 * 60 * 1000) {
    const pollIntervalMs = 8000;
    const deadline = Date.now() + maxWaitMs;

    console.log(`⏳ Aguardando Kling job ${taskId}...`);

    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollIntervalMs));

        const result = await klingDirectRequest('GET', `/v1/videos/image2video/${taskId}`);
        const task = result?.data;

        if (!task) throw new Error(`Kling: task ${taskId} não encontrada`);

        const status = task.task_status;
        console.log(`   Kling status: ${status}`);

        if (status === 'succeed') {
            const videoUrl = task.task_result?.videos?.[0]?.url;
            if (!videoUrl) throw new Error('Kling: succeed mas sem URL de vídeo');
            console.log(`✅ Kling vídeo pronto: ${videoUrl}`);
            return videoUrl;
        }

        if (status === 'failed') {
            throw new Error(`Kling job falhou: ${task.task_status_msg || 'Sem mensagem'}`);
        }

        // status: 'submitted' | 'processing' — continue polling
    }

    throw new Error(`Kling timeout: job ${taskId} não concluiu em ${maxWaitMs / 1000}s`);
}

// ─── Replicate Fallback ──────────────────────────────────────────────────────
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function animateWithReplicate(imageUrl, motionPrompt, options = {}) {
    const { duration = 5 } = options;
    const normalizedDuration = normalizeProviderDuration(duration);
    console.log('🔄 Usando Replicate (Kling v2.6) como fallback...');
    console.log(`   Downloading scene image: ${imageUrl.substring(0, 80)}...`);

    // Step 1: Download the scene image from Firebase
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imgBuffer = Buffer.from(imgResponse.data);
    const contentType = imgResponse.headers['content-type'] || 'image/png';
    const ext = contentType.includes('jpeg') ? 'jpg' : 'png';

    console.log(`   Image downloaded: ${imgBuffer.length} bytes (${contentType})`);

    // Step 2: Upload to Replicate Files API so the model can access it reliably
    const blob = new Blob([imgBuffer], { type: contentType });
    const replicateFile = await replicate.files.create(blob, {
        filename: `scene_${Date.now()}.${ext}`,
    });

    const startImageUrl = replicateFile.urls?.get || replicateFile.url;
    console.log(`   Uploaded to Replicate Files: ${startImageUrl}`);

    // Step 3: Create prediction with the Replicate-hosted image URL
    const prediction = await replicate.predictions.create({
        version: 'b13f36d030496dd78d2986ba8b2b22a44222b3f58c15fb63ef7d6b4aa3a53319',
        input: {
            start_image: startImageUrl,
            prompt: motionPrompt,
            duration: normalizedDuration,
            cfg_scale: 0.5,
        }
    });

    console.log(`   Replicate prediction ID: ${prediction.id}`);

    // Step 4: Poll until complete
    const completed = await replicate.wait(prediction, { interval: 5000 });

    if (completed.status === 'failed') {
        throw new Error(`Replicate prediction falhou: ${completed.error}`);
    }

    // Output is a URL string or array of URL strings
    let output = completed.output;
    let videoUrl = Array.isArray(output) ? output[0] : output;

    // Handle URL object
    if (videoUrl && typeof videoUrl === 'object' && videoUrl.href) {
        videoUrl = videoUrl.href;
    }

    // Final tostring
    if (videoUrl && typeof videoUrl !== 'string') {
        videoUrl = String(videoUrl);
    }

    if (!videoUrl || !videoUrl.startsWith('http')) {
        throw new Error(`Replicate retornou output inválido: ${JSON.stringify(output)?.substring(0, 200)}`);
    }

    console.log(`✅ Replicate vídeo pronto: ${videoUrl}`);
    return videoUrl;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Anima uma imagem em vídeo usando Kling v2.6.
 * Tenta API direta primeiro, faz fallback para Replicate em caso de erro.
 * 
 * @param {string} imageUrlOrBase64 - URL pública ou base64 data URI da imagem
 * @param {string} motionPrompt - Descrição da animação
 * @param {object} options - { duration: 5 | 10 }
 * @returns {Promise<string>} URL pública do vídeo gerado
 */
export async function animateImageToVideo(imageUrlOrBase64, motionPrompt, options = {}) {
    const hasDirectKeys = process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY;

    if (hasDirectKeys) {
        try {
            const taskId = await createKlingDirectJob(imageUrlOrBase64, motionPrompt, options);
            return await waitForKlingDirectJob(taskId);
        } catch (err) {
            console.warn(`⚠️ Kling Direct falhou: ${err.message}. Tentando Replicate...`);
        }
    }

    // Replicate precisa de URL pública — não funciona com base64
    const urlForReplicate = imageUrlOrBase64.startsWith('http')
        ? imageUrlOrBase64
        : (() => { throw new Error('Replicate requer URL pública. Kling Direct não configurado e imagem é base64.'); })();

    return animateWithReplicate(urlForReplicate, motionPrompt, options);
}
