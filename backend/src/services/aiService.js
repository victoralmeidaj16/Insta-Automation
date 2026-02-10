import Replicate from 'replicate';
import OpenAI from 'openai';

// Ensure OpenAI client is initialized properly
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});




/**
 * Helper to construct the Editorial Mode System Prompt
 * Extracted for reuse in both Carousel and Single Image modes
 */
// Helper: convert hex to a descriptive color name for image prompts
function hexToColorName(hex) {
    const colorMap = {
        '#4C1D95': 'deep violet', '#8e44ad': 'rich purple', '#7c3aed': 'vivid purple',
        '#6d28d9': 'dark purple', '#a855f7': 'bright purple', '#9333ea': 'electric purple',
        '#3b82f6': 'royal blue', '#2563eb': 'deep blue', '#1d4ed8': 'navy blue',
        '#ef4444': 'red', '#dc2626': 'crimson', '#f97316': 'orange',
        '#22c55e': 'emerald green', '#10b981': 'teal green', '#14b8a6': 'teal',
        '#f59e0b': 'amber', '#eab308': 'gold', '#000000': 'black', '#ffffff': 'white',
    };
    const key = (hex || '').toLowerCase();
    if (colorMap[key]) return colorMap[key];
    // Fallback: describe by hue
    const r = parseInt(key.slice(1, 3), 16) || 0;
    const g = parseInt(key.slice(3, 5), 16) || 0;
    const b = parseInt(key.slice(5, 7), 16) || 0;
    if (r > g && r > b) return 'warm reddish tone';
    if (g > r && g > b) return 'green tone';
    if (b > r && b > g) return 'blue-purple tone';
    if (r > 200 && g > 200 && b > 200) return 'light neutral';
    return 'dark accent tone';
}

export function getEditorialSystemPrompt(description, count, context) {
    const {
        primaryColor = '#4C1D95',
        targetAudience = 'General Audience',
        productService = 'Professional Services',
        brandingStyle = 'Editorial cinematic, dark, high-contrast',
        brandName,
        aspectRatio = '4:5',
        profileDescription,
        guidelines
    } = context;

    const dynamicBrand = brandName ? String(brandName).trim() : 'SUA MARCA AQUI';
    const truncate = (str, maxLength = 500) =>
        str && String(str).length > maxLength ? String(str).substring(0, maxLength) + "..." : (str ? String(str) : '');

    const colorName = hexToColorName(primaryColor);


    return `Você é um Diretor de Arte Sênior especializado em social media editorial/cinematic.
Sua tarefa é criar prompts de imagem PRONTOS para geração por IA (um por card do carrossel).

CONTEXTO DA MARCA:
- Nome: "${truncate(dynamicBrand, 80)}"
- Segmento: "${truncate(productService, 120)}"
- Público-alvo: "${truncate(targetAudience, 200)}"
- Cor principal: ${colorName} (deep, rich — not neon)
${profileDescription ? `- Descrição do perfil: "${truncate(profileDescription, 500)}"` : ''}
${guidelines ? `- Guidelines (OBRIGATÓRIO seguir): "${truncate(guidelines, 800)}"` : ''}

REGRAS OBRIGATÓRIAS:
- Gere EXATAMENTE ${count} prompts completos.
- Cada prompt segue a MESMA ESTRUTURA FIXA abaixo.
- Para CADA card, você deve ADAPTAR DUAS coisas:
  1. A CENA VISUAL (60% superior) — crie uma cena simbólica poderosa que ILUSTRE o texto daquele card
  2. O TEXTO DO CARD (40% inferior) — use o texto real do card, em ALL CAPS, extraído da descrição do carrossel
- NÃO inclua numeração (1., 2., etc.)
- Separe cada prompt APENAS pela string "---SEPARATOR---" (sem aspas).

TEMPLATE FIXO (para CADA card, substitua os campos entre colchetes):

A premium vertical social media post (${aspectRatio}) with a cinematic, high-contrast aesthetic.
The upper 60% of the image shows a powerful symbolic scene related to the card's theme:
[DESCREVA UMA CENA VISUAL CINEMATOGRÁFICA E SIMBÓLICA QUE ILUSTRE O TEXTO DESTE CARD — use metáforas visuais relacionadas ao tema, com uma psicóloga feminina jovem (20-30 anos, roupas casuais) quando apropriado, objetos simbólicos, cenários dramáticos, ou elementos abstratos que evoquem o sentimento do texto],
dramatic directional lighting, shallow depth of field,
dark textured background, cinematic atmosphere, ultra-realistic, high-detail, dramatic mood,
small particles and dust floating in the air.

The lower 40% of the image fades into a dense black-to-deep-purple gradient,
creating a solid base for bold typography without abruptly cutting the image.

Centered, bold motivational typography in ALL CAPS, using a condensed sans-serif style similar to Bebas Neue or Champion Gothic
(not referencing specific font names, only style).

Text content (Portuguese), centered and stacked, with tight line spacing and strong hierarchy:

"[TEXTO DO CARD EM ALL CAPS — extraído diretamente da descrição do carrossel, adaptado para ser impactante e caber no card]"

Color usage:
• Main text in pure white
• Strategic emphasis words in deep rich purple (not neon)
Use emphasis sparingly on 2–3 key words only

Letter spacing slightly condensed, dense and impactful text block.
Text occupies approximately one-third of the total image height.
Generous side margins (around 10%), no text touching edges.

Between image and text, a thin horizontal line in subtle purple,
with a small minimalist logo placeholder centered (no real logo details, just symbolic).

At the very bottom, small, elegant brand text:
"${truncate(dynamicBrand, 80)}"

Overall style:
• Editorial, cinematic, premium
• Dark psychology aesthetic
• Strong emotional impact
• Clean, modern, high-end
• Designed to feel authoritative, reflective, and professional

MANDATORY RESTRICTIONS:
• Lighting must remain dramatic
• Contrast must be high
• No clutter
• No stock-photo look
• No cartoon style
• No illustrative icons
• No emojis
• No exaggerated neon colors
• NEVER include hex color codes as visible text in the image
• DO NOT render technical headers like "PART 1" as text
• Any color reference must be applied visually, not written as text`;
}


