import Replicate from 'replicate';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createFitswapComposition } from '../editorialCompositionService.js';
import { createFitswapWhiteComposition } from '../fitswapWhiteCompositionService.js';
import { createPremiumComposition } from '../premiumCompositionService.js';
import { createScientificComposition } from '../scientificCompositionService.js';
import { getBrandReferenceImages, isFitswapBrand, mergeBrandProfileDefaults, normalizeBrandKey } from '../../utils/brandProfiles.js';
import { uploadBase64ToFirebase, compositeLogoOverlay } from './imageStorageService.js';
import { generateImageWithGemini, generateImageWithSeedream } from './imageGenerationAdapters.js';
import {
    buildFallbackImagePrompt,
    buildFitswapBrandContext,
    buildImageBrandingPrompt,
    enforceFitswapPromptGuardrails,
    parseStructuredFitswapPrompt,
    sanitizeBackgroundPromptForImageGeneration,
    stripSocialHashtags,
} from '../carousel/brandContextService.js';
import { getEditorialSystemPrompt, generateCarouselPrompts } from '../carousel/carouselPromptService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Verifica se o prompt menciona elementos de interface de celular/app
 */
function promptMentionsPhoneScreen(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    const keywords = [
        'celular', 'phone', 'smartphone', 'mobile', 'interface', 'app ', 'application',
        'screen', 'display', 'dashboard', 'mockup', 'ui ', 'ux ', 'ios', 'android', 'tablet'
    ];
    return keywords.some(kw => lower.includes(kw));
}

/**
 * Gera UMA imagem (Abstração principal)
 */
