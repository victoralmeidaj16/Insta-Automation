import { db } from '../config/firebase.js';

/**
 * Business Profile Service
 * Manages business profiles for multi-company Instagram management
 */

/**
 * Create a new business profile
 * @param {string} userId - Owner user ID
 * @param {Object} profileData - Profile information
 * @returns {Promise<Object>} Created profile with ID
 */
export async function createBusinessProfile(userId, profileData) {
    try {
        const { name, description, instagram, branding, aiPreferences } = profileData;

        // Validate required fields
        if (!name || !userId) {
            throw new Error('Nome do perfil e usuário são obrigatórios');
        }

        const profile = {
            userId,
            name,
            description: description || '',
            targetAudience: profileData.targetAudience || '',
            productService: profileData.productService || '',
            instagram: {
                username: instagram?.username || '',
                password: instagram?.password || '' // TODO: Encrypt password before storing
            },
            branding: {
                primaryColor: branding?.primaryColor || '#8e44ad',
                secondaryColor: branding?.secondaryColor || '#e74c3c',
                logoUrl: branding?.logoUrl || null,
                style: branding?.style || '',
                guidelines: branding?.guidelines || ''
            },
            aiPreferences: {
                defaultAspectRatio: aiPreferences?.defaultAspectRatio || '1:1',
                style: aiPreferences?.style || '',
                tone: aiPreferences?.tone || '',
                promptTemplate: aiPreferences?.promptTemplate || '',
                favoritePrompts: aiPreferences?.favoritePrompts || []
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const profileRef = await db.collection('businessProfiles').add(profile);

        console.log(`✅ Business profile "${name}" created with ID: ${profileRef.id}`);

        return {
            id: profileRef.id,
            ...profile
        };
    } catch (error) {
        console.error('❌ Error creating business profile:', error);
        throw error;
    }
}

/**
 * Get all business profiles for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of business profiles
 */
export async function getBusinessProfiles(userId) {
    try {
        const snapshot = await db.collection('businessProfiles')
            .where('userId', '==', userId)
            .get();

        const profiles = [];
        snapshot.forEach(doc => {
            profiles.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Sort in JavaScript instead of Firestore
        profiles.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });

        return profiles;
    } catch (error) {
        console.error('❌ Error fetching business profiles:', error);
        throw error;
    }
}

/**
 * Get a single business profile by ID
 * @param {string} profileId - Profile ID
 * @returns {Promise<Object>} Business profile
 */
export async function getBusinessProfile(profileId) {
    try {
        const doc = await db.collection('businessProfiles').doc(profileId).get();

        if (!doc.exists) {
            throw new Error('Business profile not found');
        }

        return {
            id: doc.id,
            ...doc.data()
        };
    } catch (error) {
        console.error('❌ Error fetching business profile:', error);
        throw error;
    }
}

/**
 * Update a business profile
 * @param {string} profileId - Profile ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export async function updateBusinessProfile(profileId, updates) {
    try {
        const updateData = {
            ...updates,
            updatedAt: new Date()
        };

        await db.collection('businessProfiles').doc(profileId).update(updateData);

        console.log(`✅ Business profile ${profileId} updated`);
        return true;
    } catch (error) {
        console.error('❌ Error updating business profile:', error);
        throw error;
    }
}

/**
 * Delete a business profile
 * @param {string} profileId - Profile ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteBusinessProfile(profileId) {
    try {
        // Check if any accounts are linked to this profile
        const accountsSnapshot = await db.collection('accounts')
            .where('businessProfileId', '==', profileId)
            .get();

        if (!accountsSnapshot.empty) {
            throw new Error(`Cannot delete profile: ${accountsSnapshot.size} account(s) still linked. Please unlink accounts first.`);
        }

        await db.collection('businessProfiles').doc(profileId).delete();

        console.log(`✅ Business profile ${profileId} deleted`);
        return true;
    } catch (error) {
        console.error('❌ Error deleting business profile:', error);
        throw error;
    }
}

/**
 * Link an Instagram account to a business profile
 * @param {string} accountId - Account ID
 * @param {string} profileId - Business profile ID
 * @returns {Promise<boolean>} Success status
 */
export async function linkAccountToProfile(accountId, profileId) {
    try {
        // Verify profile exists
        const profileDoc = await db.collection('businessProfiles').doc(profileId).get();
        if (!profileDoc.exists) {
            throw new Error('Business profile not found');
        }

        // Update account with profile link
        await db.collection('accounts').doc(accountId).update({
            businessProfileId: profileId,
            updatedAt: new Date()
        });

        console.log(`✅ Account ${accountId} linked to profile ${profileId}`);
        return true;
    } catch (error) {
        console.error('❌ Error linking account to profile:', error);
        throw error;
    }
}

/**
 * Unlink an Instagram account from a business profile
 * @param {string} accountId - Account ID
 * @returns {Promise<boolean>} Success status
 */
export async function unlinkAccountFromProfile(accountId) {
    try {
        await db.collection('accounts').doc(accountId).update({
            businessProfileId: null,
            updatedAt: new Date()
        });

        console.log(`✅ Account ${accountId} unlinked from profile`);
        return true;
    } catch (error) {
        console.error('❌ Error unlinking account from profile:', error);
        throw error;
    }
}

/**
 * Get all accounts linked to a specific business profile
 * @param {string} profileId - Business profile ID
 * @returns {Promise<Array>} List of linked accounts
 */
export async function getAccountsByProfile(profileId) {
    try {
        const snapshot = await db.collection('accounts')
            .where('businessProfileId', '==', profileId)
            .get();

        const accounts = [];
        snapshot.forEach(doc => {
            accounts.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return accounts;
    } catch (error) {
        console.error('❌ Error fetching accounts by profile:', error);
        throw error;
    }
}
