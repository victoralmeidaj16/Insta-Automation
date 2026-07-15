import OpenAI from 'openai';
import axios from 'axios';
import { isFitswapBrand, mergeBrandProfileDefaults } from '../../utils/brandProfiles.js';
import { isPromptRefusal, buildFallbackImagePrompt, buildBrandPromptSections } from '../carousel/brandContextService.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const TONE_INSTRUCTIONS = {
    casual: 'Tom casual e descontraído, como se estivesse conversando com um amigo',
    formal: 'Tom profissional e formal, adequado para negócios',
    motivacional: 'Tom inspirador e motivacional, que engaja e emociona',
    educativo: 'Tom educativo e informativo, que ensina algo valioso',
    divertido: 'Tom divertido e bem-humorado, com leveza e criatividade'
};

function captionLanguage(language = 'pt') {
    return language === 'pt' ? 'Português brasileiro' : 'English';
}

/**
 * Builds the non-vision caption prompt shared by the manual caption route and
 * the upcoming content-plan flow. With no profile context it stays equivalent
 * to the legacy generic prompt.
 */
export function buildCaptionFromBriefSystemPrompt({ context = {}, tone = 'casual', includeHashtags = true, language = 'pt' } = {}) {
    const safeContext = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
    const hasProfileContext = Object.keys(safeContext).length > 0;
    const profile = hasProfileContext ? mergeBrandProfileDefaults(safeContext) : {};
    const brandSections = hasProfileContext
        ? buildBrandPromptSections(profile, { format: 'caption' }).compose(['identity', 'voice', 'caption'])
        : '';
    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.casual;

    return `Você é um especialista em criar captions para Instagram.
Crie captions em ${captionLanguage(language)} que:
- Sejam envolventes e chamem atenção
- Usem ${toneInstruction}
- Tenham entre 2-4 linhas
${includeHashtags ? '- Incluam 5-8 hashtags relevantes no final' : '- NÃO incluam hashtags'}
- Incentivem engajamento (curtidas, comentários, compartilhamentos)
${brandSections ? `\nDIREÇÃO DA MARCA:\n${brandSections}` : ''}
\nRetorne somente a legenda, sem introduções, aspas ou explicações.`;
}

export async function generateCaptionFromBrief({ brief, context = {}, tone = 'casual', includeHashtags = true, language = 'pt' } = {}) {
    const cleanBrief = String(brief || '').trim();
    if (!cleanBrief) throw new Error('Brief/prompt da legenda é obrigatório.');

    const systemPrompt = buildCaptionFromBriefSystemPrompt({ context, tone, includeHashtags, language });
    if (process.env.DEBUG_PROMPTS === '1') {
        console.log(`\n[DEBUG_PROMPTS] generateCaptionFromBrief\n${systemPrompt}\n[/DEBUG_PROMPTS]\n`);
    }

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Crie uma caption para esta imagem/post: ${cleanBrief}` }
        ],
        max_tokens: 300,
        temperature: 0.8,
    });

    const caption = completion.choices?.[0]?.message?.content?.trim();
    if (!caption) throw new Error('OpenAI retornou uma legenda vazia.');
    return caption;
}

/**
 * Helper to fetch an image from a URL and convert it to a base64 Data URI
 */
async function imageUrlToBase64(url) {
    try {
        if (!url || !url.startsWith('http')) return url;
        console.log('🌐 Fetching image for base64 conversion:', url.substring(0, 50) + '...');

        const https = await import('https');
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            httpsAgent: httpsAgent
        });

        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/png';
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error('❌ Failed to convert image URL to base64:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data (truncated):', error.response.data?.toString().substring(0, 100));
        }
        return null;
    }
}

/**
 * Gera legenda para imagem usando GPT-4o (Vision)
 */
export async function generateImageCaption(imageUrl, profileName, profileDescription, guidelines, contextOrEditorialMemory = {}, explicitContext = {}) {
    try {
        console.log(`👁️ Analisando imagem para gerar legenda (Perfil: ${profileName})...`);

        // The fifth parameter was historically passed as editorialMemory by the
        // autopilot despite not being consumed. Keep that call shape compatible
        // while accepting a context object there for UI/API callers.
        const safeContext = explicitContext && typeof explicitContext === 'object' && !Array.isArray(explicitContext)
            ? explicitContext
            : (contextOrEditorialMemory && typeof contextOrEditorialMemory === 'object' && !Array.isArray(contextOrEditorialMemory)
                ? contextOrEditorialMemory
                : {});
        const profile = mergeBrandProfileDefaults({
            ...safeContext,
            brandName: safeContext.brandName || safeContext.name || profileName,
            name: safeContext.name || profileName,
            description: safeContext.description || safeContext.profileDescription || profileDescription,
            profileDescription: safeContext.profileDescription || profileDescription,
            branding: {
                ...(safeContext.branding || {}),
                guidelines: safeContext.branding?.guidelines || guidelines
            }
        });
        const language = profile.brandKit?.preferredLanguage || 'Portuguese (Brazil)';
        const tone = profile.brandKit?.voice || profile.brandKit?.personality || 'Engajador e profissional';
        const brandPromptSections = buildBrandPromptSections(profile, { format: 'caption' })
            .compose(['identity', 'voice', 'caption']);

        const systemPrompt = `You are an expert Social Media Manager. your task is to write a caption for an Instagram post based on the image provided.

${brandPromptSections}

Context:
- Target Language: ${language}
- Tone: ${tone}
Instructions:
1. Analyze the image visually.
2. Write a caption that relates the image content to the profile's niche.
3. Use the specified language (${language}) ONLY.
4. If Brand Guidelines are provided, strictly follow them.
5. Return ONLY the caption text. No "Here is the caption" or quotes.
6. The caption should be concise, engaging, and encourage interaction.`;

        if (process.env.DEBUG_PROMPTS === '1') {
            console.log(`\n[DEBUG_PROMPTS] generateImageCaption\n${systemPrompt}\n[/DEBUG_PROMPTS]\n`);
        }

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
 */
export async function generatePostIdeas(context = {}) {
    try {
        console.log('💡 Gerando ideias de posts...');
        const { profileName, profileDescription, guidelines, recentPosts, brandContext, isBatchMode, count } = context;
        const requestedCount = Math.max(1, Math.min(Number(count) || 3, 10));
        const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName: profileName || context.brandName });
        const brandDisplayName = isFitswap ? 'Fitswap' : (profileName || 'Negócio Genérico');

        let systemContext = `PERFIL: ${brandDisplayName}\nDESCRIÇÃO: ${profileDescription || 'Não informada'}`;
        if (brandContext) systemContext += `\nSOBRE A MARCA (CONTEXTO DETALHADO): ${brandContext}`;
        if (context.contentStrategy) systemContext += `\nESTRATÉGIA DE CONTEÚDO / PILARES: ${context.contentStrategy}`;
        if (guidelines) systemContext += `\nDIRETRIZES: ${guidelines}`;

        console.log(`🔍 [generatePostIdeas] DEBUG: isBatchMode=${isBatchMode} (type: ${typeof isBatchMode})`);

        let systemPrompt = '';
        let userPrompt = '';

        if (isBatchMode) {
            console.log('🔹 [generatePostIdeas] Using BATCH MODE (Single Posts)');
            systemPrompt = `Você é um copywriter sênior experiente.

Sua tarefa é transformar qualquer tema em ideias de POST ESTÁTICO (Imagem Única independentes) seguindo EXATAMENTE este template de alta conversão:

0) TEMA / CONTEÚDO (classificação clara em 1 linha)
1) HEADLINE (máx. 5 palavras, atrativa, sem hype excessivo)
2) SUBHEADLINE (benefício racional curto)
3) FRASE DE PRODUTO/MARCA (o que a marca/produto faz, direto)
4) FRASE IDENTITÁRIA (emocional, conectada aos valores da marca)
5) CTA (convite suave, interativo)
6) DESCRIÇÃO DA IMAGEM (guia visual para IA)

