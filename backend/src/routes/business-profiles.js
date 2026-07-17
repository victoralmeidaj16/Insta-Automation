import express from 'express';
import {
    createBusinessProfile,
    getBusinessProfiles,
    getBusinessProfile,
    getRawBusinessProfile,
    buildBusinessProfileUpdates,
    updateBusinessProfile,
    deleteBusinessProfile,
    linkAccountToProfile,
    unlinkAccountFromProfile,
    getAccountsByProfile
} from '../services/businessProfileService.js';
import {
    addAccount,
    getAccounts,
    updateAccount,
    verifyAccount
} from '../services/accountService.js';
import { db, storage } from '../config/firebase.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

/**
 * POST /api/business-profiles - Create new business profile
 */
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            instagram,
            branding,
            aiPreferences,
            targetAudience,
            productService,
            contentStrategy,
            brandContext,
            brandKey,
            brandKit,
            editorialPillars,
            contentSchedule
        } = req.body;

        const profile = await createBusinessProfile(req.userId, {
            name,
            description,
            instagram,
            branding,
            aiPreferences,
            targetAudience,
            productService,
            contentStrategy,
            brandContext,
            brandKey,
            brandKit,
            editorialPillars,
            contentSchedule
        });

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        console.error('Error creating business profile:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/business-profiles - Get all business profiles for current user
 */
router.get('/', async (req, res) => {
    try {
        const profiles = await getBusinessProfiles(req.userId);

        res.json({
            success: true,
            profiles
        });
    } catch (error) {
        console.error('Error fetching business profiles:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/business-profiles/:id - Get specific business profile
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await getBusinessProfile(id);

        // Verify ownership
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this profile'
            });
        }

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        console.error('Error fetching business profile:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/business-profiles/:id - Update business profile
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await getRawBusinessProfile(id);

        // Verify ownership
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to update this profile'
            });
        }

        console.log('🔄 [DEBUG] PUT /:id - Body:', JSON.stringify(req.body, null, 2));
        const updates = buildBusinessProfileUpdates(profile, req.body);

        await updateBusinessProfile(id, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating business profile:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/business-profiles/:id - Delete business profile
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await getBusinessProfile(id);

        // Verify ownership
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to delete this profile'
            });
        }

        await deleteBusinessProfile(id);

        res.json({
            success: true,
            message: 'Profile deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting business profile:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/business-profiles/:id/link-account - Link account to profile
 */
router.post('/:id/link-account', async (req, res) => {
    try {
        const { id } = req.params;
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({
                success: false,
                error: 'Account ID is required'
            });
        }

        // Verify profile ownership
        const profile = await getBusinessProfile(id);
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to modify this profile'
            });
        }

        await linkAccountToProfile(accountId, id);

        res.json({
            success: true,
            message: 'Account linked successfully'
        });
    } catch (error) {
        console.error('Error linking account:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/business-profiles/unlink-account - Unlink account from profile
 */
router.post('/unlink-account', async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({
                success: false,
                error: 'Account ID is required'
            });
        }

        await unlinkAccountFromProfile(accountId);

        res.json({
            success: true,
            message: 'Account unlinked successfully'
        });
    } catch (error) {
        console.error('Error unlinking account:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/business-profiles/:id/accounts - Get all accounts for a profile
 */
router.get('/:id/accounts', async (req, res) => {
    try {
        const { id } = req.params;

        // Verify profile ownership
        const profile = await getBusinessProfile(id);
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this profile'
            });
        }

        const accounts = await getAccountsByProfile(id);

        res.json({
            success: true,
            accounts
        });
    } catch (error) {
        console.error('Error fetching profile accounts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/:id/connect', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username e Password são obrigatórios'
            });
        }

        // 1. Verify profile ownership
        const profile = await getBusinessProfile(id);
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized'
            });
        }

        // 2. Check if account already exists for this user
        const accounts = await getAccounts(req.userId);
        let account = accounts.find(a => a.username === username);
        let accountId;

        if (account) {
            // Update existing account
            console.log(`🔄 Atualizando conta existente: ${account.id}`);
            await updateAccount(account.id, {
                password,
                businessProfileId: id, // Ensure it's linked to this profile
                updatedAt: new Date()
            });
            accountId = account.id;
        } else {
            // Create new account
            console.log(`➕ Criando nova conta para: ${username}`);
            const newAccount = await addAccount(
                req.userId,
                username,
                null, // email (optional)
                password,
                true, // stayLoggedIn
                id    // businessProfileId
            );
            accountId = newAccount.id;
        }

        // 3. Verify Login
        console.log(`🔐 Verificando login para conta: ${accountId}`);
        const result = await verifyAccount(accountId);

        if (result.success) {
            // Só o username fica no perfil; a senha vive criptografada na collection `accounts`.
            // Reescrever o mapa `instagram` também remove senhas legadas em texto puro do doc.
            await updateBusinessProfile(id, {
                instagram: {
                    username
                }
            });

            res.json({
                success: true,
                message: 'Conectado com sucesso!',
                result
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.message || 'Falha na autenticação',
                result
            });
        }

    } catch (error) {
        console.error('Error connecting account:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/business-profiles/:id/app-screenshot - Upload app screenshot to Firebase Storage
 */
router.post('/:id/app-screenshot', upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'Arquivo é obrigatório' });
        }

        // Verify profile ownership
        const profile = await getBusinessProfile(id);
        if (profile.userId !== req.userId) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const fileExt = path.extname(file.originalname) || '.png';
        const fileName = `business-profiles/${id}/app-screenshot-${uuidv4()}${fileExt}`;
        const fileUpload = storage.file(fileName);

        await fileUpload.save(file.buffer, {
            metadata: { contentType: file.mimetype }
        });

        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${storage.name}/${fileName}`;

        // Update profile
        await updateBusinessProfile(id, {
            brandKit: {
                ...(profile.brandKit || {}),
                appScreenshotUrl: publicUrl
            }
        });

        res.json({
            success: true,
            url: publicUrl
        });
    } catch (error) {
        console.error('Error uploading app screenshot:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/business-profiles/:id/test-instagram
 * Verifies that the stored upload-post API key is valid and returns linked accounts.
 */
router.post('/:id/test-instagram', async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await getBusinessProfile(id);

        if (profile.userId !== req.userId) {
            return res.status(403).json({ success: false, error: 'Acesso negado.' });
        }

        // Accept key from request body (when user hasn't saved yet) or fall back to saved value
        const apiKey = (req.body?.uploadPostApiKey?.trim()) || profile?.instagram?.uploadPostApiKey;
        if (!apiKey || !apiKey.trim()) {
            return res.status(400).json({ success: false, error: 'Nenhuma API key configurada para este perfil.' });
        }

        const configuredUsername = (req.body?.username?.trim()) || profile?.instagram?.username || '';
        const axios = (await import('axios')).default;

        // Verify key is valid — use schedule endpoint as health check
        const response = await axios.get('https://api.upload-post.com/api/uploadposts/schedule', {
            headers: { Authorization: `Apikey ${apiKey.trim()}` },
            timeout: 12000,
        });

        // Extract all unique usernames seen across scheduled posts
        const scheduledPosts = response.data?.scheduled_posts || (Array.isArray(response.data) ? response.data : []);
        const usernameSet = new Set();
        scheduledPosts.forEach(p => { if (p.profile_username) usernameSet.add(p.profile_username); });

        // The configured username for THIS profile is what matters for posting
        // Add it to the set so it always appears in the result
        if (configuredUsername) usernameSet.add(configuredUsername);

        const instagramAccounts = Array.from(usernameSet).map(u => ({ username: u, platform: 'instagram' }));

        return res.json({
            success: true,
            configuredUsername,
            accountCount: instagramAccounts.length,
            instagramAccounts,
            allAccounts: instagramAccounts,
        });
    } catch (error) {
        const status = error?.response?.status;
        const msg = status === 401 || status === 403
            ? 'API key inválida ou sem permissão.'
            : error?.response?.data?.message || error?.response?.data?.error || error.message;

        return res.status(400).json({ success: false, error: msg });
    }
});

export default router;
