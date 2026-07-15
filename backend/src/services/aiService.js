/**
 * aiService.js — Barrel re-export for backwards compatibility.
 *
 * The original monolith has been split into focused domain modules:
 *   image/imageStorageService.js      — Firebase upload, Sharp compositing
 *   image/imageGenerationAdapters.js  — Gemini & Seedream API adapters
 *   image/imageGenerationService.js   — generateSingleImage / generateImages / generateCarousel
 *   carousel/brandContextService.js   — Brand prompt utilities
 *   carousel/carouselPromptService.js — Carousel prompt generation
 *   carousel/htmlCarouselService.js   — HTML carousel generation
 *   content/captionService.js         — Captions, post ideas, image prompt generation
 */

export { uploadBase64ToFirebase, compositeLogoOverlay } from './image/imageStorageService.js';
export { generateImageWithGemini, generateImageWithSeedream } from './image/imageGenerationAdapters.js';
export { generateSingleImage, generateImages, generateCarousel } from './image/imageGenerationService.js';

export {
    hexToColorName,
    buildImageBrandingPrompt,
    buildFitswapBrandContext,
    parseStructuredFitswapPrompt,
    enforceFitswapPromptGuardrails,
    stripSocialHashtags,
    isPromptRefusal,
    extractConceptField,
    inferInnerBoostEmotion,
    buildFallbackImagePrompt,
    sanitizeBackgroundPromptForImageGeneration,
} from './carousel/brandContextService.js';

export {
    CAROUSEL_SLIDES_SCHEMA,
    getEditorialSystemPrompt,
    generateCarouselSlideConcepts,
    generateCarouselPrompts,
    generateSimilarPrompts,
    serializeSlideToTagPrompt,
} from './carousel/carouselPromptService.js';

export { generateHtmlCarousel, fixHtmlCarousel, countCarouselSlides } from './carousel/htmlCarouselService.js';
export { CONTENT_PLAN_SCHEMA, buildContentPlanSystemPrompt, generateContentPlan } from './content/contentPlanService.js';
export { normalizeQaText, reviewContentPlan, reviewContentPlanLocal } from './content/contentQaService.js';

export {
    buildCaptionFromBriefSystemPrompt,
    generateCaptionFromBrief,
    generateImageCaption,
    generatePostIdeas,
    extractStyleFromPrompt,
    generateVariations,
    generateRelatedIdeas,
    generateImagePrompt,
    generateTemplateVariations,
} from './content/captionService.js';
