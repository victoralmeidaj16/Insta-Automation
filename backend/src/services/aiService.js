import Replicate from 'replicate';
import OpenAI from 'openai';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Gera prompts individuais para cada card do carrossel usando OpenAI
 * @param {string} carouselDescription - Descrição geral do carrossel
 * @param {number} count - Número de cards/imagens
 * @returns {Promise<string[]>} - Array de prompts individuais
 */
export async function generateCarouselPrompts(carouselDescription, count) {
    try {
        console.log('🤖 Gerando prompts com OpenAI para carrossel...');
        console.log(`Descrição: ${carouselDescription}`);
        console.log(`Número de cards: ${count}`);

        const systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Sua tarefa é pegar uma descrição geral de um carrossel e criar prompts específicos para cada card/slide.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ser coerentes entre si, contando uma história ou apresentando um conceito de forma progressiva.`;

        const userPrompt = `Crie ${count} prompts individuais para um carrossel do Instagram com a seguinte descrição:

"${carouselDescription}"

IMPORTANTE:
- Gere exatamente ${count} prompts
- Cada prompt deve ser detalhado e visual
- Os prompts devem ter uma narrativa ou sequência lógica
- Use linguagem descritiva adequada para geração de imagens
- Retorne apenas os prompts, um por linha, sem numeração ou marcadores

Retorne os prompts separados por quebras de linha.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.8,
        });

        const response = completion.choices[0].message.content;
        const prompts = response
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .slice(0, count); // Garantir que temos exatamente 'count' prompts

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
export async function generateNextCarouselPrompt(carouselDescription, totalCards, currentCardIndex, previousPrompts = []) {
    try {
        console.log(`🤖 Gerando prompt para card ${currentCardIndex + 1}/${totalCards}...`);

        const systemPrompt = `Você é um assistente especializado em criar prompts para geração de imagens de carrosséis no Instagram. 
Você está ajudando a criar um carrossel progressivamente, um card por vez.
Cada prompt deve ser detalhado, visual e otimizado para geração de imagens com IA.
Os prompts devem ter uma narrativa coerente e progressiva.`;

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
- Retorne APENAS o prompt, sem numeração ou explicações adicionais`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.8,
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
async function generateSingleImage(prompt, aspectRatio = '1:1') {
    const aspectRatioMap = {
        '1:1': '1:1',
        '4:5': '4:5',
        '16:9': '16:9',
        '9:16': '9:16'
    };

    const replicateAspectRatio = aspectRatioMap[aspectRatio] || '1:1';

    const input = {
        size: '4K',
        prompt: prompt,
        aspect_ratio: replicateAspectRatio
    };

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
export async function generateImages(prompt, aspectRatio = '1:1', count = 1) {
    try {
        console.log('🎨 Gerando imagens com Replicate (modo simples)...');
        console.log(`Prompt: ${prompt}`);
        console.log(`Aspect Ratio: ${aspectRatio}`);
        console.log(`Count: ${count}`);

        const allImages = [];

        // Gerar imagens uma por vez com o mesmo prompt
        for (let i = 0; i < count; i++) {
            console.log(`Gerando imagem ${i + 1}/${count}...`);
            const imageUrl = await generateSingleImage(prompt, aspectRatio);
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
export async function generateCarousel(carouselDescription, aspectRatio = '1:1', count) {
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

            const imageUrl = await generateSingleImage(individualPrompts[i], aspectRatio);
            allImages.push(imageUrl);

            console.log(`✅ Card ${i + 1} gerado com sucesso!`);
        }

        console.log(`\n🎉 Carrossel completo! ${allImages.length} imagens geradas.`);

        return {
            images: allImages,
            prompts: individualPrompts
        };

    } catch (error) {
        console.error('❌ Erro ao gerar carrossel:', error);
        throw new Error(`Falha na geração do carrossel: ${error.message}`);
    }
}
