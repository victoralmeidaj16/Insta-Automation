import express from 'express';
import {
    createBusinessProfile,
    getBusinessProfiles,
    getBusinessProfile,
    updateBusinessProfile,
    deleteBusinessProfile,
    linkAccountToProfile,
    unlinkAccountFromProfile,
    getAccountsByProfile
} from '../services/businessProfileService.js';

const router = express.Router();

/**
 * POST /api/business-profiles - Create new business profile
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, branding, aiPreferences } = req.body;

        const profile = await createBusinessProfile(req.userId, {
            name,
            description,
            branding,
            aiPreferences
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
        const profile = await getBusinessProfile(id);

        // Verify ownership
        if (profile.userId !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to update this profile'
            });
        }

        const { name, description, branding, aiPreferences } = req.body;
        const updates = {};

        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (branding !== undefined) updates.branding = { ...profile.branding, ...branding };
        if (aiPreferences !== undefined) updates.aiPreferences = { ...profile.aiPreferences, ...aiPreferences };

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

export default router;
