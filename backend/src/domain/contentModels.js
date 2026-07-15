import {
    getBaseTypeForFormat,
    getFormatRule,
    inferLibraryType,
    isHtmlFormat,
    isReelFormat,
    isStoryFormat
} from './formatRules.js';

function withCommonMetadata({
    userId,
    accountId = null,
    businessProfileId = null,
    format = 'static',
    createdAt = new Date(),
    updatedAt = new Date()
} = {}) {
    const rule = getFormatRule(format);

    return {
        userId,
        accountId,
        businessProfileId,
        format,
        contentFamily: rule.family,
        payloadKind: rule.payloadKind,
        baseType: rule.baseType,
        createdAt,
        updatedAt
    };
}

export function createDraftRecord({
    userId,
    accountId = null,
    businessProfileId = null,
    format = 'static',
    mediaUrls = [],
    htmlContent = null,
    caption = '',
    scheduledFor = null,
    pillarId = null,
    pillarName = null,
    generatedBy = null,
    generationPrompt = '',
    needsAccount = false,
    extra = {}
} = {}) {
    const normalizedCaption = isStoryFormat(format) ? '' : caption;
    return {
        entityType: 'draft',
        ...withCommonMetadata({ userId, accountId, businessProfileId, format }),
        type: getBaseTypeForFormat(format),
        mediaUrls,
        htmlContent: isHtmlFormat(format) ? (htmlContent || '') : null,
        caption: normalizedCaption,
        scheduledFor,
        status: 'draft',
        isDraft: true,
        needsAccount,
        pillarId,
        pillarName,
        generatedBy,
        generationPrompt,
        ...extra
    };
}

export function createFeedPostDraftRecord(input = {}) {
    const format = input.format || 'static';
    return createDraftRecord({
        ...input,
        format,
        extra: {
            entitySubType: 'feed-post-draft',
            slideCount: Array.isArray(input.mediaUrls) ? input.mediaUrls.length : 0,
            ...(input.extra || {})
        }
    });
}

export function createHtmlCarouselDraftRecord(input = {}) {
    return createDraftRecord({
        ...input,
        format: 'carousel-html',
        mediaUrls: [],
        htmlContent: input.htmlContent || '',
        extra: {
            entitySubType: 'html-carousel-draft',
            slideCount: input.slideCount || 0,
            theme: input.theme || null,
            exportStatus: input.exportStatus || 'not_exported',
            carouselTemplateId: input.carouselTemplateId || input.extra?.carouselTemplateId || null,
            ...(input.extra || {})
        }
    });
}

export function createStoryDraftRecord(input = {}) {
    return createDraftRecord({
        ...input,
        format: 'story',
        extra: {
            entitySubType: 'story-draft',
            frameCount: Array.isArray(input.mediaUrls) ? input.mediaUrls.length : 0,
            interactiveElements: input.interactiveElements || [],
            ...(input.extra || {})
        }
    });
}

export function createReelDraftRecord(input = {}) {
    return createDraftRecord({
        ...input,
        format: 'reel',
        mediaUrls: input.mediaUrls || (input.videoUrl ? [input.videoUrl] : []),
        extra: {
            entitySubType: 'reel-draft',
            videoUrl: input.videoUrl || input.mediaUrls?.[0] || null,
            thumbnailUrl: input.thumbnailUrl || null,
            script: input.script || '',
            duration: input.duration || null,
            ...(input.extra || {})
        }
    });
}

export function createScheduledPostRecord({
    userId,
    accountId,
    businessProfileId = null,
    format = 'static',
    mediaUrls = [],
    caption = '',
    scheduledFor = null,
    status = 'pending',
    libraryItemId = null,
    pillarId = null,
    pillarName = null,
    generatedBy = null,
    generationPrompt = '',
    externalScheduler = null,
    externalJobId = null,
    externalPayload = null,
    htmlContent = null,
    extra = {}
} = {}) {
    const normalizedCaption = isStoryFormat(format) ? '' : caption;
    return {
        entityType: 'scheduled-post',
        ...withCommonMetadata({ userId, accountId, businessProfileId, format }),
        type: getBaseTypeForFormat(format),
        libraryItemId,
        mediaUrls,
        caption: normalizedCaption,
        scheduledFor,
        status,
        isDraft: false,
        pillarId,
        pillarName,
        generatedBy,
        generationPrompt,
        errorMessage: null,
        postedAt: null,
        externalScheduler,
        externalJobId,
        externalPayload,
        htmlContent: isHtmlFormat(format) ? (htmlContent || '') : null,
        ...extra
    };
}

