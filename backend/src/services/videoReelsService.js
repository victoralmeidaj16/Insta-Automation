/**
 * videoReelsService.js
 * Orquestrador completo da pipeline de geração de Reels com IA.
 * 
 * Fluxo: Script → Plano de Produção → Âncora → Cenas → Vídeos → Montagem Final
 * 
 * Adaptado para perfis de negócio do Insta-Automation:
 * - Prompts contextualizados com brand name, cores, guidelines, persona
 * - Upload de assets para Firebase Storage
 * - Armazenamento de estado em memória + JSON local
 */

import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { storage } from '../config/firebase.js';
import { animateImageToVideo } from '../utils/klingClient.js';
import { getBusinessProfile } from './businessProfileService.js';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// ─── Storage dir ─────────────────────────────────────────────────────────────
const REELS_DIR = process.env.REELS_STORAGE_DIR
    ? path.resolve(process.env.REELS_STORAGE_DIR)
    : path.resolve(__dirname, '../../data/reels');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(REELS_DIR);

async function downloadImageAsBase64(url) {
    if (!url) return null;
    try {
        console.log(`📥 Baixando imagem de referência da UI do app: ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const contentType = response.headers['content-type'] || 'image/png';
        const base64 = Buffer.from(response.data).toString('base64');
        return { base64, mimeType: contentType };
    } catch (err) {
        console.warn(`⚠️ Erro ao baixar imagem de referência da URL ${url}:`, err.message);
        return null;
    }
}

// ─── In-memory state (also persisted to JSON) ─────────────────────────────
const projects = new Map();

// ─── Firebase Upload Helper ───────────────────────────────────────────────
async function uploadFileToFirebase(filePath, mimeType = 'image/png') {
    try {
        const ext = path.extname(filePath).replace('.', '') || 'bin';
        const fileName = `reels/${uuidv4()}.${ext}`;
        const fileUpload = storage.file(fileName);
        const buffer = fs.readFileSync(filePath);

        await fileUpload.save(buffer, { metadata: { contentType: mimeType } });
        await fileUpload.makePublic();

        const publicUrl = `https://storage.googleapis.com/${storage.name}/${fileName}`;
        console.log(`☁️  Uploaded to Firebase: ${publicUrl}`);
        return publicUrl;
    } catch (err) {
        console.error('❌ Firebase upload failed:', err.message);
        return null; // degrade gracefully
    }
}

async function uploadBase64ToFirebase(base64DataUri, ext = 'png') {
    try {
        const match = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) throw new Error('Invalid base64 URI');

        const mimeType = match[1];
        const buf = Buffer.from(match[2], 'base64');
        const tempFile = path.join(REELS_DIR, `tmp_${uuidv4()}.${ext}`);
        fs.writeFileSync(tempFile, buf);

        const url = await uploadFileToFirebase(tempFile, mimeType);
        fs.unlinkSync(tempFile);
        return url;
    } catch (err) {
        console.error('❌ uploadBase64ToFirebase error:', err.message);
        return null;
    }
}

function buildNarrationText(project) {
    return (project.scenes || [])
        .slice()
        .sort((a, b) => a.id - b.id)
        .map(scene => String(scene.voiceover || '').trim())
        .filter(Boolean)
        .join('\n\n');
}

function normalizeSubtitleText(value) {
    return String(value || '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function wrapSubtitleText(text, maxLineLength = 34, maxLines = 2) {
    const words = normalizeSubtitleText(text).split(' ').filter(Boolean);
    const lines = [];
    let current = '';

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxLineLength) {
            current = next;
            continue;
        }
        if (current) lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
    }

    if (current && lines.length < maxLines) lines.push(current);

    const usedWords = lines.join(' ').split(' ').filter(Boolean).length;
    if (usedWords < words.length && lines.length > 0) {
        lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.!,;:]+$/, '')}...`;
    }

    return lines.join('\\N');
}

function formatAssTime(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const centiseconds = Math.round(safeSeconds * 100);
    const cs = centiseconds % 100;
    const totalSeconds = Math.floor(centiseconds / 100);
    const s = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const m = totalMinutes % 60;
    const h = Math.floor(totalMinutes / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text) {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}');
}

function buildSubtitleEvents(project) {
    let cursor = 0;
    return (project.scenes || [])
        .slice()
        .sort((a, b) => a.id - b.id)
        .map(scene => {
            const duration = Math.max(1, Number(scene.duration) || 5);
            const start = cursor;
            const end = cursor + duration;
            cursor = end;

            const text = normalizeSubtitleText(scene.voiceover || scene.on_screen_text);
            if (!text) return null;

            return {
                start,
                end,
                text: escapeAssText(wrapSubtitleText(text)),
            };
        })
        .filter(Boolean);
}

function writeSubtitleFile(project, outputPath) {
    const events = buildSubtitleEvents(project);
    if (events.length === 0) return 0;

    const body = events
        .map(event => `Dialogue: 0,${formatAssTime(event.start)},${formatAssTime(event.end)},Default,,0,0,0,,${event.text}`)
        .join('\n');

    const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,58,&H00FFFFFF,&H000000FF,&H80000000,&HAA000000,-1,0,0,0,100,100,0,0,3,3,0,2,80,80,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${body}
`;

    fs.writeFileSync(outputPath, ass);
    return events.length;
}

function escapeSubtitleFilterPath(filePath) {
    return String(filePath)
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'");
}

async function burnSubtitles(inputPath, outputPath, subtitlesPath) {
    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-vf', `subtitles='${escapeSubtitleFilterPath(subtitlesPath)}'`,
                '-c:v libx264',
                '-preset fast',
                '-crf 22',
                '-r 30',
                '-pix_fmt yuv420p',
                '-movflags +faststart',
            ])
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

async function generateElevenLabsNarration(project, outputPath) {
    const text = buildNarrationText(project);
    if (!text) {
        project.narration_status = 'skipped';
        project.narration_error = null;
        return null;
    }

    if (!process.env.ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY não configurada para gerar narração');
    }

    project.narration_status = 'generating';
    project.narration_text = text;
    project.narration_error = null;
    saveState(project);

    const voiceId = project.elevenlabs_voice_id || ELEVENLABS_VOICE_ID;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

    const response = await axios.post(url, {
        text,
        model_id: ELEVENLABS_TTS_MODEL,
        voice_settings: {
            stability: 0.48,
            similarity_boost: 0.78,
            style: 0.12,
            use_speaker_boost: true,
        },
    }, {
        responseType: 'arraybuffer',
        headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
        },
        timeout: 120000,
    });

    fs.writeFileSync(outputPath, Buffer.from(response.data));
    const firebaseUrl = await uploadFileToFirebase(outputPath, 'audio/mpeg');

    project.narration_status = 'done';
    project.narration_local_path = outputPath;
    project.narration_url = firebaseUrl || `local:${outputPath}`;
    project.narration_voice_id = voiceId;
    saveState(project);

    return outputPath;
}

