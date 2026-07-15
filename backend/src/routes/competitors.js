import express from 'express';
import axios from 'axios';
import { scrapeInstagramPosts, scrapeInstagramProfile, scrapeInstagramBatch } from '../services/apifyService.js';
import { db } from '../config/firebase.js';
import { downloadVideoBuffer, uploadGeminiVideo } from '../services/geminiVideoService.js';

const router = express.Router();

// ─── Image proxy ─────────────────────────────────────────────────────────────
/**
 * GET /api/competitors/proxy-image?url=<encoded-url>
 * Proxies CDN images from Instagram so they load correctly in the browser.
 */
router.get('/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Parâmetro "url" obrigatório.' });
    }
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'Referer': 'https://www.instagram.com/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            }
        });
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // cache 24h
        res.send(response.data);
    } catch {
        res.status(404).end();
    }
});

// ─── Helper ───────────────────────────────────────────────────────────────────
async function imageUrlToBase64(url) {
    try {
        if (!url || !url.startsWith('http')) return null;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000
        });
        const base64 = Buffer.from(response.data).toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return { data: base64, mimeType };
    } catch (error) {
        console.error('❌ Erro ao converter imagem para Gemini:', error.message);
        return null;
    }
}

async function callGemini(parts, timeoutMs = 60000) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
    const hasVideo = parts.some(p => p.fileData);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await axios.post(url, { contents: [{ parts }] }, { timeout: hasVideo ? 120000 : timeoutMs });
    if (response.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text;
    }
    throw new Error('Resposta do Gemini vazia ou inválida.');
}

// ─── Fetch posts (explore) ────────────────────────────────────────────────────
/**
 * POST /api/competitors/fetch
 */
