import express from 'express';
import multer from 'multer';
import { storage, db } from '../config/firebase.js';
import { createPost } from '../services/postService.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    }
});

/**
 * POST /api/library/upload - Upload files directly to library
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        const { businessProfileId, caption, tag, type } = req.body;
        const files = req.files;

        console.log('📤 Upload request:', {
            businessProfileId,
            caption,
            tag,
            type,
            filesCount: files?.length
        });

        if (!businessProfileId || !files || files.length === 0) {
            return res.status(400).json({
                error: 'businessProfileId e files são obrigatórios'
            });
        }

        // Upload files to Firebase Storage
        const mediaUrls = [];

        for (const file of files) {
            const filename = `uploads/${req.userId}/${Date.now()}_${file.originalname}`;
            const fileUpload = storage.file(filename);

            await fileUpload.save(file.buffer, {
                metadata: {
                    contentType: file.mimetype,
                },
                public: true,
            });

            const publicUrl = `https://storage.googleapis.com/${storage.name}/${filename}`;
            mediaUrls.push(publicUrl);
            console.log(`✅ File uploaded: ${filename}`);
        }

        // Determine content type
        let contentType = type || 'static';
        if (mediaUrls.length > 1 && !type) {
            contentType = 'carousel';
        }

        // Create library item (NOT a post - just for organization)
        const libraryItem = {
            userId: req.userId,
            businessProfileId: businessProfileId,
            type: contentType,
            mediaUrls,
            caption: caption || '',
            tag: tag || 'editar',
            createdAt: new Date(),
            // Library items are not posts yet, they can be scheduled later
            isScheduled: false,
            scheduledPostId: null,
        };

        const itemRef = await db.collection('library_items').add(libraryItem);

        console.log(`✅ Library item created with ID: ${itemRef.id}`);

        res.status(201).json({
            message: 'Upload realizado com sucesso',
            item: {
                id: itemRef.id,
                ...libraryItem,
            },
        });

    } catch (error) {
        console.error('❌ Erro no upload:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/library - Get library items
 */
router.get('/', async (req, res) => {
    try {
        const { businessProfileId } = req.query;

        if (!businessProfileId) {
            return res.status(400).json({
                error: 'businessProfileId é obrigatório'
            });
        }

        const snapshot = await db.collection('library_items')
            .where('userId', '==', req.userId)
            .where('businessProfileId', '==', businessProfileId)
            .orderBy('createdAt', 'desc')
            .get();

        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`📚 Found ${items.length} library items for businessProfile ${businessProfileId}`);

        res.status(200).json(items);

    } catch (error) {
        console.error('❌ Erro ao buscar library items:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/library/:id - Update library item
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        await db.collection('library_items').doc(id).update({
            ...updates,
            updatedAt: new Date(),
        });

        console.log(`✅ Library item ${id} updated`);

        res.status(200).json({
            message: 'Item atualizado com sucesso',
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar library item:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/library/:id - Delete library item
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await db.collection('library_items').doc(id).delete();

        console.log(`🗑️ Library item ${id} deleted`);

        res.status(200).json({
            message: 'Item deletado com sucesso',
        });

    } catch (error) {
        console.error('❌ Erro ao deletar library item:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
