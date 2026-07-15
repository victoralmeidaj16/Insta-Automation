const FORMAT_RULES = {
    static: {
        key: 'static',
        family: 'feed',
        baseType: 'static',
        payloadKind: 'media',
        aspectRatio: '4:5',
        requiresMedia: true,
        requiresHtml: false,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    carousel: {
        key: 'carousel',
        family: 'feed',
        baseType: 'carousel',
        payloadKind: 'media',
        aspectRatio: '4:5',
        requiresMedia: true,
        requiresHtml: false,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    'carousel-premium': {
        key: 'carousel-premium',
        family: 'feed',
        baseType: 'carousel',
        payloadKind: 'media',
        aspectRatio: '4:5',
        requiresMedia: true,
        requiresHtml: false,
        isDraftCreatable: true,
        postTypeAllowed: false
    },
    'carousel-html': {
        key: 'carousel-html',
        family: 'html-carousel',
        baseType: 'carousel',
        payloadKind: 'html',
        aspectRatio: '4:5',
        requiresMedia: false,
        requiresHtml: true,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    'carousel-html-video': {
        key: 'carousel-html-video',
        family: 'html-carousel',
        baseType: 'carousel',
        payloadKind: 'html',
        aspectRatio: '4:5',
        requiresMedia: false,
        requiresHtml: true,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    video: {
        key: 'video',
        family: 'video',
        baseType: 'video',
        payloadKind: 'media',
        aspectRatio: '16:9',
        requiresMedia: true,
        requiresHtml: false,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    story: {
        key: 'story',
        family: 'story',
        baseType: 'story',
        payloadKind: 'media',
        aspectRatio: '9:16',
        requiresMedia: true,
        requiresHtml: false,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    reel: {
        key: 'reel',
        family: 'reel',
        baseType: 'reel',
        payloadKind: 'media',
        aspectRatio: '9:16',
        requiresMedia: true,
        requiresHtml: false,
        isDraftCreatable: true,
        postTypeAllowed: true
    },
    html: {
        key: 'html',
        family: 'html-carousel',
        baseType: 'html',
        payloadKind: 'html',
        aspectRatio: '4:5',
        requiresMedia: false,
        requiresHtml: true,
        isDraftCreatable: false,
        postTypeAllowed: true
    }
};

export function getFormatRule(format = 'static') {
    return FORMAT_RULES[format] || FORMAT_RULES.static;
}

export function normalizeFormat(format = '', fallback = 'static') {
    return FORMAT_RULES[format] ? format : fallback;
}

export function getBaseTypeForFormat(format = 'static') {
    return getFormatRule(format).baseType;
}

export function getAspectRatioForFormat(format = 'static', fallback = '4:5') {
    return getFormatRule(format).aspectRatio || fallback;
}

export function isHtmlFormat(format = '') {
    return getFormatRule(format).payloadKind === 'html';
}

export function isStoryFormat(format = '') {
    return getFormatRule(format).family === 'story';
}

export function isReelFormat(format = '') {
    return getFormatRule(format).family === 'reel';
}

export function isFeedFormat(format = '') {
    return getFormatRule(format).family === 'feed';
}

export function getCreatablePostTypes() {
    return Object.values(FORMAT_RULES)
        .filter(rule => rule.postTypeAllowed)
        .map(rule => rule.key);
}

export function inferLibraryType({ type, mediaUrls = [], htmlCode = null, htmlContent = null } = {}) {
    if (type && FORMAT_RULES[type]) return type;
    if (htmlCode || htmlContent) return 'html';
    return (mediaUrls || []).length > 1 ? 'carousel' : 'static';
}