router.post('/fetch', async (req, res) => {
    try {
        const { username, limit, days } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'O arroba ou URL do concorrente é obrigatório.' });
        }

        const cleanUsername = username.split('?')[0].replace(/\/$/, "").replace(/^@/, "").replace(/^.*instagram\.com\//, "");

        // 1. Check cache (last 24h)
        const cacheSnapshot = await db.collection('competitor_scrapes')
            .where('username', '==', cleanUsername)
            .get();

        if (!cacheSnapshot.empty) {
            // Sort in memory to avoid requiring a Firebase composite index
            const docs = cacheSnapshot.docs.map(d => d.data());
            docs.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
            
            const cacheDoc = docs[0];
            const cacheAgeHours = (new Date().getTime() - cacheDoc.createdAt.toDate().getTime()) / (1000 * 60 * 60);
            const cachedPosts = Array.isArray(cacheDoc.posts) ? cacheDoc.posts : [];
            
            // Re-use cache if less than 24h old 
            if (cacheAgeHours < 24 && cachedPosts.length > 0) {
                console.log(`📦 Retornando cache para @${cleanUsername} (${cacheAgeHours.toFixed(1)}h de idade)`);
                return res.json({ success: true, posts: cachedPosts, cached: true });
            }

            if (cacheAgeHours < 24 && cachedPosts.length === 0) {
                console.warn(`⚠️ Ignorando cache vazio para @${cleanUsername} (${cacheAgeHours.toFixed(1)}h de idade)`);
            }
        }

        // 2. Fetch fresh data
        const posts = await scrapeInstagramPosts(username, limit || 12, days);
        
        // 3. Save to cache manually
        if (posts.length > 0) {
            await db.collection('competitor_scrapes').add({
                username: cleanUsername,
                posts: posts,
                limit: limit || 12,
                days: days || null,
                createdAt: new Date()
            });
        }
        
        res.json({ success: true, posts, cached: false });
    } catch (error) {
        console.error('❌ Erro no scrape/competitors:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Radar Global ─────────────────────────────────────────────────────────────
/**
 * POST /api/competitors/radar
 * Scrapes all reference profiles for a business in batch and returns the global top.
 */
router.post('/radar', async (req, res) => {
    try {
        const { businessProfileId, limitPerUser, days } = req.body;
        if (!businessProfileId) return res.status(400).json({ error: 'businessProfileId é obrigatório.' });

        // 1. Fetch all reference profiles for this business
        const profilesSnap = await db.collection('competitor_profiles')
            .where('businessProfileId', '==', businessProfileId)
            .get();

        if (profilesSnap.empty) {
            return res.json({ success: true, posts: [], message: 'Nenhum perfil de referência cadastrado.' });
        }

        const profiles = profilesSnap.docs.map(doc => doc.data());
        const usernames = profiles.map(p => p.username);

        // 2. Check Cache
        const cacheSnapshot = await db.collection('competitor_radars')
            .where('businessProfileId', '==', businessProfileId)
            .get();

        if (!cacheSnapshot.empty) {
            const docs = cacheSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
            
            const cacheDoc = docs[0];
            const cacheAgeHours = (new Date().getTime() - cacheDoc.createdAt.toDate().getTime()) / (1000 * 60 * 60);
            
            // Re-use cache if less than 24h old
            if (cacheAgeHours < 24) {
                console.log(`📡 Retornando cache do Radar para empresa ${businessProfileId} (${cacheAgeHours.toFixed(1)}h de idade)`);
                return res.json({ success: true, posts: cacheDoc.posts, cached: true });
            }
        }

        // 3. Run Batch Scrape
        const allPosts = await scrapeInstagramBatch(usernames, limitPerUser || 12, days || 7);

        // 4. Sort Globally (Compute generic virality score based on engagement)
        // Here we just attach the proxy follower counts so front-end has it if it needs to compute outlier.
        const postsWithStats = allPosts.map(post => {
            const profile = profiles.find(p => p.username === post.ownerUsername);
            const followers = profile ? profile.followers : 1;
            const engagement = (post.likes || 0) + (post.comments || 0);
            const outlierScore = engagement / followers;
            return { ...post, followers, engagement, outlierScore };
        });

        // 5. Save to Cache
        await db.collection('competitor_radars').add({
            businessProfileId,
            usernamesScraped: usernames,
            posts: postsWithStats,
            createdAt: new Date()
        });

        res.json({ success: true, posts: postsWithStats, cached: false });
    } catch (error) {
        console.error('❌ Erro no Radar Global:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Analyze post ─────────────────────────────────────────────────────────────
/**
 * POST /api/competitors/analyze
 */
router.post('/analyze', async (req, res) => {
    try {
        const { post } = req.body;
        if (!post) return res.status(400).json({ error: 'Dados do post incompletos para análise.' });

        const systemPrompt = `Você é um analista de performance de social media. Analise o post do concorrente.
Avalie a estrutura, o hook e o formato. Responda em Markdown limpo:
- **Resumo do Conceito**: Qual é a tese principal do post?
- **O Gancho (Hook)**: Qual elemento visual/textual capta a atenção?
- **Estrutura Visual**: Layout e Cores.
- **Veredito**: Por que isso funcionou? Como recriar com originalidade?`;

        const userContent = `Legenda do Post: """${post.caption}"""\nLikes: ${post.likes}\nComments: ${post.comments}`;
        const parts = [{ text: systemPrompt + "\n\n" + userContent }];

        if (post.imageUrl) {
            const imgData = await imageUrlToBase64(post.imageUrl);
            if (imgData) parts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
        }

        const analysis = await callGemini(parts);
        res.json({ success: true, analysis });
    } catch (error) {
        console.error('❌ Erro na análise (Gemini):', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Extract concept ──────────────────────────────────────────────────────────
/**
 * POST /api/competitors/concept
 */
router.post('/concept', async (req, res) => {
    try {
        const { post, businessProfileId, deepScan } = req.body;
        if (!post || !businessProfileId) {
            return res.status(400).json({ error: 'Faltam dados para extrair o conceito.' });
        }

        let systemPrompt = `Você é um diretor de arte. Baseado no post do concorrente, crie um NOVO prompt de imagem que use a mesma psicologia, mas adaptada.
Traga a mesma ideia/hook, mas com um texto original.
Formato exato de saída:
[HEADLINE: "Sua Nova Chamada"]
[BACKGROUND: Descrição da cena fotográfica]`;

        let userContent = `Legenda Original: ${post.caption}`;
        const parts = [];

        if (deepScan && post.videoUrl && post.type === 'video') {
            console.log("💎 Iniciando Raio-X Profundo no Vídeo...");
            systemPrompt = `Você é um analista diretor de arte e copywriting. Foi feito o upload do arquivo MP4 do vídeo concorrente.
Sua missão:
1. Veja todo o vídeo e ESCUTE o áudio/roteiro. Transcreva o que foi falado.
2. Explique a estratégia de Hook (Primeiros 3 segundos), a Retenção (Cortes e transições), e a Recompensa final.
3. Crie um [NOVO SCRIPT] adaptado com a mesma psicologia, e uma ideia de [VISUAL] pro vídeo.
Forneça a saída em Markdown claro.`;
            
            parts.push({ text: systemPrompt + "\n\n" + userContent });

            try {
                const videoDoc = await downloadVideoBuffer(post.videoUrl);
                if (videoDoc) {
                    const uploadedFile = await uploadGeminiVideo(videoDoc.buffer, videoDoc.mimeType);
                    parts.push({ fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } });
                } else {
                    throw new Error('videoDoc is null');
                }
            } catch (downloadErr) {
                console.warn('⚠️ Falha ao baixar/upar MP4, fazendo fallback para Capa (Imagem)...', downloadErr.message);
                parts.push({ text: "Não foi possível analisar o MP4. Sigo usando apenas a Legenda e Capa do Reel." });
                if (post.imageUrl) {
                    const imgData = await imageUrlToBase64(post.imageUrl);
                    if (imgData) parts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
                }
            }
        } else {
            parts.push({ text: systemPrompt + "\n\n" + userContent });
            if (post.imageUrl) {
                const imgData = await imageUrlToBase64(post.imageUrl);
                if (imgData) parts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
            }
        }

        const newConceptPrompt = await callGemini(parts);

        // Check if idea for this post already exists — update instead of duplicate
        if (post.id) {
            const existing = await db.collection('competitor_ideas')
                .where('businessProfileId', '==', businessProfileId)
                .where('post.id', '==', post.id)
                .limit(1).get();

            if (!existing.empty) {
                const docId = existing.docs[0].id;
                const updateData = deepScan
                    ? { strategy: newConceptPrompt, enriched: true }
                    : { concept: newConceptPrompt, enriched: true };
                await db.collection('competitor_ideas').doc(docId).update(updateData);
                const updated = { id: docId, ...existing.docs[0].data(), ...updateData };
                return res.json({ success: true, ideaId: docId, idea: updated, updated: true });
            }
        }

        // Create new idea with the result pre-populated
        const ideaDoc = {
            businessProfileId,
            userId: req.userId || 'system',
            post,
            note: '',
            strategy: deepScan ? newConceptPrompt : null,
            concept: !deepScan ? newConceptPrompt : null,
            enriched: true,
            createdAt: new Date(),
        };

        const docRef = await db.collection('competitor_ideas').add(ideaDoc);
        res.json({ success: true, ideaId: docRef.id, idea: { id: docRef.id, ...ideaDoc } });
    } catch (error) {
        console.error('❌ Erro ao extrair conceito (Gemini):', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Competitor Profiles CRUD ─────────────────────────────────────────────────

/**
 * GET /api/competitors/profiles?businessProfileId=xxx
 */
router.get('/profiles', async (req, res) => {
    try {
        const { businessProfileId } = req.query;
        if (!businessProfileId) {
            return res.status(400).json({ error: 'businessProfileId obrigatório.' });
        }

        const snapshot = await db.collection('competitor_profiles')
            .where('businessProfileId', '==', businessProfileId)
            .get();

        const profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, profiles });
    } catch (error) {
        console.error('❌ Erro ao listar perfis concorrentes:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/competitors/profiles
 * Body: { businessProfileId, username, tag? }
 */
router.post('/profiles', async (req, res) => {
    try {
        const { businessProfileId, username, tag } = req.body;
        if (!businessProfileId || !username) {
            return res.status(400).json({ error: 'businessProfileId e username são obrigatórios.' });
        }

        // Check if already exists
        const existing = await db.collection('competitor_profiles')
            .where('businessProfileId', '==', businessProfileId)
            .where('username', '==', username.replace(/^@/, '').toLowerCase())
            .limit(1).get();

        if (!existing.empty) {
            return res.status(409).json({ error: `@${username} já está na sua lista.` });
        }

        console.log(`➕ Adicionando perfil @${username} para businessProfile ${businessProfileId}...`);

        const stats = await scrapeInstagramProfile(username);

        const doc = {
            businessProfileId,
            userId: req.userId || 'system',
            username: stats.username,
            fullName: stats.fullName,
            biography: stats.biography,
            profilePicUrl: stats.profilePicUrl,
            externalUrl: stats.externalUrl,
            tag: tag || stats.businessCategory || '',
            followers: stats.followers,
            following: stats.following,
            postsCount: stats.postsCount,
            verified: stats.verified,
            reelsLast30d: stats.reelsLast30d,
            postsLast30d: stats.postsLast30d,
            avgViews: stats.avgViews,
            avgLikes: stats.avgLikes,
            avgComments: stats.avgComments,
            engagementRate: stats.engagementRate,
            syncedAt: stats.syncedAt,
            createdAt: new Date(),
        };

        const docRef = await db.collection('competitor_profiles').add(doc);
        res.json({ success: true, profile: { id: docRef.id, ...doc } });
    } catch (error) {
        console.error('❌ Erro ao adicionar perfil concorrente:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/competitors/profiles/:id  (update tag)
 */
router.patch('/profiles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tag } = req.body;
        await db.collection('competitor_profiles').doc(id).update({ tag: tag || '' });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erro ao atualizar perfil:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/competitors/profiles/:id
 */
router.delete('/profiles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('competitor_profiles').doc(id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erro ao deletar perfil:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/competitors/profiles/:id/sync
 * Re-scrapes the profile stats and updates Firestore.
 */
router.post('/profiles/:id/sync', async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('competitor_profiles').doc(id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Perfil não encontrado.' });

        const { username } = doc.data();
        console.log(`🔄 Sincronizando @${username}...`);

        const stats = await scrapeInstagramProfile(username);

        const updates = {
            fullName: stats.fullName,
            biography: stats.biography,
            profilePicUrl: stats.profilePicUrl,
            followers: stats.followers,
            following: stats.following,
            postsCount: stats.postsCount,
            verified: stats.verified,
            reelsLast30d: stats.reelsLast30d,
            postsLast30d: stats.postsLast30d,
            avgViews: stats.avgViews,
            avgLikes: stats.avgLikes,
            avgComments: stats.avgComments,
            engagementRate: stats.engagementRate,
            syncedAt: stats.syncedAt,
        };

        await db.collection('competitor_profiles').doc(id).update(updates);
        res.json({ success: true, profile: { id, ...doc.data(), ...updates } });
    } catch (error) {
        console.error('❌ Erro ao sincronizar perfil:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Saved Ideas CRUD ────────────────────────────────────────────────────────

/**
 * GET /api/competitors/ideas?businessProfileId=xxx
 */
router.get('/ideas', async (req, res) => {
    try {
        const { businessProfileId } = req.query;
        if (!businessProfileId) {
            return res.status(400).json({ error: 'businessProfileId obrigatório.' });
        }
        const snapshot = await db.collection('competitor_ideas')
            .where('businessProfileId', '==', businessProfileId)
            .get();
        const ideas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        ideas.sort((a, b) => {
            const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
            const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
            return tb.getTime() - ta.getTime();
        });
        res.json({ success: true, ideas });
    } catch (error) {
        console.error('❌ Erro ao listar ideias:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/competitors/ideas
 * Body: { businessProfileId, post, note? }
 * Saves the idea immediately and fires Gemini analysis + concept extraction in background.
 */
router.post('/ideas', async (req, res) => {
    try {
        const { businessProfileId, post, note } = req.body;
        if (!businessProfileId || !post) {
            return res.status(400).json({ error: 'businessProfileId e post são obrigatórios.' });
        }

        // Prevent duplicate (same post ID per business)
        if (post.id) {
            const existing = await db.collection('competitor_ideas')
                .where('businessProfileId', '==', businessProfileId)
                .where('post.id', '==', post.id)
                .limit(1).get();
            if (!existing.empty) {
                return res.status(409).json({ error: 'Este post já foi salvo nas suas ideias.' });
            }
        }

        const doc = {
            businessProfileId,
            userId: req.userId || 'system',
            post,
            note: note || '',
            strategy: null,
            concept: null,
            enriched: false,
            createdAt: new Date(),
        };

        const docRef = await db.collection('competitor_ideas').add(doc);

        // ── Background enrichment: run Gemini analysis + concept extraction ──
        (async () => {
            try {
                console.log(`🧠 [Background] Enriquecendo ideia ${docRef.id}...`);

                // 1. Strategy analysis
                const strategySystemPrompt = `Você é um analista de performance de social media. Analise o post do concorrente.
Avalie a estrutura, o hook e o formato. Responda em Markdown limpo:
- **Resumo do Conceito**: Qual é a tese principal do post?
- **O Gancho (Hook)**: Qual elemento visual/textual capta a atenção?
- **Estrutura Visual**: Layout e Cores.
- **Veredito**: Por que isso funcionou? Como recriar com originalidade?`;
                const strategyUserContent = `Legenda do Post: """${post.caption}"""\nLikes: ${post.likes}\nComments: ${post.comments}`;
                const strategyParts = [{ text: strategySystemPrompt + '\n\n' + strategyUserContent }];

                if (post.imageUrl) {
                    const imgData = await imageUrlToBase64(post.imageUrl);
                    if (imgData) strategyParts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
                }

                const strategy = await callGemini(strategyParts);

                // 2. Concept/hook extraction (non-video only — video deep scan is separate by user request)
                let concept = null;
                if (post.type !== 'video') {
                    const conceptSystemPrompt = `Você é um diretor de arte. Baseado no post do concorrente, crie um NOVO prompt de imagem que use a mesma psicologia, mas adaptada.
Traga a mesma ideia/hook, mas com um texto original.
Formato exato de saída:
[HEADLINE: "Sua Nova Chamada"]
[BACKGROUND: Descrição da cena fotográfica]`;
                    const conceptParts = [{ text: conceptSystemPrompt + '\n\n' + `Legenda Original: ${post.caption}` }];
                    if (post.imageUrl) {
                        const imgData = await imageUrlToBase64(post.imageUrl);
                        if (imgData) conceptParts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
                    }
                    concept = await callGemini(conceptParts);
                }

                await db.collection('competitor_ideas').doc(docRef.id).update({ strategy, concept, enriched: true });
                console.log(`✅ [Background] Ideia ${docRef.id} enriquecida com estratégia + conceito.`);
            } catch (err) {
                console.error(`❌ [Background] Falha ao enriquecer ideia ${docRef.id}:`, err.message);
            }
        })();

        res.json({ success: true, idea: { id: docRef.id, ...doc } });
    } catch (error) {
        console.error('❌ Erro ao salvar ideia:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/competitors/ideas/:id  (update note)
 */
router.patch('/ideas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        await db.collection('competitor_ideas').doc(id).update({ note: note || '' });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erro ao atualizar ideia:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/competitors/ideas/:id
 */
router.delete('/ideas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('competitor_ideas').doc(id).delete();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erro ao deletar ideia:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
