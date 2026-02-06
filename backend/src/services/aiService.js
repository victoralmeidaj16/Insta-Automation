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
 * Gera prompts individuais para cada card do carrossel usando OpenAI
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} count - Número de cards/imagens
 * @returns {Promise<string[]>} - Array de prompts individuais
 */
export async function generateCarouselPrompts(carouselDescription, count, context = {}) {
    try {
        console.log('🤖 Gerando prompts com OpenAI para carrossel...');
        console.log(`Descrição: ${carouselDescription}`);
        console.log(`Número de cards: ${count}`);

        // Context truncation to avoid token limits
        const truncate = (str, maxLength = 2000) => str && str.length > maxLength ? str.substring(0, maxLength) + "..." : str;

        const { profileDescription, guidelines, savedPrompts } = context;

        let systemContext = '';
        if (profileDescription) systemContext += `\n\nCONTEXTO DO PERFIL:\n${truncate(profileDescription)}`;
        if (guidelines) systemContext += `\n\nDIRETRIZES DA MARCA (GUIDELINES):\n${truncate(guidelines)}\nIMPORTANTE: Siga estas diretrizes estritamente.`;

        let savedPromptsContext = '';
        if (savedPrompts && savedPrompts.length > 0) {
            // Limit to 5 examples to save tokens
            const recentPrompts = savedPrompts.slice(0, 5);
            savedPromptsContext = `\n\nEXEMPLOS DE ESTILO (Prompts Salvos):\nAqui estão exemplos de prompts que o usuário gosta. Tente seguir um estilo similar:\n${recentPrompts.map(p => `"${p.text}"`).join('\n')}`;
        }

        const systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Sua tarefa é pegar uma descrição geral de um carrossel e criar prompts específicos para cada card/slide.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ser coerentes entre si, contando uma história ou apresentando um conceito de forma progressiva.
${systemContext}
${savedPromptsContext}`;

        const userPrompt = `Crie ${count} prompts individuais para um carrossel do Instagram com a seguinte descrição:

"${truncate(carouselDescription, 3000)}"

IMPORTANTE:
- Generate exactly ${count} prompts
- Each prompt must be detailed and visual
- The prompts must have a narrative or logical sequence
- Use descriptive language suitable for image generation
- Return only the prompts, one per line, without numbering or bullets
- DO NOT use Markdown headers (###), bold (**), or italics
- Se as Diretrizes da Marca exigirem um estilo específico (ex: minimalista, cyberpunk, cores vibrantes), aplique-o em TODOS os prompts.
- **CRITICAL:** Use "TEXT OVERLAY: 'Your Text Here'" explicitly in the prompt description to ensure text appears in the image if needed.
- Para carrosséis, descreva exatamente o texto que deve aparecer na imagem, se houver.

Retorne os prompts separados APENAS por quebras de linha.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;

        if (!response) {
            throw new Error('OpenAI retornou uma resposta vazia (sem conteúdo).');
        }

        const prompts = response
            .split('\n')
            .map(p => p.trim())
            .filter(p => {
                // Filter out empty lines, markdown headers (###), and separators (---)
                return p.length > 0 && !p.startsWith('#') && !p.startsWith('-') && !p.startsWith('*');
            })
            // Remove numbering if present (e.g., "1. prompt")
            .map(p => p.replace(/^\d+[\.\)]\s*/, ''))
            .slice(0, count);

        if (prompts.length === 0) {
            throw new Error('Falha ao processar os prompts gerados (formato inválido).');
        }

        console.log(`✅ ${prompts.length} prompts gerados com sucesso!`);
        prompts.forEach((p, i) => console.log(`   ${i + 1}. ${p.substring(0, 60)}...`));

        return prompts;

    } catch (error) {
        console.error('❌ Erro ao gerar prompts com OpenAI:', error);
        throw new Error(`Falha na geração de prompts: ${error.message}`);
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
/**
 * Gera UMA imagem usando Replicate Seedream 4.5
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @param {string} brandingStyle - Estilo visual da marca (opcional)
 * @returns {Promise<string>} - URL da imagem gerada
 */
async function generateSingleImage(prompt, aspectRatio = '1:1', brandingStyle = '') {
    const aspectRatioMap = {
        '1:1': '1:1',
        '4:5': '4:5',
        '16:9': '16:9',
        '9:16': '9:16'
    };

    const replicateAspectRatio = aspectRatioMap[aspectRatio] || '1:1';

    // Inject Branding Context if provided
    let finalPrompt = prompt;
    if (brandingStyle) {
        finalPrompt += `\n\nVISUAL STYLE: ${brandingStyle}`;
    }

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

    throw new Error('Nenhuma imagem retornada pela API');
}

/**
 * Gera imagens usando Replicate Seedream 4.5 (modo simples)
 * @param {string} prompt - Descrição da imagem
 * @param {string} aspectRatio - Aspect ratio (1:1, 4:5, 16:9, 9:16)
 * @param {number} count - Número de imagens a gerar
 * @returns {Promise<string[]>} - URLs das imagens geradas
 */
export async function generateImages(prompt, aspectRatio = '1:1', count = 1, brandingStyle = '') {
    try {
        console.log('🎨 Gerando imagens com Replicate (modo simples)...');
        console.log(`Prompt: ${prompt}`);
        console.log(`Aspect Ratio: ${aspectRatio}`);
        console.log(`Count: ${count}`);

        const allImages = [];

        // Gerar imagens uma por vez com o mesmo prompt
        for (let i = 0; i < count; i++) {
            console.log(`Gerando imagem ${i + 1}/${count}...`);
            const imageUrl = await generateSingleImage(prompt, aspectRatio, brandingStyle);
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
            console.log(`Prompt: ${individualPrompts[i]}`);

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