/**
 * Analisa o estilo de uma imagem de referência usando Vision API
 * @param {string} base64Image - Imagem em base64
 * @returns {Promise<string>} - Descrição do estilo visual
 */
async function analyzeImageStyle(base64Image) {
    try {
        console.log('👁️ Analisando imagem de referência com Vision...');

        // Ensure base64 has prefix if missing
        const imagePart = base64Image.startsWith('data:') ? base64Image : `data: image / jpeg; base64, ${base64Image} `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Cost effective vision model
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analyze the visual style of this image for an AI image generator prompt. Focus on: Lighting, Color Palette, Composition, Textures, and Overall Vibe. Be concise and descriptive. Do NOT describe the subject matter (like 'a person holding a phone'), ONLY the aesthetic style." },
                        { type: "image_url", image_url: { url: imagePart } }
                    ],
                },
            ],
            max_tokens: 150,
        });

        const styleDescription = response.choices[0].message.content;
        console.log('👁️ Estilo extraído:', styleDescription);
        return styleDescription;
    } catch (error) {
        console.error('❌ Erro ao analisar imagem de referência:', error);
        return null; // Fail gracefully
    }
}

/**
 * Gera prompts individuais para cada card do carrossel usando OpenAI

 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} count - Número de cards/imagens
 * @returns {Promise<string[]>} - Array de prompts individuais
 */
