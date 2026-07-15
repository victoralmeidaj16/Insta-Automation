import { chromium } from 'playwright';
import { db, storage } from '../config/firebase.js';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

const VIEW_W = 420;
const VIEW_H = 525;
const SCALE = 1080 / 420;

const HIDE_SELECTORS = [
    '.ig-header', '.ig-dots', '.ig-actions', '.ig-caption',
    '.nav-btn', '.nav-prev', '.nav-next',
    '.progress-bar', '.slide-counter',
    '.nav-dots',
    '.bottom-bar .bb-swipe',
];

/**
 * Applies the clean-export layout tweaks inside the page.
 * Called via page.evaluate() so must be serialisable — no closures over outer vars.
 */
function applyCleanLayout() {
    const hide = [
        '.ig-header', '.ig-dots', '.ig-actions', '.ig-caption',
        '.nav-btn', '.nav-prev', '.nav-next',
        '.progress-bar', '.slide-counter',
        '.nav-dots', '.bottom-bar .bb-swipe',
    ];
    hide.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
    });
    const frame = document.querySelector('.ig-frame');
    if (frame) frame.style.cssText = 'width:420px;height:525px;max-width:none;border-radius:0;box-shadow:none;overflow:hidden;margin:0;';
    const vp = document.querySelector('.carousel-viewport');
    if (vp) vp.style.cssText = 'width:420px;height:525px;aspect-ratio:unset;overflow:hidden;cursor:default;';
    const wrap = document.querySelector('.carousel-wrap');
    if (wrap) wrap.style.cssText = 'width:420px;height:525px;position:relative;overflow:hidden;box-shadow:none;border-radius:0;';
    document.body.style.cssText = 'padding:0;margin:0;display:block;overflow:hidden;background:transparent;';
}

/**
 * Shows only slide at index `idx`, hiding all others.
 * Resets CSS animations on the visible slide so they play from the start.
 */
function activateSlide(idx) {
    const track = document.querySelector('.carousel-track');
    if (track) { track.style.transition = 'none'; track.style.transform = 'none'; }
    document.querySelectorAll('.slide').forEach((s, i) => {
        if (i === idx) {
            s.style.display = 'block';
            s.style.opacity = '1';
            s.style.position = 'relative';
            s.classList.add('active');
            s.classList.remove('exit');
            // Reset animations so they play from the beginning
            s.querySelectorAll('*').forEach(el => {
                el.style.animation = 'none';
                // Force reflow then re-enable
                void el.offsetWidth;
                el.style.animation = '';
            });
        } else {
            s.style.display = 'none';
            s.classList.remove('active', 'exit');
        }
    });
}

// ─── ffmpeg helper ────────────────────────────────────────────────────────────

function convertToMp4(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .outputOptions([
                '-preset fast',
                '-crf 18',
                '-an',                          // no audio
                '-vf scale=1080:1350:flags=lanczos', // Instagram 4:5
                '-pix_fmt yuv420p',             // required for broad compatibility
                '-movflags +faststart',         // streaming-friendly
            ])
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

// ─── Image export ─────────────────────────────────────────────────────────────

/**
 * Renders each HTML carousel slide as a JPEG and uploads to Firebase Storage.
 */
export async function renderHtmlToImages(htmlContent, storageFolder) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

        const context = await browser.newContext({
            viewport: { width: VIEW_W, height: VIEW_H },
            deviceScaleFactor: SCALE,
        });
        const page = await context.newPage();

        console.log(`🌐 Setting page content...`);
        await page.setContent(htmlContent, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length || 1);
        console.log(`📸 Detected ${slideCount} slides.`);

        await page.evaluate(applyCleanLayout);

        const mediaUrls = [];

        for (let i = 0; i < slideCount; i++) {
            console.log(`🖼️ Exporting image slide ${i + 1}/${slideCount}...`);
            await page.evaluate(activateSlide, i);
            await page.waitForTimeout(1500);

            const buffer = await page.screenshot({
                type: 'jpeg',
                quality: 95,
                clip: { x: 0, y: 0, width: VIEW_W, height: VIEW_H },
            });

            const fileName = `${storageFolder}/slide_${i + 1}.jpg`;
            const file = storage.file(fileName);
            await file.save(buffer, { metadata: { contentType: 'image/jpeg' } });
            await file.makePublic();
            mediaUrls.push(`https://storage.googleapis.com/${storage.name}/${fileName}`);
        }

        return { mediaUrls, slideCount };
    } finally {
        if (browser) await browser.close();
    }
}

// ─── Video export ─────────────────────────────────────────────────────────────

/**
 * Renders each HTML carousel slide as an MP4 with live CSS animations via
 * Playwright's built-in video recording, then converts with ffmpeg.
 *
 * @param {string} htmlContent
 * @param {string} storageFolder  - Firebase Storage prefix for the uploaded files
 * @param {number} slideDurationMs - How long to record each slide (default: 5 s)
 */
