import axios from 'axios';
import sharp from 'sharp';
import { storage } from '../../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Faz o upload de uma imagem Base64 para o Firebase Storage e retorna a URL pública.
 * Evita o limite de 1MB do Firestore e melhora performance global.
 */
export async function uploadBase64ToFirebase(base64DataUri) {
    if (!base64DataUri || !base64DataUri.startsWith('data:image/')) return base64DataUri;

    try {
        console.log('☁️ Fazendo upload automático da imagem gerada para o Firebase Storage...');
        const uniqueId = uuidv4();

        const match = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return base64DataUri;

        const mimeType = match[1];
        const base64Data = match[2];
        const ext = mimeType.split('/')[1] || 'png';
        const buffer = Buffer.from(base64Data, 'base64');

        const fileName = `generated_images/${uniqueId}.${ext}`;
        const fileUpload = storage.file(fileName);

        await fileUpload.save(buffer, {
            metadata: {
                contentType: mimeType,
            },
        });

        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${storage.name}/${fileName}`;
        console.log('✅ Upload concluído. URL pública:', publicUrl);
        return publicUrl;
    } catch (err) {
        console.error('❌ Falha ao fazer upload da imagem gerada:', err);
        return base64DataUri; // Fallback to base64 if it fails
    }
}

/**
 * Superpõe uma logo imagem usando sharp
 * @param {string} sourceImageBase64Url - A imagem original (Base64 data URI ou HTTP URL)
 * @param {string} logoPath - Caminho físico absoluto da logo
 * @returns {Promise<string>} Base64 data URI da imagem com a logo composta
 */
export async function compositeLogoOverlay(sourceImageBase64Url, logoPath) {
    try {
        console.log('🖼️ Iniciando compositing da logo com Sharp...');

        let imageBuffer;
        const isUrl = typeof sourceImageBase64Url === 'string' && sourceImageBase64Url.startsWith('http');

        if (isUrl) {
            const response = await axios.get(sourceImageBase64Url, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data);
        } else {
            const base64Str = String(sourceImageBase64Url || '');
            const base64Data = base64Str.replace(/^data:[^;]+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        }

        // 🔄 Usuário solicitou que toda imagem transformada na biblioteca seja 4:5 (1080x1350)
        console.log('📐 Redimensionando imagem de base para 1080x1350 (4:5) antes de aplicar a logo...');
        const resizedImageBuffer = await sharp(imageBuffer)
            .resize(1080, 1350, { fit: 'cover', position: 'center' })
            .toBuffer();

        const sourceImage = sharp(resizedImageBuffer);
        const metadata = await sourceImage.metadata();
        const width = metadata.width;
        const height = metadata.height;

        // Logo configuration: ~12% of width so it's not too giant
        const logoTargetWidth = Math.round(width * 0.12);

        // Prepare logo: resize
        const logoBuffer = await sharp(logoPath)
            .resize({ width: logoTargetWidth, withoutEnlargement: true })
            .toBuffer();

        const logoMetadata = await sharp(logoBuffer).metadata();

        // Margin: ~4% from bottom and right edges
        const marginX = Math.round(width * 0.04);
        const marginY = Math.round(height * 0.04);

        const left = width - logoMetadata.width - marginX;
        const top = height - logoMetadata.height - marginY;

        // Composite using 'screen' blend to remove black background from the logo
        const compositedBuffer = await sourceImage
            .composite([
                {
                    input: logoBuffer,
                    top: Math.max(0, top),
                    left: Math.max(0, left),
                    blend: 'screen'
                }
            ])
            .toFormat('png')
            .toBuffer();

        console.log('✅ Compositing concluído com sucesso.');
        return `data:image/png;base64,${compositedBuffer.toString('base64')}`;
    } catch (error) {
        console.error('❌ Erro no compositing da logo:', error);
        // Fallback to original image if compositing fails
        return sourceImageBase64Url;
    }
}