Na seção TEMA / CONTEÚDO:
- Indique a linha editorial e o objetivo do post (ex: autoridade, conversão, identificação emocional).
- Seja direto. Uma linha apenas.

Na seção DESCRIÇÃO DA IMAGEM:
- Descreva de forma objetiva o cenário visual (Ambiente, Pessoa, Ação, Estilo Fotográfico).
- Siga rigorosamente a paleta de cores e identidade descritas no contexto do cliente.
- O post deve comunicar clareza, funcionalidade ou emoção de acordo com a marca.

CONTEXTO DO CLIENTE:
${systemContext}

FORMATO DE SAÍDA (JSON Object):
{
  "ideas": [
    {
      "title": "Headline principal do post",
      "description": "Conteúdo completo formatado em Markdown seguindo o template abaixo",
      "type": "static",
      "slideCount": 1,
      "reason": "Por que esta ideia funciona para o público"
    }
  ]
}

REGRAS PARA 'description':
O campo 'description' deve conter TODO o conteúdo do post formatado em Markdown, seguindo ESTRITAMENTE este formato:

**TEMA / CONTEÚDO:**
[linha editorial + objetivo]

**HEADLINE:**
[texto curto]

**SUBHEADLINE:**
[texto racional]

**FRASE DE PRODUTO:**
[texto funcional]

**FRASE IDENTITÁRIA:**
[texto emocional]

**CTA:**
[texto suave]

**DESCRIÇÃO DA IMAGEM:**
[descrição objetiva da cena e cores]

IMPORTANTE:
- Retorne EXATAMENTE ${requestedCount} ideias dentro de "ideas".
- Não retorne menos nem mais que ${requestedCount} ideias.`;

            userPrompt = `Gere EXATAMENTE ${requestedCount} ideias de posts variados (posts estáticos/únicos) focados no contexto desta marca.`;

        } else {
            // --- MODO CARROSSEL (News / Insight Style) ---
            systemPrompt = `Você é um estrategista de conteúdo para Instagram experiente.
Sua tarefa é gerar EXATAMENTE ${requestedCount} ideias de posts altamente engajadores e relevantes para o perfil fornecido.

CONTEXTO DO CLIENTE:
${systemContext}

OBJETIVO DA ARQUITETURA DE INFORMAÇÃO:
Criar EXATAMENTE ${requestedCount} sugestões de carrosséis focados no estilo "news / insight".
A ESTRUTURA É RIGOROSA:
- NÃO USE estrutura de título + subtítulo explicativo.
- USE "curiosity hooks" (ganchos de curiosidade).
- O tom deve soar como uma revelação surpreendente, não como uma aula.
- Concentre-se no lado psicológico, científico ou em uma quebra de mito.
- Eles não parecem conteúdo educativo. Eles parecem descoberta científica, insight secreto ou informação privilegiada.
- Retorne EXATAMENTE ${requestedCount} itens dentro de "ideas".`;

            userPrompt = `Gere EXATAMENTE ${requestedCount} ideias de posts no formato JSON.
Para cada ideia inclua:
- title: Título da Ideia
- description: Estrutura do post (Roteiro em Bullet points)
- type: 'carousel' ou 'static'
- slideCount: número sugerido de slides (entre 4 e 10 para carrosseis, 1 para static)
- reason: Por que essa ideia vai funcionar (1 frase curta)

    Retorne APENAS o JSON válido no formato:
    {
      "ideas": [
        {
            "title": "...",
            "description": "...",
            "type": "carousel",
            "slideCount": 8,
            "reason": "..."
        },
        ...
      ]
    }

    IMPORTANTE SOBRE O CAMPO 'description':
    - O campo 'description' deve descrever o roteiro do post usando Markdown.
    - O campo DEVE OBRIGATORIAMENTE conter: hook de abertura, subtítulos dos slides, e CTA final.`;
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        const parsed = JSON.parse(content);
        let ideas = Array.isArray(parsed?.ideas)
            ? parsed.ideas
            : (Array.isArray(parsed) ? parsed : []);

        if (ideas.length > requestedCount) {
            ideas = ideas.slice(0, requestedCount);
        }

        if (ideas.length < requestedCount) {
            const missing = requestedCount - ideas.length;
            const repairIdeaExample = isBatchMode
                ? `    {
      "title": "...",
      "description": "...",
      "type": "static",
      "slideCount": 1,
      "reason": "..."
    }`
                : `    {
      "title": "...",
      "description": "...",
      "type": "carousel",
      "slideCount": 5,
      "reason": "..."
    }`;
            console.warn(`⚠️ A IA retornou ${ideas.length}/${requestedCount} ideias. Gerando ${missing} restantes...`);

            const repairPrompt = `Você retornou apenas ${ideas.length} ideias, mas eu preciso de EXATAMENTE ${requestedCount}.