export async function generateSingleImage(prompt, aspectRatio = '1:1', brandingStyle = '', isEditorial = false, context = {}, referenceImage = null, model = 'gemini') {
    let finalPrompt = prompt || '';
    const brandKey = context.brandKey || normalizeBrandKey(context);
    const isFitswap = isFitswapBrand({ brandKey, brandName: context.brandName, name: context.name });
    const fitswapProfile = isFitswap ? buildFitswapBrandContext({ ...context, brandKey }) : null;
    const skipLegacyOverlayComposition = Boolean(
        context.skipLegacyOverlayComposition ||
        context.isPremiumCarousel ||
        context.overlayMode === 'premium'
    );
    const brandingPrompt = buildImageBrandingPrompt(context, {
        backgroundOnly: skipLegacyOverlayComposition
    });

    let enhancedReferenceImages = [
        ...(referenceImage ? (Array.isArray(referenceImage) ? referenceImage : [referenceImage]) : []),
        ...getBrandReferenceImages({
            ...(fitswapProfile || context),
            brandName: context.brandName,
            name: context.brandName,
            brandKey
        })
    ].filter(Boolean);

    enhancedReferenceImages = [...new Set(enhancedReferenceImages)];

    // Modo premium: o background deve sair SEM logo (overlay é aplicado depois),
    // então logos não podem ir como referência visual. Limita a 3 referências de estilo.
    if (skipLegacyOverlayComposition) {
        const logoRefs = new Set([
            context.logoUrl,
            context.branding?.logoUrl,
            context.branding?.logo,
            fitswapProfile?.branding?.logoUrl,
            fitswapProfile?.branding?.logo
        ].filter(Boolean));
        enhancedReferenceImages = enhancedReferenceImages
            .filter(img => !logoRefs.has(img))
            .slice(0, 3);
    }

    // Injeção Contextual de App Screenshot
    const appScreenshotUrl = context.brandKit?.appScreenshotUrl || context.appScreenshotUrl;
    if (appScreenshotUrl && promptMentionsPhoneScreen(finalPrompt)) {
        console.log('📱 App Screenshot detectado como relevante para o prompt. Injetando como referência prioritária.');
        enhancedReferenceImages.unshift(appScreenshotUrl);

        // Adicionar instrução contextual
        const appInstruction = `\n\n[CRITICAL REFERENCE]: Use the provided app screenshot as the exact visual content to be displayed on the screen of the device (phone/laptop) shown in the scene. The elements, colors, and branding of that screenshot must be clearly visible on the screen in high detail.`;
        finalPrompt += appInstruction;
    }


    const isViverMais = (context.brandName && context.brandName.toLowerCase().includes('viver mais')) ||
        finalPrompt.toLowerCase().includes('viver mais');

    if ((isEditorial || isViverMais) && isViverMais) {
        try {
            const logoPath = path.resolve(__dirname, '../../assets/logo-viver-mais.png');
            if (fs.existsSync(logoPath)) {
                console.log('🏷️ Injetando logo "Viver Mais" como referência visual...');
                const logoBuffer = fs.readFileSync(logoPath);
                const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                enhancedReferenceImages.push(logoBase64);
            } else {
                console.warn(`⚠️ Logo Viver Mais não encontrado em: ${logoPath}`);
            }
        } catch (error) {
            console.error('⚠️ Erro ao carregar logo Viver Mais:', error);
        }
    }

    const fitswapStructured = parseStructuredFitswapPrompt(finalPrompt);
    const shouldUseFitswapComposition = isFitswap && fitswapStructured.isStructured;

    if (!isViverMais && !shouldUseFitswapComposition && finalPrompt) {
        finalPrompt = stripSocialHashtags(finalPrompt);
    }

    let finalImageUrl = null;

    if (!finalPrompt && context.attachLogo && enhancedReferenceImages.length > 0) {
        console.log('⏭️ Prompt vazio mas attachLogo ativo. Pulando geração de IA e aplicando logo diretamente na imagem original.');
        finalImageUrl = enhancedReferenceImages[0];
    } else {
        if (shouldUseFitswapComposition) {
            console.log('🟢 Prompt Fitswap estruturado detectado. Gerando apenas o background antes da composição editorial.');
            finalPrompt = sanitizeBackgroundPromptForImageGeneration(fitswapStructured.background);
        } else if (finalPrompt.includes('[WHITE_OVERLAY]')) {
            const bgMatchWO = finalPrompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
            if (bgMatchWO) {
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(bgMatchWO[1].trim());
                console.log('🟢 Prompt WHITE_OVERLAY: extraído background para geração de imagem:', finalPrompt.substring(0, 80) + '...');
            } else {
                finalPrompt = finalPrompt
                    .replace(/\[WHITE_OVERLAY\]/gi, '')
                    .replace(/\[HEADLINE:[^\]]*\]/gi, '')
                    .replace(/\[HIGHLIGHTS:[^\]]*\]/gi, '')
                    .trim();
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(finalPrompt);
            }
        } else if (finalPrompt.includes('[PREMIUM_OVERLAY]')) {
            const bgMatchPO = finalPrompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
            if (bgMatchPO) {
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(bgMatchPO[1].trim());
                console.log('🟢 Prompt PREMIUM_OVERLAY: extraído background para geração de imagem:', finalPrompt.substring(0, 80) + '...');
            } else {
                finalPrompt = finalPrompt
                    .replace(/\[PREMIUM_OVERLAY\]/gi, '')
                    .replace(/\[TITLE:[^\]]*\]/gi, '')
                    .replace(/\[HIGHLIGHTS:[^\]]*\]/gi, '')
                    .trim();
                finalPrompt = sanitizeBackgroundPromptForImageGeneration(finalPrompt);
            }
        }

        if (isEditorial && !shouldUseFitswapComposition) {
            console.log(`🎬 MODO EDITORIAL/CARROSSEL ATIVADO (Single Image): Transformando prompt via GPT...`);
            try {
                const mergedContext = mergeBrandProfileDefaults({ ...context, brandKey });
                const systemPrompt = getEditorialSystemPrompt(finalPrompt, 1, { ...mergedContext, brandingStyle, isEditorial: true });

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Gere o prompt para o card único sobre: "${finalPrompt}"` }
                    ],
                    temperature: 0.7,
                });

                let transformedPrompt = completion.choices[0].message.content.trim();
                transformedPrompt = transformedPrompt
                    .replace(/^```(text|json|markdown)?|```$/g, '')
                    .replace(/---SEPARATOR---/g, '')
                    .trim();

                finalPrompt = stripSocialHashtags(transformedPrompt);
            } catch (error) {
                console.error('⚠️ Falha na transformação do prompt editorial, usando original:', error);
                finalPrompt = `${finalPrompt}\n\nVISUAL STYLE: ${brandingStyle}`;
            }
        }

        if (!shouldUseFitswapComposition) {
            if (brandingStyle) {
                finalPrompt += `\n\nVISUAL STYLE: ${brandingStyle}`;
            }
            if (brandingPrompt) {
                finalPrompt += `\n\nBRAND DIRECTION:\n${brandingPrompt}`;
            }
        }

        // For Premium Carousel mode, sanitize any remaining text/overlay instructions
        if (skipLegacyOverlayComposition) {
            finalPrompt = finalPrompt
                .replace(/On-screen text\s*\(Overlay\)[\s\S]*?(?=\n\n|Background:|Visual effects:|$)/gi, '')
                .replace(/Main phrase:\s*"[^"]*"/gi, '')
                .replace(/Optional subtext:\s*"[^"]*"/gi, '')
                .replace(/Font:\s*Inter\s*(Medium|Bold|Regular)[.,]?\s*/gi, '')
                .replace(/Color:\s*Dark Gray\s*\([^)]*\)[.,]?\s*/gi, '')
                .trim();
            finalPrompt = `[CRITICAL INSTRUCTION: Generate ONLY the photographic scene. DO NOT render any text, letters, words, headlines, typography, or UI elements on the image. The image must contain NO readable characters whatsoever.]\n\n${finalPrompt}`;

            if (enhancedReferenceImages.length > 0) {
                finalPrompt = `[STYLE REFERENCE]: Match the photographic style, lighting, color grade and overall mood of the attached reference image(s). Do NOT copy their subject or composition, and NEVER reproduce any logo, watermark or text visible in them.\n\n${finalPrompt}`;
            }
        }

        finalPrompt = stripSocialHashtags(finalPrompt);
        finalPrompt = enforceFitswapPromptGuardrails(finalPrompt, { ...context, brandKey });

        if (context.attachLogo) {
            finalPrompt += `\n\n[INSTRUÇÃO DO SISTEMA]: A arte gerada NÃO PODE CONTER LOGOMARCAS, ASSINATURAS OU MARCAS D'ÁGUA ("Inner Boost" ou outras). A logomarca oficial do cliente será inserida eletronicamente pelo nosso sistema na imagem final, então mantenha os cantos inferiores limpos para encaixe perfeito. Foque absolutamente apenas no conceito criativo solicitado no prompt.`;
        }

        if (model === 'gemini' && process.env.GEMINI_API_KEY) {
            try {
                finalImageUrl = await generateImageWithGemini(finalPrompt, aspectRatio, enhancedReferenceImages);
                console.log(`📡 finalImageUrl após Gemini: type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 100) : 'NOT_A_STRING'}`);
            } catch (geminiError) {
                console.error('⚠️ Falha no Gemini, tentando Replicate (Fallback)...', geminiError.message);
            }
        } else if (model === 'seedream') {
            console.log('🤖 Usando modelo Seedream 4.5 (via BytePlus)...');
            try {
                finalImageUrl = await generateImageWithSeedream(finalPrompt, aspectRatio, enhancedReferenceImages.length > 0 ? enhancedReferenceImages : null);
                console.log(`📡 finalImageUrl após Seedream (BytePlus): type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 100) : 'NOT_A_STRING'}`);
            } catch (seedreamError) {
                console.error('⚠️ Falha no Seedream (BytePlus):', seedreamError.message);
                if (!process.env.REPLICATE_API_TOKEN) throw seedreamError;
            }
        }
    }

    console.log(`📡 finalImageUrl antes do Replicate Fallback: type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 50) : 'NOT_A_STRING'}`);

    // Replicate (Fallback) if not generated yet
    if (!finalImageUrl) {
        const aspectRatioMap = {
            '1:1': '1:1',
            '4:5': '3:4',
            '16:9': '16:9',
            '9:16': '9:16'
        };

        const replicateAspectRatio = aspectRatioMap[aspectRatio] || '1:1';
        const seed = Math.floor(Math.random() * 2147483647);
        console.log(`🎲 Seed gerada: ${seed}`);

        let input = {
            prompt: finalPrompt,
            aspect_ratio: replicateAspectRatio,
            seed: seed,
            disable_safety_checker: true,
            safety_tolerance: 5
        };

        if (!process.env.REPLICATE_API_TOKEN) {
            throw new Error('Todas as tentativas falharam e REPLICATE_API_TOKEN não está configurado.');
        }

        const client = replicate;

        console.log(`🚀 Enviando requisição para Replicate (Fallback/Default)...`);

        if (enhancedReferenceImages.length > 0) {
            input.image = enhancedReferenceImages;
        }

        const output = await client.run('bytedance/seedream-4.5', { input });

        if (output && output.length > 0) {
            const rawOutput = typeof output[0] === 'string' ? output[0] : (output[0].url ? (typeof output[0].url === 'function' ? output[0].url() : output[0].url) : output[0]);
            finalImageUrl = String(rawOutput);
            console.log(`📡 finalImageUrl após Replicate (Fallback): type=${typeof finalImageUrl}, value=${finalImageUrl.substring(0, 100)}`);
        } else {
            throw new Error('Nenhuma imagem retornada pela API (Replicate e Gemini falharam)');
        }
    }

    console.log(`📡 finalImageUrl após toda geração: type=${typeof finalImageUrl}, value=${typeof finalImageUrl === 'string' ? finalImageUrl.substring(0, 50) : 'NOT_A_STRING'}`);

    // POST-PROCESSING: Composite Logo if requested
    if (finalImageUrl && context.attachLogo) {
        const logoBasename = brandKey === 'inner-boost' ? 'inner-boost-logo.png' :
            brandKey === 'viver-mais' ? 'logo-viver-mais.png' : 'logo.png';
        const logoPath = path.resolve(__dirname, `../../assets/${logoBasename}`);

        if (fs.existsSync(logoPath)) {
            console.log(`🖼️ Aplicando logo ${logoBasename} pixel-perfect com Sharp...`);
            finalImageUrl = await compositeLogoOverlay(finalImageUrl, logoPath);
        } else {
            console.warn('⚠️ Não foi possível aplicar logo: arquivo não encontrado', logoPath);
        }
    }

    const isWhiteOverlay = prompt && prompt.includes('[WHITE_OVERLAY]');
    const isCarouselStructured = !isWhiteOverlay && prompt && prompt.includes('[BACKGROUND:') && prompt.includes('[HEADLINE:');

    if (finalImageUrl && isWhiteOverlay && !skipLegacyOverlayComposition) {
        console.log('🟢 Aplicando composição Fitswap White Overlay...');
        const hlMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
        const headline = hlMatch ? hlMatch[1].trim() : '';
        const highlights = hgMatch ? hgMatch[1].trim().split(',').map(s => s.trim().toUpperCase()) : [];
        const logoUrl = context.branding?.logoUrl || context.branding?.logo || null;
        finalImageUrl = await createFitswapWhiteComposition(finalImageUrl, {
            headline,
            highlights,
            brandName: context.brandName || context.name || 'Fitswap',
            logoUrl,
            options: { primaryColor: '#A6F000' }
        });
        console.log(`📡 finalImageUrl após createFitswapWhiteComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && isCarouselStructured && !skipLegacyOverlayComposition) {
        console.log('🧱 Aplicando composição editorial Carrossel (structured overlay)...');
        const bgMatch = prompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
        const hlMatch = prompt.match(/\[HEADLINE:\s*(.*?)\]/i);
        const subMatch = prompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
        const headline = hlMatch ? hlMatch[1].trim() : '';
        const subheadline = subMatch ? subMatch[1].trim() : '';
        const highlights = hgMatch ? hgMatch[1].trim().split(',').map(s => s.trim().toUpperCase()) : [];
        const logoUrl = context.branding?.logoUrl || context.branding?.logo || null;
        finalImageUrl = await createScientificComposition(finalImageUrl, headline, subheadline, highlights, logoUrl, {
            primaryColor: context.branding?.primaryColor || context.primaryColor,
            brandName: context.brandName || context.name || 'Sua Marca'
        });
        console.log(`📡 finalImageUrl após createScientificComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && prompt && prompt.includes('[PREMIUM_OVERLAY]') && !skipLegacyOverlayComposition) {
        console.log('🟢 Aplicando composição Premium Overlay...');
        const titleMatch = prompt.match(/\[TITLE:\s*(.*?)\]/i);
        const hgMatch = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const highlights = hgMatch ? hgMatch[1].trim().split(',').map(s => s.trim().toUpperCase()) : [];

        const logoUrl = context.branding?.logoUrl || context.branding?.logo || null;

        let logoIcon = '🧠';
        if (context.brandKey === 'fitswap') logoIcon = '🍎';
        if (context.brandKey === 'viver-mais') logoIcon = '✨';

        finalImageUrl = await createPremiumComposition(finalImageUrl, {
            title,
            highlights,
            brandName: context.brandName || context.name || 'Empresa',
            logoUrl,
            primaryColor: context.branding?.primaryColor || context.primaryColor,
            logoIcon: context.branding?.logoIcon || logoIcon
        });
        console.log(`📡 finalImageUrl após createPremiumComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && shouldUseFitswapComposition && !skipLegacyOverlayComposition) {
        console.log('🧱 Aplicando composição editorial Fitswap...');
        finalImageUrl = await createFitswapComposition(finalImageUrl, {
            headline: fitswapStructured.headline,
            subheadline: fitswapStructured.subheadline,
            highlights: fitswapStructured.highlights,
            logoUrl: fitswapProfile?.branding?.logoUrl || fitswapProfile?.branding?.logo || null,
            aspectRatio,
            options: {
                primaryColor: fitswapProfile?.branding?.primaryColor || context.primaryColor,
                secondaryColor: fitswapProfile?.branding?.secondaryColor || context.secondaryColor,
                bodyColor: '#6B7280',
                brandName: fitswapProfile?.name || context.brandName || 'Fitswap'
            }
        });
        console.log(`📡 finalImageUrl após createFitswapComposition: type=${typeof finalImageUrl}`);
    } else if (finalImageUrl && skipLegacyOverlayComposition) {
        console.log('⏭️ Composição legada ignorada. Retornando apenas o background bruto para overlay no cliente.');
    }

    // Convert Base64 payload into a public cloud storage URL
    if (finalImageUrl && typeof finalImageUrl === 'string' && finalImageUrl.startsWith('data:image/')) {
        finalImageUrl = await uploadBase64ToFirebase(finalImageUrl);
    }

    if (finalImageUrl && typeof finalImageUrl !== 'string') {
        finalImageUrl = String(finalImageUrl);
    }

    return finalImageUrl;
}

/**
 * Gera N imagens usando o mesmo prompt (modo simples)
 */
export async function generateImages(prompt, aspectRatio = '1:1', count = 1, brandingStyle = '', isEditorial = false, context = {}, referenceImage = null, model = 'gemini') {
    try {
        console.log('🎨 Gerando imagens com Replicate (modo simples)...');
        console.log(`🖼️ PROMPT GERADO (Single Image):\n${prompt}`);
        console.log(`Aspect Ratio: ${aspectRatio}`);
        console.log(`Count: ${count}`);

        const allImages = [];

        for (let i = 0; i < count; i++) {
            console.log(`Gerando imagem ${i + 1}/${count}...`);
            const imageUrl = await generateSingleImage(prompt, aspectRatio, brandingStyle, isEditorial, context, referenceImage, model);
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
 */
export async function generateCarousel(promptsOrDescription, aspectRatio = '1:1', count = 1, brandingStyle = '', model = 'gemini', context = {}, businessProfileId = null) {
    try {
        console.log('🎪 Iniciando geração de carrossel inteligente...');

        let individualPrompts = [];
        const isArray = Array.isArray(promptsOrDescription);

        if (isArray) {
            individualPrompts = promptsOrDescription;
            console.log(`Utilizando ${individualPrompts.length} prompts fornecidos diretamente.`);
        } else {
            console.log(`Gerando ${count} prompts para a descrição: ${promptsOrDescription}`);
            individualPrompts = await generateCarouselPrompts(promptsOrDescription, count, { ...context, isEditorial: true });
        }

        if (!isArray && individualPrompts.length < count) {
            console.warn(`⚠️ OpenAI gerou apenas ${individualPrompts.length} prompts ao invés de ${count}`);
        }

        // No modo premium (backgrounds crus, sem overlay), o 1º slide vira âncora de estilo
        // dos seguintes — mesma luz, mesmo color grade, mesma "fotografia" no carrossel inteiro.
        const isPremiumFlow = Boolean(
            context.isPremiumCarousel ||
            context.overlayMode === 'premium' ||
            context.skipLegacyOverlayComposition
        );
        let styleAnchorImage = null;

        const allImages = [];
        for (let i = 0; i < individualPrompts.length; i++) {
            const currentPrompt = individualPrompts[i];
            console.log(`\n📸 Gerando card ${i + 1}/${individualPrompts.length}...`);

            const safePrompt = String(currentPrompt || '');
            console.log(`📡 Prompt ${i + 1} type: ${typeof safePrompt}`);

            const slideReference = isPremiumFlow && styleAnchorImage ? [styleAnchorImage] : null;
            const imageUrl = await generateSingleImage(safePrompt, aspectRatio, brandingStyle, false, context, slideReference, model, businessProfileId);
            allImages.push(imageUrl);

            if (isPremiumFlow && !styleAnchorImage && imageUrl) {
                styleAnchorImage = imageUrl;
            }

            console.log(`✅ Card ${i + 1} gerado com sucesso!`);
        }

        console.log(`\n🎉 Carrossel completo! ${allImages.length} imagens geradas.`);

        return {
            images: allImages,
            prompts: individualPrompts
        };
    } catch (error) {
        console.error('❌ Erro ao gerar carrossel:', error);
        throw error;
    }
}
