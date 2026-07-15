import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { storage, db } from '../config/firebase.js';
import { createPost } from '../services/postService.js';
import { uploadImage } from '../services/historyService.js';
import { generateImages } from '../services/aiService.js';
import { createLibraryItemRecord } from '../domain/contentModels.js';
import { inferLibraryType, isHtmlFormat, isStoryFormat, normalizeFormat } from '../domain/formatRules.js';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    }
});

function normalizeLibraryTag(tag) {
    const normalized = String(tag || '').trim().toLowerCase();

    if (!normalized) return 'editar';
    if (normalized === 'editar' || normalized === 'a editar' || normalized === 'a_editar' || normalized === 'auto') return 'editar';
    if (normalized === 'pronto') return 'pronto';
    if (normalized === 'postado' || normalized === 'publicado' || normalized === 'posted') return 'postado';

    return normalized;
}

function isCarouselLibraryItem(item) {
    const format = item.format || item.type || '';
    return format === 'carousel'
        || format === 'carousel-html'
        || format === 'carousel-premium'
        || item.type === 'carousel'
        || item.baseType === 'carousel'
        || item.contentFamily === 'html-carousel';
}

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
                    ...createLibraryItemRecord({
                        userId: req.userId,
                        businessProfileId,
                        type: 'static',
                        mediaUrls: [url],
                        fileHash: hash,
                        originalName: file.originalname,
                        fileSize: file.size,
                        caption: caption || '',
                        tag: tag || 'editar'
                    })
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
            const contentType = inferLibraryType({ type: normalizeFormat(type || '', ''), mediaUrls });
            const sanitizedCaption = isStoryFormat(contentType) ? '' : (caption || '');
            const libraryItem = createLibraryItemRecord({
                userId: req.userId,
                businessProfileId,
                type: contentType,
                mediaUrls,
                fileHash: fileHashes[0],
                originalName: files[0].originalname,
                fileSize: files[0].size,
                caption: sanitizedCaption,
                tag: tag || 'editar'
            });

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
 * POST /api/library - Create library item from existing media URLs (e.g. AI generated) or HTML code
 */