// ─── State helpers ────────────────────────────────────────────────────────
function saveState(project) {
    const dir = path.join(REELS_DIR, project.id);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(project, null, 2));
    projects.set(project.id, project);
}

function loadProjects() {
    if (!fs.existsSync(REELS_DIR)) return;
    const entries = fs.readdirSync(REELS_DIR);
    for (const entry of entries) {
        const stateFile = path.join(REELS_DIR, entry, 'state.json');
        if (fs.existsSync(stateFile)) {
            try {
                const p = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                projects.set(p.id, p);
            } catch (_) { /* skip corrupt */ }
        }
    }
}

loadProjects();

// ─── Gemini helpers ───────────────────────────────────────────────────────

/**
 * Build brand context string from business profile.
 */
function normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    return String(value)
        .split(/\n|,/)
        .map(item => item.trim())
        .filter(Boolean);
}

function compactText(value, maxLength = 900) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function addSection(parts, title, lines) {
    const body = lines.filter(Boolean).join('\n');
    if (body) parts.push(`## ${title}\n${body}`);
}

function buildBrandContext(profile = {}) {
    const parts = [];
    const branding = profile.branding || {};
    const aiPreferences = profile.aiPreferences || {};
    const brandKit = profile.brandKit || {};
    const editorialPillars = normalizeList(profile.editorialPillars);
    const valuePillars = normalizeList(brandKit.valuePillars);
    const editorialLines = normalizeList(brandKit.editorialLines);
    const doAlways = normalizeList(brandKit.doAlways);
    const neverUse = normalizeList(brandKit.neverUse);
    const referencePrompts = normalizeList(brandKit.referencePrompts).slice(0, 4);
    const favoritePrompts = normalizeList(aiPreferences.favoritePrompts?.map?.(prompt => prompt?.text || prompt?.description || prompt?.name)).slice(0, 4);

    addSection(parts, 'Brand Identity', [
        profile.name ? `Brand name: ${profile.name}` : '',
        profile.brandKey ? `Brand key/internal preset: ${profile.brandKey}` : '',
        profile.description ? `Description: ${compactText(profile.description)}` : '',
        profile.brandContext ? `Strategic brand context: ${compactText(profile.brandContext, 1400)}` : '',
        brandKit.coreMessage ? `Core message: ${compactText(brandKit.coreMessage, 500)}` : '',
        brandKit.personality ? `Personality: ${compactText(brandKit.personality, 500)}` : '',
    ]);

    addSection(parts, 'Audience, Offer and Positioning', [
        profile.targetAudience ? `Target audience: ${compactText(profile.targetAudience, 1000)}` : '',
        profile.productService ? `Product/service: ${compactText(profile.productService, 1200)}` : '',
        profile.contentStrategy ? `Content strategy: ${compactText(profile.contentStrategy, 1400)}` : '',
        valuePillars.length ? `Value pillars: ${valuePillars.join(' | ')}` : '',
        editorialPillars.length ? `Editorial pillars: ${editorialPillars.join(' | ')}` : '',
        editorialLines.length ? `Editorial lines: ${editorialLines.join(' | ')}` : '',
    ]);

    addSection(parts, 'Voice and Copy Rules', [
        aiPreferences.tone ? `Tone of voice: ${compactText(aiPreferences.tone, 600)}` : '',
        aiPreferences.style ? `AI style preference: ${compactText(aiPreferences.style, 600)}` : '',
        aiPreferences.promptTemplate ? `Reusable prompt/template preference: ${compactText(aiPreferences.promptTemplate, 800)}` : '',
        doAlways.length ? `Always do: ${doAlways.join(' | ')}` : '',
        neverUse.length ? `Never use: ${neverUse.join(' | ')}` : '',
    ]);

    addSection(parts, 'Visual Direction', [
        branding.style ? `Visual style: ${compactText(branding.style, 900)}` : '',
        branding.primaryColor ? `Primary color: ${branding.primaryColor}` : '',
        branding.secondaryColor ? `Secondary color: ${branding.secondaryColor}` : '',
        branding.guidelines ? `Brand visual guidelines: ${compactText(branding.guidelines, 1600)}` : '',
        brandKit.uiPatterns?.length ? `UI/layout patterns: ${normalizeList(brandKit.uiPatterns).join(' | ')}` : '',
        brandKit.visualReferenceUrls?.length ? `Visual reference URLs: ${normalizeList(brandKit.visualReferenceUrls).join(' | ')}` : '',
        brandKit.appUiReferenceUrls?.length ? `App/UI reference URLs: ${normalizeList(brandKit.appUiReferenceUrls).join(' | ')}` : '',
    ]);

    addSection(parts, 'Reference Prompts', [
        referencePrompts.length ? referencePrompts.map((prompt, index) => `Reference ${index + 1}: ${compactText(prompt, 700)}`).join('\n') : '',
        favoritePrompts.length ? favoritePrompts.map((prompt, index) => `Favorite prompt ${index + 1}: ${compactText(prompt, 500)}`).join('\n') : '',
    ]);

    return parts.join('\n\n');
}

function isGeminiQuotaError(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 429
        || message.includes('429')
        || message.includes('too many requests')
        || message.includes('resource exhausted')
        || message.includes('quota');
}

function isGeminiConfigError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('gemini_api_key') || message.includes('api key');
}

function getGeminiUserMessage(error, operation = 'processar a solicitação') {
    if (isGeminiQuotaError(error)) {
        return `Limite do Gemini atingido ao ${operation}. Aguarde alguns minutos ou troque a GEMINI_API_KEY.`;
    }

    if (isGeminiConfigError(error)) {
        return `GEMINI_API_KEY não configurada ou inválida ao ${operation}.`;
    }

    return error?.message || `Erro ao ${operation}.`;
}

function splitScriptIntoBeats(script, count) {
    const fallback = 'Apresente a ideia principal do roteiro de forma clara e visual.';
    const sentences = String(script || fallback)
        .split(/(?<=[.!?])\s+|\n+/)
        .map(part => part.trim())
        .filter(Boolean);

    if (sentences.length === 0) sentences.push(fallback);

    return Array.from({ length: count }, (_, index) => {
        const sentence = sentences[index % sentences.length];
        const prefix = index === 0
            ? 'Hook'
            : index === count - 1
                ? 'CTA'
                : `Cena ${index + 1}`;
        return `${prefix}: ${sentence}`;
    });
}