Gere APENAS as ${missing} ideias restantes no mesmo formato JSON.
Não repita ideias já retornadas.
Retorne APENAS:
{
  "ideas": [
${repairIdeaExample}
  ]
}

IDEIAS JÁ GERADAS (NÃO REPETIR):
${JSON.stringify(ideas, null, 2)}`;

            const repairCompletion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: repairPrompt }
                ],
                temperature: 0.4,
                response_format: { type: "json_object" }
            });

            const repairContent = repairCompletion.choices[0].message.content;
            const repairParsed = JSON.parse(repairContent);
            const extraIdeas = Array.isArray(repairParsed?.ideas)
                ? repairParsed.ideas
                : (Array.isArray(repairParsed) ? repairParsed : []);

            ideas = [...ideas, ...extraIdeas].slice(0, requestedCount);
        }

        if (ideas.length === 0) {
            throw new Error('Nenhuma ideia válida foi retornada pela IA.');
        }

        if (ideas.length < requestedCount) {
            throw new Error(`A IA retornou ${ideas.length}/${requestedCount} ideias mesmo após a correção.`);
        }

        console.log(`✅ ${ideas.length} ideias geradas com sucesso!`);
        return ideas;

    } catch (error) {
        console.error('❌ Erro ao gerar ideias:', error);
        throw new Error(`Falha na geração de ideias: ${error.message} `);
    }
}

/**
 * Extrai o estilo visual de um prompt existente
 */
export async function extractStyleFromPrompt(prompt) {
    try {
        console.log('🎨 Extraindo estilo do prompt...');

        const systemPrompt = `Você é um especialista em direção de arte e engenharia de prompt para IA.
Sua tarefa é analisar um prompt de geração de imagem e extrair APENAS os elementos que definem o ESTILO VISUAL.

            Ignore: O sujeito da imagem(quem / o quê está na cena).
Foque em:
        - Estilo artístico(ex: Cyberpunk, Minimalista, Pintura a óleo)
            - Iluminação(ex: Neon light, Natural lighting, Golden hour)
            - Paleta de cores(ex: Pastel tones, Dark moody colors)
                - Renderização / Mídia(ex: 3D render, Octane render, Photography, 8k)
                - Vibe / Atmosfera(ex: Futuristic, Melancholic, Cheerful)

Retorne APENAS uma lista de palavras - chave separadas por vírgula em INGLÊS(pois funciona melhor para geração de imagens).`;

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
        console.log(`✅ Estilo extraído: ${style} `);
        return style;

    } catch (error) {
        console.error('❌ Erro ao extrair estilo:', error);
        throw new Error(`Falha na extração de estilo: ${error.message} `);
    }
}

/**
 * Expande uma ideia central em N posts completos com template de marca
 */
export async function generateVariations(baseIdea, count, context = {}) {
    try {
        console.log(`🧠 Gerando ${count} variações para a ideia: "${baseIdea}"...`);

        const { brandName, brandContext, targetAudience, tone, guidelines, contentStrategy } = context;
        const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName });

        const systemPrompt = `Você é um copywriter sênior da marca ${isFitswap ? 'Fitswap' : (brandName || 'Marca')}.

Sua tarefa é expandir uma "Ideia Central" em ${count} posts completíssimos, seguindo ESTRITAMENTE o "TEMPLATE FIXO ${isFitswap ? 'FITSWAP' : 'DA MARCA'}":

0) TEMA / CONTEÚDO (classificação clara em 1 linha)
1) HEADLINE (máx. 5 palavras, sem hype)
2) SUBHEADLINE (benefício racional curto)
3) FRASE DE PRODUTO (o que o app faz, direto)
4) FRASE IDENTITÁRIA (emocional, humana)
5) CTA (convite suave, sem pressão)
6) DESCRIÇÃO DA IMAGEM (guia para design/IA)

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Sobre: ${brandContext || 'Não informado'}
- Público: ${targetAudience || 'Geral'}
- Tom: ${tone || 'Profissional e Engajador'}
${contentStrategy ? `- Estratégia/Pilares: ${contentStrategy}` : ''}
${guidelines ? `- Diretrizes de Marca: ${guidelines}` : ''}

FORMATO DE SAÍDA (JSON array):
[
    {
        "headline": "MARKDOWN COMPLETO DO POST, seguindo o template abaixo",
        "visualConcept": "PROMPT DE IMAGEM COMPLETO EM INGLÊS",
        "captionDraft": "Resumo da legenda"
    }
]

REGRAS PARA 'headline':
O campo 'headline' deve conter TODO o conteúdo do post formatado em Markdown, seguindo ESTRITAMENTE este formato:

**TEMA / CONTEÚDO:**
[linha editorial + objetivo]

**HEADLINE:**
[texto curto]

**SUBHEADLINE:**
[texto racional]

**FRASE DE PRODUTO:**
[texto funcional]

**FRASE IDENTITÁRIA:**
[texto emocional]

**CTA:**
[texto suave]

**DESCRIÇÃO DA IMAGEM:**
[descrição objetiva da cena]`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Ideia Central: "${baseIdea}"\nQuantidade: ${count}` }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content;
        const parsed = JSON.parse(responseContent);
        const variations = Array.isArray(parsed) ? parsed : (parsed.variations || parsed.posts || parsed.ideas || []);

        return variations.slice(0, count);

    } catch (error) {
        console.error('❌ Erro ao gerar variações:', error);
        throw new Error(`Falha na geração de variações: ${error.message} `);
    }
}

/**
 * Gera N ideias de posts estáticos relacionados a uma ideia semente
 */
