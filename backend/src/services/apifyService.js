import axios from 'axios';

const APIFY_BASE = "https://api.apify.com/v2";

function extractInstagramUsername(url) {
    if (!url) return "";
    let cleanUrl = url.split('?')[0].replace(/\/$/, "");
    if (!cleanUrl.includes('instagram.com/')) {
        return cleanUrl.replace(/^@/, "");
    }
    const match = cleanUrl.match(/instagram\.com\/([^/?#]+)/);
    if (match) {
        return match[1].trim();
    }
    return "";
}

function extractApifyDatasetIssue(items) {
    const errorItems = items.filter(item => item && typeof item === 'object' && item.error);
    if (!errorItems.length) return null;

    const blocked = errorItems.some(item =>
        Array.isArray(item.requestErrorMessages)
        && item.requestErrorMessages.some(message => typeof message === 'string' && message.includes('Request got blocked'))
    );

    const emptyOrPrivate = errorItems.every(item =>
        item.error === 'no_items'
        || String(item.errorDescription || '').toLowerCase().includes('empty or private')
    );

    const resolvedUsernames = [...new Set(
        errorItems
            .map(item => extractInstagramUsername(item.inputUrl || item.url || ''))
            .filter(Boolean)
    )];

    return {
        blocked,
        emptyOrPrivate,
        resolvedUsernames,
        errorItems
    };
}

function buildSingleProfileFetchError(username, datasetIssue) {
    if (!datasetIssue) {
        return new Error(`Não foi possível buscar posts de @${username} no momento.`);
    }

    if (datasetIssue.blocked) {
        return new Error(`Instagram bloqueou temporariamente a consulta para @${username}. Tente novamente em alguns minutos.`);
    }

    if (datasetIssue.emptyOrPrivate) {
        return new Error(`Nenhum post público encontrado para @${username}. A conta pode estar privada ou sem posts visíveis.`);
    }

    return new Error(`Não foi possível buscar posts de @${username} no momento.`);
}

async function runApifyJob(token, payload, timeoutSec = 120) {
    const actorId = "apify~instagram-scraper";
    const runUrl = `${APIFY_BASE}/acts/${actorId}/runs`;

    const runResp = await axios.post(runUrl, payload, {
        params: { token },
        timeout: 30000
    });

    const runData = runResp.data.data || {};
    const runId = runData.id;
    if (!runId) {
        throw new Error('Falha ao iniciar Job no Apify (sem runId).');
    }

    console.log(`⌛ Job Apify iniciado (${runId})...`);

    const maxPolls = Math.ceil(timeoutSec / 3);
    let lastStatus = '';
    let datasetId = null;

    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const statusResp = await axios.get(`${APIFY_BASE}/actor-runs/${runId}`, {
            params: { token },
            timeout: 15000
        });

        const statusData = statusResp.data.data || {};
        lastStatus = statusData.status;

        if (i % 5 === 0) console.log(`⏳ [${i * 3}s] Status: ${lastStatus}`);

        if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(lastStatus)) {
            if (lastStatus !== 'SUCCEEDED') {
                throw new Error(`Job Apify encerrou com status: ${lastStatus}`);
            }
            datasetId = statusData.defaultDatasetId;
            console.log(`✅ Job concluído em ~${i * 3}s. Dataset: ${datasetId}`);
            break;
        }
    }

    if (!datasetId) {
        throw new Error(`Timeout aguardando Job Apify (último status: ${lastStatus}).`);
    }

    const itemsResp = await axios.get(`${APIFY_BASE}/datasets/${datasetId}/items`, {
        params: { token },
        timeout: 30000
    });

    return Array.isArray(itemsResp.data) ? itemsResp.data : [];
}

/**
 * Scrapes recent posts from an Instagram username via Apify.
 */
export async function scrapeInstagramPosts(urlOrUsername, limit = 15, days = null) {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error('APIFY_API_TOKEN não está configurado.');

    const username = extractInstagramUsername(urlOrUsername);
    if (!username) throw new Error('Não foi possível extrair o usuário do Instagram.');

    console.log(`🔍 Buscando posts de @${username} (limite: ${limit}, dias: ${days || 'ilimitado'})`);

    const payload = {
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "posts",
        resultsLimit: limit,
        addParentData: false,
        proxy: { "useApifyProxy": true }
    };

    if (days && days > 0) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        payload.oldestPostDate = date.toISOString().split('T')[0];
    }

    const items = await runApifyJob(token, payload, 120);
    console.log(`📦 ${items.length} itens recebidos para @${username}`);

    const datasetIssue = extractApifyDatasetIssue(items);
    if (datasetIssue) {
        console.warn(`⚠️ Dataset com erro para @${username}:`, {
            blocked: datasetIssue.blocked,
            emptyOrPrivate: datasetIssue.emptyOrPrivate,
            resolvedUsernames: datasetIssue.resolvedUsernames
        });
    }

    if (items.length > 0) {
        const s = items[0];
        console.log(`📝 Sample:`, { id: s.id, type: s.type, hasDisplayUrl: !!s.displayUrl, likesCount: s.likesCount });
    }

    const posts = [];
    for (const item of items) {
        if (item?.error) continue;
        if (!item.id && !item.shortCode && !item.caption && !item.displayUrl) continue;

        let ptype = String(item.type || "image").toLowerCase();
        if (ptype === "sidecar" || ptype === "graphsidecar") ptype = "carousel";
        if (ptype === "graphimage") ptype = "image";
        if (ptype === "graphvideo" || ptype === "clipsmedia" || ptype === "video") ptype = "video";

        let slideCount = item.carouselMediaCount;
        if (!slideCount && Array.isArray(item.carouselMedia)) slideCount = item.carouselMedia.length;

        let imageUrl = item.displayUrl || item.imageUrl || item.thumbnailUrl || '';
        if (!imageUrl && Array.isArray(item.childPosts) && item.childPosts[0]) {
            imageUrl = item.childPosts[0].displayUrl || item.childPosts[0].imageUrl || '';
        }
        if (!imageUrl && Array.isArray(item.carouselMedia) && item.carouselMedia[0]) {
            imageUrl = item.carouselMedia[0].displayUrl || item.carouselMedia[0].imageUrl || '';
        }

        posts.push({
            id: item.id || item.shortCode || '',
            type: ptype,
            caption: item.caption || '',
            imageUrl,
            videoUrl: item.videoUrl || item.video_url || item.videoPlayUrl || null,
            likes: item.likesCount || item.likes || 0,
            comments: item.commentsCount || item.comments || 0,
            videoViews: item.videoViewCount || item.video_view_count || item.videoPlayCount || null,
            slideCount: slideCount || 1,
            timestamp: item.timestamp || item.takenAtTimestamp || '',
            sourceUrl: item.url || item.postUrl || `https://www.instagram.com/p/${item.shortCode}/`
        });
    }

    console.log(`✅ ${posts.length} posts válidos para @${username}`);

    if (posts.length === 0 && datasetIssue) {
        throw buildSingleProfileFetchError(username, datasetIssue);
    }

    return posts;
}