function normalizeVideoDuration(duration) {
    const value = Number(duration);
    return value >= 8 ? 10 : 5;
}

const IMAGE_SAFETY_RULES = [
    'No readable text anywhere in the image.',
    'No legible PDF/document text, no generated paragraphs, no fake written words.',
    'No realistic app screenshots, no readable UI, no buttons with text, no logos.',
    'If showing a phone, laptop, PDF, app, dashboard, flashcards, quiz, notes, or book page, use abstract blurred shapes and symbolic interface blocks only.',
    'Prefer over-the-shoulder or environment shots instead of close-ups of screens/documents.',
    'If a smartphone appears, it must be in natural use: angled at 30-45 degrees, partially visible, max 25% of the frame, with the screen slightly blurred or motion-streaked — never a static front-facing display of a phone screen.',
    'Never compose a product-demo or unboxing shot. The human face, expression, or environment must always be the primary visual subject.',
].join(' ');

function appendImageSafetyRules(prompt) {
    const base = String(prompt || '').trim();
    if (base.includes('IMAGE MODEL SAFETY RULES')) return base;
    if (!base) return IMAGE_SAFETY_RULES;
    return `${base}\n\nIMAGE MODEL SAFETY RULES: ${IMAGE_SAFETY_RULES}`;
}

function buildFallbackProductionPlan(script, businessProfile = {}, sceneCount = 4) {
    const brandName = businessProfile.name || 'Marca';
    const beats = splitScriptIntoBeats(script, sceneCount);
    const primaryColor = businessProfile.branding?.primaryColor || 'brand accent colors';
    const style = businessProfile.branding?.style || 'modern social media commercial';
    const tone = businessProfile.aiPreferences?.tone || businessProfile.brandKit?.personality || 'direct, clear, brand-aligned';
    const coreMessage = businessProfile.brandKit?.coreMessage || businessProfile.productService || script;
    const doAlways = normalizeList(businessProfile.brandKit?.doAlways).slice(0, 4).join(', ');
    const neverUse = normalizeList(businessProfile.brandKit?.neverUse).slice(0, 4).join(', ');

    return {
        title: beats[0].replace(/^Hook:\s*/i, '').slice(0, 72) || 'Reel gerado',
        copy_angle: `Use ${brandName}'s voice: ${tone}. Connect the script to this brand promise: ${compactText(coreMessage, 300)}.`,
        caption: `${beats[0].replace(/^Hook:\s*/i, '')}\n\n${compactText(coreMessage, 220)}`,
        anchor_prompt: appendImageSafetyRules(`Photorealistic vertical 9:16 hero frame for ${brandName}. A confident presenter connected to the topic "${String(script).slice(0, 120)}", modern Instagram Reels aesthetic, ${style}, ${primaryColor}, professional soft lighting, clean background, cinematic composition, no text, no logos. Always follow: ${doAlways || 'brand consistency'}. Avoid: ${neverUse || 'generic stock visuals'}.`),
        global_style: `Vertical 9:16, photorealistic, fast social-media pacing, cohesive ${brandName} visual identity, ${style}, clean lighting, strong foreground subject, subtle brand color accents. Tone: ${tone}. Screens and documents must be abstract/blurred/unreadable when present. Smartphone screens must never dominate the frame — maximum 25% of frame area, always angled or partially out-of-view, held naturally by a person mid-action. Focus stays on human expressions and environment. No product-demo compositions.`,
        motion_style: 'Subtle handheld camera push-in, natural presenter movement, light parallax, smooth social-media pacing. When a smartphone appears, it enters and exits the frame naturally — visible for no more than 1.5 seconds — as if caught mid-use, then the camera returns to the person.',
        scenes: beats.map((beat, index) => ({
            id: index + 1,
            duration: index === beats.length - 1 ? 10 : 5,
            description: beat,
            on_screen_text: beat.replace(/^(Hook|CTA|Cena \d+):\s*/i, '').slice(0, 70),
            voiceover: beat,
            image_prompt: appendImageSafetyRules(`Scene ${index + 1} for a vertical Instagram Reel by ${brandName}: ${beat}. Same presenter and visual identity as anchor, expressive pose, clean modern setting, ${style}, ${primaryColor}, photorealistic, professional lighting, 9:16 composition, no text, no watermark. Brand promise: ${compactText(coreMessage, 260)}. Avoid: ${neverUse || 'generic stock visuals'}.`),
            motion_prompt: index === beats.length - 1
                ? 'Confident closing gesture, subtle camera push-in, polished call-to-action energy.'
                : 'Natural presenter movement, subtle camera push-in, light background parallax.',
        })),
    };
}

function buildFallbackReelScriptDescription(businessProfile = {}, seed = '') {
    const brandName = businessProfile.name || 'a marca';
    const targetAudience = compactText(businessProfile.targetAudience, 220) || 'público ideal';
    const productService = compactText(businessProfile.productService, 260) || 'solução principal da marca';
    const coreMessage = compactText(businessProfile.brandKit?.coreMessage, 220) || productService;
    const tone = businessProfile.aiPreferences?.tone || businessProfile.brandKit?.personality || 'direto, claro e alinhado à marca';
    const editorialLine = normalizeList(businessProfile.brandKit?.editorialLines || businessProfile.editorialPillars)[0] || 'conteúdo educativo e persuasivo';
    const baseIdea = seed?.trim()
        ? `Ideia base: ${seed.trim()}`
        : `Ideia base: mostrar como ${brandName} resolve uma dor real do público sem parecer anúncio genérico.`;

    return [
        `${baseIdea}`,
        '',
        `Roteiro para Reel de ${brandName}: abrir com uma dor concreta de ${targetAudience}, mostrar a tensão do problema no dia a dia, apresentar ${brandName} como mecanismo simples e visual para resolver essa situação, demonstrar rapidamente o benefício central (${coreMessage}) e fechar com CTA direto para testar/conhecer a solução.`,
        '',
        `Tom: ${tone}.`,
        `Linha editorial: ${editorialLine}.`,
        `Produto/serviço a destacar: ${productService}.`,
        '',
        'Estrutura sugerida:',
        '1. Hook: frase curta de identificação com a dor.',
        '2. Problema: mostrar o atrito real em cena cotidiana.',
        '3. Virada: apresentar o mecanismo da marca sem exagero.',
        '4. Prova/benefício: visualizar o resultado prático.',
        '5. CTA: convite simples para agir agora.',
    ].join('\n');
}

