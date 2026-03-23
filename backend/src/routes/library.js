import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { storage, db } from '../config/firebase.js';
import { createPost } from '../services/postService.js';
import { uploadImage } from '../services/historyService.js';
import { generateImages } from '../services/aiService.js';

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
router.post('/upload', upload.array('files', 50), async (req, res) => {
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
        const fileHashes = [];
        const duplicatesSkipped = [];

        for (const file of files) {
            // Calculate Hash to prevent duplicates
            const hash = crypto.createHash('md5').update(file.buffer).digest('hex');

            // Check if this file already exists for this profile
            const duplicateSnapshot = await db.collection('library_items')
                .where('businessProfileId', '==', businessProfileId)
                .where('fileHash', '==', hash)
                .get();

            if (!duplicateSnapshot.empty) {
                console.warn(`⚠️ Duplicate file detected for hash: ${hash}`);
                duplicatesSkipped.push(file.originalname);
                continue; // Skip duplicate instead of aborting
            }

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
            fileHashes.push(hash);
            console.log(`✅ File uploaded: ${filename} (hash: ${hash})`);
        }

        if (mediaUrls.length === 0 && duplicatesSkipped.length > 0) {
            return res.status(409).json({
                error: `Todas as imagens selecionadas já existem nesta biblioteca.`,
                duplicatesSkipped
            });
        }

        // Determine upload mode
        const isMultiStatic = (type === 'static' || !type) && mediaUrls.length > 1;

        if (isMultiStatic) {
            console.log('🔄 Detected multiple static images. Creating individual library items...');
            const createdItems = [];

            for (let i = 0; i < mediaUrls.length; i++) {
                const url = mediaUrls[i];
                const hash = fileHashes[i];
                const libraryItem = {
                    userId: req.userId,
                    businessProfileId: businessProfileId,
                    type: 'static',
                    mediaUrls: [url],
                    fileHash: hash,
                    originalName: files[i].originalname, // Store original filename
                    caption: caption || '',
                    tag: tag || 'editar',
                    createdAt: new Date(),
                    isScheduled: false,
                    scheduledPostId: null,
                };

                const itemRef = await db.collection('library_items').add(libraryItem);
                createdItems.push({ id: itemRef.id, ...libraryItem });
            }

            console.log(`✅ Created ${createdItems.length} individual static library items.`);

            res.status(201).json({
                message: `Upload realizado com sucesso! ${createdItems.length} itens criados.` + (duplicatesSkipped.length > 0 ? ` (${duplicatesSkipped.length} duplicados ignorados)` : ''),
                items: createdItems,
                count: createdItems.length,
                duplicatesSkipped
            });

        } else {
            // Default behavior (Carousel, Single Static, etc)
            let contentType = type || 'static';
            if (mediaUrls.length > 1 && !type) {
                contentType = 'carousel';
            }

            const libraryItem = {
                userId: req.userId,
                businessProfileId: businessProfileId,
                type: contentType,
                mediaUrls,
                fileHash: fileHashes[0], 
                originalName: files[0].originalname, // Store first file's original name
                caption: caption || '',
                tag: tag || 'editar',
                createdAt: new Date(),
                isScheduled: false,
                scheduledPostId: null,
            };

            const itemRef = await db.collection('library_items').add(libraryItem);
            console.log(`✅ Library item created with ID: ${itemRef.id}`);

            res.status(201).json({
                message: 'Upload realizado com sucesso' + (duplicatesSkipped.length > 0 ? ` (${duplicatesSkipped.length} duplicados ignorados)` : ''),
                item: {
                    id: itemRef.id,
                    ...libraryItem,
                },
                duplicatesSkipped
            });
        }

    } catch (error) {
        console.error('❌ Erro no upload:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/library/upload-files - Upload files only (for replacing images)
 */
router.post('/upload-files', upload.array('files', 50), async (req, res) => {
    try {
        const { businessProfileId } = req.body;
        const files = req.files;

        console.log('📤 Upload files request:', {
            businessProfileId,
            filesCount: files?.length
        });

        if (!businessProfileId || !files || files.length === 0) {
            return res.status(400).json({
                error: 'businessProfileId e files são obrigatórios'
            });
        }

        const mediaUrls = [];
        const fileHashes = [];
        const originalNames = [];

        for (const file of files) {
            const hash = crypto.createHash('md5').update(file.buffer).digest('hex');
            const duplicateSnapshot = await db.collection('library_items')
                .where('businessProfileId', '==', businessProfileId)
                .where('fileHash', '==', hash)
                .get();

            if (!duplicateSnapshot.empty) {
                return res.status(409).json({
                    error: `A imagem "${file.originalname}" já existe nesta biblioteca.`
                });
            }

            const filename = `uploads/${req.userId}/${Date.now()}_${file.originalname}`;
            const fileUpload = storage.file(filename);

            await fileUpload.save(file.buffer, {
                metadata: { contentType: file.mimetype },
                public: true,
            });

            mediaUrls.push(`https://storage.googleapis.com/${storage.name}/${filename}`);
            fileHashes.push(hash);
            originalNames.push(file.originalname);
        }

        res.status(200).json({ mediaUrls, fileHashes, originalNames });

    } catch (error) {
        console.error('❌ Erro no upload de arquivos:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/library - Create library item from existing media URLs (e.g. AI generated)
 */
router.post('/', async (req, res) => {
    try {
        const { businessProfileId, mediaUrls, caption, tag, type } = req.body;

        if (!businessProfileId || !mediaUrls || !Array.isArray(mediaUrls)) {
            return res.status(400).json({
                error: 'businessProfileId e mediaUrls (array) são obrigatórios'
            });
        }

        console.log('📚 Saving to library from URLs...', { count: mediaUrls.length, type });

        // Persist images (download external -> upload to firebase)
        // using the shared helper from historyService
        const processedUrls = await Promise.all(mediaUrls.map(url => uploadImage(url)));

        const libraryItem = {
            userId: req.userId,
            businessProfileId,
            type: type || (mediaUrls.length > 1 ? 'carousel' : 'static'),
            mediaUrls: processedUrls,
            caption: caption || '',
            tag: tag || 'editar',
            createdAt: new Date(),
            isScheduled: false,
            scheduledPostId: null,
        };

        const docRef = await db.collection('library_items').add(libraryItem);

        console.log(`✅ Saved to library with ID: ${docRef.id}`);

        res.status(201).json({
            id: docRef.id,
            ...libraryItem
        });

    } catch (error) {
        console.error('❌ Erro ao salvar na library:', error);
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

        // Tenta sincronizar os posts agendados em background (fire and forget)
        // para garantir que se algum já foi postado, a library será atualizada.
        import('../services/postService.js')
            .then(({ syncScheduledPosts }) => syncScheduledPosts())
            .catch(err => console.error('Erro no auto-sync ao carregar library:', err));

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
 * POST /api/library/:id/format - Reformat image to ideal Instagram aspect ratio via Gemini
 */
router.post('/:id/format', async (req, res) => {
    try {
        const { id } = req.params;

        // Load the library item
        const doc = await db.collection('library_items').doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Item n\u00e3o encontrado' });
        }

        const item = { id: doc.id, ...doc.data() };
        const imageUrl = item.mediaUrls?.[0];

        if (!imageUrl) {
            return res.status(400).json({ error: 'Item sem imagem para formatar' });
        }

        // Determine target aspect ratio based on content type
        const isStory = item.type === 'story' || item.type === 'stories';
        const targetRatio = isStory ? '9:16' : '4:5';
        const targetDimensions = isStory ? '1080 x 1920 pixels (9:16)' : '1080 x 1350 pixels (4:5)';

        console.log(`\ud83d\udccc Formatting item ${id} (type: ${item.type}) to ${targetRatio}...`);

        // Build the reformatting prompt — instructs Gemini to NOT crop, only extend/adapt
        const formatPrompt = `You are a professional Instagram content designer.

Your task: Recreate this image in the EXACT aspect ratio of ${targetRatio} (${targetDimensions}).

CRITICAL RULES:
- PRESERVE ALL visual content from the original — every element, text, person, object, and design must remain fully visible.
- DO NOT crop, cut, or remove any part of the original image.
- If the image does not fill the target ratio, intelligently EXTEND the background, edges, or empty areas to fill the space — match the original style, colors, and atmosphere seamlessly.
- Keep all text perfectly readable and properly positioned.
- The composition, lighting, and color palette must be identical to the original.
- Output must be a clean, publication-ready image — no borders, no watermarks, no padding artifacts.

Simply adapt the image to fill ${targetRatio} while keeping 100% of the original content intact.`;

        // Call Gemini with the original image as reference (image-to-image)
        console.log('🤖 Sending to Gemini for reformatting...');
        const resultUrls = await generateImages(
            formatPrompt,
            targetRatio,
            1,
            null,
            false,
            {},
            imageUrl, // Pass original image as reference
            'gemini'
        );

        if (!resultUrls || resultUrls.length === 0) {
            throw new Error('Gemini n\u00e3o retornou imagem reformatada');
        }

        console.log('✨ Gemini reformatting complete. Persisting to Storage...');
        // Upload the new image to Firebase Storage (persist it)
        const newImageUrl = await uploadImage(resultUrls[0]);

        console.log('💾 Updating Firestore document with new URL...');
        // Update the library item with the new image URL
        const updatedMediaUrls = [newImageUrl, ...item.mediaUrls.slice(1)];
        await db.collection('library_items').doc(id).update({
            mediaUrls: updatedMediaUrls,
            updatedAt: new Date(),
        });

        console.log(`\u2705 Item ${id} reformatted successfully to ${targetRatio}: ${newImageUrl}`);

        res.status(200).json({
            success: true,
            message: `Imagem reformatada para ${targetRatio} com sucesso!`,
            mediaUrls: updatedMediaUrls,
            targetRatio,
        });

    } catch (error) {
        console.error('\u274c Erro ao formatar imagem:', error);
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

        // Verify if there are base64 images to upload to Firebase Storage
        if (updates.mediaUrls && Array.isArray(updates.mediaUrls)) {
            for (let i = 0; i < updates.mediaUrls.length; i++) {
                const url = updates.mediaUrls[i];
                if (url && url.startsWith('data:image/')) {
                    console.log('🔄 Uploading Base64 image to Firebase Storage...');

                    // Extract mime type and base64 data
                    const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
                    if (!match) continue;

                    const mimeType = match[1];
                    const base64Data = match[2];
                    const buffer = Buffer.from(base64Data, 'base64');
                    const extension = mimeType.split('/')[1];

                    const filename = `uploads/ai_refined/${Date.now()}_${id}.${extension}`;
                    const fileUpload = storage.file(filename);

                    await fileUpload.save(buffer, {
                        metadata: { contentType: mimeType },
                        public: true,
                    });

                    const publicUrl = `https://storage.googleapis.com/${storage.name}/${filename}`;
                    updates.mediaUrls[i] = publicUrl;
                    console.log(`✅ Base64 image uploaded to: ${publicUrl}`);
                }
            }
        }

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
