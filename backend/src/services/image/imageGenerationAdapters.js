import axios from 'axios';

/**
 * Helper to extract image data from Gemini API response
 */
function extractImageFromGemini(data) {
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
        console.error('❌ Resposta do Gemini em formato inesperado ou vazia:', JSON.stringify(data));

        if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            throw new Error('Gemini recusou gerar a imagem por política de segurança (SAFETY).');
        }

        throw new Error('Resposta do Gemini em formato inesperado (sem partes)');
    }

    const parts = data.candidates[0].content.parts;
    console.log(`🔍 Analisando ${parts.length} partes da resposta do Gemini...`);

    // Support both camelCase (inlineData) and snake_case (inline_data) depending on API version/proxy
    const imagePart = parts.find(p => p.inlineData || p.inline_data);

    if (imagePart) {
        const inlineData = imagePart.inlineData || imagePart.inline_data;
        const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
        const base64 = inlineData.data;

        console.log(`✅ Imagem extraída do Gemini (${mimeType}, len: ${base64?.length || 0})`);

        if (!base64) {
            console.error('❌ Parte de imagem encontrada mas sem dados (base64 vazio)');
            throw new Error('Gemini retornou um slot de imagem mas sem o conteúdo binário.');
        }

        return `data:${mimeType};base64,${base64}`;
    }

    // Fallback if no inline data found but text is present
    const textPart = parts.find(p => p.text);
    if (textPart) {
        console.warn('⚠️ Gemini retornou texto em vez de imagem:', textPart.text);
        throw new Error(`Gemini não gerou imagem. Resposta do texto: "${textPart.text.substring(0, 200)}..."`);
    }

    throw new Error('Nenhuma imagem ou texto válido encontrado na resposta do Gemini');
}

/**
 * Gera imagem com Google Gemini (Imagen 3)
 * @param {string} prompt
 * @param {string} aspectRatio
 * @param {string|string[]|null} referenceImage
 * @returns {Promise<string>} - URL da imagem gerada
 */
export async function generateImageWithGemini(prompt, aspectRatio, referenceImage = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    // A proporção vai em generationConfig.imageConfig (o modelo aceita 4:5 nativo).
    // Mapear 4:5 para 3:4 fazia o post sair mais alto que o limite do feed, e o
    // Instagram completava com faixas brancas nas laterais.
    const ratioLabels = {
        '1:1': 'formato quadrado perfeito',
        '4:5': 'formato retrato vertical',
        '9:16': 'formato vertical de tela cheia',
        '16:9': 'formato paisagem horizontal'
    };
    const geminiRatio = ratioLabels[aspectRatio] ? aspectRatio : '1:1';
    const ratioMsg = `${ratioLabels[geminiRatio]} (aspect ratio ${geminiRatio})`;

    console.log(`🤖 Gerando imagem com Gemini... Ratio: ${geminiRatio}`);

    // Pixels ("1080x1350") ou proporções escritas no prompt podem conflitar com a
    // proporção pedida; todas viram a descrição da proporção de destino.
    let safePrompt = prompt
        .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b|\b(?:1:1|4:5|3:4|9:16|16:9)\b/gi, ratioMsg);

    // Enforcement: Explicitly prepend the target ratio to help the model internalize the dimension
    safePrompt = `[TARGET ASPECT RATIO: ${geminiRatio}]\n\n${safePrompt}`;

    const modelId = 'gemini-3-pro-image-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    // Build parts array — text prompt + optional reference image
    const parts = [{ text: safePrompt }];

    // Handle reference images (single or array)
    const imagesToAttach = Array.isArray(referenceImage) ? referenceImage : (referenceImage ? [referenceImage] : []);

    if (imagesToAttach.length > 0) {
        for (const img of imagesToAttach) {
            if (!img) continue;

            let base64Data = img;
            let mimeType = 'image/jpeg';

            if (typeof img === 'string' && img.startsWith('http')) {
                try {
                    const imgResponse = await axios.get(img, { responseType: 'arraybuffer' });
                    base64Data = Buffer.from(imgResponse.data).toString('base64');
                    mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
                } catch (e) {
                    console.warn(`⚠️ Failed to fetch reference image: ${img.substring(0, 50)}`, e.message);
                    continue;
                }
            } else {
                const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
                if (mimeMatch) mimeType = mimeMatch[1];
            }

            // Normalize MIME type for Gemini
            mimeType = mimeType.toLowerCase().trim();
            if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
            if (mimeType === 'image/x-png') mimeType = 'image/png';

            // Gemini supported formats: image/png, image/jpeg, image/webp, image/heic, image/heif
            const supportedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
            if (!supportedMimes.includes(mimeType)) {
                console.warn(`⚠️ MimeType '${mimeType}' not officially supported by Gemini, defaulting to 'image/jpeg'`);
                mimeType = 'image/jpeg';
            }

            // Strip data URI prefix if present to get raw base64
            const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: rawBase64
                }
            });
        }
    }

    console.log('📝 Prompt final enviado ao Gemini:', parts[0].text);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
        const payload = {
            contents: [{
                parts: parts
            }],
            generationConfig: {
                temperature: 0.4,
                imageConfig: {
                    aspectRatio: geminiRatio
                }
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMessage = `Gemini API Error (${response.status})`;
            try {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error && errorJson.error.message) {
                        errorMessage = `Gemini Error: ${errorJson.error.message}`;
                    } else {
                        errorMessage = `Gemini Error: ${errorText}`;
                    }
                } catch (e) {
                    errorMessage = `Gemini Error: ${errorText}`;
                }
            } catch (e) {
                errorMessage += ' (failed to read error text)';
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Optimized logging: Do not stringify the entire binary data
        const logData = {
            hasCandidates: !!(data.candidates && data.candidates.length > 0),
            candidateCount: data.candidates?.length,
            firstCandidateParts: data.candidates?.[0]?.content?.parts?.length
        };
        console.log('📦 Gemini API Response Metadata:', JSON.stringify(logData));

        if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];
            console.log(`📋 Gemini finishReason: ${candidate.finishReason || 'N/A'}`);
            if (candidate.safetyRatings) {
                console.log('🛡️ Safety Ratings:', JSON.stringify(candidate.safetyRatings));
            }
        }

        return extractImageFromGemini(data);

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: Gemini demorou muito para responder (>90s).');
        }
        throw error;
    }
}

