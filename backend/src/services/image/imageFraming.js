import axios from 'axios';
import sharp from 'sharp';

/**
 * Dimensões finais publicadas no Instagram por proporção.
 * O feed aceita no máximo 4:5 na vertical; qualquer coisa mais alta (ex.: 3:4)
 * é encaixada pelo Instagram com faixas brancas nas laterais.
 */
export const INSTAGRAM_DIMENSIONS = {
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '9:16': { width: 1080, height: 1920 },
    '16:9': { width: 1920, height: 1080 }
};

async function loadImageBuffer(imageUrl) {
    if (imageUrl.startsWith('http')) {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    }
    return Buffer.from(imageUrl.replace(/^data:[^;]+;base64,/, ''), 'base64');
}

/**
 * Enquadra a imagem gerada na proporção pedida (recorte central + tamanho do
 * Instagram). Os provedores nem sempre respeitam a proporção, então a imagem
 * nunca segue para composição/publicação fora do formato.
 *
 * @param {string} imageUrl - data URL ou URL http da imagem
 * @param {string} aspectRatio - '1:1' | '4:5' | '9:16' | '16:9'
 * @returns {Promise<string>} data URL enquadrada, ou a original se não houver o que fazer
 */
export async function fitToAspectRatio(imageUrl, aspectRatio) {
    const target = INSTAGRAM_DIMENSIONS[aspectRatio];
    if (!target || typeof imageUrl !== 'string' || !imageUrl) return imageUrl;

    try {
        const buffer = await loadImageBuffer(imageUrl);
        const { width, height } = await sharp(buffer).metadata();
        if (width === target.width && height === target.height) return imageUrl;

        console.log(`📐 Enquadrando imagem ${width}x${height} em ${target.width}x${target.height} (${aspectRatio})...`);
        const framed = await sharp(buffer)
            .resize(target.width, target.height, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 95 })
            .toBuffer();

        return `data:image/jpeg;base64,${framed.toString('base64')}`;
    } catch (error) {
        console.error(`⚠️ Falha ao enquadrar imagem em ${aspectRatio}; mantendo a original:`, error.message);
        return imageUrl;
    }
}