export async function generateReelScriptDescription(businessProfile = {}, options = {}) {
    const seed = String(options.seed || '').trim();
    const sceneCount = Math.max(2, Math.min(8, Number(options.sceneCount) || 4));
    const brandContext = buildBrandContext(businessProfile);

    const prompt = `You are a senior short-form video strategist and direct-response copywriter for Instagram Reels.

Create a rich "Roteiro / Descrição" in Brazilian Portuguese that will be used as input to generate a production plan for a ${sceneCount}-scene Reel.

The output must be useful as a brief, not a final production plan. It should clearly describe the story, hook, emotional angle, product mechanism, scenes, proof/benefit, and CTA.

## Existing idea or draft
${seed || 'No draft provided. Create a strong original Reel concept from the brand context.'}

## Brand Context
${brandContext || 'No specific brand context provided.'}

## Output rules
- Return ONLY the roteiro/descrição text, no JSON and no markdown title.
- Write in Portuguese Brazilian.
- 2 to 5 compact paragraphs plus a numbered scene outline.
- Make it specific to the profile, product, audience, tone, editorial pillars, and visual rules.
- Do not invent unsupported claims, guarantees, prices, testimonials, app screens, or readable UI.
- Avoid generic motivational filler.
- Mention visual direction only when useful for the future production plan.`;

    try {
        return (await geminiText(prompt)).trim();
    } catch (err) {
        console.warn(`⚠️ ${getGeminiUserMessage(err, 'gerar roteiro do Reel')} Usando roteiro local de fallback.`);
        return buildFallbackReelScriptDescription(businessProfile, seed);
    }
}

/**
 * Call Gemini text model for orchestration/planning.
 */
async function geminiText(prompt) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY não configurada');
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_TEXT_MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

/**
 * Generate image via Gemini.
 * Returns: { base64: string, mimeType: string }
 */
async function geminiGenerateImage(prompt) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY não configurada');
    }

    const model = genAI.getGenerativeModel({
        model: GEMINI_IMAGE_MODEL,
    });

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });

    const response = result.response;
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return {
                base64: part.inlineData.data,
                mimeType: part.inlineData.mimeType || 'image/png',
            };
        }
    }

    throw new Error('Gemini não retornou imagem inline');
}

/**
 * Generate image via Gemini with anchor image as reference (for scene consistency).
 * @param {string} prompt 
 * @param {string} anchorBase64 - base64 data (no prefix) of anchor image
 * @param {string} anchorMime 
 */
async function geminiGenerateSceneImage(prompt, anchorBase64, anchorMime = 'image/png', additionalImages = []) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY não configurada');
    }

    const model = genAI.getGenerativeModel({
        model: GEMINI_IMAGE_MODEL,
    });

    const parts = [
        {
            inlineData: {
                mimeType: anchorMime,
                data: anchorBase64,
            }
        }
    ];

    // Add additional reference images (e.g. app UI screenshots)
    for (const img of additionalImages) {
        if (img?.base64) {
            parts.push({
                inlineData: {
                    mimeType: img.mimeType || 'image/png',
                    data: img.base64
                }
            });
        }
    }

    parts.push({ text: prompt });

    const result = await model.generateContent({
        contents: [{
            role: 'user',
            parts: parts
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    });

    const response = result.response;
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return {
                base64: part.inlineData.data,
                mimeType: part.inlineData.mimeType || 'image/png',
            };
        }
    }

    throw new Error('Gemini não retornou imagem de cena');
}

// ─── STEP 1: Create project + Production Plan ─────────────────────────────

/**
 * Cria um novo projeto de reel e gera o plano de produção via Gemini.
 * @param {string} script - Roteiro textual
 * @param {object} businessProfile - Dados do perfil de negócio
 * @param {object} options - { sceneCount?: number }
 * @returns {object} project state
 */