/**
 * Scrapes recent posts from an array of usernames via Apify (Batch Mode).
 */
export async function scrapeInstagramBatch(usernames, limitPerUser = 12, days = 7) {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error('APIFY_API_TOKEN não está configurado.');

    console.log(`🌐 Buscando posts em lote para: ${usernames.join(', ')}`);

    const directUrls = usernames.map(u => `https://www.instagram.com/${u}/`);

    const payload = {
        directUrls,
        resultsType: "posts",
        resultsLimit: limitPerUser,
        addParentData: false,
        proxy: { "useApifyProxy": true }
    };

    if (days && days > 0) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        payload.oldestPostDate = date.toISOString().split('T')[0];
    }

    const items = await runApifyJob(token, payload, 300); // Higher timeout for batch
    console.log(`📦 ${items.length} itens recebidos no Lote`);

    const posts = [];
    for (const item of items) {
        if (!item.id && !item.shortCode && !item.caption && !item.displayUrl) continue;

        let ptype = String(item.type || "image").toLowerCase();
        if (ptype === "sidecar" || ptype === "graphsidecar") ptype = "carousel";
        if (ptype === "graphimage") ptype = "image";
        if (ptype === "graphvideo" || ptype === "clipsmedia" || ptype === "video") ptype = "video";

        let slideCount = item.carouselMediaCount;
        if (!slideCount && Array.isArray(item.carouselMedia)) slideCount = item.carouselMedia.length;

        let imageUrl = item.displayUrl || item.imageUrl || item.thumbnailUrl || '';
        if (!imageUrl && Array.isArray(item.childPosts) && item.childPosts[0]) {
            imageUrl = item.childPosts[0].displayUrl || item.childPosts[0].imageUrl || '';
        }
        if (!imageUrl && Array.isArray(item.carouselMedia) && item.carouselMedia[0]) {
            imageUrl = item.carouselMedia[0].displayUrl || item.carouselMedia[0].imageUrl || '';
        }

        posts.push({
            id: item.id || item.shortCode || '',
            ownerUsername: item.ownerUsername || (item.owner && item.owner.username) || '',
            type: ptype,
            caption: item.caption || '',
            imageUrl,
            videoUrl: item.videoUrl || item.video_url || item.videoPlayUrl || null,
            likes: item.likesCount || item.likes || 0,
            comments: item.commentsCount || item.comments || 0,
            videoViews: item.videoViewCount || item.video_view_count || item.videoPlayCount || null,
            slideCount: slideCount || 1,
            timestamp: item.timestamp || item.takenAtTimestamp || '',
            sourceUrl: item.url || item.postUrl || `https://www.instagram.com/p/${item.shortCode}/`
        });
    }

    console.log(`✅ ${posts.length} posts válidos extraídos no lote`);
    return posts;
}

