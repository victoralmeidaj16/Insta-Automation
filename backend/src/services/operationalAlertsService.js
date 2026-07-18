import axios from 'axios';
import { db } from '../config/firebase.js';

const PROCESSING_STALE_MS = 20 * 60 * 1000;

function asDate(value) {
    return value?.toDate?.() || (value ? new Date(value) : null);
}

async function getUploadPostProfile(profile, cache) {
    const apiKey = profile.instagram?.uploadPostApiKey?.trim();
    const username = profile.instagram?.username?.trim();
    if (!apiKey || !username) return { connected: false, reason: 'missing-configuration' };

    const cacheKey = `${apiKey}:${username}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const request = axios.get('https://api.upload-post.com/api/uploadposts/users', {
        headers: { Authorization: `Apikey ${apiKey}` },
        timeout: 12000
    }).then(response => {
        const providerProfile = (response.data?.profiles || []).find(item => item.username === username);
        return {
            connected: Boolean(providerProfile?.social_accounts?.instagram),
            profileUsername: username,
            instagramHandle: providerProfile?.social_accounts?.instagram?.username
                || providerProfile?.social_accounts?.instagram?.display_name
                || null,
            reason: providerProfile ? 'instagram-not-connected' : 'profile-not-found'
        };
    }).catch(error => ({
        connected: false,
        profileUsername: username,
        reason: error.response?.status === 401 || error.response?.status === 403
            ? 'provider-auth-failed'
            : 'provider-unavailable'
    }));

    cache.set(cacheKey, request);
    return request;
}

export async function getOperationalAlerts(userId, profileId = null) {
    const [profilesSnapshot, postsSnapshot] = await Promise.all([
        db.collection('businessProfiles').where('userId', '==', userId).get(),
        db.collection('posts').where('userId', '==', userId).get()
    ]);

    const profiles = profilesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(profile => !profileId || profile.id === profileId);
    const alerts = [];
    const providerCache = new Map();

    for (const profile of profiles) {
        const state = await getUploadPostProfile(profile, providerCache);
        if (!state.connected) {
            alerts.push({
                id: `username-disconnected:${profile.id}`,
                kind: 'username_disconnected',
                severity: 'critical',
                profileId: profile.id,
                profileName: profile.name,
                title: 'Username desconectado',
                message: state.reason === 'profile-not-found'
                    ? `O perfil Upload-Post “${state.profileUsername}” não foi encontrado.`
                    : `A conta Instagram de “${profile.name}” não está conectada ao Upload-Post.`,
                action: 'Reconectar conta'
            });
        }
    }

    const now = Date.now();
    postsSnapshot.docs.forEach(doc => {
        const post = { id: doc.id, ...doc.data() };
        if (post.status !== 'processing') return;
        if (profileId && post.businessProfileId !== profileId) return;
        const startedAt = asDate(post.processingStartedAt)
            || asDate(post.updatedAt)
            || asDate(post.createdAt);
        if (!startedAt || now - startedAt.getTime() < PROCESSING_STALE_MS) return;

        const profile = profiles.find(item => item.id === post.businessProfileId);
        alerts.push({
            id: `processing-stuck:${post.id}`,
            kind: 'processing_stuck',
            severity: 'warning',
            profileId: post.businessProfileId || null,
            profileName: profile?.name || 'Perfil não identificado',
            postId: post.id,
            title: 'Publicação presa em processamento',
            message: `Este conteúdo está em processamento há ${Math.floor((now - startedAt.getTime()) / 60000)} min.`,
            action: 'Abrir calendário'
        });
    });

    return alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
}