export async function generateCarouselPrompts(carouselDescription, count, context = {}) {
    try {
        console.log('🤖 Gerando prompts com OpenAI para carrossel...');
        console.log(`Descrição: ${carouselDescription} `);
        console.log(`Número de cards: ${count} `);

        // Context truncation to avoid token limits
        const truncate = (str, maxLength = 2000) => str && str.length > maxLength ? str.substring(0, maxLength) + "..." : str;

        const { profileDescription, guidelines, savedPrompts, isEditorial, brandName, referenceImage } = context;

        // Reference image is now passed directly to the image generation model (not analyzed here)
        // Remove style analysis — the user's reference image will be attached to each card's image gen call
        let finalBrandingStyle = context.brandingStyle || 'Editorial cinematic, professional';

        // BATCHING LOGIC FOR EDITORIAL MODE (To prevent Timeouts)
        if (isEditorial && count > 5) {
            console.log(`⚠️ Editorial Mode: Splitting ${count} cards into batches to avoid timeout...`);
            const mid = Math.ceil(count / 2);
            const firstBatchCount = mid;
            const secondBatchCount = count - mid;

            // Generate first batch
            console.log(`🔹 Generating Batch 1(${firstBatchCount} cards)...`);
            const firstBatch = await generateCarouselPrompts(carouselDescription, firstBatchCount, { ...context, isEditorial: true });

            // Generate second batch
            console.log(`🔹 Generating Batch 2(${secondBatchCount} cards)...`);
            const secondBatch = await generateCarouselPrompts(carouselDescription, secondBatchCount, { ...context, isEditorial: true });

            return [...firstBatch, ...secondBatch];
        }

        let systemContext = '';
        if (profileDescription) systemContext += `\n\nCONTEXTO DO PERFIL: \n${truncate(profileDescription)} `;
        if (guidelines) systemContext += `\n\nDIRETRIZES DA MARCA(GUIDELINES): \n${truncate(guidelines)} \nIMPORTANTE: Siga estas diretrizes estritamente.`;

        let savedPromptsContext = '';
        if (savedPrompts && savedPrompts.length > 0) {
            // Limit to 5 examples to save tokens
            const recentPrompts = savedPrompts.slice(0, 5);
            savedPromptsContext = `\n\nEXEMPLOS DE ESTILO(Prompts Salvos): \nAqui estão exemplos de prompts que o usuário gosta.Tente seguir um estilo similar: \n${recentPrompts.map(p => `"${p.text}"`).join('\n')} `;
        }

        let systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Sua tarefa é pegar uma descrição geral de um carrossel e criar prompts específicos para cada card / slide.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ser coerentes entre si, contando uma história ou apresentando um conceito de forma progressiva.
        ${systemContext}
${savedPromptsContext} `;

        // EDITORIAL MODE LOGIC
        if (isEditorial) {
            systemPrompt = getEditorialSystemPrompt(carouselDescription, count, context);
        }


        const userPrompt = `Crie ${count} prompts individuais para um carrossel do Instagram com a seguinte descrição:

    "${truncate(carouselDescription, 3000)}"

    IMPORTANTE:
    - Generate exactly ${count} prompts
        - ${isEditorial ? 'Use ESTRITAMENTE o template fornecido no System Prompt para cada card.' : 'Each prompt must be detailed and visual'}
    - The prompts must have a narrative or logical sequence
        - Use descriptive language suitable for image generation
            - Return only the prompts, one per line, without numbering or bullets
                - DO NOT use Markdown headers(###), bold(**), or italics
                    - ${isEditorial ? 'Não desvie do formato de template. O output DEVE ser o prompt completo pronto para ser enviado para a IA de imagem.' : 'Se as Diretrizes da Marca exigirem um estilo específico (ex: minimalista, cyberpunk, cores vibrantes), aplique-o em TODOS os prompts.'}
    - ${isEditorial ? '' : 'Use "TEXT OVERLAY: \'Your Text Here\'" explicitly in the prompt description to ensure text appears in the image if needed.'}

Retorne os prompts separados APENAS pela string "---SEPARATOR---"(sem aspas).
Garante que CADA prompt esteja completo antes de inserir o separador.`;

        const completion = await openai.chat.completions.create({
            model: isEditorial ? 'gpt-4o' : 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: isEditorial ? 16000 : 4096,
        });

        const response = completion.choices[0].message.content;

        if (!response) {
            throw new Error('OpenAI retornou uma resposta vazia (sem conteúdo).');
        }

        const parsePrompts = (rawText) => {
            const cleaned = String(rawText || '').replace(/```/g, '').trim();

            // Handling for Editorial Mode (Multi-line prompts)
            if (isEditorial) {
                return cleaned
                    .split('---SEPARATOR---') // Split by unique separator
                    .map(p => p.trim())
                    .filter(p => p.length > 50); // Editorial prompts are long; filter noise
            }

            // Standard Mode (Single line per prompt usually)
            return cleaned
                .split('\n')
                .map(p => p.trim())
                .filter(p => {
                    // Filter out empty lines, markdown headers (###), and separators (---)
                    return p.length > 0 && !p.startsWith('#') && !p.startsWith('-') && !p.startsWith('*');
                })
                // Remove numbering if present (e.g., "1. prompt")
                .map(p => p.replace(/^\d+[\.\)]\s*/, ''));
        };

        let prompts = parsePrompts(response).slice(0, count);

        // Guarantee we return exactly `count` prompts (common failure: model returns fewer blocks)
        if (prompts.length !== count) {
            console.warn(`⚠️ OpenAI retornou ${prompts.length}/${count} prompts. Tentando corrigir...`);

            if (prompts.length > count) {
                prompts = prompts.slice(0, count);
            } else {
                const missing = count - prompts.length;
                const repairPrompt = isEditorial
                    ? `Você retornou ${prompts.length} prompts completos, mas eu preciso de EXATAMENTE ${count}.
Gere APENAS MAIS ${missing} prompts completos, seguindo o mesmo TEMPLATE.
Não repita os prompts já existentes.
Separe cada prompt APENAS pela string "---SEPARATOR---" (sem aspas).

PROMPTS JÁ GERADOS (NÃO REPETIR):
${prompts.map((p, i) => `--- PROMPT ${i + 1} ---\n${p}`).join('\n\n')}`
                    : `Você retornou ${prompts.length} prompts, mas eu preciso de EXATAMENTE ${count}.
Gere APENAS MAIS ${missing} prompts (um por linha), sem numeração, sem bullets, sem markdown.
Não repita os prompts já existentes.

PROMPTS JÁ GERADOS (NÃO REPETIR):
${prompts.map((p) => `- ${p}`).join('\n')}`;

                const repairCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: repairPrompt }
                    ],
                    temperature: 0.4,
                });

                const repairText = repairCompletion.choices?.[0]?.message?.content;
                const extra = parsePrompts(repairText);
                prompts = [...prompts, ...extra].slice(0, count);
            }
        }

        if (prompts.length === 0) {
            throw new Error('Falha ao processar os prompts gerados (formato inválido).');
        }
        // Accept if we got at least 80% of requested prompts, pad with last prompt if needed
        if (prompts.length < count) {
            const minAcceptable = Math.ceil(count * 0.8);
            if (prompts.length >= minAcceptable) {
                console.warn(`⚠️ Aceitando ${prompts.length}/${count} prompts (≥80%). Preenchendo o restante...`);
                while (prompts.length < count) {
                    prompts.push(prompts[prompts.length - 1]); // Duplicate last prompt as fallback
                }
            } else {
                throw new Error(`Falha ao gerar prompts suficientes: ${prompts.length}/${count}`);
            }
        }

        console.log(`✅ ${prompts.length} prompts gerados com sucesso!`);
        prompts.forEach((p, i) => console.log(`   ${i + 1}. ${p.substring(0, 60)}...`));

        return prompts;

    } catch (error) {
        console.error('❌ Erro ao gerar prompts com OpenAI:', error);
        throw new Error(`Falha na geração de prompts: ${error.message} `);
    }
}