export function createLibraryItemRecord({
    userId,
    businessProfileId,
    type,
    mediaUrls = [],
    htmlCode = null,
    caption = '',
    tag = 'editar',
    fileHash = null,
    originalName = null,
    extra = {}
} = {}) {
    const resolvedType = inferLibraryType({ type, mediaUrls, htmlCode });
    const rule = getFormatRule(resolvedType);
    const normalizedCaption = isStoryFormat(resolvedType) ? '' : caption;

    return {
        entityType: 'library-item',
        userId,
        businessProfileId,
        type: resolvedType,
        format: resolvedType,
        contentFamily: rule.family,
        payloadKind: rule.payloadKind,
        mediaUrls,
        htmlCode: isHtmlFormat(resolvedType) ? (htmlCode || '') : null,
        caption: normalizedCaption,
        tag,
        fileHash,
        originalName,
        fileSize: extra.fileSize || null,
        isScheduled: false,
        isPosted: false,
        scheduledPostId: null,
        createdAt: new Date(),
        ...extra
    };
}

export function normalizeStoredPostRecord(record = {}) {
    const format = record.format || record.type || 'static';
    const rule = getFormatRule(format);
    const mediaUrls = Array.isArray(record.mediaUrls) ? record.mediaUrls : [];
    const normalizedCaption = isStoryFormat(format) ? '' : (record.caption || '');

    return {
        ...record,
        format,
        type: record.type || rule.baseType,
        contentFamily: record.contentFamily || rule.family,
        payloadKind: record.payloadKind || rule.payloadKind,
        entityType: record.entityType || (record.isDraft ? 'draft' : 'scheduled-post'),
        isStory: isStoryFormat(format),
        reviewState: inferReviewState(record),
        draftModel: inferDraftModel(format),
        draftDetails: buildDraftDetails(record, format, mediaUrls),
        slideCount: record.slideCount || mediaUrls.length || 0,
        frameCount: record.frameCount || mediaUrls.length || 0,
        interactiveElements: record.interactiveElements || [],
        videoUrl: record.videoUrl || mediaUrls[0] || null,
        thumbnailUrl: record.thumbnailUrl || mediaUrls[1] || mediaUrls[0] || null,
        script: record.script || '',
        duration: record.duration || null,
        theme: record.theme || null,
        exportStatus: record.exportStatus || (isHtmlFormat(format) ? 'not_exported' : null),
        caption: normalizedCaption
    };
}

function inferDraftModel(format = 'static') {
    if (isHtmlFormat(format)) return 'HtmlCarouselDraft';
    if (isStoryFormat(format)) return 'StoryDraft';
    if (isReelFormat(format) || format === 'video') return 'ReelDraft';
    return 'FeedPostDraft';
}

function inferReviewState(record = {}) {
    const status = record.status || 'draft';
    if (record.isDraft || status === 'draft') return 'ready_for_review';
    if (status === 'pending' || status === 'scheduled') return 'scheduled';
    if (status === 'processing') return record.scheduledFor ? 'scheduled' : 'ready_for_publish';
    if (status === 'success' || status === 'posted') return 'published';
    if (status === 'error' || status === 'failed') return 'failed';
    return status;
}

function buildDraftDetails(record = {}, format = 'static', mediaUrls = []) {
    if (isHtmlFormat(format)) {
        return {
            model: 'HtmlCarouselDraft',
            htmlContent: record.htmlContent || '',
            slideCount: record.slideCount || 0,
            theme: record.theme || null,
            scheduledFor: record.scheduledFor || null,
            exportStatus: record.exportStatus || 'not_exported'
        };
    }

    if (isStoryFormat(format)) {
        return {
            model: 'StoryDraft',
            mediaUrls,
            frameCount: record.frameCount || mediaUrls.length || 0,
            interactiveElements: record.interactiveElements || [],
            scheduledFor: record.scheduledFor || null
        };
    }

    if (isReelFormat(format) || format === 'video') {
        return {
            model: 'ReelDraft',
            videoUrl: record.videoUrl || mediaUrls[0] || null,
            thumbnailUrl: record.thumbnailUrl || mediaUrls[1] || mediaUrls[0] || null,
            script: record.script || '',
            duration: record.duration || null,
            scheduledFor: record.scheduledFor || null
        };
    }

    return {
        model: 'FeedPostDraft',
        mediaUrls,
        caption: record.caption || '',
        scheduledFor: record.scheduledFor || null,
        pillarId: record.pillarId || null
    };
}