/**
 * Gera imagem com Seedream 4.5 via BytePlus API
 * @param {string} prompt
 * @param {string} aspectRatio
 * @param {string|string[]|null} referenceImage
 * @returns {Promise<string>} - URL da imagem gerada
 */
export async function generateImageWithSeedream(prompt, aspectRatio, referenceImage = null) {
    const apiKey = process.env.SEEDREAM_API_TOKEN;
    if (!apiKey) throw new Error('SEEDREAM_API_TOKEN não configurada');

    const sizeMap = {
        '1:1': '2048x2048',
        '4:5': '1728x2160', // Adjusted to meet min 3,686,400 pixels (1728*2160 = 3,732,480)
        '16:9': '2560x1440',
        '9:16': '1440x2560'
    };

    const size = sizeMap[aspectRatio] || '2048x2048';

    const modelId = 'seedream-4-5-251128';
    const url = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

    console.log(`🚀 Contacting BytePlus API for Seedream (${size})...`);

    const seed = Math.floor(Math.random() * 2147483647);

    const payload = {
        model: modelId,
        prompt: prompt,
        size: size,
        watermark: false,
        seed: seed,
        sequential_image_generation: 'disabled',
        response_format: 'url',
        stream: false
    };

    // Handle Reference Image (Image-to-Image) if provided
    if (referenceImage) {
        if (Array.isArray(referenceImage) && referenceImage.length > 0) {
            payload.image = referenceImage;
        } else if (typeof referenceImage === 'string') {
            payload.image = [referenceImage];
        }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMessage = `BytePlus API Error (${response.status})`;
            try {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error && errorJson.error.message) {
                        errorMessage = `BytePlus Error: ${errorJson.error.message}`;
                    } else {
                        errorMessage = `BytePlus Error: ${errorText}`;
                    }
                } catch (e) {
                    errorMessage = `BytePlus Error: ${errorText}`;
                }
            } catch (e) {
                errorMessage += ' (failed to read error text)';
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Response format: { data: [ { url: "..." } ] }
        if (data.data && data.data.length > 0 && data.data[0].url) {
            return data.data[0].url;
        }

        throw new Error('Nenhuma URL de imagem retornada pela BytePlus API');

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: A geração da imagem demorou mais que 90 segundos.');
        }
        throw error;
    }
}