/**
 * Gera o PRÓXIMO prompt do carrossel progressivamente
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} totalCards - Número total de cards
 * @param {number} currentCardIndex - Índice do card atual (0-based)
 * @param {string[]} previousPrompts - Prompts já gerados
 * @returns {Promise<string>} - Prompt para o próximo card
 */
export async function generateNextCarouselPrompt(carouselDescription, totalCards, currentCardIndex, previousPrompts = [], context = {}) {
    try {
        console.log(`🤖 Gerando prompt para card ${currentCardIndex + 1}/${totalCards}...`);

        const { profileDescription, guidelines, savedPrompts } = context;

        let systemContext = '';
        if (profileDescription) systemContext += `\n\nCONTEXTO DO PERFIL:\n${profileDescription}`;
        if (guidelines) systemContext += `\n\nDIRETRIZES DA MARCA (GUIDELINES):\n${guidelines}\nIMPORTANTE: Siga estas diretrizes estritamente para manter a consistência visual.`;

        const systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Você está ajudando a criar um carrossel progressivamente, um card por vez.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ter uma narrativa coerente e progressiva.
${systemContext}`;

        let contextPrompts = '';
        if (previousPrompts.length > 0) {
            contextPrompts = `\n\nPrompts já criados para os cards anteriores:\n${previousPrompts.map((p, i) => `Card ${i + 1}: ${p}`).join('\n')}`;
        }

        const userPrompt = `Crie o prompt para o card ${currentCardIndex + 1} de ${totalCards} de um carrossel do Instagram.

Descrição geral do carrossel: "${carouselDescription}"
${contextPrompts}

IMPORTANTE:
- Este é o card ${currentCardIndex + 1} de ${totalCards}
- O prompt deve continuar a narrativa dos cards anteriores (se houver)
- Seja detalhado e visual
- Use linguagem descritiva adequada para geração de imagens
- Mantenha o estilo visual consistente com os cards anteriores e as Diretrizes da Marca
- Retorne APENAS o prompt, sem numeração ou explicações adicionais`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
        });

        const prompt = completion.choices[0].message.content.trim();
        console.log(`✅ Prompt gerado: ${prompt.substring(0, 60)}...`);

        return prompt;

    } catch (error) {
        console.error('❌ Erro ao gerar próximo prompt:', error);
        throw new Error(`Falha na geração do próximo prompt: ${error.message}`);
    }
}

/**
 * Gera UMA imagem usando Replicate Seedream 4.5
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @returns {Promise<string>} - URL da imagem gerada
 */

// Helper to generate image with Google Gemini (Imagen 3)
async function generateImageWithGemini(prompt, aspectRatio, referenceImage = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    // Map Aspect Ratio for Gemini
    // Supported: "1:1", "3:4", "4:3", "16:9", "9:16"
    const ratioMap = {
        '1:1': '1:1',
        '4:5': '3:4', // Best approximation
        '16:9': '16:9',
        '9:16': '9:16'
    };
    const geminiRatio = ratioMap[aspectRatio] || '1:1';

    console.log(`🤖 Gerando imagem com Gemini (Imagen 3)... Ratio: ${geminiRatio}`);

    // Using Gemini 3 Pro Image Preview (Nano Banana Pro)
    // Documentation: https://ai.google.dev/gemini-api/docs/image-generation
    const modelId = 'gemini-3-pro-image-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    // Build parts array — text prompt + optional reference image
    const parts = [{ text: prompt }];

    if (referenceImage) {
        console.log('📎 Anexando imagem de referência ao prompt Gemini...');
        // Strip data URI prefix if present to get raw base64
        const base64Data = referenceImage.replace(/^data:image\/[a-z]+;base64,/, '');
        parts.push({
            inline_data: {
                mime_type: 'image/png',
                data: base64Data
            }
        });
        // Add instruction to use it as style reference
        parts[0].text += '\n\nIMPORTANT: Use the attached reference image as a STYLE GUIDE. Match its visual style, color palette, lighting, composition, and overall aesthetic. Generate a NEW image with the described content but in the SAME visual style as the reference.';
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: parts
            }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: {
                    aspectRatio: geminiRatio
                }
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Gemini HTTP Error: ${response.status} - ${errText.substring(0, 500)}`);
        throw new Error(`Gemini Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    // Debug: Log what Gemini actually returned
    if (data.candidates && data.candidates[0]) {
        const candidate = data.candidates[0];
        console.log(`📋 Gemini finishReason: ${candidate.finishReason || 'N/A'}`);
        if (candidate.content && candidate.content.parts) {
            const partTypes = candidate.content.parts.map(p => {
                if (p.inline_data || p.inlineData) return `image(${(p.inline_data || p.inlineData).mime_type || (p.inline_data || p.inlineData).mimeType})`;
                if (p.text) return `text(${p.text.substring(0, 100)}...)`;
                if (p.file_data || p.fileData) return `file(${JSON.stringify(p.file_data || p.fileData).substring(0, 100)})`;
                return `unknown(keys: ${Object.keys(p).join(', ')}, sample: ${JSON.stringify(p).substring(0, 200)})`;
            });
            console.log(`📋 Gemini parts: [${partTypes.join(', ')}]`);
        } else {
            console.log('📋 Gemini: No content.parts in candidate');
        }
        if (candidate.safetyRatings) {
            const blocked = candidate.safetyRatings.filter(r => r.probability !== 'NEGLIGIBLE' && r.probability !== 'LOW');
            if (blocked.length > 0) {
                console.warn(`⚠️ Gemini safety flags: ${JSON.stringify(blocked)}`);
            }
        }
    } else {
        console.log('📋 Gemini response (no candidates):', JSON.stringify(data).substring(0, 500));
    }

    // Check for prompt feedback (blocked before generation)
    if (data.promptFeedback && data.promptFeedback.blockReason) {
        console.error(`🚫 Gemini blocked prompt: ${data.promptFeedback.blockReason}`);
        throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
    }

    // Handle generateContent response — check multiple possible response formats
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        const parts = data.candidates[0].content.parts;

        // Format 1: inline_data (snake_case)
        const inlinePart = parts.find(p => p.inline_data);
        if (inlinePart && inlinePart.inline_data) {
            console.log('✅ Gemini retornou imagem (inline_data)!');
            return `data:${inlinePart.inline_data.mime_type};base64,${inlinePart.inline_data.data}`;
        }

        // Format 2: inlineData (camelCase — Gemini SDK sometimes uses this)
        const camelPart = parts.find(p => p.inlineData);
        if (camelPart && camelPart.inlineData) {
            console.log('✅ Gemini retornou imagem (inlineData camelCase)!');
            const mimeType = camelPart.inlineData.mimeType || camelPart.inlineData.mime_type;
            return `data:${mimeType};base64,${camelPart.inlineData.data}`;
        }

        // Format 3: file_data / fileData (URL-based response)
        const filePart = parts.find(p => p.file_data || p.fileData);
        if (filePart) {
            const fd = filePart.file_data || filePart.fileData;
            console.log('✅ Gemini retornou imagem (file_data):', JSON.stringify(fd).substring(0, 200));
            if (fd.file_uri || fd.fileUri || fd.uri) {
                return fd.file_uri || fd.fileUri || fd.uri;
            }
        }

        // Format 4: Try raw — some parts may have image data at unexpected keys
        for (const part of parts) {
            const keys = Object.keys(part);
            for (const key of keys) {
                if (key !== 'text' && part[key] && typeof part[key] === 'object' && (part[key].data || part[key].uri)) {
                    console.log(`✅ Gemini retornou imagem (key: ${key})!`);
                    if (part[key].data) {
                        const mime = part[key].mime_type || part[key].mimeType || 'image/png';
                        return `data:${mime};base64,${part[key].data}`;
                    }
                    if (part[key].uri) return part[key].uri;
                }
            }
        }
    }

    throw new Error('Nenhuma imagem retornada pelo Gemini 3 Pro');
}

/**
 * Gera UMA imagem usando Google Gemini (Prioritário) ou Replicate (Fallback)
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @param {string} brandingStyle - Estilo visual da marca (opcional)
 * @param {boolean} isEditorial - Se verdadeiro, aplica a transformação de prompt editorial antes de gerar
 * @param {object} context - Contexto adicional (branding, etc) para o modo editorial
 * @returns {Promise<string>} - URL da imagem gerada (ou Data URI)
 */
async function generateSingleImage(prompt, aspectRatio = '1:1', brandingStyle = '', isEditorial = false, context = {}, referenceImage = null) {
    let finalPrompt = prompt;

    // 0. EDITORIAL MODE TRANSFORMATION
    if (isEditorial) {
        console.log('🎬 MODO EDITORIAL ATIVADO (Single Image): Transformando prompt via GPT...');
        try {
            // Use the extracted helper to generate the system prompt
            const systemPrompt = getEditorialSystemPrompt(prompt, 1, { ...context, brandingStyle, isEditorial: true });

            // Call OpenAI to generate the single definitive prompt
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Gere o prompt para o card único sobre: "${prompt}"` }
                ],
                temperature: 0.7,
            });

            const transformedPrompt = completion.choices[0].message.content.trim();
            console.log(`✨ Prompt Transformado (Editorial):\n${transformedPrompt}`);

            // Clean up Markdown block and any leaked separators
            finalPrompt = transformedPrompt
                .replace(/^```(text)?|```$/g, '')
                .replace(/---SEPARATOR---/g, '')
                .trim();

        } catch (error) {
            console.error('⚠️ Falha na transformação do prompt editorial, usando original:', error);
            // Fallback to appended style if transformation fails
            finalPrompt = `${prompt}\n\nVISUAL STYLE: ${brandingStyle}`;
        }
    } else {
        // Standard Mode: Inject Branding Context simply
        if (brandingStyle) {
            finalPrompt += `\n\nVISUAL STYLE: ${brandingStyle}`;
        }
    }

    // Clean hex codes from prompt to prevent them being rendered as text
    finalPrompt = finalPrompt.replace(/#[0-9a-fA-F]{6}\b/g, '').replace(/#[0-9a-fA-F]{3}\b/g, '').trim();

    // 1. Tentar com Google Gemini primeiro (Se configurado)
    if (process.env.GEMINI_API_KEY) {
        try {
            return await generateImageWithGemini(finalPrompt, aspectRatio, referenceImage);
        } catch (geminiError) {
            console.error('⚠️ Falha no Gemini, tentando Replicate...', geminiError.message);
            // Fallback to Replicate below
        }
    }

    // 2. Replicate (Fallback)
    const aspectRatioMap = {
        '1:1': '1:1',
        '4:5': '4:5',
        '16:9': '16:9',
        '9:16': '9:16'
    };

    const replicateAspectRatio = aspectRatioMap[aspectRatio] || '1:1';

    let input = {
        prompt: finalPrompt,
        aspect_ratio: replicateAspectRatio
    };

    // Custom configuration for 4:5 (Portrait) - High Resolution 2048x2560
    if (aspectRatio === '4:5') {
        input = {
            prompt: finalPrompt,
            size: 'custom',
            width: 2048,
            height: 2560
        };
    } else {
        // Default behavior for other aspect ratios (1:1, 16:9, 9:16)
        input = {
            prompt: finalPrompt,
            size: '4K',
            aspect_ratio: replicateAspectRatio
        };
    }

    const output = await replicate.run('bytedance/seedream-4.5', { input });

    if (output && output.length > 0) {
        return output[0].url();
    }

    throw new Error('Nenhuma imagem retornada pela API (Replicate e Gemini falharam)');
}