export async function renderHtmlToVideos(htmlContent, storageFolder, slideDurationMs = 5000) {
    const tmpDir = path.join(os.tmpdir(), `carousel-video-${uuidv4()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

        // ── Step 1: count slides with a throw-away context ──────────────────
        const countCtx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H } });
        const countPage = await countCtx.newPage();
        await countPage.setContent(htmlContent, { waitUntil: 'networkidle' });
        const slideCount = await countPage.evaluate(() => document.querySelectorAll('.slide').length || 1);
        await countCtx.close();
        console.log(`🎬 Detected ${slideCount} slides for video export.`);

        const mediaUrls = [];

        // ── Step 2: record each slide in its own context ─────────────────────
        for (let i = 0; i < slideCount; i++) {
            console.log(`🎥 Recording video slide ${i + 1}/${slideCount} (${slideDurationMs / 1000}s)...`);

            const slideVideoDir = path.join(tmpDir, `slide_${i}`);
            await fs.mkdir(slideVideoDir, { recursive: true });

            const ctx = await browser.newContext({
                viewport: { width: VIEW_W, height: VIEW_H },
                deviceScaleFactor: SCALE,
                recordVideo: {
                    dir: slideVideoDir,
                    size: { width: VIEW_W, height: VIEW_H },
                },
            });

            const page = await ctx.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle' });
            await page.waitForTimeout(500); // fonts / images settle before we start

            await page.evaluate(applyCleanLayout);
            await page.evaluate(activateSlide, i);

            // Let CSS animations run
            await page.waitForTimeout(slideDurationMs);

            // Closing the page finalises the .webm file
            await page.close();
            const webmPath = await page.video().path();
            await ctx.close();

            // ── Step 3: convert .webm → .mp4 at Instagram resolution ─────────
            const mp4Path = path.join(tmpDir, `slide_${i + 1}.mp4`);
            console.log(`🔄 Converting slide ${i + 1} to mp4...`);
            await convertToMp4(webmPath, mp4Path);

            // ── Step 4: upload to Firebase Storage ────────────────────────────
            const mp4Buffer = await fs.readFile(mp4Path);
            const fileName = `${storageFolder}/slide_${i + 1}.mp4`;
            const file = storage.file(fileName);
            await file.save(mp4Buffer, { metadata: { contentType: 'video/mp4' } });
            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${storage.name}/${fileName}`;
            mediaUrls.push(publicUrl);
            console.log(`✅ Slide ${i + 1} uploaded: ${publicUrl}`);
        }

        return { mediaUrls, slideCount };
    } finally {
        if (browser) await browser.close();
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

// ─── Post export ──────────────────────────────────────────────────────────────

/**
 * Exports an HTML carousel post to media files (images or videos).
 * Reads `post.extra.exportAsVideo` to decide which path to use.
 */
export async function exportHtmlCarouselToImages(postId) {
    const postRef = db.collection('posts').doc(postId);
    const postDoc = await postRef.get();
    if (!postDoc.exists) throw new Error(`Post ${postId} not found.`);

    const post = postDoc.data();
    const htmlContent = post.htmlContent || post.htmlCode;
    if (!htmlContent) throw new Error(`Post ${postId} has no HTML content to export.`);

    const exportAsVideo = post.extra?.exportAsVideo === true || post.format === 'carousel-html-video';
    const mode = exportAsVideo ? 'video' : 'image';
    console.log(`🎨 Starting HTML → ${mode} export for post: ${postId}`);

    try {
        const uniqueFolder = uuidv4();
        const storageFolder = `exported_carousels/${postId}/${uniqueFolder}`;

        const { mediaUrls, slideCount } = exportAsVideo
            ? await renderHtmlToVideos(htmlContent, storageFolder, post.extra?.slideDurationMs)
            : await renderHtmlToImages(htmlContent, storageFolder);

        await postRef.update({
            mediaUrls,
            exportStatus: 'exported',
            exportMode: mode,
            slideCount,
            updatedAt: new Date(),
        });

        console.log(`🎉 Export completed for post ${postId}. ${mediaUrls.length} ${mode}s generated.`);
        return mediaUrls;
    } catch (error) {
        console.error(`❌ Export failed for post ${postId}:`, error);
        await postRef.update({
            exportStatus: 'failed',
            errorMessage: `Export error: ${error.message}`,
            updatedAt: new Date(),
        });
        throw error;
    }
}

// ─── Library item export ──────────────────────────────────────────────────────

/**
 * Exports an HTML carousel library item to media files (images or videos).
 * Pass `{ exportAsVideo: true }` in options to record each slide as MP4.
 */
export async function exportLibraryHtmlToImages(itemId, options = {}) {
    const itemRef = db.collection('library_items').doc(itemId);
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) throw new Error(`Library item ${itemId} not found.`);

    const item = itemDoc.data();
    const htmlContent = item.htmlCode || item.htmlContent;
    if (!htmlContent) throw new Error(`Library item ${itemId} has no HTML content to export.`);

    const exportAsVideo = options.exportAsVideo === true || item.exportAsVideo === true;
    const mode = exportAsVideo ? 'video' : 'image';
    console.log(`🎨 Starting HTML → ${mode} export for library item: ${itemId}`);

    try {
        const uniqueFolder = uuidv4();
        const storageFolder = `library_exports/${itemId}/${uniqueFolder}`;

        const { mediaUrls } = exportAsVideo
            ? await renderHtmlToVideos(htmlContent, storageFolder, options.slideDurationMs)
            : await renderHtmlToImages(htmlContent, storageFolder);

        await itemRef.update({
            mediaUrls,
            hasExportedImages: true,
            exportMode: mode,
            updatedAt: new Date(),
        });

        console.log(`🎉 Export completed for library item ${itemId}. ${mediaUrls.length} ${mode}s generated.`);
        return mediaUrls;
    } catch (error) {
        console.error(`❌ Export failed for library item ${itemId}:`, error);
        throw error;
    }
}