export async function generateRelatedIdeas(baseIdea, count, context = {}) {
    try {
        console.log(`🧠 Gerando ${count} ideias relacionadas à base: "${baseIdea}"...`);

        const { brandName, brandContext, targetAudience, tone } = context;
        const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName });

        const systemPrompt = `Você é um copywriter sênior da marca ${isFitswap ? 'Fitswap' : (brandName || 'Marca')}.

Sua tarefa é expandir uma "Ideia Semente" em ${count} ideias de POSTS ESTÁTICOS NOVOS, seguindo EXATAMENTE este template:

0) TEMA / CONTEÚDO (classificação clara em 1 linha)
1) HEADLINE (máx. 5 palavras, sem hype)
2) SUBHEADLINE (benefício racional curto)
3) FRASE DE PRODUTO (o que o app faz, direto)
4) FRASE IDENTITÁRIA (emocional, humana)
5) CTA (convite suave, sem pressão)
6) DESCRIÇÃO DA IMAGEM (guia para design/IA)

IDEIA SEMENTE (BASE):
"${baseIdea}"

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Sobre: ${brandContext || 'Não informado'}
- Público: ${targetAudience || 'Geral'}
- Tom: ${tone || 'Profissional e Engajador'}

FORMATO DE SAÍDA (JSON Object):
{
  "ideas": [
    {
      "title": "Headline do Post",
      "description": "Conteúdo completo formatado em Markdown seguindo o template abaixo",
      "reason": "Por que esse ângulo funciona"
    }
  ]
}

REGRAS PARA 'description':
O campo 'description' deve conter TODO o conteúdo do post formatado em Markdown, seguindo ESTRITAMENTE este formato:

**TEMA / CONTEÚDO:**
[linha editorial + objetivo]

**HEADLINE:**
[texto curto]

**SUBHEADLINE:**
[texto racional]

**FRASE DE PRODUTO:**
[texto funcional]

**FRASE IDENTITÁRIA:**
[texto emocional]

**CTA:**
[texto suave]

**DESCRIÇÃO DA IMAGEM:**
[descrição objetiva da cena]`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Ideia Semente: "${baseIdea}"\nQuantidade: ${count}` }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content;

        let parsed;
        try {
            parsed = JSON.parse(responseContent);
        } catch (e) {
            const match = responseContent.match(/```json\n([\s\S]*?)\n```/) || responseContent.match(/```\n([\s\S]*?)\n```/);
            if (match) {
                try {
                    parsed = JSON.parse(match[1]);
                } catch (e2) {
                    throw new Error('Invalid JSON format from AI');
                }
            } else {
                throw new Error('Could not parse AI response as JSON');
            }
        }

        const ideas = Array.isArray(parsed) ? parsed : (parsed.ideas || parsed.posts || parsed.variations || []);

        return ideas.slice(0, count);

    } catch (error) {
        console.error('❌ Erro ao gerar ideias relacionadas:', error);
        throw new Error(`Falha na geração de ideias relacionadas: ${error.message}`);
    }
}

/**
 * Gera um prompt de imagem detalhado a partir de um conceito de post
 */
export async function generateImagePrompt(concept, context = {}) {
    try {
        console.log(`🎨 Gerando prompt de imagem para conceito: "${concept.substring(0, 50)}..."`);

        const { brandName, brandContext, brandingStyle, savedPrompts, contentStrategy } = context;
        const guidelines = context.branding?.guidelines || '';

        const recentPrompts = savedPrompts && Array.isArray(savedPrompts) ? savedPrompts.slice(0, 3) : [];
        const savedPromptsText = recentPrompts.length > 0
            ? `\nEXAMPLES OF STYLE (Follow these): \n${recentPrompts.map(p => `"${p.text || p}"`).join('\n')}`
            : '';

        // Tenta extrair Headline e Subheadline do markdown para garantir o overlay
        let extractedHeadline = '';
        let extractedSubheadline = '';

        try {
            const headlineMatch = concept.match(/\*\*HEADLINE:\*\*\s*([^\n]+)/i) || concept.match(/^#\s+([^\n]+)/m);
            const subheadlineMatch = concept.match(/\*\*SUBHEADLINE:\*\*\s*([^\n]+)/i);
            const cardMatch = concept.match(/\*\*Card\s+\d+:\*\*\s*([^\n]+)/i);

            if (headlineMatch) extractedHeadline = headlineMatch[1].trim();
            else if (cardMatch) extractedHeadline = cardMatch[1].trim();
            if (subheadlineMatch) extractedSubheadline = subheadlineMatch[1].trim();

            const lines = concept.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                if (!extractedHeadline && trimmed.startsWith('# ')) {
                    extractedHeadline = trimmed.replace(/^#\s*/, '').trim();
                    continue;
                }

                if (!extractedSubheadline && trimmed.includes('🔹 SUBHEADLINE')) {
                    const index = lines.indexOf(line);
                    if (lines[index + 1]) {
                        extractedSubheadline = lines[index + 1].trim().replace(/\*\*/g, '');
                    }
                    continue;
                }

                if (!extractedSubheadline && trimmed.length > 10 && !trimmed.startsWith('#') && !trimmed.startsWith('**')) {
                    extractedSubheadline = trimmed.replace(/\*\*/g, '').trim();
                }
            }
        } catch (e) {
            console.warn('Falha ao extrair headline/subheadline manualmente:', e);
        }

        const overlayInstruction = extractedHeadline
            ? `Overlay text (MUST BE IN PORTUGUESE - BRAZIL | DEVE ESTAR EM PORTUGUÊS DO BRASIL, color: ${context.branding?.primaryColor || 'White'} or contrasting): "${extractedHeadline.toUpperCase()}"\n"${extractedSubheadline}"`
            : `Overlay text (MUST BE IN PORTUGUESE - BRAZIL | DEVE ESTAR EM PORTUGUÊS DO BRASIL, color: ${context.branding?.primaryColor || 'White'} or contrasting): [HEADLINE EM PORTUGUÊS]\n[SUBHEADLINE EM PORTUGUÊS]`;

        const referencePrompt = context.referenceStyle || (savedPrompts && savedPrompts.length > 0 ? (savedPrompts[0].text || savedPrompts[0]) : null);

        let systemPrompt = '';

        if (context.isPremiumCarousel) {
            // Try multiple formats: legacy "**Card X:**", structured "**HEADLINE:**", or raw text
            const cardMessageMatch = concept.match(/\*\*Card\s+\d+:\*\*\s*([\s\S]+?)$/i);
            const headlineMatch = concept.match(/\*\*HEADLINE:\*\*\s*([^\n]+)/i);
            const subheadlineMatch2 = concept.match(/\*\*SUBHEADLINE:\*\*\s*([^\n]+)/i);
            const temaMatch = concept.match(/\*\*TEMA\s*[\/\\]?\s*CONTE[ÚU]DO:\*\*\s*([^\n]+)/i);

            const cardMessage = cardMessageMatch
                ? cardMessageMatch[1].trim()
                : headlineMatch
                    ? [temaMatch?.[1], headlineMatch[1], subheadlineMatch2?.[1]].filter(Boolean).join(' — ')
                    : concept;
            const backgroundStyleMatch = concept.match(/\*\*Imagem de Fundo:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Card\s+\d+:\*\*|$)/i);
            const centralThemeMatch = concept.match(/\*\*Tema Central:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|$)/i);
            const backgroundStyle = backgroundStyleMatch ? backgroundStyleMatch[1].trim() : '';
            const centralTheme = centralThemeMatch ? centralThemeMatch[1].trim() : '';

            const isFitswap = isFitswapBrand({ brandKey: context.brandKey, brandName });

            if (isFitswap) {
                console.log('💎🎬 Using FITSWAP NARRATIVE-DRIVEN PREMIUM CAROUSEL TEMPLATE');
                console.log(`📝 Card message extracted: "${cardMessage.substring(0, 80)}..."`);

                const fitswapGuidelines = context?.branding?.guidelines || context?.guidelines || '';

                systemPrompt = `You are a Senior Art Director for Fitswap — a Brazilian AI-powered food decision engine that transforms what people have, crave, or habitually eat into personalized healthy meals, without manual planning.