/**
 * Gera imagens usando Replicate Seedream 4.5 (modo simples)
 * @param {boolean} isEditorial - Se verdadeiro, ativa o modo editorial
 * @param {object} context - Contexto adicional
 * @returns {Promise<string[]>} - URLs das imagens geradas
 */
export async function generateImages(prompt, aspectRatio = '1:1', count = 1, brandingStyle = '', isEditorial = false, context = {}, referenceImage = null) {
    try {
        console.log('🎨 Gerando imagens com Replicate (modo simples)...');
        console.log(`🖼️ PROMPT GERADO (Single Image):\n${prompt}`); // Explicit Log for Single Image Mode
        console.log(`Aspect Ratio: ${aspectRatio}`);
        console.log(`Count: ${count}`);

        const allImages = [];

        // Gerar imagens uma por vez com o mesmo prompt
        for (let i = 0; i < count; i++) {
            console.log(`Gerando imagem ${i + 1}/${count}...`);
            const imageUrl = await generateSingleImage(prompt, aspectRatio, brandingStyle, isEditorial, context, referenceImage);
            allImages.push(imageUrl);
            console.log(`✅ Imagem ${i + 1} gerada: ${imageUrl}`);
        }

        console.log(`🎉 Total de ${allImages.length} imagens geradas com sucesso!`);
        return allImages;

    } catch (error) {
        console.error('❌ Erro ao gerar imagens:', error);
        throw new Error(`Falha na geração de imagens: ${error.message}`);
    }
}