router.post('/', async (req, res) => {
    try {
        const { businessProfileId, mediaUrls, caption, tag, type, htmlCode } = req.body;

        if (!businessProfileId) {
            return res.status(400).json({
                error: 'businessProfileId é obrigatório'
            });
        }
        
        const resolvedType = inferLibraryType({ type: normalizeFormat(type || '', ''), mediaUrls, htmlCode });

        if (!isHtmlFormat(resolvedType) && (!mediaUrls || !Array.isArray(mediaUrls))) {
            return res.status(400).json({
                error: 'mediaUrls (array) são obrigatórios, exceto no modo HTML'
            });
        }

        console.log('📚 Saving to library...', { count: mediaUrls?.length || 0, type });

        // Persist images (download external -> upload to firebase)
        // using the shared helper from historyService
        const processedUrls = mediaUrls ? await Promise.all(mediaUrls.map(url => uploadImage(url))) : [];

        const sanitizedCaption = isStoryFormat(resolvedType) ? '' : (caption || '');
        const libraryItem = createLibraryItemRecord({
            userId: req.userId,
            businessProfileId,
            type: resolvedType,
            mediaUrls: processedUrls,
            htmlCode: htmlCode || null,
            caption: sanitizedCaption,
            tag: tag || 'editar'
        });

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
 * GET /api/library - Get library items (paginated)
 * Query params: businessProfileId (required), limit (default 24, max 50), lastId (cursor for next page)
 */
router.get('/', async (req, res) => {
    try {
        const { businessProfileId, limit: limitParam, lastId, type, tag, isScheduled, isPosted: isPostedQuery } = req.query;

        if (!businessProfileId) {
            return res.status(400).json({
                error: 'businessProfileId é obrigatório'
            });
        }

        const hasTypeFilter = Boolean(type && type !== 'all');
        const normalizedTypeFilter = type === 'stories' ? 'story' : normalizeFormat(type, type);

        // When filtering by tag or type, fetch a larger batch and filter in memory.
        // This avoids requiring an extra Firestore composite index for type + orderBy.
        const defaultSize = (tag && tag !== 'all') || hasTypeFilter ? 200 : 24;
        const PAGE_SIZE = Math.min(parseInt(limitParam) || defaultSize, 200);

        // Tenta sincronizar os posts agendados em background (fire and forget)
        import('../services/postService.js')
            .then(({ syncScheduledPosts }) => syncScheduledPosts())
            .catch(err => console.error('Erro no auto-sync ao carregar library:', err));

        let query = db.collection('library_items')
            .where('userId', '==', req.userId)
            .where('businessProfileId', '==', businessProfileId);

        // Filtros dinâmicos
        // Use 'in' to handle tag variants stored in Firestore (e.g. "a editar", "a_editar" → normalized to "editar")
        if (tag && tag !== 'all') {
            if (tag === 'editar') {
                query = query.where('tag', 'in', ['editar', 'a editar', 'a_editar', 'auto']);
            } else if (tag === 'postado') {
                query = query.where('tag', 'in', ['postado', 'publicado', 'posted']);
            } else {
                query = query.where('tag', '==', tag);
            }
        }
        if (isScheduled === 'true') {
            query = query.where('isScheduled', '==', true);
        }
        if (isPostedQuery === 'true') {
            query = query.where('isPosted', '==', true);
        }

        query = query.orderBy('isPosted', 'asc')
            .orderBy('createdAt', 'desc')
            .limit(PAGE_SIZE + 1); // fetch one extra to detect hasMore

        if (lastId) {
            const cursorDoc = await db.collection('library_items').doc(lastId).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const docs = snapshot.docs;
        const hasMore = docs.length > PAGE_SIZE;
        const items = docs.map(doc => {
            const data = doc.data();
            const isStory = isStoryFormat(data.format || data.type);
            const mediaUrls = Array.isArray(data.mediaUrls)
                ? data.mediaUrls.filter(Boolean)
                : (typeof data.url === 'string' && data.url ? [data.url] : []);

            return {
                id: doc.id,
                ...data,
                mediaUrls,
                tag: normalizeLibraryTag(data.tag),
                caption: isStory ? '' : (data.caption || '')
            };
        })
            .filter(item => {
                if (!hasTypeFilter) return true;
                if (normalizedTypeFilter === 'carousel') {
                    return isCarouselLibraryItem(item);
                }
                if (normalizedTypeFilter === 'story') {
                    return isStoryFormat(item.format || item.type) || item.contentFamily === 'story';
                }
                return item.type === normalizedTypeFilter || item.format === normalizedTypeFilter;
            })
            .slice(0, PAGE_SIZE);

        console.log(`📚 Found ${items.length} library items (hasMore: ${hasMore}) for businessProfile ${businessProfileId}`);

        res.status(200).json({ items, hasMore });

    } catch (error) {
        console.error('❌ Erro ao buscar library items:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/library/check-duplicates - Check if files already exist in library
 */
router.post('/check-duplicates', async (req, res) => {
    try {
        const { businessProfileId, files } = req.body; // files: [{ name, size, hash }]

        if (!businessProfileId || !files || !Array.isArray(files)) {
            return res.status(400).json({ error: 'businessProfileId e files (array) são obrigatórios' });
        }

        const duplicates = [];

        for (const fileItem of files) {
            let query = db.collection('library_items')
                .where('businessProfileId', '==', businessProfileId);
            
            // Priority 1: Check by hash if provided
            if (fileItem.hash) {
                const hashSnapshot = await query.where('fileHash', '==', fileItem.hash).get();
                if (!hashSnapshot.empty) {
                    duplicates.push({ name: fileItem.name, reason: 'hash' });
                    continue;
                }
            }

            // Priority 2: Check by name AND size (very high probability of being the same file)
            if (fileItem.name && fileItem.size) {
                const nameSizeSnapshot = await query
                    .where('originalName', '==', fileItem.name)
                    .where('fileSize', '==', fileItem.size)
                    .get();
                
                if (!nameSizeSnapshot.empty) {
                    duplicates.push({ name: fileItem.name, reason: 'name_size' });
                    continue;
                }
            }
        }

        res.json({ duplicates });

    } catch (error) {
        console.error('❌ Erro ao verificar duplicidade:', error);
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
        const isStory = isStoryFormat(item.format || item.type);
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
 * POST /api/library/:id/export - Render HTML carousel to images
 */
router.post('/:id/export', async (req, res) => {
    try {
        const { id } = req.params;
        const { exportLibraryHtmlToImages } = await import('../services/htmlExportService.js');
        
        console.log(`📤 Triggering server-side export for library item: ${id}`);
        const mediaUrls = await exportLibraryHtmlToImages(id);
        
        res.json({
            success: true,
            mediaUrls
        });
    } catch (error) {
        console.error('❌ Erro ao exportar carrossel HTML:', error);
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
        const existingDoc = await db.collection('library_items').doc(id).get();
        if (!existingDoc.exists) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        const existingItem = existingDoc.data() || {};
        const nextFormat = normalizeFormat(updates.format || updates.type || existingItem.format || existingItem.type, existingItem.format || existingItem.type || 'static');
        const shouldBlankCaption = isStoryFormat(nextFormat);

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

        if (shouldBlankCaption) {
            updates.caption = '';
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