CRITICAL RULE — THE MOST IMPORTANT INSTRUCTION:
The overlay text will be rendered IN LARGE BOLD TYPOGRAPHY directly on top of this image.
Your job is NOT to illustrate or re-explain the card message visually.
Your job is to create a BACKGROUND SCENE that makes the overlay text land HARDER when the viewer reads it.
Ask yourself: "What food/kitchen scene would amplify the emotional impact of this specific text?"
The image and the text must feel like they belong together — image sets the stage, text delivers the revelation.

STOP-SCROLLING METHODOLOGY — choose ONE per card:
1. VISUAL PARADOX: Something conceptually impossible or contradictory (e.g., an apple filled with candy to say "natural ≠ nutritious")
2. UNEXPECTED JUXTAPOSITION: Two things that shouldn't be together, creating immediate tension
3. CONCEPTUAL CLOSE-UP: Extreme close-up of ONE hero element that embodies the entire message — maximum impact
4. EMOTIONAL MICRO-MOMENT: Real, raw human expression or gesture that instantly communicates the emotion

REAL EXAMPLES OF CORRECT REASONING:
- Overlay: "A CONSISTÊNCIA NÃO É SOBRE FORÇA DE VONTADE. É SOBRE ESTRUTURA." → CORRECT: 5 identical meal prep containers perfectly aligned in a row, top-down shot on white surface. Neon lime lid on each. → WRONG: a ceramic bowl balanced on a glass rod (abstract, no food context)
- Overlay: "VOCÊ NÃO FALHOU NA DIETA. VOCÊ FALHOU NA DECISÃO." → CORRECT: A hand frozen mid-reach between two options on a white counter — a granola bar and a chocolate bar — caught in the moment of indecision. → WRONG: generic sad portrait without food
- Overlay: "INGREDIENTES 'NATURAIS' NEM SEMPRE SIGNIFICAM NUTRITIVOS." → CORRECT: Red apple cut open revealing colorful candy inside. (This is ideal — visual paradox in food context)
- Overlay: "SUA ALIMENTAÇÃO PRECISA CABER NA SUA VIDA." → CORRECT: A realistic weekly meal calendar filled with simple, diverse meals — not a gourmet spread, but an achievable plan.

TECHNICAL SPECS:
- Ratio 4:5 vertical (1080×1350)
- Soft directional daylight, high-key lighting
- Canon EOS R5, 50mm f/2.0
- Clean negative space in the lower 40% for text overlay — keep this zone light, simple, and uncluttered
- NEVER generate readable text, letters, or words in the image
${fitswapGuidelines ? `- Additional brand guidelines: ${fitswapGuidelines}` : ''}

OUTPUT FORMAT:
Return ONLY the final image prompt in English. Start with the visual scene/concept, then lighting, camera angle, and technique. Be specific, grounded in food context, and intentional.`;

            } else {
                console.log('🎬 Using NARRATIVE-DRIVEN PREMIUM CAROUSEL TEMPLATE');
                const primaryColor = context.branding?.primaryColor || '#00C2FF';
                const brandStyle = brandingStyle || 'premium editorial lifestyle';
                console.log(`📝 Card message extracted: "${cardMessage.substring(0, 80)}..."`);

                systemPrompt = `You are a Visual Storytelling Director specialized in premium Instagram carousels.

CORE PRINCIPLE:
Every image must be a STOP-SCROLLING VISUAL METAPHOR of THIS SPECIFIC CARD'S MESSAGE.
The image must communicate the same meaning as the card text — even without words.
IGNORE the background suggestion — it is only a mood reference, NOT the visual concept.

STOP-SCROLLING METHODOLOGY — choose ONE per card:
1. VISUAL PARADOX: Something conceptually impossible or contradictory (e.g., an apple filled with candy to say "natural ≠ nutritious")
2. UNEXPECTED JUXTAPOSITION: Two things that shouldn't be together, creating immediate tension
3. CONCEPTUAL CLOSE-UP: Extreme close-up of ONE hero element that embodies the entire message — maximum impact
4. EMOTIONAL MICRO-MOMENT: Real, raw human expression or gesture that instantly communicates the emotion