/**
 * Gera carrossel inteligente: usa OpenAI para criar prompts individuais e Replicate para gerar as imagens
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @param {number} count - Número de cards/imagens
 * @returns {Promise<{images: string[], prompts: string[]}>} - URLs das imagens e prompts usados
 */
export async function generateCarousel(carouselDescription, aspectRatio = '1:1', count, brandingStyle = '') {
    try {
        console.log('🎪 Iniciando geração de carrossel inteligente...');
        console.log(`Descrição geral: ${carouselDescription}`);
        console.log(`Número de cards: ${count}`);

        // Passo 1: Gerar prompts individuais com OpenAI
        const individualPrompts = await generateCarouselPrompts(carouselDescription, count);

        if (individualPrompts.length < count) {
            console.warn(`⚠️ OpenAI gerou apenas ${individualPrompts.length} prompts ao invés de ${count}`);
        }

        // Passo 2: Gerar cada imagem com seu próprio prompt
        const allImages = [];
        for (let i = 0; i < individualPrompts.length; i++) {
            console.log(`\n📸 Gerando card ${i + 1}/${individualPrompts.length}...`);
            console.log(`🖼️ PROMPT GERADO (Card ${i + 1}):\n${individualPrompts[i]}`); // Explicit Log

            const imageUrl = await generateSingleImage(individualPrompts[i], aspectRatio, brandingStyle);
            allImages.push(imageUrl);

            console.log(`✅ Card ${i + 1} gerado com sucesso!`);
        }

        console.log(`\n🎉 Carrossel completo! ${allImages.length} imagens geradas.`);

        return {
            images: allImages,
            prompts: individualPrompts
        };

        // ... existing code ...
        return {
            images: allImages,
            prompts: individualPrompts
        };

    } catch (error) {
        console.error('❌ Erro ao gerar carrossel:', error);
        throw new Error(`Falha na geração do carrossel: ${error.message}`);
    }
}