export async function createReelProject(script, businessProfile = {}, options = {}) {
    const id = uuidv4();
    const sceneCount = options.sceneCount || 4;
    const brandContext = buildBrandContext(businessProfile);

    console.log(`🎬 Criando projeto de reel: ${id} (${sceneCount} cenas)`);

    // Generate production plan via Gemini
    const planPrompt = `You are a professional video production director, performance copywriter, and AI image prompt engineer specializing in short-form vertical video (Instagram Reels / TikTok).

Given the following script and brand context, create a detailed production plan for a ${sceneCount}-scene vertical video reel (9:16 aspect ratio).
Use the brand context as mandatory strategy input, not as decoration. The plan must reflect the brand's positioning, audience psychology, product/service, content pillars, tone of voice, visual guidelines, do/avoid rules, and reference prompts.

## Script:
${script}

## Brand Context:
${brandContext || 'No specific brand context provided.'}

## Output Format (JSON only, no markdown):
{
  "title": "Short descriptive title for this reel",
  "copy_angle": "The strategic copy angle in Portuguese: target pain/desire, promise, mechanism, and why this brand is credible.",
  "caption": "Instagram caption in Portuguese, concise and on-brand, with CTA and no generic filler.",
  "anchor_prompt": "A detailed image generation prompt for the ANCHOR/REFERENCE image IN ENGLISH. This establishes the main character, identity, brand environment, product cues, style, and visual language for the entire video. Must specify character appearance, wardrobe, props, brand colors, lighting style, camera angle, composition, mood, and vertical 9:16 photorealistic quality. Must include what to avoid from the brand kit and must forbid readable text/UI/documents.",
  "global_style": "One paragraph describing the overall visual style, color palette, lighting approach, camera work, atmosphere, composition rules, brand do/avoid rules, audience-specific emotional tone, and the rule that screens/documents/UI must be abstract or unreadable.",
  "motion_style": "Brief description of how scenes should animate in a brand-aligned way (e.g., subtle breathing, camera push-in, parallax, micro-expressions)",
  "scenes": [
    {
      "id": 1,
      "duration": 5,
      "description": "What happens in this scene in Portuguese, including the narrative purpose of the scene.",
      "on_screen_text": "Short Portuguese overlay copy for this scene, 3-9 words, on-brand and non-generic.",
      "voiceover": "Portuguese voiceover or spoken line for this scene, natural and brand-aligned.",
      "image_prompt": "Detailed image generation prompt for this scene IN ENGLISH. Must reference: same character/visual identity as anchor, specific action/pose, environment, product cues, emotional expression, props, lighting, lens/composition, negative space, vertical 9:16 framing, brand colors, brand avoid-rules, and strict no-readable-text/no-legible-screen rules.",
      "motion_prompt": "Animation description for Kling: specific movements, camera motion, duration hint"
    }
  ]
}

RULES:
- Generate exactly ${sceneCount} scenes
- All image prompts in ENGLISH; copy_angle, caption, scene descriptions, on_screen_text and voiceover in PORTUGUESE
- Every scene must maintain visual consistency with the anchor (same character, style, palette)
- Brand colors, content pillars, tone, visual guidelines, product mechanism, and do/avoid rules must appear naturally in the scenes
- Never invent claims, guarantees, screenshots, readable UI, logos, or text inside generated images unless the brand context explicitly permits it
- Scene duration MUST be either 5 or 10 only. Never use 3, 4, 6, 7, 8, 9 or any other number.
- If a scene references PDFs, books, apps, dashboards, flashcards, quizzes, notes, laptop screens or phone screens, describe them as abstract, blurred, symbolic, unreadable interface/document shapes. Do not ask the image model to render readable content.
- When a scene involves a smartphone or app: describe the person in a real-life context (studying, commuting, relaxing) with the phone as a casual background prop, never as the scene's main subject. The screen must not be visible for more than 1–2 seconds of the scene's duration. Prefer over-the-shoulder, lifestyle, or environmental framing.
- NEVER plan a scene where the phone/screen is the center of attention. Prefer: person smiling or reacting after using the app, phone being pocketed, phone held loosely at the side, or phone face-down after a session.
- If the app must be shown, instruct the image prompt to frame the phone at 30–45 degrees, partially out of frame, max 25% of the composition, with the screen slightly blurred or motion-streaked — never a clean product-demo composition.
- Image prompts must be specific enough for an image model: subject, setting, action, emotion, camera/lens, lighting, composition, materials/props, brand accents, and negative prompts
- Copy must be concrete and useful, not generic motivational filler
- Duration: 5s for standard scenes, 10s for climax/CTA scenes
- Return ONLY valid JSON, nothing else`;

    let plan;
    let planSource = 'gemini';
    let planWarning = null;

    try {
        const planText = await geminiText(planPrompt);

        // Parse JSON — strip markdown fences if present
        try {
            const cleanJson = planText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            plan = JSON.parse(cleanJson);
        } catch (err) {
            console.error('⚠️ Falha ao parsear plano, tentando extração JSON...');
            const jsonMatch = planText.match(/\{[\s\S]+\}/);
            if (jsonMatch) {
                plan = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Gemini não retornou JSON válido para o plano de produção');
            }
        }
    } catch (err) {
        planSource = 'fallback';
        planWarning = getGeminiUserMessage(err, 'criar o plano do Reel');
        console.warn(`⚠️ ${planWarning} Usando plano local de fallback.`);
        plan = buildFallbackProductionPlan(script, businessProfile, sceneCount);
    }

    const project = {
        id,
        created_at: new Date().toISOString(),
        script,
        brand_name: businessProfile.name || 'Marca',
        business_profile_id: businessProfile.id || null,
        elevenlabs_voice_id: businessProfile.aiPreferences?.elevenLabsVoiceId || businessProfile.elevenLabsVoiceId || null,

        // Production plan
        title: plan.title || 'Reel sem título',
        plan_source: planSource,
        plan_warning: planWarning,
        copy_angle: plan.copy_angle || '',
        caption: plan.caption || '',
        anchor_prompt: appendImageSafetyRules(plan.anchor_prompt),
        global_style: `${plan.global_style || ''} Screens, PDFs, books, app interfaces, dashboards and documents must be abstract, blurred and unreadable when present. Smartphone screens must never dominate the frame — maximum 25% of frame area, always angled or partially out-of-view, held naturally by a person mid-action. Focus stays on human expressions and environment. No product-demo compositions.`.trim(),
        motion_style: `${plan.motion_style || 'Subtle handheld push-in, natural presenter movement.'} When a smartphone appears, the device enters and exits the frame naturally in under 1.5 seconds — as if caught mid-use — then the camera returns to the person's face or the environment.`,
        scenes: (plan.scenes || []).map(scene => ({
            id: scene.id,
            duration: normalizeVideoDuration(scene.duration),
            description: scene.description,
            on_screen_text: scene.on_screen_text || '',
            voiceover: scene.voiceover || '',
            image_prompt: appendImageSafetyRules(scene.image_prompt),
            motion_prompt: scene.motion_prompt,
            image_status: 'not_started', // not_started | pending | approved | rejected
            video_status: 'pending',     // pending | generating | done | error
            image_url: null,
            video_url: null,
            regen_count: 0,
            feedback: null,
        })),

        // Anchor state
        anchor_status: 'not_started', // not_started | pending | approved | rejected
        anchor_url: null,
        anchor_base64: null,
        anchor_mime: null,

        // Final
        final_status: 'pending', // pending | rendering | rendered | error
        final_url: null,
        final_has_narration: false,
        final_has_subtitles: false,
        subtitles_status: 'pending', // pending | rendering | done | skipped | error
        subtitles_local_path: null,
        narration_status: 'pending', // pending | generating | done | skipped | error
        narration_url: null,
        narration_local_path: null,
        narration_text: null,
        narration_error: null,
        error: null,
    };

    saveState(project);
    console.log(`✅ Projeto criado: "${project.title}" com ${project.scenes.length} cenas`);
    return project;
}

// ─── STEP 2: Generate anchor image ────────────────────────────────────────

/**
 * Gera a imagem âncora do projeto.
 * @param {string} projectId
 * @returns {object} updated project
 */
export async function generateAnchorImage(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    console.log(`🖼️  Gerando imagem âncora para projeto ${projectId}`);

    const fullPrompt = `${project.anchor_prompt}

Additional requirements:
- Vertical format (9:16 aspect ratio)
- Ultra-high quality, photorealistic
- Eye-level camera angle, professional lighting
- ${project.global_style}
- No text, no watermarks, no logos in the image`;

    const imageData = await geminiGenerateImage(fullPrompt);

    // Save locally
    const dir = path.join(REELS_DIR, projectId);
    ensureDir(dir);
    const localPath = path.join(dir, 'anchor.png');
    fs.writeFileSync(localPath, Buffer.from(imageData.base64, 'base64'));

    // Upload to Firebase
    const firebaseUrl = await uploadFileToFirebase(localPath, imageData.mimeType);

    // Update project
    project.anchor_status = 'pending';
    project.anchor_url = firebaseUrl || `local:${localPath}`;
    project.anchor_base64 = imageData.base64;
    project.anchor_mime = imageData.mimeType;
    saveState(project);

    console.log(`✅ Âncora gerada: ${project.anchor_url}`);
    return project;
}