MANDATORY PROCESS (reason step by step):
1. MESSAGE: What does THIS CARD's text say literally?
2. TENSION/PARADOX: What is the core contradiction, revelation, or emotional hook in this message?
3. STOP-SCROLLING CHOICE: Which approach (paradox/juxtaposition/close-up/emotion) best communicates it?
4. SCENE: Translate into a specific, surprising visual — NOT the obvious illustration of the topic

IMAGE RULES:
- FORBIDDEN: generic stock aesthetics, obvious topic illustrations (e.g., "health card = apple on table"), reusing background scenes, people smiling without reason
- Every card MUST have a DISTINCT visual concept — not variations of the same scene
- Real micro-expressions if human: authentic, unposed, emotionally specific
- The image must answer: "Does this stop my scroll and make me feel something?" — if not, it's wrong

TECHNICAL SPECS:
- Ratio 4:5 vertical (1080×1350)
- Shot on Canon EOS R5, 50mm f/2.0
- Clean negative space in the lower 40% for text overlay
- NEVER generate readable text, letters, or words in the image
- Brand color (${primaryColor}) subtly in lighting, props, or accents — never dominant
- Brand aesthetic: ${brandStyle}
${guidelines ? `- Brand guidelines: ${guidelines}` : ''}

OUTPUT FORMAT:
Return ONLY the image prompt in English. Start with the visual scene/concept, then camera angle, lighting, and technique.
Be specific, surprising, and intentional.`;
            }

        } else if (isFitswapBrand({ brandKey: context.brandKey, brandName })) {
            console.log('💎 Using EXCLUSIVE FITSWAP MASTER TEMPLATE');

            systemPrompt = `Você é um Diretor de Arte Sênior da Fitswap.
Sua missão é converter o "Conceito Visual" em um PROMPT DE IMAGEM seguindo RIGOROSAMENTE o "MODELO-MESTRE FITSWAP".

NUNCA desvie da estrutura. NUNCA invente estilos fora do guideline.