/**
 * Scrapes profile details + calculates stats from recent posts.
 * Returns: username, fullName, biography, profilePicUrl, followers, following,
 *          postsCount, verified, isPrivate, reelsLast30d, postsLast30d,
 *          avgViews, avgLikes, avgComments
 */
export async function scrapeInstagramProfile(urlOrUsername) {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error('APIFY_API_TOKEN não está configurado.');

    const username = extractInstagramUsername(urlOrUsername);
    if (!username) throw new Error('Não foi possível extrair o usuário do Instagram.');

    console.log(`👤 Buscando perfil de @${username}...`);

    const payload = {
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "details",
        resultsLimit: 1,
        addParentData: false,
    };

    const items = await runApifyJob(token, payload, 120);

    if (!items.length) throw new Error(`Perfil @${username} não encontrado ou é privado.`);

    const profile = items[0];

    if (profile.private) throw new Error(`Perfil @${username} é privado.`);

    // Calculate stats from latestPosts (up to last 30 days)
    const latestPosts = Array.isArray(profile.latestPosts) ? profile.latestPosts : [];
    const now = Date.now();
    const cutoff30d = now - 30 * 24 * 60 * 60 * 1000;

    const recent = latestPosts.filter(p => {
        if (!p.timestamp) return false;
        return new Date(p.timestamp).getTime() >= cutoff30d;
    });

    const reelTypes = new Set(['video', 'graphvideo', 'clipsmedia']);
    const reelsLast30d = recent.filter(p => reelTypes.has(String(p.type || '').toLowerCase())).length;
    const postsLast30d = recent.length;

    const videoPostsAll = latestPosts.filter(p => reelTypes.has(String(p.type || '').toLowerCase()));
    const avgViews = videoPostsAll.length
        ? Math.round(videoPostsAll.reduce((s, p) => s + (p.videoViewCount || 0), 0) / videoPostsAll.length)
        : 0;
    const avgLikes = latestPosts.length
        ? Math.round(latestPosts.reduce((s, p) => s + (p.likesCount || 0), 0) / latestPosts.length)
        : 0;
    const avgComments = latestPosts.length
        ? Math.round(latestPosts.reduce((s, p) => s + (p.commentsCount || 0), 0) / latestPosts.length)
        : 0;

    // Engagement rate = (avg likes + avg comments) / followers * 100
    const followers = profile.followersCount || 0;
    const engagementRate = followers > 0
        ? Number(((avgLikes + avgComments) / followers * 100).toFixed(2))
        : 0;

    return {
        username: profile.username || username,
        fullName: profile.fullName || '',
        biography: profile.biography || '',
        profilePicUrl: profile.profilePicUrl || '',
        externalUrl: profile.externalUrl || '',
        followers,
        following: profile.followsCount || 0,
        postsCount: profile.postsCount || 0,
        verified: profile.verified || false,
        isPrivate: profile.private || false,
        businessCategory: profile.businessCategoryName || '',
        reelsLast30d,
        postsLast30d,
        avgViews,
        avgLikes,
        avgComments,
        engagementRate,
        syncedAt: new Date().toISOString(),
    };
}