/**
 * Gera legenda para imagem usando GPT-4o (Vision)
 * @param {string} imageUrl - URL da imagem
 * @param {string} profileName - Nome do perfil (para contexto)
 * @param {string} profileDescription - Descrição do perfil
 * @param {string} guidelines - Diretrizes da marca
 * @returns {Promise<string>} - Legenda gerada
 */
export async function generateImageCaption(imageUrl, profileName, profileDescription, guidelines) {
    try {
        console.log(`👁️ Analisando imagem para gerar legenda (Perfil: ${profileName})...`);

        // Detectar se é "Inner Boost" para forçar inglês
        const isInnerBoost = profileName && profileName.toLowerCase().includes('inner boost');
        const language = isInnerBoost ? 'English' : 'Portuguese (Brazil)';
        const tone = isInnerBoost ? 'Professional, inspiring, and growth-oriented' : 'Engajador e profissional';

        const systemPrompt = `You are an expert Social Media Manager. your task is to write a caption for an Instagram post based on the image provided.
        
Context:
- Profile Name: ${profileName || 'Business Profile'}
- Profile Description: ${profileDescription || 'N/A'}
- Brand Guidelines: ${guidelines || 'N/A'}
- Target Language: ${language}
- Tone: ${tone}

Instructions:
1. Analyze the image visually.
2. Write a caption that relates the image content to the profile's niche.
3. Use the specified language (${language}) ONLY.
4. If Brand Guidelines are provided, strictly follow them.
5. Return ONLY the caption text. No "Here is the caption" or quotes.
6. The caption should be concise, engaging, and encourage interaction.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Write an amazing caption for this image." },
                        {
                            type: "image_url",
                            image_url: {
                                "url": imageUrl,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 300,
        });

        const caption = response.choices[0].message.content.trim();
        console.log('✅ Legenda gerada com sucesso');
        return caption;

    } catch (error) {
        console.error('❌ Erro ao gerar legenda com visão:', error);
        throw new Error(`Falha na geração de legenda: ${error.message}`);
    }
}

/**
 * Gera ideias de posts baseadas no perfil do negócio
 * @param {Object} context - Contexto do perfil (descrição, guidelines, etc)
 * @returns {Promise<Array>} - Array de ideias estruturadas
 */
export async function generatePostIdeas(context = {}) {
    try {
        console.log('💡 Gerando ideias de posts...');
        const { profileName, profileDescription, guidelines, recentPosts } = context;

        let systemContext = `PERFIL: ${profileName || 'Negócio Genérico'}\nDESCRIÇÃO: ${profileDescription || 'Não informada'}`;
        if (guidelines) systemContext += `\nDIRETRIZES: ${guidelines}`;

        const systemPrompt = `Você é um estrategista de conteúdo para Instagram experiente.
Sua tarefa é gerar 3 ideias de posts altamente engajadores e relevantes para o perfil fornecido.

CONTEXTO DO CLIENTE:
${systemContext}

OBJETIVO:
Criar 3 sugestões distintas (ex: 1 educativo, 1 vendas/promoção, 1 conexão/storytelling).
As ideias devem ser focadas em gerar salvamentos e compartilhamentos.`;

        const userPrompt = `Gere 3 ideias de posts no formato JSON.
Para cada ideia inclua:
- title: Título chamativo (gancho)
- description: Breve explicação da ideia e objetivo
- type: 'carousel' ou 'static'
- slideCount: número sugerido de slides (entre 4 e 10 para carrosseis, 1 para static)
- reason: Por que essa ideia vai funcionar (1 frase curta)

    Retorne APENAS o JSON no formato:
    [
      { 
        "title": "...", 
        "description": "...", 
        "type": "carousel", 
        "slideCount": 8, 
        "reason": "..." 
      },
      ...
    ]

    IMPORTANTE SOBRE O CAMPO 'description':
    - O campo 'description' deve ser MUITO RICO e formatado usando Markdown.
    - Ele deve servir como a legenda ou o roteiro completo do post.
    - Estrutura obrigatória para 'description':
        1. Título do Post (em Negrito)
        2. Breve introdução impactante (1-2 frases)
        3. Separador visual (ex: 👇👇👇)
        4. LISTA NUMERADA com os tópicos/slides, incluindo emojis e detalhes para cada um.
        5. Conclusão curta.
    
    EXEMPLO DE 'description':
    "🧠 **Os 4 Pilares da Psicologia Positiva**\n\nA maioria das pessoas busca felicidade, mas poucos a constroem...\n\n👇👇👇\n\n✨ **1️⃣ Gratidão**\nNão é fingir que está tudo bem. É treinar o cérebro.\n\n🛠 **2️⃣ Resiliência**\nAprender a cair sem desistir.\n\n..."
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8,
        });

        const content = completion.choices[0].message.content.trim();
        // Extract JSON if wrapped in markdown code blocks
        const jsonStr = content.replace(/```json\n?|\n?```/g, '');

        const ideas = JSON.parse(jsonStr);
        console.log(`✅ ${ideas.length} ideias geradas com sucesso!`);
        return ideas;

    } catch (error) {
        console.error('❌ Erro ao gerar ideias:', error);
        throw new Error(`Falha na geração de ideias: ${error.message}`);
    }
}

