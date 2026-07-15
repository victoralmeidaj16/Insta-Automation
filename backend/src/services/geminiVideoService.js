import axios from 'axios';
import { Buffer } from 'buffer';

const UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";

/**
 * Downloads an MP4 video from a URL into a Buffer.
 */
export async function downloadVideoBuffer(url) {
    if (!url) return null;
    console.log(`📥 Baixando vídeo fisicamente: ${url.substring(0, 50)}...`);
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: {
            'Referer': 'https://www.instagram.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        }
    });
    return { buffer: Buffer.from(res.data), mimeType: res.headers['content-type'] || 'video/mp4' };
}

/**
 * Uploads a physical video buffer into Gemini 2.0 via the File API.
 * Polls until the file processing state is ACTIVE.
 */
export async function uploadGeminiVideo(buffer, mimeType) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY não configurada.');
    
    console.log(`🚀 Fazendo upload do arquivo de vídeo para o Gemini... (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    const response = await axios.post(`${UPLOAD_URL}?key=${key}`, buffer, {
        headers: {
            "X-Goog-Upload-Command": "start, upload, finalize",
            "X-Goog-Upload-Header-Content-Length": buffer.length.toString(),
            "X-Goog-Upload-Header-Content-Type": mimeType,
            "Content-Type": mimeType,
        },
        maxBodyLength: Infinity,
        timeout: 120000 
    });
    
    const file = response.data.file;
    await waitForFileActive(file.name);
    return { uri: file.uri, mimeType: file.mimeType };
}

/**
 * Wait for Gemini servers to finish extracting the video binary.
 */
async function waitForFileActive(fileName, maxWaitMs = 120000) {
    const key = process.env.GEMINI_API_KEY;
    const start = Date.now();
    console.log(`⏳ Aguardando processamento do arquivo no Gemini: ${fileName}`);
    
    while (Date.now() - start < maxWaitMs) {
        try {
            const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${key}`);
            if (response.data.state === "ACTIVE") {
                console.log(`✅ Vídeo processado com sucesso!`);
                return;
            }
            if (response.data.state === "FAILED") throw new Error('O processamento do vídeo falhou no lado do Gemini.');
        } catch(e) {
            // ignore network errors and retry
        }
        await new Promise(r => setTimeout(r, 4000));
    }
    throw new Error('Tempo esgotado aguardando o vídeo ficar ACTIVE no servidor do Gemini.');
}