export async function updateAnchorPrompt(projectId, prompt) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const nextPrompt = String(prompt || '').trim();
    if (!nextPrompt) throw new Error('Prompt da âncora é obrigatório');

    project.anchor_prompt = nextPrompt;
    project.anchor_status = 'rejected';
    saveState(project);

    console.log(`✏️ Prompt da âncora atualizado para projeto ${projectId}`);
    return project;
}

function clearSceneVideo(scene) {
    scene.video_status = 'pending';
    scene.video_url = null;
    scene.video_local_path = null;
    scene.video_error = null;
}

function clearProjectFinal(project) {
    project.final_status = 'pending';
    project.final_url = null;
    project.final_local_path = null;
    project.final_has_narration = false;
    project.final_has_subtitles = false;
    project.subtitles_status = 'pending';
    project.subtitles_local_path = null;
    project.narration_status = 'pending';
    project.narration_url = null;
    project.narration_local_path = null;
    project.narration_error = null;
    project.error = null;
}

function clearSceneImage(scene) {
    scene.image_status = 'rejected';
    scene.image_url = null;
    scene._base64 = null;
    scene._mime = null;
    scene.error = null;
    clearSceneVideo(scene);
}

export async function updateScene(projectId, sceneId, updates = {}) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const scene = project.scenes.find(s => s.id === Number(sceneId));
    if (!scene) throw new Error(`Cena ${sceneId} não encontrada`);

    const next = {
        description: updates.description !== undefined ? String(updates.description || '').trim() : scene.description,
        on_screen_text: updates.on_screen_text !== undefined ? String(updates.on_screen_text || '').trim() : scene.on_screen_text,
        voiceover: updates.voiceover !== undefined ? String(updates.voiceover || '').trim() : scene.voiceover,
        image_prompt: updates.image_prompt !== undefined ? appendImageSafetyRules(updates.image_prompt) : scene.image_prompt,
        motion_prompt: updates.motion_prompt !== undefined ? String(updates.motion_prompt || '').trim() : scene.motion_prompt,
        duration: updates.duration !== undefined ? normalizeVideoDuration(updates.duration) : normalizeVideoDuration(scene.duration),
    };

    if (!next.description) throw new Error('Descrição da cena é obrigatória');
    if (!next.image_prompt) throw new Error('Prompt da imagem é obrigatório');

    const imageAffectingChanged = [
        'description',
        'on_screen_text',
        'voiceover',
        'image_prompt',
    ].some(key => String(scene[key] || '').trim() !== String(next[key] || '').trim());

    const videoOnlyChanged = !imageAffectingChanged && (
        String(scene.motion_prompt || '').trim() !== String(next.motion_prompt || '').trim()
        || normalizeVideoDuration(scene.duration) !== next.duration
    );

    Object.assign(scene, next);

    if (imageAffectingChanged) {
        clearSceneImage(scene);
        clearProjectFinal(project);
    } else if (videoOnlyChanged) {
        clearSceneVideo(scene);
        clearProjectFinal(project);
    }

    saveState(project);
    console.log(`✏️ Cena ${sceneId} atualizada no projeto ${projectId}`);
    return project;
}

// ─── STEP 3: Approve/Reject anchor ───────────────────────────────────────

export async function approveAnchor(projectId, approved) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    project.anchor_status = approved ? 'approved' : 'rejected';
    saveState(project);
    console.log(`🛑 Âncora ${approved ? 'aprovada ✅' : 'rejeitada ❌'}: ${projectId}`);
    return project;
}

async function generateImageForScene(project, scene, suffix = '') {
    let additionalImages = [];
    let appScreenshotsPrompt = '';
    // Default: tela totalmente abstrata quando não há referência
    let screenConstraint = 'Any screens, PDFs, books, notes, app UI, dashboards, flashcards or quizzes must be abstract, blurred and unreadable. If a smartphone appears, show it held naturally at an angle (30–45 degrees), max 25% of the frame, screen slightly out-of-focus — never a front-facing product-demo shot.';

    if (project.business_profile_id) {
        try {
            const profile = await getBusinessProfile(project.business_profile_id);
            const urls = [];
            if (profile.brandKit?.appScreenshotUrl) {
                urls.push(profile.brandKit.appScreenshotUrl);
            }
            if (profile.brandKit?.appUiReferenceUrls?.length) {
                urls.push(...profile.brandKit.appUiReferenceUrls.filter(Boolean));
            }

            // download at most 2 screenshots to avoid excessive payload
            const uniqueUrls = [...new Set(urls)].slice(0, 2);
            for (const url of uniqueUrls) {
                const img = await downloadImageAsBase64(url);
                if (img) {
                    additionalImages.push(img);
                }
            }

            if (additionalImages.length > 0) {
                // Estratégia: tela como elemento de apoio (lifestyle), não como foco (product demo)
                screenConstraint = [
                    'A smartphone MAY appear in this scene, but it must look like a natural part of everyday life — NOT a product demonstration.',
                    'If the phone is visible: hold it at a 30–45 degree angle, partially out of frame, occupying at most 25% of the total composition.',
                    'The screen should be glimpsed briefly — slightly blurred, motion-streaked, or in soft focus — so the app color palette and general layout are subtly recognizable but NOT readable or crystal-clear.',
                    'The person\'s face, body language, or the physical environment must always be the primary visual subject.',
                    'Think: someone casually scrolling or glancing at their phone mid-activity, not posing with it.',
                    'NEVER render a clean, front-facing, fully lit phone screen. NEVER place the phone centered in the frame.',
                ].join(' ');

                appScreenshotsPrompt = `
APP INTERFACE SUBTLE REFERENCE RULES:
- The provided screenshot(s) show the app's color identity, general layout, and branding.
- DO NOT reproduce the UI literally or in high definition.
- Instead, let the app's color palette and general aesthetic emerge subtly through the blurred/angled screen — like a warm glow from the screen color or a vague sense of the interface layout.
- The goal is brand recognition through atmosphere, not a product-demo screenshot.
- The person using the phone must be the emotional anchor of the image, not the device.`;
            }
        } catch (err) {
            console.warn('⚠️ Erro ao carregar referências do perfil de negócio para imagem de cena:', err.message);
        }
    }

    const scenePrompt = `Using the provided anchor image as the STRICT visual reference for character identity, clothing, style and setting:

${appendImageSafetyRules(scene.image_prompt)}

CONSISTENCY RULES:
- Same character as anchor image: identical face, clothing, proportions
- Same visual style and lighting as: ${project.global_style}
- Vertical 9:16 format, photorealistic, ultra-high quality
- No readable text, no watermarks, no logos anywhere in the image
- ${screenConstraint}
${appScreenshotsPrompt}

This is scene ${scene.id} of ${project.scenes.length} in the sequence.`;

    const imageData = await geminiGenerateSceneImage(
        scenePrompt,
        project.anchor_base64,
        project.anchor_mime,
        additionalImages
    );

    const dir = path.join(REELS_DIR, project.id);
    ensureDir(dir);
    const fileSuffix = suffix || '';
    const localPath = path.join(dir, `scene_${scene.id}${fileSuffix}.png`);
    fs.writeFileSync(localPath, Buffer.from(imageData.base64, 'base64'));

    const firebaseUrl = await uploadFileToFirebase(localPath, imageData.mimeType);

    scene.image_status = 'pending';
    scene.image_url = firebaseUrl || `local:${localPath}`;
    scene._base64 = imageData.base64;
    scene._mime = imageData.mimeType;
    scene.feedback = null;
    clearSceneVideo(scene);
    clearProjectFinal(project);
}