/**
 * Extrai o estilo visual de um prompt existente
 * @param {string} prompt - O prompt de referência
 * @returns {Promise<string>} - Lista de palavras-chave do estilo
 */
export async function extractStyleFromPrompt(prompt) {
    try {
        console.log('🎨 Extraindo estilo do prompt...');

        const systemPrompt = `Você é um especialista em direção de arte e engenharia de prompt para IA.
Sua tarefa é analisar um prompt de geração de imagem e extrair APENAS os elementos que definem o ESTILO VISUAL.

Ignore: O sujeito da imagem (quem/o quê está na cena).
Foque em:
- Estilo artístico (ex: Cyberpunk, Minimalista, Pintura a óleo)
- Iluminação (ex: Neon light, Natural lighting, Golden hour)
- Paleta de cores (ex: Pastel tones, Dark moody colors)
- Renderização/Mídia (ex: 3D render, Octane render, Photography, 8k)
- Vibe/Atmosfera (ex: Futuristic, Melancholic, Cheerful)

Retorne APENAS uma lista de palavras-chave separadas por vírgula em INGLÊS (pois funciona melhor para geração de imagens).`;

        const userPrompt = `Extraia o estilo visual deste prompt:
"${prompt}"

Retorne APENAS as keywords de estilo.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.5,
        });

        const style = completion.choices[0].message.content.trim();
        console.log(`✅ Estilo extraído: ${style}`);
        return style;

    } catch (error) {
        console.error('❌ Erro ao extrair estilo:', error);
        throw new Error(`Falha na extração de estilo: ${error.message}`);
    }
}


