import express from 'express';
import multer from 'multer';
import { storage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const router = express.Router();

// Configurar multer para upload em memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4'];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado. Use: JPG, PNG ou MP4'));
        }
    },
});

/**
 * POST /api/upload - Upload de mídia(s) para Firebase Storage
 */
router.post('/', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'Nenhum arquivo enviado',
            });
        }

        const uploadedUrls = [];

        for (const file of req.files) {
            // Gerar nome único
            const uniqueId = uuidv4();
            const ext = path.extname(file.originalname);
            const fileName = `users/${req.userId}/posts/${uniqueId}${ext}`;

            // Upload para Firebase Storage
            const fileUpload = storage.file(fileName);

            await fileUpload.save(file.buffer, {
                metadata: {
                    contentType: file.mimetype,
                },
            });

            // Tornar público
            await fileUpload.makePublic();

            // Gerar URL pública
            const publicUrl = `https://storage.googleapis.com/${storage.name}/${fileName}`;

            uploadedUrls.push(publicUrl);

            console.log(`✅ Arquivo uploaded: ${fileName}`);
        }

        res.json({
            message: 'Upload realizado com sucesso',
            urls: uploadedUrls,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