// ─── STEP 4: Generate scene images ────────────────────────────────────────

/**
 * Gera imagens de todas as cenas usando a âncora como referência.
 * @param {string} projectId
 * @returns {object} updated project
 */
export async function generateSceneImages(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);
    if (project.anchor_status !== 'approved') throw new Error('Âncora deve estar aprovada antes de gerar cenas');

    console.log(`🎨 Gerando ${project.scenes.length} imagens de cena para projeto ${projectId}`);

    // Generate in parallel (but sequential to respect API limits)
    for (const scene of project.scenes) {
        if (scene.image_status === 'approved') continue; // skip already approved

        try {
            console.log(`  → Cena ${scene.id}: "${scene.description?.substring(0, 50)}"`);
            await generateImageForScene(project, scene);

        } catch (err) {
            console.error(`❌ Erro na cena ${scene.id}:`, err.message);
            scene.image_status = 'error';
            scene.error = err.message;
        }

        saveState(project);
    }

    return project;
}

// ─── STEP 5: Approve/Reject scene + trigger animation ─────────────────────

/**
 * Aprova ou rejeita uma cena. Se aprovada, dispara animação via Kling.
 * Se rejeitada com feedback, regenera automaticamente.
 * @param {string} projectId
 * @param {number} sceneId
 * @param {boolean} approved
 * @param {string|null} feedback
 * @returns {object} updated project
 */
export async function approveScene(projectId, sceneId, approved, feedback = null) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const scene = project.scenes.find(s => s.id === Number(sceneId));
    if (!scene) throw new Error(`Cena ${sceneId} não encontrada no projeto ${projectId}`);

    if (approved) {
        scene.image_status = 'approved';
        saveState(project);
        console.log(`✅ Cena ${sceneId} aprovada. Disparando animação...`);

        // Trigger animation async (don't await — return immediately)
        animateScene(projectId, sceneId).catch(err =>
            console.error(`❌ Erro na animação da cena ${sceneId}:`, err.message)
        );

    } else {
        scene.image_status = 'rejected';
        scene.feedback = feedback;
        saveState(project);
        console.log(`❌ Cena ${sceneId} rejeitada. ${feedback ? 'Regenerando...' : ''}`);

        if (feedback) {
            // Regenerate automatically
            regenerateSceneImage(projectId, sceneId, feedback).catch(err =>
                console.error(`❌ Erro na regeneração da cena ${sceneId}:`, err.message)
            );
        }
    }

    return project;
}

// ─── Regenerate scene image ───────────────────────────────────────────────

export async function regenerateSceneImage(projectId, sceneId, feedback) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const scene = project.scenes.find(s => s.id === Number(sceneId));
    if (!scene) throw new Error(`Cena ${sceneId} não encontrada`);

    scene.image_status = 'regenerating';
    scene.regen_count = (scene.regen_count || 0) + 1;
    saveState(project);

    try {
        console.log(`🔄 Regenerando cena ${sceneId} (tentativa ${scene.regen_count})`);

        if (feedback) {
            scene.image_prompt = appendImageSafetyRules(`${scene.image_prompt}\n\nIMPROVEMENT REQUEST: ${feedback}`);
        }

        const timestamp = Date.now();
        await generateImageForScene(project, scene, `_regen_${timestamp}`);
        saveState(project);

        console.log(`✅ Cena ${sceneId} regenerada`);
    } catch (err) {
        console.error(`❌ Erro ao regenerar cena ${sceneId}:`, err.message);
        scene.image_status = 'error';
        scene.error = err.message;
        saveState(project);
    }

    return project;
}

export async function generateSceneImage(projectId, sceneId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);
    if (project.anchor_status !== 'approved') throw new Error('Âncora deve estar aprovada antes de regenerar cenas');

    const scene = project.scenes.find(s => s.id === Number(sceneId));
    if (!scene) throw new Error(`Cena ${sceneId} não encontrada`);

    scene.image_status = 'regenerating';
    scene.regen_count = (scene.regen_count || 0) + 1;
    saveState(project);

    try {
        const timestamp = Date.now();
        await generateImageForScene(project, scene, `_manual_${timestamp}`);
        saveState(project);
        console.log(`✅ Imagem da cena ${sceneId} regenerada manualmente`);
    } catch (err) {
        console.error(`❌ Erro ao regenerar imagem da cena ${sceneId}:`, err.message);
        scene.image_status = 'error';
        scene.error = err.message;
        saveState(project);
    }

    return project;
}

// ─── STEP 6: Animate scene via Kling ──────────────────────────────────────

export async function animateScene(projectId, sceneId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const scene = project.scenes.find(s => s.id === Number(sceneId));
    if (!scene) throw new Error(`Cena ${sceneId} não encontrada`);
    if (!scene.image_url) throw new Error(`Cena ${sceneId} sem imagem`);

    scene.video_status = 'generating';
    saveState(project);

    try {
        // Kling AI Image-to-Video requires ONLY motion instructions, not styling overrides
        const motionPrompt = scene.motion_prompt || `${project.motion_style || 'Smooth, cinematic animation.'}`;
        const duration = normalizeVideoDuration(scene.duration);
        scene.duration = duration;

        const imageSource = scene.image_url.startsWith('http')
            ? scene.image_url
            : `data:${scene._mime};base64,${scene._base64}`;

        const videoUrl = await animateImageToVideo(imageSource, motionPrompt, {
            duration,
        });

        // Download and save video locally, then upload to Firebase
        const dir = path.join(REELS_DIR, projectId);
        ensureDir(dir);
        const localVideoPath = path.join(dir, `scene_${sceneId}.mp4`);

        if (videoUrl.startsWith('http')) {
            const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(localVideoPath, Buffer.from(response.data));
        }

        const firebaseVideoUrl = await uploadFileToFirebase(localVideoPath, 'video/mp4');

        scene.video_status = 'done';
        scene.video_url = firebaseVideoUrl || videoUrl;
        scene.video_local_path = localVideoPath;
        saveState(project);

        console.log(`✅ Vídeo da cena ${sceneId} gerado: ${scene.video_url}`);
    } catch (err) {
        console.error(`❌ Erro ao animar cena ${sceneId}:`, err.message);
        scene.video_status = 'error';
        scene.video_error = err.message;
        saveState(project);
    }

    return project;
}