DIRETRIZES FITSWAP:
- Cena Visual: DEVE VARIAR dependendo do conceito. Pode ser um ambiente clean, um close-up, uma textura, ou um sujeito. Não repita sempre "mulher na cozinha".
- Background: ultra-clean premium environment with soft daylight, organized surfaces, no clutter.
- Palette: White (#FFFFFF), Dark Gray (#111827), Medium Gray (#6B7280), Neon Lime (#A6F000).
- Textures: natural skin, matte ceramic, polished glass, soft fabric, smartphone glass (if applicable).
- Fonts: Inter / SF Pro. Títulos Bold/ExtraBold, apoio Medium.
- Produto: tecnologia que resolve alimentação sem esforço.

ESTRUTURA OBRIGATÓRIA DO PROMPT (Preencha os [] com base no conceito):

"A premium vertical lifestyle photo (Ratio 4:5, 1080×1350), shot with soft directional daylight. Captured Shot on Canon EOS R5, 50mm f/2.0.
The camera is positioned [ÂNGULO], creating [SENSAÇÃO VISUAL].

At the center: [CENA OU SUJEITO PRINCIPAL. Varie enormemente. Pode ser um objeto, pessoa, comida, ou textura abstrata. Extraia do conceito].

The scene represents a moment of [NARRATIVA].
Supporting elements: [OBJETOS RELACIONADOS].

[OPCIONAL - MAS SÓ SE FIZER SENTIDO PARA O CONCEITO: The smartphone emits a subtle glow in Neon Lime (#A6F000), suggesting the Fitswap interface (no readable text).]

${!context.isPremiumCarousel ? `On-screen text (Overlay):
Position: Top Left or Top Right (Clean negative space).
Font: Inter Medium.
Color: Dark Gray (#111827).
Main phrase: "${extractedHeadline ? extractedHeadline.toUpperCase() : '[INSERIR HEADLINE CURTA DO CONCEITO]'}"
Optional subtext: "${extractedSubheadline || '[INSERIR SUBHEADLINE]'}"` : `[CRITICAL RULE: DO NOT GENERATE ANY READABLE TEXT, LETTERS, OR WORDS ON THE IMAGE. NO TEXT IN BACKGROUND. TEXT WILL BE ADDED VIA OVERLAY LATER.]`}

Background: [CENÁRIO DE FUNDO EXTRAÍDO DO CONCEITO - ultra-clean with matte surfaces, soft shadows, no clutter].
Palette: White (#FFFFFF) primary, Dark Gray (#111827) secondary, Neon Lime (#A6F000) accents.
Textures: [TEXTURAS RELEVANTES].

Visual effects: soft bloom, micro grain, selective focus, subtle bokeh.

The image conveys: [EMOÇÕES-CHAVE].
Brand perception: Modern wellness-tech solving real-life food friction with calm elegance."

SAÍDA:
Retorne APENAS o texto do prompt final em INGLÊS, preenchido e polido.`;

        } else if ((brandName || '').toLowerCase().includes('inner boost')) {
            console.log('🧠 Using EXCLUSIVE INNER BOOST MASTER TEMPLATE');

            systemPrompt = `Você é um Diretor de Arte Sênior da Inner Boost.
Sua missão é criar um PROMPT VISUAL seguindo a "BRAND BIBLE INNER BOOST" (v1.0).

CONCEITO CENTRAL: "Espelho Mental Brutal".
Se a imagem conforta -> está errada. Tem que incomodar com elegância.

DIRETRIZES VISUAIS (BÍBLIA):
- Paleta: Black (#0B0B0D), Dark Gray (#111111), Neon Blue (#00C2FF), Neon Green (#00F5A0).
- Proibido: Luz quente, sol, sorrisos, "cozy".
- Mood: Dark, Heavy, Introspective.
- Assinatura: Floating 3D thought cards.

ESTRUTURA OBRIGATÓRIA DO PROMPT (Preencha os []):

"Create a dark, minimalist, emotionally intense vertical image in Inner Boost's modern style (4:5, 1080×1350).

Background: [Tipo: Abstract Void / Dark Bedroom / Night Desk / Psychological Background], with subtle texture, particles, and soft haze.
Color palette: Black (#0B0B0D) dominant, Neon Blue (#00C2FF), Neon Green (#00F5A0).

Main subject: [DESCRIBE A SCENE based on the Concept. Do not just copy the text. Create a visual metaphor or literal scene], expressing [Anxiety/Guilt/Overwhelm/Frustration].
Add floating 3D thought cards with white text and subtle blue/green glow.

${!context.isPremiumCarousel ? `Main text (Overlay):
Position: Top/Center/Bottom (Clean negative space).
Font: Bold Modern Sans.
Color: White with neon glow.
Text: "${extractedHeadline ? extractedHeadline.toUpperCase() : '[HEADLINE]'}"` : `[CRITICAL RULE: DO NOT GENERATE ANY READABLE TEXT, LETTERS, OR WORDS ON THE IMAGE. NO TEXT IN BACKGROUND. TEXT WILL BE ADDED VIA OVERLAY LATER.]`}

Textures: digital noise, soft grain, light haze, neon reflections.
Lighting: dramatic, high contrast, cinematic.
Atmosphere: heavy, introspective, uncomfortable, relatable.
"

SAÍDA:
Retorne APENAS o texto do prompt final em INGLÊS.`;

        } else if (referencePrompt) {
            console.log('🎨 Using Style Transfer Mode with reference:', referencePrompt.substring(0, 50) + '...');

            systemPrompt = `Você é um diretor de arte de IA sênior especializado em "Style Transfer" e estética editorial.
Sua missão é criar um NOVO prompt de imagem para um NOVO conceito, mas MANTENDO ESTRITAMENTE o estilo visual (câmera, luz, cores, vibe) de um "Prompt de Referência".

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Estilo: ${brandingStyle || 'Premium editorial lifestyle'}

---

PROMPT DE REFERÊNCIA (ESTILO A SEGUIR):
"${referencePrompt}"

---

NOVO CONCEITO (AÇÃO/SUJEITO A CRIAR):
"${concept}"

---

REGRAS DE ADAPTAÇÃO:
1. MANTENHA O ESTILO: Use a mesma iluminação, ângulo de câmera, tipo de lente, grão, cores e atmosfera do Reference Prompt.
2. MUDE O SUJEITO/AÇÃO: Descreva a cena baseada no "NOVO CONCEITO". Se o conceito é "Cozinhar", o sujeito deve estar coziando, não segurando um celular (a menos que o conceito peça).
3. ELEMENTOS OBRIGATÓRIOS DA MARCA:
   - Se o Reference Prompt tiver "Neon Lime glow", mantenha.
   - Se houver referência de UI do Fitswap, tente incorporar se fizer sentido (ex: celular na bancada).
4. TEXT OVERLAY OBRIGATÓRIO:
   ${overlayInstruction}

SAÍDA:
Retorne APENAS o texto do novo prompt em INGLÊS. O prompt deve ser detalhado e fluido, pronto para o DALL-E 3.`;

        } else {
            const primaryColor = context.branding?.primaryColor || 'Neon Lime';
            const secondaryColor = context.branding?.secondaryColor || 'Deep Black';
            const brandStyle = brandingStyle || 'Premium editorial lifestyle';

            systemPrompt = `Você é um diretor de arte de IA sênior especializado em estética editorial e identidade visual de marca.
Sua missão é transformar um "Conceito de Post" em um prompt de geração de imagem altamente detalhado, SEGUINDO RIGOROSAMENTE AS DIRETRIZES DA MARCA.

CONTEXTO DA MARCA:
- Nome: ${brandName || 'Marca'}
- Estilo: ${brandStyle}
- Cor Primária: ${primaryColor}
- Cor Secundária: ${secondaryColor}
${guidelines ? `- DIRETRIZES DA MARCA: ${guidelines}` : ''}

REGRAS VISUAIS:
1. **ESTILO E ILUMINAÇÃO:**
   - Use o estilo definido: "${brandStyle}".
   - Incorpore as Diretrizes da Marca (${guidelines || 'N/A'}) se fornecidas.
   - Iluminação e atmosfera devem seguir a identidade visual da marca.
   - Detalhes sutis na Cor Primária (${primaryColor}) para branding.

2. **COMPOSIÇÃO E LEITURA:**
   - A imagem deve ser composta de forma profissional.
   - IMPORTANTE: Garanta espaço negativo limpo (clean negative space) suficiente para inserção de texto (headline), preferencialmente no topo ou lateral.
   - O sujeito principal deve estar em destaque.

3. **CORES:**
   - Use a Cor Secundária (${secondaryColor}) para fundos ou elementos de contraste.
   - Use a Cor Primária (${primaryColor}) para destaques (accents).

REGRAS OBRIGATÓRIAS (Prompt Base):
Crie um prompt detalhado, criativo e de alta qualidade para o DALL-E 3 baseado no conceito: "${concept}".
Integre o estilo "${brandStyle}" de forma natural.

${overlayInstruction}

REGRA DE IDIOMA DO TEXTO OVERLAY:
Qualquer texto visível NA IMAGEM (headline, subheadline, overlay) DEVE obrigatoriamente estar em Português do Brasil.
O prompt de imagem pode ser escrito em inglês, mas os textos que aparecerão na imagem gerada devem ser em PT-BR.

Retorne APENAS o texto do prompt final, em INGLÊS. SEJA CRIATIVO e EVITE repetições robóticas de templates.`;
        }

        // Build user message: for premium carousel, clearly separate card message from style context
        let userMessage;
        if (context.isPremiumCarousel) {
            // Try multiple formats: legacy "**Card X:**", structured "**HEADLINE:**", or raw text
            const cardMessageMatch = concept.match(/\*\*Card\s+\d+:\*\*\s*([\s\S]+?)$/i);
            const headlineLineMatch = concept.match(/\*\*HEADLINE:\*\*\s*([^\n]+)/i);
            const subheadlineLineMatch = concept.match(/\*\*SUBHEADLINE:\*\*\s*([^\n]+)/i);
            const temaLineMatch = concept.match(/\*\*TEMA\s*[\/\\]?\s*CONTE[ÚU]DO:\*\*\s*([^\n]+)/i);

            const cardMessage = cardMessageMatch
                ? cardMessageMatch[1].trim()
                : headlineLineMatch
                    ? [temaLineMatch?.[1], headlineLineMatch[1], subheadlineLineMatch?.[1]].filter(Boolean).join(' — ')
                    : concept;
            const backgroundStyleMatch = concept.match(/\*\*Imagem de Fundo:\*\*\s*([\s\S]*?)(?=\n\s*\*\*Card\s+\d+:\*\*|$)/i);
            const centralThemeMatch = concept.match(/\*\*Tema Central:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|$)/i);
            const backgroundStyle = backgroundStyleMatch ? backgroundStyleMatch[1].trim() : '';
            const centralTheme = centralThemeMatch ? centralThemeMatch[1].trim() : '';

        const isFitswapBrandForMsg = isFitswapBrand({ brandKey: context.brandKey, brandName });
        const brandSegment = context.productService || context.branding?.productService || '';
        const sceneContext = isFitswapBrandForMsg
            ? 'Create a food/kitchen scene that COMPLEMENTS this specific overlay text.'
            : `Create a scene that COMPLEMENTS this specific overlay text and fits the brand's segment: "${brandSegment || brandName || 'the brand'}".`;

        userMessage = `OVERLAY TEXT (this is what will appear in large bold typography ON TOP of the image):
"${cardMessage}"

This text already says the words. Your image must SET THE STAGE so these words land harder — not re-explain them.
${sceneContext}
${centralTheme ? `\nCARROUSSEL THEME (context only): "${centralTheme}"` : ''}
${backgroundStyle ? `\nSTYLE REFERENCE (mood/color only, do NOT copy this scene literally): "${backgroundStyle}"` : ''}`;
        } else {
            userMessage = `Conceito Visual: "${concept}"`;
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            temperature: 0.7,
        });

        let generatedPrompt = completion.choices[0].message.content?.trim() || '';
        console.log(`✅ Prompt gerado (primeiros 120 chars): "${generatedPrompt.substring(0, 120)}..."`);

        // For premium carousels: prepend structured overlay tags extracted from the concept brief,
        // so buildPremiumLayoutFromPrompt gets [TITLE:] and [HIGHLIGHTS:] instead of falling back
        // to raw brief text as the headline.
        if (context.isPremiumCarousel) {
            const headlineMatch = concept.match(/\*\*HEADLINE:\*\*\s*([^\n]+)/i);
            const subheadlineMatch = concept.match(/\*\*SUBHEADLINE:\*\*\s*([^\n]+)/i);
            const temaMatch = concept.match(/\*\*TEMA\s*[\/\\]?\s*CONTE[ÚU]DO:\*\*\s*([^\n]+)/i);

            const headline = headlineMatch?.[1]?.trim() || '';
            const subheadline = subheadlineMatch?.[1]?.trim() || '';
            const tema = temaMatch?.[1]?.trim() || '';

            if (headline) {
                // Auto-derive highlights from subheadline (2-3 key words) if no explicit highlights
                const highlights = subheadline
                    ? subheadline.split(/[\s,;—\-]+/).filter(w => w.length > 3).slice(0, 3).join(', ').toUpperCase()
                    : '';

                const overlayPrefix = [
                    `[TITLE: ${headline}]`,
                    subheadline ? `[SUBHEADLINE: ${subheadline}]` : '',
                    highlights ? `[HIGHLIGHTS: ${highlights}]` : '',
                    tema ? `[TEMA: ${tema}]` : '',
                ].filter(Boolean).join('\n');

                generatedPrompt = `${overlayPrefix}\n[BACKGROUND: ${generatedPrompt}]`;
                console.log(`🏷️ Premium overlay tags injetados: TITLE="${headline}" | HIGHLIGHTS="${highlights}"`);
            }
        }

        if (isPromptRefusal(generatedPrompt)) {
            console.warn('⚠️ Modelo recusou o conceito. Usando fallback determinístico para gerar prompt visual.');
            return buildFallbackImagePrompt(concept, context);
        }

        return generatedPrompt;

    } catch (error) {
        console.error('❌ Erro ao gerar prompt de imagem:', error);
        console.warn('⚠️ Aplicando fallback determinístico após erro no modelo de prompt.');
        return buildFallbackImagePrompt(concept, context);
    }
}

/**
 * Gera variações de um modelo de prompt substituindo campos em chaves { }
 */
export async function generateTemplateVariations(templateText, count, context = {}) {
    try {
        console.log(`🧠 Gerando ${count} variações para o template de prompt...`);

        const systemPrompt = `Você é um diretor de arte de IA especializado em geração de imagens e engenharia de prompts.
Sua tarefa é analisar o TEMPLATE DE PROMPT abaixo. O usuário colocou palavras-chave ou instruções entre chaves { }, indicando variáveis que devem ser substituídas pela IA.
Crie ${count} opções diferentes de prompts substituindo inteligentemente o conteúdo dentro de TODAS as chaves { }.

REGRAS:
1. Retorne EXATAMENTE ${count} variações do prompt completo.
2. Cada variação deve ser o TEXTO INTEIRO original do prompt, mas com as { } substituídas por suas ideias criativas focando no nicho solicitado.
3. Não mude a estrutura do texto fora das { }.
4. Mantenha fiel ao contexto visual e à intenção original do usuário.
5. As opções preenchidas devem fazer sentido e oferecer uma boa diversidade de temas para geração.
6. Não deixe NENHUMA chave { } no texto final. Substitua todas.

TEMPLATE DE PROMPT DO USUÁRIO:
"""
${templateText}
"""

FORMATO DE SAÍDA OBRIGATÓRIO (JSON Object):
{
  "prompts": [
    "Variação 1 completa aqui com substituições...",
    "Variação 2 completa aqui com substituições..."
  ]
}
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Gere as ${count} variações na estrutura JSON solicitada.` }
            ],
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content;
        const parsed = JSON.parse(responseContent);
        const prompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
        if (prompts.length === 0) {
            throw new Error('Nenhuma variação foi gerada.');
        }

        return prompts.slice(0, count);

    } catch (error) {
        console.error('❌ Erro ao gerar variações de template:', error);
        throw new Error(`Falha na geração de variações de template: ${error.message}`);
    }
}