// ─── STEP 7: Retry video ───────────────────────────────────────────────────

export async function retrySceneVideo(projectId, sceneId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const scene = project.scenes.find(s => s.id === Number(sceneId));
    if (!scene) throw new Error(`Cena ${sceneId} não encontrada`);

    scene.video_status = 'pending';
    scene.video_error = null;
    clearProjectFinal(project);
    saveState(project);

    animateScene(projectId, sceneId).catch(err =>
        console.error(`❌ Retry animação cena ${sceneId}:`, err.message)
    );

    return project;
}

// ─── STEP 8: Merge final video ─────────────────────────────────────────────

/**
 * Concatena todos os vídeos de cena em um vídeo final via FFmpeg.
 * @param {string} projectId
 * @returns {object} updated project
 */
export async function mergeScenes(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`Projeto ${projectId} não encontrado`);

    const pendingScenes = project.scenes.filter(s => s.video_status !== 'done');
    if (pendingScenes.length > 0) {
        throw new Error(`Ainda há cenas não finalizadas: ${pendingScenes.map(s => s.id).join(', ')}`);
    }

    project.final_status = 'rendering';
    project.final_has_narration = false;
    project.final_has_subtitles = false;
    project.subtitles_status = 'pending';
    project.error = null;
    saveState(project);

    console.log(`🎞️  Montando vídeo final do projeto ${projectId}...`);

    const dir = path.join(REELS_DIR, projectId);
    const outputPath = path.join(dir, 'final.mp4');
    const videoOnlyPath = path.join(dir, 'final_video_only.mp4');
    const captionedVideoOnlyPath = path.join(dir, 'final_captioned_video_only.mp4');
    const subtitlesPath = path.join(dir, 'subtitles.ass');
    const narrationPath = path.join(dir, 'narration.mp3');

    try {
        // Ensure all scene videos are local
        for (const scene of project.scenes) {
            if (!scene.video_local_path || !fs.existsSync(scene.video_local_path)) {
                // Download from Firebase URL
                if (scene.video_url && scene.video_url.startsWith('http')) {
                    const localPath = path.join(dir, `scene_${scene.id}.mp4`);
                    const response = await axios.get(scene.video_url, { responseType: 'arraybuffer' });
                    fs.writeFileSync(localPath, Buffer.from(response.data));
                    scene.video_local_path = localPath;
                }
            }
        }

        // Create concat list file
        const concatFile = path.join(dir, 'concat.txt');
        const concatContent = project.scenes
            .slice()
            .sort((a, b) => a.id - b.id)
            .map(s => `file '${String(s.video_local_path).replace(/'/g, "'\\''")}'`)
            .join('\n');
        fs.writeFileSync(concatFile, concatContent);

        // First render the clean visual track.
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatFile)
                .inputOptions(['-f concat', '-safe 0'])
                .outputOptions([
                    '-c:v libx264',
                    '-preset fast',
                    '-crf 22',
                    '-r 30',
                    '-pix_fmt yuv420p',
                    '-movflags +faststart',
                ])
                .output(videoOnlyPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        const subtitleCount = writeSubtitleFile(project, subtitlesPath);
        let visualTrackPath = videoOnlyPath;
        if (subtitleCount > 0) {
            project.subtitles_status = 'rendering';
            project.subtitles_local_path = subtitlesPath;
            saveState(project);

            await burnSubtitles(videoOnlyPath, captionedVideoOnlyPath, subtitlesPath);

            project.subtitles_status = 'done';
            project.final_has_subtitles = true;
            project.subtitles_local_path = subtitlesPath;
            visualTrackPath = captionedVideoOnlyPath;
            saveState(project);
        } else {
            project.subtitles_status = 'skipped';
            project.final_has_subtitles = false;
            project.subtitles_local_path = null;
            saveState(project);
        }

        const generatedNarrationPath = await generateElevenLabsNarration(project, narrationPath);

        if (generatedNarrationPath) {
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(visualTrackPath)
                    .input(generatedNarrationPath)
                    .outputOptions([
                        '-map 0:v:0',
                        '-map 1:a:0',
                        '-c:v copy',
                        '-c:a aac',
                        '-b:a 128k',
                        '-af apad',
                        '-shortest',
                        '-movflags +faststart',
                    ])
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            project.final_has_narration = true;
        } else {
            fs.copyFileSync(visualTrackPath, outputPath);
            project.final_has_narration = false;
        }

        // Upload final video to Firebase
        const finalFirebaseUrl = await uploadFileToFirebase(outputPath, 'video/mp4');

        project.final_status = 'rendered';
        project.final_url = finalFirebaseUrl || `local:${outputPath}`;
        project.final_local_path = outputPath;
        project.error = null;
        saveState(project);

        console.log(`✅ Vídeo final gerado: ${project.final_url}`);
        return project;
    } catch (err) {
        project.final_status = 'error';
        project.error = err.message;
        if (project.subtitles_status === 'rendering') {
            project.subtitles_status = 'error';
        }
        if (project.narration_status === 'generating') {
            project.narration_status = 'error';
            project.narration_error = err.message;
        }
        saveState(project);
        throw err;
    }
}

// ─── Public getters ────────────────────────────────────────────────────────

export function getProject(projectId) {
    const project = projects.get(projectId);
    if (!project) return null;

    // Return a clean copy without large base64 fields (for API response)
    const clean = JSON.parse(JSON.stringify(project));
    delete clean.anchor_base64;
    clean.scenes?.forEach(s => {
        delete s._base64;
        delete s._mime;
    });
    return clean;
}

export function listProjects() {
    return Array.from(projects.values())
        .map(p => ({
            id: p.id,
            title: p.title,
            brand_name: p.brand_name,
            created_at: p.created_at,
            anchor_status: p.anchor_status,
            final_status: p.final_status,
            scene_count: p.scenes?.length || 0,
            scenes_done: p.scenes?.filter(s => s.video_status === 'done').length || 0,
        }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getAssetPath(projectId, filename) {
    return path.join(REELS_DIR, projectId, filename);
}
