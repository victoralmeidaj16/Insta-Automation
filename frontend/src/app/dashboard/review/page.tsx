'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';
import { buildPremiumLayoutFromPrompt, renderPremiumPostToDataUrl, PremiumPostPreview, InteractivePremiumPreview, PremiumCanvasPreview, PremiumEditorModal } from '../generate/components/PremiumCarouselEditor';
import type { PremiumLayout } from '../generate/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Pillar {
    id: string;
    name: string;
    description: string;
    weight: number;
    formats: string[];
    captionStyle?: string;
    enabled?: boolean;
}

interface PlannedSlot {
    slot: string;
    slotLabel: string;
    pillarId: string;
    pillarName: string;
    format: string;
    weight: number;
    slideCount?: number;
    slotKind?: 'post' | 'story';
    customTopic?: string;
    customBriefing?: string;
}

interface ContentSchedule {
    postsPerWeek?: number;
    storiesPerWeek?: number;
    preferredDays?: string[];
    preferredTimes?: string[];
    autonomyMode?: string;
}

const REVIEW_MODE_PREMIUM_CAROUSEL_SLIDE_COUNT = 5;

function getReviewModeSlideCount(format: string, slideCount?: number) {
    if (format === 'carousel-premium') return REVIEW_MODE_PREMIUM_CAROUSEL_SLIDE_COUNT;
    return slideCount;
}

interface FirestoreDateLike {
    toDate?: () => Date;
}

interface BusinessProfileOption {
    id: string;
    name: string;
    brandKey?: string;
    brandContext?: string;
    contentStrategy?: string;
    targetAudience?: string;
    productService?: string;
    contentSchedule?: ContentSchedule;
    editorialPillars?: Pillar[];
    aiPreferences?: {
        style?: string;
        favoritePrompts?: string[];
    };
    branding?: {
        primaryColor?: string;
        logoUrl?: string;
        logo?: string;
        guidelines?: string;
    };
}

interface GenerationContextOverrides {
    brandContext: string;
    contentStrategy: string;
    targetAudience: string;
    productService: string;
    brandingGuidelines: string;
    additionalInstructions: string;
}

interface GenerationResult {
    generated: number;
    failed: number;
    posts?: Array<{ id?: string }>;
    week?: string;
}

interface GenerationJobStatus {
    status: 'running' | 'done' | 'error';
    started?: string;
    generated: number;
    failed: number;
    errors: any[];
    totalPosts?: number;
    currentIndex?: number;
    currentPostTitle?: string;
    completedItems?: Array<{ index: number; title: string; format: string; status: 'done' | 'error' }>;
}

interface WeekPreview {
    profile: { id: string; name: string; brandKey: string };
    account: { id: string; username?: string } | null;
    checks: {
        hasPillars: boolean;
        hasAccount: boolean;
        hasSchedule: boolean;
        pillarWeightOk: boolean;
        autonomyMode: string;
    };
    plan: PlannedSlot[];
    pillars: Pillar[];
    schedule: ContentSchedule;
    recentActivity: { byPilar: Record<string, number>; total: number };
}

interface DraftPost {
    id: string;
    type: string;
    format?: string;
    contentFamily?: string;
    draftModel?: 'FeedPostDraft' | 'StoryDraft' | 'ReelDraft' | 'HtmlCarouselDraft';
    reviewState?: 'draft' | 'ready_for_review' | 'ready_for_publish' | 'scheduled' | 'published' | 'failed' | string;
    draftDetails?: Record<string, unknown>;
    mediaUrls: string[];
    htmlContent?: string;
    caption: string;
    pillarName?: string;
    pillarId?: string;
    businessProfileId?: string;
    scheduledFor?: string | number | Date | FirestoreDateLike | null;
    status: string;
    needsAccount?: boolean;
    generationPrompt?: string;
    overlayData?: {
        headline?: string;
        subheadline?: string;
        highlights?: string[];
        layout?: string;
    } | null;
    premiumLayout?: PremiumLayout | null;
    premiumLayouts?: PremiumLayout[] | null;
    premiumOverlayBakedAt?: string | number | Date | FirestoreDateLike | null;
    sourceMediaUrls?: string[] | null;
    slideCount?: number;
    frameCount?: number;
    interactiveElements?: string[];
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    script?: string;
    duration?: number | null;
    theme?: string | null;
    exportStatus?: string | null;
}

type ApprovalDestination = 'schedule' | 'library';

interface ApprovalSelectionState {
    ids: string[];
    destinationLabel: string;
}

/**
 * Parses generation prompt to extract overlay tags
 */
function extractOverlayData(prompt: string) {
    if (!prompt) return null;
    const headline = prompt.match(/\[HEADLINE:\s*(.*?)\]/i)?.[1]?.trim();
    const subheadline = prompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i)?.[1]?.trim();
    const highlights = prompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i)?.[1]
        ?.split(',')
        .map(h => h.trim())
        .filter(Boolean);
    const layout = prompt.match(/\[LAYOUT:\s*(.*?)\]/i)?.[1]?.trim();

    if (!headline && !subheadline && (!highlights || highlights.length === 0)) return null;
    return { headline, subheadline, highlights, layout };
}



// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PILLAR_COLORS = [
    '#a3e635', '#60a5fa', '#fb923c', '#c084fc',
    '#34d399', '#fbbf24', '#f87171', '#38bdf8',
];

const FORMAT_LABELS: Record<string, string> = {
    static: 'Estático',
    carousel: 'Carrossel',
    'carousel-premium': 'Carrossel Premium',
    'carousel-html': 'Carrossel HTML',
    story: 'Story',
    reel: 'Reel',
};

const FORMAT_ICONS: Record<string, string> = {
    static: '🖼️',
    carousel: '📋',
    'carousel-premium': '✨',
    'carousel-html': '🎨',
    story: '📱',
    reel: '🎬',
};

const REVIEW_TABS = [
    { key: 'feed', label: 'Feed', icon: '🖼️' },
    { key: 'stories', label: 'Stories', icon: '📱' },
    { key: 'reels', label: 'Reels', icon: '🎬' },
] as const;

function getPillarColor(index: number) {
    return PILLAR_COLORS[index % PILLAR_COLORS.length];
}

function formatDate(value: unknown): string {
    if (!value) return '—';
    let d: Date;
    if (typeof value === 'object' && value !== null) {
        const objectValue = value as FirestoreDateLike & { _seconds?: number };
        if (typeof objectValue.toDate === 'function') {
            d = objectValue.toDate();
        } else if (typeof objectValue._seconds === 'number') {
            d = new Date(objectValue._seconds * 1000);
        } else {
            d = new Date(value as string | number | Date);
        }
    } else {
        d = new Date(value as string | number | Date);
    }
    
    if (isNaN(d.getTime())) return '—';

    return d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (typeof value === 'object' && value !== null) {
        if (typeof (value as FirestoreDateLike).toDate === 'function') {
            return (value as FirestoreDateLike).toDate!();
        }
        if ('_seconds' in (value as Record<string, unknown>)) {
            return new Date(Number((value as { _seconds: number })._seconds) * 1000);
        }
    }

    const parsed = new Date(value as string | number | Date);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function startOfWeek(date: Date) {
    const result = new Date(date);
    const day = result.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diffToMonday);
    result.setHours(0, 0, 0, 0);
    return result;
}

function getCampaignLabel(value: DraftPost['scheduledFor']) {
    const date = toDate(value);
    if (!date) return 'Sem campanha';
    const weekStart = startOfWeek(date);
    return `Semana ${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

function formatDateTimeLocal(value: DraftPost['scheduledFor']): string {
    if (!value) return '';
    let d: Date;
    if (typeof value === 'object' && value !== null) {
        const objectValue = value as FirestoreDateLike & { _seconds?: number };
        if (typeof objectValue.toDate === 'function') {
            d = objectValue.toDate();
        } else if (typeof objectValue._seconds === 'number') {
            d = new Date(objectValue._seconds * 1000);
        } else {
            d = new Date(value as string | number | Date);
        }
    } else {
        d = new Date(value as string | number | Date);
    }

    if (isNaN(d.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
        const maybeError = error as {
            message?: string;
            response?: { data?: { error?: string } };
            originalError?: { response?: { data?: { error?: string } } };
        };

        return maybeError.response?.data?.error
            || maybeError.originalError?.response?.data?.error
            || maybeError.message
            || fallback;
    }

    return fallback;
}

function buildGenerationOverridesFromProfile(profile?: BusinessProfileOption | null): GenerationContextOverrides {
    return {
        brandContext: profile?.brandContext || '',
        contentStrategy: profile?.contentStrategy || '',
        targetAudience: profile?.targetAudience || '',
        productService: profile?.productService || '',
        brandingGuidelines: profile?.branding?.guidelines || '',
        additionalInstructions: ''
    };
}

function getInitialProfileId(profiles: BusinessProfileOption[]): string {
    if (typeof window !== 'undefined') {
        const savedProfileId = window.localStorage.getItem('selectedBusinessProfile');
        if (savedProfileId && profiles.some(profile => profile.id === savedProfileId)) {
            return savedProfileId;
        }
    }

    return profiles[0]?.id || '';
}

function getDraftFormat(draft: DraftPost): string {
    return draft.format || draft.type || 'static';
}

function getDraftReviewTab(draft: DraftPost): 'feed' | 'stories' | 'reels' {
    const format = getDraftFormat(draft);
    // HTML Carousels appear inside Feed
    if (draft.draftModel === 'HtmlCarouselDraft' || draft.contentFamily === 'html-carousel' || format === 'carousel-html') return 'feed';
    if (draft.draftModel === 'StoryDraft' || draft.contentFamily === 'story' || format === 'story') return 'stories';
    if (draft.draftModel === 'ReelDraft' || draft.contentFamily === 'reel' || format === 'reel' || format === 'video') return 'reels';
    return 'feed';
}

/**
 * Extract individual slide HTML documents from a full carousel HTML string.
 * Looks for elements with class "slide" and wraps each in a minimal HTML doc
 * that inherits the original <head> styles.
 */
function extractHtmlSlides(html: string): string[] {
    if (!html) return [];
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const slides = Array.from(doc.querySelectorAll('.slide'));
        if (slides.length === 0) return [html]; // fallback: treat whole thing as 1 slide
        const headHtml = doc.head?.innerHTML || '';
        return slides.map(slide => {
            const clonedSlide = slide.cloneNode(true) as HTMLElement;
            clonedSlide.classList.add('active');
            // Give each slide full-size styles
            return `<!DOCTYPE html><html><head>${headHtml}<style>
                html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#09090b;}
                body{display:flex;align-items:stretch;justify-content:stretch;}
                body>*{width:100%;height:100%;box-sizing:border-box;}
                .slide{opacity:1!important;pointer-events:auto!important;z-index:1!important;}
                .slide.active{opacity:1!important;}
            </style></head><body>${clonedSlide.outerHTML}</body></html>`;
        });
    } catch {
        return [html];
    }
}

/**
 * Wrap a single slide HTML string with the same full-size reset CSS
 * used by cleanHtmlCarousel (for non-split cases).
 */
function wrapSingleSlide(html: string): string {
    return cleanHtmlCarousel(html);
}

function getDraftAspectRatio(draft: DraftPost): string {
    const tab = getDraftReviewTab(draft);
    return tab === 'stories' || tab === 'reels' ? '9 / 16' : '4 / 5';
}

function getCaptionLabel(draft: DraftPost): string {
    const tab = getDraftReviewTab(draft);
    if (tab === 'stories') return 'Texto de apoio';
    if (tab === 'reels') return 'Script';
    return 'Caption';
}

function getReviewStateLabel(state?: string): string {
    const labels: Record<string, string> = {
        draft: 'Draft',
        ready_for_review: 'Pronto para revisão',
        ready_for_publish: 'Pronto para publicar',
        scheduled: 'Agendado',
        published: 'Publicado',
        failed: 'Falhou'
    };
    return labels[state || 'draft'] || (state || 'Draft');
}

function isLikelyVideoUrl(url?: string | null): boolean {
    if (!url) return false;
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function cleanHtmlCarousel(html: string): string {
    if (!html) return '';
    const sanitizedHtml = html
        // Strip legacy Instagram mockup nodes completely
        .replace(/<div[^>]*class=["'][^"']*\big-frame\b[^"']*["'][^>]*>/gi, '')
        .replace(/<div[^>]*class=["'][^"']*\big-header\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*class=["'][^"']*\big-dots\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*class=["'][^"']*\big-actions\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<\/div>\s*<\/div>\s*<\/body>/i, '</div></body>')
        // Remove associated legacy CSS blocks
        .replace(/\.ig-frame\s*\{[\s\S]*?\}\s*/gi, '')
        .replace(/\.ig-header\s*\{[\s\S]*?\}\s*/gi, '')
        .replace(/\.ig-actions\s*\{[\s\S]*?\}\s*/gi, '')
        .replace(/\.ig-dots\s*\{[\s\S]*?\}\s*/gi, '');

    const reviewCss = `
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
            background: #09090b !important;
        }
        body {
            display: flex !important;
            align-items: stretch !important;
            justify-content: stretch !important;
        }
        body > * {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            max-height: 100% !important;
            box-sizing: border-box !important;
        }
        .carousel-viewport,
        .carousel,
        #viewport,
        .carousel-track,
        #track {
            width: 100% !important;
            height: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            overflow: hidden !important;
        }
        .carousel-viewport,
        .carousel,
        #viewport {
            display: block !important;
        }
        .carousel-track,
        #track {
            display: flex !important;
            transform: none !important;
            transition: none !important;
        }
        .slide {
            position: relative !important;
            flex: 0 0 100% !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
            padding: 0 !important;
            overflow: hidden !important;
            scroll-snap-align: start !important;
        }
        .carousel-track > .slide:not(:first-child),
        #track > .slide:not(:first-child),
        .carousel > .slide:not(:first-child),
        #viewport > .slide:not(:first-child) {
            display: none !important;
        }
        .slide img {
            max-width: 100% !important;
            max-height: 100% !important;
        }
        .ig-frame, .ig-header, .ig-actions, .ig-dots {
            display: none !important;
            visibility: hidden !important;
        }
    `;

    if (/<head[\s>]/i.test(sanitizedHtml)) {
        return sanitizedHtml.replace(/<\/head>/i, `<style>${reviewCss}</style></head>`);
    }

    return `<html><head><style>${reviewCss}</style></head><body>${sanitizedHtml}</body></html>`;
}

function shouldRenderPremiumOverlay(draft: DraftPost) {
    if (getDraftFormat(draft) !== 'carousel-premium') return false;
    if (draft.premiumOverlayBakedAt) return false;
    return Boolean(draft.premiumLayout || draft.overlayData || extractOverlayData(draft.generationPrompt || ''));
}

function splitPremiumPromptBlocks(prompt: string) {
    return String(prompt || '')
        .split(/\n?---SEPARATOR---\n?/g)
        .map(block => block.trim())
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckItem({ ok, label, fix, tone = 'error' }: { ok: boolean; label: string; fix?: string; tone?: 'error' | 'warning' }) {
    const isWarning = !ok && tone === 'warning';
    const icon = ok ? '✅' : isWarning ? '⚠️' : '❌';
    const labelColor = ok ? '#e4e4e7' : isWarning ? '#fbbf24' : '#fca5a5';

    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid #27272a' }}>
            <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '0.1rem' }}>{icon}</span>
            <div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: labelColor }}>{label}</p>
                {!ok && fix && <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a', marginTop: '0.2rem' }}>{fix}</p>}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Step = 'plan' | 'approve' | 'generating' | 'review';
type ReviewTab = typeof REVIEW_TABS[number]['key'];

export default function ReviewPage() {
    const router = useRouter();

    // Step state
    const [step, setStep] = useState<Step>('plan');

    // Profile selection
    const [profiles, setProfiles] = useState<BusinessProfileOption[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [draftProfileFilter, setDraftProfileFilter] = useState('');
    const [pillarFilter, setPillarFilter] = useState('all');
    const [campaignFilter, setCampaignFilter] = useState('all');

    // Preview state
    const [preview, setPreview] = useState<WeekPreview | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Generation state
    const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
    const [generationJob, setGenerationJob] = useState<GenerationJobStatus | null>(null);
    const [generationElapsed, setGenerationElapsed] = useState(0);
    const [recentGeneratedDraftIds, setRecentGeneratedDraftIds] = useState<string[]>([]);

    // Drafts state
    const [drafts, setDrafts] = useState<DraftPost[]>([]);
    const [loadingDrafts, setLoadingDrafts] = useState(false);
    const [editingCaption, setEditingCaption] = useState<Record<string, string>>({});
    const [actioning, setActioning] = useState<Record<string, boolean>>({});
    const [slideIndex, setSlideIndex] = useState<Record<string, number>>({});
    const [selectedDraftForPrompt, setSelectedDraftForPrompt] = useState<DraftPost | null>(null);
    const [promptText, setPromptText] = useState('');
    const [regenerating, setRegenerating] = useState(false);
    const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
    const [scheduledPosts, setScheduledPosts] = useState<DraftPost[]>([]);

    // Inline schedule editing
    const [editingSchedule, setEditingSchedule] = useState<Record<string, string>>({});
    const [savingSchedule, setSavingSchedule] = useState<Record<string, boolean>>({});

    const [confirmingDraft, setConfirmingDraft] = useState<DraftPost | null>(null);
    const [approvalSelection, setApprovalSelection] = useState<ApprovalSelectionState | null>(null);
    const [rejectingDraft, setRejectingDraft] = useState<DraftPost | null>(null);
    const [reviewTab, setReviewTab] = useState<ReviewTab>('feed');
    const [premiumEditorDraft, setPremiumEditorDraft] = useState<DraftPost | null>(null);
    const [premiumEditorLayout, setPremiumEditorLayout] = useState<PremiumLayout | null>(null);
    const [savingPremiumLayout, setSavingPremiumLayout] = useState(false);

    // Inline image refinement
    const [refinePrompts, setRefinePrompts] = useState<Record<string, string>>({});
    const [refiningImage, setRefiningImage] = useState<Record<string, boolean>>({});
    const [refinedPreview, setRefinedPreview] = useState<Record<string, { imageUrl: string; slideIdx: number }>>({});
    const htmlSlideCacheRef = useRef<Record<string, string[]>>({});

    // Editable plan state (derived from preview.plan, user can tweak before generating)
    const [editablePlan, setEditablePlan] = useState<PlannedSlot[]>([]);
    const [expandedPlanSlot, setExpandedPlanSlot] = useState<number | null>(null);
    const [generationContextOverrides, setGenerationContextOverrides] = useState<GenerationContextOverrides>(buildGenerationOverridesFromProfile(null));

    const fetchProfiles = async () => {
        const res = await api.get('/api/business-profiles');
        return (res.data.profiles || []) as BusinessProfileOption[];
    };

    // ---------------------------------------------------------------------------
    // Load profiles
    // ---------------------------------------------------------------------------
    useEffect(() => {
        fetchProfiles()
            .then(list => {
                setProfiles(list);
                if (list.length > 0) setSelectedProfileId(prev => prev || getInitialProfileId(list));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const syncReviewProfile = async () => {
            try {
                const list = await fetchProfiles();
                setProfiles(list);

                if (list.length === 0) {
                    setSelectedProfileId('');
                    return;
                }

                setSelectedProfileId(prev => {
                    if (prev && list.some(profile => profile.id === prev)) return prev;
                    return getInitialProfileId(list);
                });
            } catch {
                // Silent refresh
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncReviewProfile();
            }
        };

        window.addEventListener('focus', syncReviewProfile);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', syncReviewProfile);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Auto-load preview when profile changes
    useEffect(() => {
        if (selectedProfileId) loadPreview(selectedProfileId);
    }, [selectedProfileId]);

    // Sync editable plan when preview changes
    useEffect(() => {
        if (preview?.plan) {
            setEditablePlan(preview.plan.map(slot => ({
                ...slot,
                slideCount: getReviewModeSlideCount(slot.format, slot.slideCount),
                customTopic: slot.customTopic || '',
                customBriefing: slot.customBriefing || ''
            })));
            setExpandedPlanSlot(null);
        }
    }, [preview]);

    useEffect(() => {
        const activeProfile = profiles.find(profile => profile.id === selectedProfileId) || null;
        setGenerationContextOverrides(buildGenerationOverridesFromProfile(activeProfile));
    }, [profiles, selectedProfileId]);

    useEffect(() => {
        if (!selectedProfileId) return;
        setDraftProfileFilter(selectedProfileId);
        setPillarFilter('all');
        setCampaignFilter('all');
        setRecentGeneratedDraftIds([]);
    }, [selectedProfileId]);

    // Load pending drafts on mount
    useEffect(() => {
        loadDrafts();
    }, []);

    useEffect(() => {
        loadScheduledPosts(draftProfileFilter === 'all' ? undefined : draftProfileFilter);
    }, [draftProfileFilter]);

    useEffect(() => {
        if (drafts.length === 0) return;
        const scopedDrafts = draftProfileFilter === 'all'
            ? drafts
            : drafts.filter(draft => draft.businessProfileId === draftProfileFilter);
        const currentTabHasDrafts = scopedDrafts.some(draft => getDraftReviewTab(draft) === reviewTab);
        if (currentTabHasDrafts) return;
        const firstAvailableTab = REVIEW_TABS.find(tab => scopedDrafts.some(draft => getDraftReviewTab(draft) === tab.key));
        if (firstAvailableTab) {
            setReviewTab(firstAvailableTab.key);
        }
    }, [draftProfileFilter, drafts, reviewTab]);

    // ---------------------------------------------------------------------------
    // API calls
    // ---------------------------------------------------------------------------
    const loadPreview = async (profileId: string, silent = false) => {
        setLoadingPreview(true);
        if (!silent) setPreview(null);
        try {
            const res = await api.post('/api/auto-generate/preview', { businessProfileId: profileId });
            setPreview(res.data);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao carregar preview'));
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleRegenPlan = async () => {
        if (!selectedProfileId) return;
        toast.loading('Regenerando plano...', { id: 'regen-plan' });
        try {
            setRecentGeneratedDraftIds([]);
            await loadPreview(selectedProfileId, true);
            toast.success('Plano regenerado!', { id: 'regen-plan' });
        } catch {
            toast.error('Erro ao regenerar plano.', { id: 'regen-plan' });
        }
    };

    const updateSlotFormat = (idx: number, format: string) => {
        setEditablePlan(prev => prev.map((s, i) => i === idx ? {
            ...s,
            format,
            slideCount: getReviewModeSlideCount(format, s.slideCount)
        } : s));
    };

    const updateSlotField = (idx: number, field: keyof PlannedSlot, value: string | number) => {
        setEditablePlan(prev => prev.map((slot, i) => i === idx ? { ...slot, [field]: value } : slot));
    };

    const updateSlotDate = (idx: number, value: string) => {
        const nextDate = new Date(value);
        if (isNaN(nextDate.getTime())) return;

        setEditablePlan(prev => prev.map((slot, i) => (
            i === idx ? {
                ...slot,
                slot: nextDate.toISOString(),
                slotLabel: nextDate.toLocaleString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            } : slot
        )));
    };

    const updateSlotPillar = (idx: number, pillarId: string) => {
        const pillar = preview?.pillars.find(item => item.id === pillarId);
        if (!pillar) return;

        setEditablePlan(prev => prev.map((slot, i) => {
            if (i !== idx) return slot;

            const availableFormats = pillar.formats?.length ? pillar.formats : Object.keys(FORMAT_LABELS);
            const nextFormat = availableFormats.includes(slot.format) ? slot.format : availableFormats[0];
            return {
                ...slot,
                pillarId: pillar.id,
                pillarName: pillar.name,
                weight: pillar.weight,
                format: nextFormat,
                slideCount: getReviewModeSlideCount(nextFormat, slot.slideCount)
            };
        }));
    };

    const removeSlot = (idx: number) => {
        setEditablePlan(prev => prev.filter((_, i) => i !== idx));
        setExpandedPlanSlot(prev => {
            if (prev === null) return null;
            if (prev === idx) return null;
            return prev > idx ? prev - 1 : prev;
        });
    };

    const addSlot = () => {
        if (!preview || preview.pillars.length === 0) return;
        const pillar = preview.pillars[0];
        const formats = pillar.formats || ['static'];
        setEditablePlan(prev => [...prev, {
            slot: new Date().toISOString(),
            slotLabel: 'Novo slot',
            pillarId: pillar.id,
            pillarName: pillar.name,
            format: formats[0],
            slideCount: getReviewModeSlideCount(formats[0]),
            weight: pillar.weight,
            slotKind: formats.includes('story') ? 'story' : 'post',
            customTopic: '',
            customBriefing: ''
        }]);
        setExpandedPlanSlot(editablePlan.length);
    };

    const loadDrafts = async () => {
        setLoadingDrafts(true);
        try {
            const res = await api.get('/api/auto-generate/drafts');
            setDrafts(res.data.drafts || []);
        } catch { } finally {
            setLoadingDrafts(false);
        }
    };

    const loadScheduledPosts = async (businessProfileId?: string) => {
        try {
            const res = await api.get('/api/posts', {
                params: businessProfileId ? { businessProfileId } : undefined
            });
            const posts = (res.data.posts || []).filter((post: DraftPost) =>
                ['scheduled', 'processing', 'success', 'posted', 'pending'].includes(post.status)
            );
            setScheduledPosts(posts);
        } catch {
            setScheduledPosts([]);
        }
    };

    const handleSaveSchedule = async (postId: string) => {
        const newDate = editingSchedule[postId];
        if (!newDate) return;
        setSavingSchedule(prev => ({ ...prev, [postId]: true }));
        try {
            await api.patch(`/api/auto-generate/drafts/${postId}/schedule`, {
                scheduledFor: new Date(newDate).toISOString()
            });
            setDrafts(prev => prev.map(d => d.id === postId ? { ...d, scheduledFor: newDate } : d));
            setEditingSchedule(prev => { const n = { ...prev }; delete n[postId]; return n; });
            toast.success('Data atualizada!');
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao salvar data'));
        } finally {
            setSavingSchedule(prev => ({ ...prev, [postId]: false }));
        }
    };

    const handleRefineImage = async (draft: DraftPost, slideIdx: number) => {
        const prompt = refinePrompts[draft.id]?.trim();
        if (!prompt) { toast.error('Descreva o que deseja mudar na imagem.'); return; }
        const sourceUrl = (draft.sourceMediaUrls?.[slideIdx]) || draft.mediaUrls?.[slideIdx];
        if (!sourceUrl) { toast.error('Imagem de referência não encontrada.'); return; }

        setRefiningImage(prev => ({ ...prev, [draft.id]: true }));
        try {
            const isStory = (draft.format || draft.type || '').toLowerCase().includes('story');
            const aspectRatio = isStory ? '9:16' : '4:5';
            const res = await api.post('/api/ai/generate-single-image', {
                prompt,
                referenceImage: sourceUrl,
                aspectRatio,
                businessProfileId: draft.businessProfileId,
                model: 'gemini'
            });
            if (res.data.success) {
                setRefinedPreview(prev => ({ ...prev, [draft.id]: { imageUrl: res.data.image, slideIdx } }));
                toast.success('Imagem refinada! Aplique ou descarte.');
            }
        } catch {
            toast.error('Erro ao refinar imagem com IA.');
        } finally {
            setRefiningImage(prev => ({ ...prev, [draft.id]: false }));
        }
    };

    const handleAcceptRefinement = async (draft: DraftPost) => {
        const refined = refinedPreview[draft.id];
        if (!refined) return;
        const { imageUrl, slideIdx } = refined;
        const newUrls = [...(draft.mediaUrls || [])];
        newUrls[slideIdx] = imageUrl;
        try {
            await api.patch(`/api/auto-generate/drafts/${draft.id}/media`, { mediaUrls: newUrls });
            setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, mediaUrls: newUrls } : d));
            setRefinedPreview(prev => { const n = { ...prev }; delete n[draft.id]; return n; });
            setRefinePrompts(prev => { const n = { ...prev }; delete n[draft.id]; return n; });
            toast.success('Imagem atualizada no rascunho!');
        } catch {
            toast.error('Erro ao salvar imagem refinada.');
        }
    };

    const handleGenerate = async () => {
        if (!preview) return;
        setStep('generating');
        try {
            await api.post('/api/auto-generate/weekly', {
                businessProfileId: preview.profile.id,
                customPlan: editablePlan.length > 0 ? editablePlan : undefined,
                generationContextOverrides
            });
            // Background job started — poll for completion
            pollGenerationStatus(preview.profile.id);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao iniciar geração'));
            setStep('plan');
        }
    };

    const pollGenerationStatus = (profileId: string) => {
        let attempts = 0;
        const maxAttempts = 120; // 10 min max (120 × 5s)
        setGenerationElapsed(0);
        const elapsedTimer = setInterval(() => setGenerationElapsed(s => s + 1), 1000);

        const interval = setInterval(async () => {
            attempts++;
            try {
                const res = await api.get(`/api/auto-generate/status/${profileId}`);
                const job = res.data;
                setGenerationJob(job);

                if (job.status === 'done') {
                    clearInterval(interval);
                    clearInterval(elapsedTimer);
                    setGenerationResult(job);
                    setDraftProfileFilter(profileId);
                    setPillarFilter('all');
                    setCampaignFilter('all');
                    setRecentGeneratedDraftIds(
                        Array.isArray(job.posts)
                            ? job.posts
                                .map((post: { id?: string }) => post?.id)
                                .filter((id: string | undefined): id is string => Boolean(id))
                            : []
                    );
                    await loadDrafts();
                    setStep('review');
                    if (job.generated > 0) toast.success(`${job.generated} posts gerados e prontos para revisão!`);
                    if (job.failed > 0) toast.error(`${job.failed} post(s) falharam.`);
                } else if (job.status === 'error') {
                    clearInterval(interval);
                    clearInterval(elapsedTimer);
                    toast.error(job.error || 'Erro ao gerar conteúdo');
                    setStep('plan');
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    clearInterval(elapsedTimer);
                    toast.error('Tempo limite excedido. Verifique os rascunhos manualmente.');
                    setDraftProfileFilter(profileId);
                    setPillarFilter('all');
                    setCampaignFilter('all');
                    setRecentGeneratedDraftIds([]);
                    await loadDrafts();
                    setStep('review');
                }
            } catch {
                // Network blip — keep polling
            }
        }, 5000);
    };

    const handleRegenerateSlide = async (draftId: string, slideIndex: number) => {
        const toastId = toast.loading(`🔄 Regerando slide ${slideIndex + 1}...`);
        
        try {
            const response = await api.post(`/api/auto-generate/drafts/${draftId}/regenerate-slide`, { slideIndex });
            if (response.data.success && response.data.post) {
                setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, ...response.data.post } : d));
                // Update confirmingDraft locally if it's the one open right now in the confirm modal
                if (confirmingDraft?.id === draftId) {
                    setConfirmingDraft(prev => prev ? { ...prev, ...response.data.post } : prev);
                }
                toast.success(`Slide ${slideIndex + 1} regerado com sucesso!`, { id: toastId });
            } else {
                throw new Error('Falha na resposta do servidor');
            }
        } catch (error) {
            console.error('Error regen slide:', error);
            const apiError = error as { response?: { data?: { error?: string } } };
            toast.error(apiError.response?.data?.error || 'Erro ao regerar slide', { id: toastId });
        }
    };

    const approveDraftIds = async (postIds: string[], destination: ApprovalDestination) => {
        if (postIds.length === 0) return;

        if (destination === 'schedule') {
            const now = new Date();
            const invalidDrafts = drafts.filter(d => postIds.includes(d.id) && (!d.scheduledFor || new Date(d.scheduledFor) <= now));
            if (invalidDrafts.length > 0) {
                toast.error(`Existem ${invalidDrafts.length} posts com data de agendamento no passado ou sem data. Ajuste a data para o futuro antes de agendar.`);
                return;
            }
        }

        setActioning(prev => ({
            ...prev,
            ...Object.fromEntries(postIds.map(id => [id, true]))
        }));

        let ok = 0;
        try {
            for (const postId of postIds) {
                if (editingCaption[postId] !== undefined) {
                    await api.patch(`/api/auto-generate/drafts/${postId}/caption`, { caption: editingCaption[postId] });
                }

                await api.post(`/api/auto-generate/drafts/${postId}/approve`, { destination });
                ok++;
            }

            if (ok > 0) {
                toast.success(
                    destination === 'library'
                        ? `${ok} ${ok === 1 ? 'conteúdo enviado para a Library' : 'conteúdos enviados para a Library'}!`
                        : `${ok} ${ok === 1 ? 'post aprovado para agendamento/publicação' : 'posts aprovados para agendamento/publicação'}!`
                );
            }

            setDrafts(prev => prev.filter(d => !postIds.includes(d.id)));
            setSelectedDraftIds(prev => prev.filter(id => !postIds.includes(id)));
            setConfirmingDraft(null);
            setApprovalSelection(null);
            loadScheduledPosts(draftProfileFilter === 'all' ? undefined : draftProfileFilter);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao aprovar'));
        } finally {
            setActioning(prev => {
                const next = { ...prev };
                postIds.forEach(id => { next[id] = false; });
                return next;
            });
        }
    };

    const handleApprove = async (postId: string, destination: ApprovalDestination) => {
        await approveDraftIds([postId], destination);
    };

    const getProfileLayoutOptions = (profileId: string) => {
        const activeProfile = profiles.find(p => p.id === profileId);
        const p = activeProfile;
        const isFitswap = (p?.name || '').toLowerCase().includes('fitswap') || (p?.brandKey || '').toLowerCase().includes('fitswap');
        const defaultColor = isFitswap ? '#6F9800' : '#4C1D95';

        return {
            brandName: p?.name || 'Sua Marca',
            primaryColor: p?.branding?.primaryColor || defaultColor,
            logoIcon: isFitswap ? '🍎' : '✨',
            logoUrl: p?.branding?.logoUrl || p?.branding?.logo,
            description: ''
        };
    };

    const buildPremiumLayoutFromDraft = (draft: DraftPost, slidePosition: number = 0) => {
        const promptBlocks = splitPremiumPromptBlocks(draft.generationPrompt || '');
        const promptForSlide = promptBlocks[slidePosition] || promptBlocks[0] || draft.generationPrompt || '';
        const baseLayout = buildPremiumLayoutFromPrompt(
            promptForSlide,
            getProfileLayoutOptions(draft.businessProfileId || selectedProfileId)
        );
        const overlay = draft.overlayData || extractOverlayData(draft.generationPrompt || '');
        const savedLayout = draft.premiumLayout || null;
        const savedSlideLayout = Array.isArray(draft.premiumLayouts) ? draft.premiumLayouts[slidePosition] : null;

        return {
            ...baseLayout,
            title: savedSlideLayout?.title || savedLayout?.title || overlay?.headline || baseLayout.title,
            highlightText: savedSlideLayout?.highlightText || savedLayout?.highlightText || overlay?.highlights?.join(', ') || baseLayout.highlightText,
            brandName: savedLayout?.brandName || savedSlideLayout?.brandName || baseLayout.brandName,
            primaryColor: savedSlideLayout?.primaryColor || savedLayout?.primaryColor || baseLayout.primaryColor,
            logoIcon: savedLayout?.logoIcon || savedSlideLayout?.logoIcon || baseLayout.logoIcon,
            logoUrl: savedLayout?.logoUrl || savedSlideLayout?.logoUrl || baseLayout.logoUrl,
            description: savedSlideLayout?.description || savedLayout?.description || baseLayout.description,
            descriptionEnabled: savedSlideLayout?.descriptionEnabled ?? savedLayout?.descriptionEnabled ?? baseLayout.descriptionEnabled,
            descriptionColor: savedSlideLayout?.descriptionColor || savedLayout?.descriptionColor || baseLayout.descriptionColor,
            imageOffsetX: savedSlideLayout?.imageOffsetX ?? savedLayout?.imageOffsetX ?? baseLayout.imageOffsetX,
            imageOffsetY: savedSlideLayout?.imageOffsetY ?? savedLayout?.imageOffsetY ?? baseLayout.imageOffsetY,
            imageScale: savedSlideLayout?.imageScale ?? savedLayout?.imageScale ?? baseLayout.imageScale,
            gradientOpacity: savedSlideLayout?.gradientOpacity ?? savedLayout?.gradientOpacity ?? baseLayout.gradientOpacity,
            hideOverlay: savedSlideLayout?.hideOverlay ?? savedLayout?.hideOverlay ?? baseLayout.hideOverlay,
            slideIndex: slidePosition,
            slideCount: Math.max((draft.mediaUrls || []).filter(Boolean).length, 1)
        } as PremiumLayout;
    };

    const handleBakeOverlay = async (draft: DraftPost) => {
        const slides = (draft.mediaUrls || []).filter(Boolean);
        const slideLayouts = slides.map((_, index) => buildPremiumLayoutFromDraft(draft, index));
        const firstLayout = slideLayouts[0];

        if (!firstLayout.title) {
            const userHeadline = window.prompt("Não foi possível extrair o título automaticamente. Insira o Título Principal (Headline) para a imagem:");
            if (!userHeadline) return;
            firstLayout.title = userHeadline.toUpperCase();
            slideLayouts[0] = { ...firstLayout };
        }

        const toastId = toast.loading(`Aplicando overlay em ${slides.length} slide(s)...`);
        setActioning(prev => ({ ...prev, [draft.id]: true }));

        try {
            // Bake overlay onto every slide in parallel
            const bakedUrls = await Promise.all(
                slides.map((imgUrl, index) => renderPremiumPostToDataUrl({
                    layout: slideLayouts[index] || firstLayout,
                    backgroundImage: imgUrl,
                    apiBaseUrl: api.defaults.baseURL || 'http://localhost:3001'
                }))
            );

            await api.patch(`/api/auto-generate/drafts/${draft.id}/media`, {
                mediaUrls: bakedUrls,
                premiumLayout: {
                    ...firstLayout,
                    backgroundImage: undefined
                },
                premiumLayouts: slideLayouts.map(layout => ({
                    ...layout,
                    backgroundImage: undefined
                })),
                markPremiumBaked: true
            });

            setDrafts(prev => prev.map(d => d.id === draft.id ? {
                ...d,
                mediaUrls: bakedUrls,
                premiumLayout: {
                    ...firstLayout,
                    backgroundImage: undefined
                },
                premiumLayouts: slideLayouts.map(layout => ({
                    ...layout,
                    backgroundImage: undefined
                })),
                overlayData: {
                    headline: firstLayout.title,
                    subheadline: '',
                    highlights: String(firstLayout.highlightText || '')
                        .split(',')
                        .map(item => item.trim())
                        .filter(Boolean),
                    layout: 'premium'
                },
                premiumOverlayBakedAt: new Date().toISOString()
            } : d));
            setConfirmingDraft(prev => prev?.id === draft.id ? {
                ...prev,
                mediaUrls: bakedUrls,
                premiumLayout: {
                    ...firstLayout,
                    backgroundImage: undefined
                },
                premiumLayouts: slideLayouts.map(layout => ({
                    ...layout,
                    backgroundImage: undefined
                })),
                overlayData: {
                    headline: firstLayout.title,
                    subheadline: '',
                    highlights: String(firstLayout.highlightText || '')
                        .split(',')
                        .map(item => item.trim())
                        .filter(Boolean),
                    layout: 'premium'
                },
                premiumOverlayBakedAt: new Date().toISOString()
            } : prev);

            toast.success(`Overlay adicionado em ${bakedUrls.length} slide(s) e salvo!`, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(getApiErrorMessage(error, 'Erro ao criar imagem com overlay.'), { id: toastId });
        } finally {
            setActioning(prev => ({ ...prev, [draft.id]: false }));
        }
    };

    const handleOpenPremiumEditor = (draft: DraftPost) => {
        setPremiumEditorDraft(draft);
        setPremiumEditorLayout(buildPremiumLayoutFromDraft(draft, slideIndex[draft.id] || 0));
    };

    const handlePremiumEditorChange = (field: keyof PremiumLayout, value: string | boolean | number) => {
        setPremiumEditorLayout(prev => prev ? { ...prev, [field]: value } : prev);
    };

    const handleSavePremiumEditor = async () => {
        if (!premiumEditorDraft || !premiumEditorLayout) return;

        const layoutToSave: PremiumLayout = {
            ...premiumEditorLayout,
            backgroundImage: undefined
        };

        setSavingPremiumLayout(true);
        try {
            const res = await api.patch(`/api/auto-generate/drafts/${premiumEditorDraft.id}/premium-layout`, {
                layout: layoutToSave,
                slideIndex: premiumEditorLayout.slideIndex ?? 0
            });
            const savedLayout = (res.data?.layout || layoutToSave) as PremiumLayout;
            const nextOverlayData = {
                headline: savedLayout.title,
                subheadline: '',
                highlights: String(savedLayout.highlightText || '')
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean),
                layout: 'premium'
            };

            setDrafts(prev => prev.map(draft => draft.id === premiumEditorDraft.id ? {
                ...draft,
                premiumLayout: (premiumEditorLayout.slideIndex || 0) === 0 ? savedLayout : (draft.premiumLayout || savedLayout),
                premiumLayouts: (() => {
                    const nextLayouts = Array.isArray(draft.premiumLayouts) ? [...draft.premiumLayouts] : [];
                    nextLayouts[premiumEditorLayout.slideIndex || 0] = savedLayout;
                    return nextLayouts;
                })(),
                overlayData: nextOverlayData,
                premiumOverlayBakedAt: null
            } : draft));
            setConfirmingDraft(prev => prev?.id === premiumEditorDraft.id ? {
                ...prev,
                premiumLayout: (premiumEditorLayout.slideIndex || 0) === 0 ? savedLayout : (prev.premiumLayout || savedLayout),
                premiumLayouts: (() => {
                    const nextLayouts = Array.isArray(prev.premiumLayouts) ? [...prev.premiumLayouts] : [];
                    nextLayouts[premiumEditorLayout.slideIndex || 0] = savedLayout;
                    return nextLayouts;
                })(),
                overlayData: nextOverlayData,
                premiumOverlayBakedAt: null
            } : prev);
            toast.success('Layout premium salvo no rascunho.');
            setPremiumEditorDraft(null);
            setPremiumEditorLayout(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao salvar edição premium'));
        } finally {
            setSavingPremiumLayout(false);
        }
    };

    const handleInlinePremiumUpdate = async (draftId: string, slideIndex: number, updates: Partial<PremiumLayout>) => {
        const draft = drafts.find(d => d.id === draftId);
        if (!draft) return;
        
        const currentLayout = buildPremiumLayoutFromDraft(draft, slideIndex);
        const nextLayout = { ...currentLayout, ...updates, backgroundImage: undefined };
        
        // Update local state instantly for smooth dragging
        setDrafts(prev => prev.map(d => d.id === draftId ? {
            ...d,
            premiumLayout: slideIndex === 0 ? nextLayout : (d.premiumLayout || nextLayout),
            premiumLayouts: (() => {
                const arr = Array.isArray(d.premiumLayouts) ? [...d.premiumLayouts] : [];
                arr[slideIndex] = nextLayout;
                return arr;
            })(),
            premiumOverlayBakedAt: null
        } : d));

        // Let's debounce the backend patch or just fire-and-forget for small values if preferred
        // We'll wrap in a timeout to avoid flooding API on every single drag tick
        if ((window as any)._inlinePremiumTimeout) clearTimeout((window as any)._inlinePremiumTimeout);
        (window as any)._inlinePremiumTimeout = setTimeout(async () => {
            try {
                await api.patch(`/api/auto-generate/drafts/${draftId}/premium-layout`, {
                    layout: nextLayout,
                    slideIndex: slideIndex
                });
            } catch (err) {
                console.error("Failed to save inline premium layout", err);
            }
        }, 500);
    };

    const handleReject = async (postId: string) => {
        setActioning(prev => ({ ...prev, [postId]: true }));
        try {
            await api.post(`/api/auto-generate/drafts/${postId}/reject`);
            toast.success('Descartado');
            setDrafts(prev => prev.filter(d => d.id !== postId));
            setSelectedDraftIds(prev => prev.filter(id => id !== postId));
            setRejectingDraft(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao descartar'));
        } finally {
            setActioning(prev => ({ ...prev, [postId]: false }));
        }
    };

    const handleRejectAll = async (draftList: DraftPost[] = drafts) => {
        if (!confirm(`Descartar todos os ${draftList.length} rascunhos desta seção?`)) return;
        let ok = 0;
        const toastId = toast.loading(`Descartando ${draftList.length} rascunhos...`);
        for (const d of draftList) {
            try {
                await api.post(`/api/auto-generate/drafts/${d.id}/reject`);
                ok++;
            } catch { }
        }
        toast.dismiss(toastId);
        toast.success(`${ok} rascunhos descartados!`);
        loadDrafts();
    };

    const handleRegenerate = async () => {
        if (!selectedDraftForPrompt || !promptText) return;
        setRegenerating(true);
        try {
            const res = await api.post(`/api/auto-generate/drafts/${selectedDraftForPrompt.id}/regenerate`, {
                prompt: promptText
            });
            toast.success('Post regerado com sucesso!');
            
            // Update the local draft data
            const updatedPost = res.data.post;
            setDrafts(prev => prev.map(d => d.id === selectedDraftForPrompt.id ? { ...d, ...updatedPost } : d));
            setSelectedDraftForPrompt(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Erro ao regerar post'));
        } finally {
            setRegenerating(false);
        }
    };

    const openBulkApprovalModal = (draftList: DraftPost[] = drafts, destinationLabel = 'seção') => {
        if (draftList.length === 0) return;
        setApprovalSelection({
            ids: draftList.map(d => d.id),
            destinationLabel
        });
    };

    const handleApproveSelected = () => {
        const selectedVisibleIds = drafts
            .filter(draft => selectedDraftIds.includes(draft.id))
            .map(draft => draft.id);
        if (selectedVisibleIds.length === 0) return;
        setApprovalSelection({
            ids: selectedVisibleIds,
            destinationLabel: 'seleção'
        });
    };

    const toggleDraftSelection = (postId: string) => {
        setSelectedDraftIds(prev => (
            prev.includes(postId)
                ? prev.filter(id => id !== postId)
                : [...prev, postId].slice(-3)
        ));
    };

    // ---------------------------------------------------------------------------
    // Render helpers
    // ---------------------------------------------------------------------------
    // hasAccount é aviso, não bloqueio — conta só é necessária ao aprovar/postar
    const allChecksOk = preview
        ? preview.checks.hasPillars &&
          preview.checks.hasSchedule &&
          preview.checks.pillarWeightOk &&
          preview.checks.autonomyMode !== 'manual'
        : false;
    const canAdvanceToApprove = allChecksOk && editablePlan.length > 0;

    const pillarColorMap: Record<string, string> = {};
    (preview?.pillars || []).forEach((p, i) => {
        pillarColorMap[p.id] = getPillarColor(i);
    });
    const plannedByPillar = editablePlan.reduce<Record<string, number>>((acc, slot) => {
        if (!slot.pillarId) return acc;
        acc[slot.pillarId] = (acc[slot.pillarId] || 0) + 1;
        return acc;
    }, {});
    const totalPlannedSlots = editablePlan.length;
    const totalRecentPosts = preview?.recentActivity.total || 0;
    // ---------------------------------------------------------------------------
    // Step: Plan
    // ---------------------------------------------------------------------------
    const renderPlanStep = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', alignItems: 'start' }}>

            {/* Left: profile selector + checks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Perfil da Marca</h3>
                    <select
                        className="input"
                        value={selectedProfileId}
                        onChange={e => setSelectedProfileId(e.target.value)}
                        style={{ width: '100%' }}
                    >
                        <option value="">Selecionar perfil...</option>
                        {profiles.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>

                {preview && (
                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verificações</h3>
                        <CheckItem
                            ok={preview.checks.hasAccount}
                            label={preview.checks.hasAccount ? "Conta Instagram vinculada" : "Conta Instagram não vinculada"}
                            fix="Isso não bloqueia o plano nem a geração. Vincule a conta só antes de aprovar/publicar os posts."
                            tone="warning"
                        />
                        <CheckItem
                            ok={preview.checks.hasPillars}
                            label="Pilares editoriais configurados"
                            fix="Vá em Perfis de Negócio → edite o perfil → Pilares Editoriais"
                        />
                        <CheckItem
                            ok={preview.checks.pillarWeightOk}
                            label="Soma dos pesos = 100%"
                            fix="Ajuste os pesos dos pilares para somarem exatamente 100%"
                        />
                        <CheckItem
                            ok={preview.checks.hasSchedule}
                            label="Frequência de posts configurada"
                            fix="Configure posts por semana em Agendamento Automático"
                        />
                        <CheckItem
                            ok={preview.checks.autonomyMode !== 'manual'}
                            label={`Modo autopilot: ${preview.checks.autonomyMode}`}
                            fix="Mude o Modo de Autonomia para 'Gerar + Revisar' ou 'Automático'"
                        />

                        {!allChecksOk && (
                            <button
                                onClick={() => router.push('/dashboard/business-profiles')}
                                className="btn btn-secondary"
                                style={{ width: '100%', marginTop: '1rem', fontSize: '0.875rem' }}
                            >
                                ⚙️ Configurar Perfil
                            </button>
                        )}
                    </div>
                )}

                {/* Pillar distribution */}
                {preview && preview.pillars.length > 0 && (
                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '1.25rem' }}>
                        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mix de Pilares</h3>
                        <p style={{ margin: '0 0 0.875rem', fontSize: '0.8rem', color: '#71717a', lineHeight: 1.45 }}>
                            Compare o peso configurado com a cobertura prevista do plano atual e o histórico recente.
                        </p>
                        <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.9rem', fontSize: '0.72rem', color: '#71717a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: '#52525b', display: 'inline-block' }} />
                                Alvo configurado
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: '#a3e635', display: 'inline-block' }} />
                                Previsto no plano
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: '#27272a', border: '1px solid #3f3f46', display: 'inline-block' }} />
                                Histórico recente
                            </div>
                        </div>
                        {preview.pillars.map((p, i) => {
                            const color = getPillarColor(i);
                            const recent = preview.recentActivity.byPilar[p.id] || 0;
                            const planned = plannedByPillar[p.id] || 0;
                            const plannedShare = totalPlannedSlots > 0 ? (planned / totalPlannedSlots) * 100 : 0;
                            const recentShare = totalRecentPosts > 0 ? (recent / totalRecentPosts) * 100 : 0;
                            const delta = plannedShare - p.weight;
                            return (
                                <div key={p.id} style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#e4e4e7' }}>{p.name}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#52525b' }}>
                                            alvo {p.weight}% · previsto {plannedShare.toFixed(0)}% · {recent} recente{recent !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                        <div style={{ height: '5px', background: '#111113', borderRadius: '999px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${p.weight}%`, background: '#52525b', borderRadius: '999px' }} />
                                        </div>
                                        <div style={{ height: '6px', background: '#111113', borderRadius: '999px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${plannedShare}%`, background: color, borderRadius: '999px' }} />
                                        </div>
                                        <div style={{ height: '4px', background: '#111113', borderRadius: '999px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${recentShare}%`, background: '#3f3f46', borderRadius: '999px' }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.72rem', color: '#71717a' }}>
                                        <span>{planned} slot{planned !== 1 ? 's' : ''} no plano</span>
                                        <span style={{ color: delta >= 0 ? '#86efac' : '#fca5a5' }}>
                                            {delta >= 0 ? '+' : ''}{delta.toFixed(0)} p.p. vs alvo
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Right: plan preview */}
            <div>
                {loadingPreview && (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#52525b' }}>Calculando plano...</div>
                )}

                {!loadingPreview && !preview && selectedProfileId && (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#52525b' }}>Selecione um perfil para ver o plano</div>
                )}

                {!loadingPreview && !selectedProfileId && (
                    <div style={{ border: '2px dashed #27272a', borderRadius: '0.75rem', padding: '4rem', textAlign: 'center', color: '#52525b' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
                        <p>Selecione um perfil de negócio para ver o plano da semana</p>
                    </div>
                )}

                {!loadingPreview && preview && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                                Plano da Semana — {preview.profile.name}
                                <span style={{ fontSize: '0.875rem', color: '#52525b', fontWeight: 400, marginLeft: '0.5rem' }}>
                                    ({editablePlan.length} conteúdos)
                                </span>
                            </h2>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={handleRegenPlan}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                    disabled={loadingPreview}
                                >
                                    {loadingPreview ? '⏳' : '🔄'} Regenerar
                                </button>
                                {canAdvanceToApprove && (
                                    <button
                                        onClick={() => setStep('approve')}
                                        className="btn btn-primary"
                                        style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}
                                    >
                                        Revisar e Confirmar →
                                    </button>
                                )}
                            </div>
                        </div>

                        {editablePlan.length === 0 ? (
                            <div style={{ border: '2px dashed #27272a', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: '#52525b' }}>
                                <p>Nenhum slot disponível esta semana.</p>
                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Todos os horários configurados já passaram ou a frequência está como 0.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {editablePlan.map((slot, i) => {
                                    const color = pillarColorMap[slot.pillarId] || '#7c3aed';
                                    const pillarObj = preview.pillars.find(p => p.id === slot.pillarId);
                                    const availableFormats = pillarObj?.formats || Object.keys(FORMAT_LABELS);
                                    const isExpanded = expandedPlanSlot === i;

                                    return (
                                        <div key={i} style={{ background: '#18181b', border: isExpanded ? `1px solid ${color}66` : '1px solid #27272a', borderRadius: '0.75rem', padding: '0.9rem 1rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(170px, 1fr) minmax(170px, 1fr) 170px 44px 44px', gap: '0.75rem', alignItems: 'center' }}>
                                                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: `${color}22`, border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color, fontWeight: 700 }}>
                                                    {i + 1}
                                                </div>

                                                <input
                                                    type="datetime-local"
                                                    value={formatDateTimeLocal(slot.slot)}
                                                    onChange={e => updateSlotDate(i, e.target.value)}
                                                    className="input"
                                                    style={{ padding: '0.55rem 0.65rem', fontSize: '0.8rem', minWidth: 0 }}
                                                />

                                                <select
                                                    value={slot.pillarId}
                                                    onChange={e => updateSlotPillar(i, e.target.value)}
                                                    className="input"
                                                    style={{ padding: '0.55rem 0.65rem', fontSize: '0.8rem', minWidth: 0 }}
                                                >
                                                    {preview.pillars.map(pillar => (
                                                        <option key={pillar.id} value={pillar.id}>{pillar.name}</option>
                                                    ))}
                                                </select>

                                                <select
                                                    value={slot.format}
                                                    onChange={e => updateSlotFormat(i, e.target.value)}
                                                    className="input"
                                                    style={{ padding: '0.55rem 0.65rem', fontSize: '0.8rem', minWidth: 0 }}
                                                >
                                                    {availableFormats.map(f => (
                                                        <option key={f} value={f}>{FORMAT_ICONS[f]} {FORMAT_LABELS[f] || f}</option>
                                                    ))}
                                                </select>

                                                <button
                                                    onClick={() => setExpandedPlanSlot(isExpanded ? null : i)}
                                                    title={isExpanded ? 'Fechar briefing' : 'Editar briefing'}
                                                    style={{ background: 'none', border: '1px solid #3f3f46', borderRadius: '0.5rem', color: isExpanded ? color : '#a1a1aa', cursor: 'pointer', padding: '0.45rem', fontSize: '0.95rem' }}
                                                >
                                                    {isExpanded ? '▴' : '▾'}
                                                </button>

                                                <button
                                                    onClick={() => removeSlot(i)}
                                                    title="Remover slot"
                                                    style={{ background: 'none', border: '1px solid #3f3f46', borderRadius: '0.5rem', color: '#71717a', cursor: 'pointer', padding: '0.45rem', fontSize: '0.9rem' }}
                                                    onMouseEnter={e => { (e.currentTarget).style.borderColor = '#f87171'; (e.currentTarget).style.color = '#f87171'; }}
                                                    onMouseLeave={e => { (e.currentTarget).style.borderColor = '#3f3f46'; (e.currentTarget).style.color = '#71717a'; }}
                                                >✕</button>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.75rem', color: color, background: `${color}14`, border: `1px solid ${color}33`, borderRadius: '999px', padding: '0.18rem 0.55rem' }}>
                                                    {slot.pillarName}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: '#71717a' }}>{slot.slotLabel}</span>
                                                {slot.customTopic && (
                                                    <span style={{ fontSize: '0.75rem', color: '#e4e4e7', background: 'rgba(255,255,255,0.04)', borderRadius: '999px', padding: '0.18rem 0.55rem' }}>
                                                        Tema: {slot.customTopic}
                                                    </span>
                                                )}
                                                {slot.format === 'carousel-premium' && (
                                                    <span style={{ fontSize: '0.75rem', color: '#f5d0fe', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)', borderRadius: '999px', padding: '0.18rem 0.55rem' }}>
                                                        {slot.slideCount || REVIEW_MODE_PREMIUM_CAROUSEL_SLIDE_COUNT} slides
                                                    </span>
                                                )}
                                            </div>

                                            {isExpanded && (
                                                <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid #27272a', display: 'grid', gap: '0.75rem' }}>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#a1a1aa' }}>
                                                            Conteúdo / tema a gerar (opcional)
                                                        </label>
                                                        <input
                                                            value={slot.customTopic || ''}
                                                            onChange={e => updateSlotField(i, 'customTopic', e.target.value)}
                                                            placeholder="Se quiser, defina um tema específico. Se deixar em branco, a IA usa o pilar e o contexto da marca."
                                                            style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', borderRadius: '0.5rem', color: '#e4e4e7', padding: '0.75rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#a1a1aa' }}>
                                                            Descrição / input extra para a IA (opcional)
                                                        </label>
                                                        <textarea
                                                            value={slot.customBriefing || ''}
                                                            onChange={e => updateSlotField(i, 'customBriefing', e.target.value)}
                                                            rows={4}
                                                            placeholder="Se quiser, detalhe instruções extras. Se deixar em branco, a IA gera só com base no pilar e nas informações da marca."
                                                            style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', borderRadius: '0.5rem', color: '#e4e4e7', padding: '0.75rem', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
                                                        />
                                                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#71717a' }}>
                                                            Você pode deixar os dois campos vazios.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                <button
                                    onClick={addSlot}
                                    style={{ background: 'none', border: '1px dashed #3f3f46', borderRadius: '0.5rem', padding: '0.7rem 1rem', color: '#71717a', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { (e.currentTarget).style.borderColor = '#7c3aed'; (e.currentTarget).style.color = '#a78bfa'; }}
                                    onMouseLeave={e => { (e.currentTarget).style.borderColor = '#3f3f46'; (e.currentTarget).style.color = '#71717a'; }}
                                >
                                    + Adicionar slot
                                </button>
                            </div>
                        )}

                        {!allChecksOk && editablePlan.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#fca5a5' }}>
                                Corrija as verificações ao lado antes de gerar o conteúdo.
                            </div>
                        )}

                        {preview.checks.hasAccount === false && canAdvanceToApprove && (
                            <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#fbbf24' }}>
                                Você pode seguir para a aprovação do plano e gerar os rascunhos agora. A conta do Instagram só será exigida quando for aprovar/publicar os posts.
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    // ---------------------------------------------------------------------------
    // Step: Approve plan
    // ---------------------------------------------------------------------------
    const renderApproveStep = () => {
        if (!preview) return null;
        const { profile } = preview;

        return (
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: '0 0 0.25rem' }}>Confirmar plano de geração</h2>
                    <p style={{ margin: 0, color: '#71717a', fontSize: '0.875rem' }}>
                        Revise os {editablePlan.length} conteúdos que serão gerados para <strong style={{ color: '#e4e4e7' }}>{profile.name}</strong>. Após confirmar, a IA começará a criar as imagens e captions usando o contexto ajustado do perfil.
                    </p>
                </div>

                {/* Plan table — editable preview */}
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', overflow: 'hidden', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #27272a', display: 'grid', gridTemplateColumns: '2rem 135px 1fr 110px 1.6fr 2rem', gap: '0.75rem', fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span>#</span>
                        <span>Data / Hora</span>
                        <span>Pilar</span>
                        <span>Formato</span>
                        <span>Tema / Briefing</span>
                        <span></span>
                    </div>
                    {editablePlan.map((slot, i) => {
                        const color = pillarColorMap[slot.pillarId] || '#7c3aed';
                        const pillarObj = preview?.pillars.find(p => p.id === slot.pillarId);
                        const availableFormats = pillarObj?.formats || Object.keys(FORMAT_LABELS);
                        return (
                            <div key={i} style={{ padding: '0.75rem 1.25rem', borderBottom: i < editablePlan.length - 1 ? '1px solid #1c1c1f' : 'none', display: 'grid', gridTemplateColumns: '2rem 135px 1fr 110px 1.6fr 2rem', gap: '0.75rem', alignItems: 'center' }}>
                                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${color}22`, border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color, fontWeight: 700 }}>{i + 1}</span>
                                <input
                                    type="datetime-local"
                                    value={formatDateTimeLocal(slot.slot)}
                                    onChange={e => updateSlotDate(i, e.target.value)}
                                    className="input"
                                    style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', minWidth: 0, width: '100%' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.75rem', color: '#e4e4e7' }}>{slot.pillarName}</span>
                                    {slot.format === 'carousel-premium' && (
                                        <span style={{ fontSize: '0.68rem', color: '#c084fc', whiteSpace: 'nowrap' }}>
                                            {slot.slideCount || REVIEW_MODE_PREMIUM_CAROUSEL_SLIDE_COUNT} slides
                                        </span>
                                    )}
                                </div>
                                <select
                                    value={slot.format}
                                    onChange={e => updateSlotFormat(i, e.target.value)}
                                    className="input"
                                    style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }}
                                >
                                    {availableFormats.map(f => (
                                        <option key={f} value={f}>{FORMAT_ICONS[f]} {FORMAT_LABELS[f] || f}</option>
                                    ))}
                                </select>
                                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    <input
                                        value={slot.customTopic || ''}
                                        onChange={e => updateSlotField(i, 'customTopic', e.target.value)}
                                        placeholder="Tema..."
                                        className="input"
                                        style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: '100%', background: 'rgba(255,255,255,0.02)' }}
                                    />
                                    <input
                                        value={slot.customBriefing || ''}
                                        onChange={e => updateSlotField(i, 'customBriefing', e.target.value)}
                                        placeholder="Briefing (opcional)..."
                                        className="input"
                                        style={{ padding: '0.25rem 0.4rem', fontSize: '0.7rem', width: '100%', color: '#a1a1aa', background: 'transparent' }}
                                    />
                                </div>
                                <button
                                    onClick={() => removeSlot(i)}
                                    title="Remover"
                                    style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem 0.3rem', borderRadius: '0.25rem', transition: 'color 0.15s' }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.color = '#f87171'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.color = '#52525b'}
                                >✕</button>
                            </div>
                        );
                    })}
                </div>

                {/* Warning if no account */}
                {!preview.checks.hasAccount && (
                    <div style={{ padding: '0.875rem 1rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#fbbf24', marginBottom: '1.5rem' }}>
                        ⚠️ Nenhuma conta Instagram vinculada. Os posts serão gerados como rascunhos e você precisará vincular uma conta antes de aprová-los.
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => setStep('plan')}
                        className="btn btn-secondary"
                        style={{ flex: 1 }}
                    >
                        ← Editar plano
                    </button>
                    <button
                        onClick={handleGenerate}
                        className="btn btn-primary"
                        style={{ flex: 2, fontWeight: 600 }}
                    >
                        🤖 Confirmar e Gerar Conteúdo
                    </button>
                </div>
            </div>
        );
    };

    // ---------------------------------------------------------------------------
    // Step: Generating
    // ---------------------------------------------------------------------------
    const renderGeneratingStep = () => {
        const mins = Math.floor(generationElapsed / 60);
        const secs = generationElapsed % 60;
        const elapsed = mins > 0
            ? `${mins}m ${secs.toString().padStart(2, '0')}s`
            : `${secs}s`;

        const job = generationJob;
        const total = job?.totalPosts || 0;
        const currentIdx = job?.currentIndex ?? -1;
        const completed = job?.completedItems || [];
        const progressPct = total > 0 ? Math.round((completed.length / total) * 100) : 0;

        return (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
                <h2 style={{ marginBottom: '0.5rem' }}>Gerando conteúdo...</h2>
                <p style={{ color: '#71717a', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                    A IA está criando imagens, carrosséis e captions de acordo com a sua estratégia.
                </p>
                
                {total > 0 ? (
                    <div style={{ textAlign: 'left', background: '#18181b', border: '1px solid #27272a', padding: '1.5rem', borderRadius: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#a1a1aa' }}>
                            <span>Progresso</span>
                            <span>{progressPct}% ({completed.length}/{total})</span>
                        </div>
                        <div style={{ height: '6px', background: '#27272a', borderRadius: '3px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', background: '#7c3aed', transition: 'width 0.3s ease' }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {completed.map(item => (
                                <div key={'done-' + item.index} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#09090b', borderRadius: '0.5rem', border: '1px solid #27272a' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{item.status === 'done' ? '✅' : '❌'}</span>
                                    <span style={{ fontSize: '1.1rem' }} title={item.format}>{FORMAT_ICONS[item.format] || '🖼️'}</span>
                                    <span style={{ fontSize: '0.9rem', color: '#e4e4e7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                                </div>
                            ))}

                            {currentIdx >= 0 && currentIdx < total && !completed.find(c => c.index === currentIdx) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#09090b', borderRadius: '0.5rem', border: '1px solid #7c3aed40' }}>
                                    <div style={{ width: '1.1rem', height: '1.1rem', borderRadius: '50%', border: '2px solid #7c3aed', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', marginLeft: '2px' }} />
                                    <span style={{ fontSize: '1.1rem' }}>⏳</span>
                                    <span style={{ fontSize: '0.9rem', color: '#e4e4e7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        Gerando: {job?.currentPostTitle || 'Processando...'}
                                    </span>
                                </div>
                            )}

                            {Array.from({ length: total }).map((_, idx) => {
                                if (idx <= currentIdx) return null;
                                return (
                                    <div key={'wait-' + idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#09090b', borderRadius: '0.5rem', border: '1px solid #27272a', opacity: 0.5 }}>
                                        <span style={{ fontSize: '1.1rem' }}>⏳</span>
                                        <span style={{ fontSize: '1.1rem' }}>—</span>
                                        <span style={{ fontSize: '0.9rem', color: '#a1a1aa' }}>Aguardando...</span>
                                    </div>
                                );
                            })}
                        </div>
                        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '2rem' }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7c3aed', animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite` }} />
                            ))}
                        </div>
                        <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
                    </>
                )}

                <p style={{ color: '#52525b', fontSize: '0.875rem', marginTop: '2rem' }}>
                    ⏱ {elapsed} — atualizando
                </p>
            </div>
        );
    };

    // ---------------------------------------------------------------------------
    // Step: Review
    // ---------------------------------------------------------------------------
    const renderReviewStep = () => {
        const profileScopedDrafts = !draftProfileFilter || draftProfileFilter === 'all'
            ? drafts
            : drafts.filter(draft => draft.businessProfileId === draftProfileFilter);
        const generationScopedDrafts = recentGeneratedDraftIds.length > 0
            ? profileScopedDrafts.filter(draft => recentGeneratedDraftIds.includes(draft.id))
            : profileScopedDrafts;
        const pillarOptions = Array.from(new Set(generationScopedDrafts.map(draft => draft.pillarName).filter(Boolean))) as string[];
        const campaignOptions = Array.from(new Set(generationScopedDrafts.map(draft => getCampaignLabel(draft.scheduledFor))));

        const filteredDrafts = generationScopedDrafts.filter(draft => {
            if (pillarFilter !== 'all' && draft.pillarName !== pillarFilter) return false;
            if (campaignFilter !== 'all' && getCampaignLabel(draft.scheduledFor) !== campaignFilter) return false;
            return true;
        });

        const tabCounts = REVIEW_TABS.reduce((acc, tab) => {
            acc[tab.key] = filteredDrafts.filter(draft => getDraftReviewTab(draft) === tab.key).length;
            return acc;
        }, {} as Record<ReviewTab, number>);

        const visibleDrafts = filteredDrafts.filter(draft => getDraftReviewTab(draft) === reviewTab);
        const selectedVisibleDrafts = visibleDrafts.filter(draft => selectedDraftIds.includes(draft.id)).slice(0, 3);
        const reviewProfileId = !draftProfileFilter || draftProfileFilter === 'all' ? selectedProfileId : draftProfileFilter;
        const reviewProfile = profiles.find(profile => profile.id === reviewProfileId);
        const reviewSchedule = reviewProfile?.contentSchedule;

        const currentWeekStart = startOfWeek(new Date());
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 7);

        const filteredScheduledPosts = scheduledPosts.filter(post => {
            if (draftProfileFilter && draftProfileFilter !== 'all' && post.businessProfileId !== draftProfileFilter) return false;
            if (pillarFilter !== 'all' && post.pillarName !== pillarFilter) return false;
            if (campaignFilter !== 'all' && getCampaignLabel(post.scheduledFor) !== campaignFilter) return false;
            return true;
        });

        const slotMap = [...filteredDrafts, ...filteredScheduledPosts].reduce((acc, item) => {
            const key = toDate(item.scheduledFor)?.toISOString().slice(0, 16) || 'sem-data';
            acc[key] = [...(acc[key] || []), item];
            return acc;
        }, {} as Record<string, DraftPost[]>);

        const conflicts = Object.entries(slotMap)
            .filter(([key, items]) => key !== 'sem-data' && items.length > 1)
            .map(([key, items]) => ({ key, items }));

        const scheduledThisWeek = [...filteredDrafts, ...filteredScheduledPosts].filter(item => {
            const date = toDate(item.scheduledFor);
            return Boolean(date && date >= currentWeekStart && date < currentWeekEnd);
        });

        const expectedThisWeek = Number(reviewSchedule?.postsPerWeek || 0) + Number(reviewSchedule?.storiesPerWeek || 0);
        const gaps = Math.max(0, expectedThisWeek - scheduledThisWeek.length);
        const htmlSlideCache = htmlSlideCacheRef.current;

        return (
            <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Mesa de Revisão</h2>
                        {generationResult && (
                            <p style={{ margin: '0.25rem 0 0', color: '#71717a', fontSize: '0.875rem' }}>
                                {generationResult.generated} posts gerados{generationResult.failed > 0 ? ` · ${generationResult.failed} falharam` : ''}
                            </p>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            value={draftProfileFilter}
                            onChange={e => {
                                setDraftProfileFilter(e.target.value);
                                setRecentGeneratedDraftIds([]);
                            }}
                            className="input"
                            style={{ minWidth: '220px', padding: '0.55rem 0.8rem', fontSize: '0.875rem' }}
                        >
                            <option value="all">Todos os perfis</option>
                            {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>{profile.name}</option>
                            ))}
                        </select>
                        <select
                            value={pillarFilter}
                            onChange={e => setPillarFilter(e.target.value)}
                            className="input"
                            style={{ minWidth: '180px', padding: '0.55rem 0.8rem', fontSize: '0.875rem' }}
                        >
                            <option value="all">Todos os pilares</option>
                            {pillarOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <select
                            value={campaignFilter}
                            onChange={e => setCampaignFilter(e.target.value)}
                            className="input"
                            style={{ minWidth: '180px', padding: '0.55rem 0.8rem', fontSize: '0.875rem' }}
                        >
                            <option value="all">Todas as campanhas</option>
                            {campaignOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <button onClick={() => setStep('plan')} className="btn btn-secondary" style={{ fontSize: '0.875rem' }}>
                            ← Novo plano
                        </button>
                        {visibleDrafts.length > 1 && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => handleRejectAll(visibleDrafts)} className="btn btn-secondary" style={{ fontSize: '0.875rem', border: '1px solid #ef4444', color: '#ef4444' }}>
                                    🗑️ Rejeitar seção ({visibleDrafts.length})
                                </button>
                                <button onClick={() => openBulkApprovalModal(visibleDrafts, 'seção')} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                                    ✅ Aprovar seção ({visibleDrafts.length})
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {recentGeneratedDraftIds.length > 0 && (
                    <div style={{ marginBottom: '1.25rem', padding: '0.9rem 1rem', borderRadius: '0.75rem', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ color: '#ddd6fe', fontSize: '0.85rem' }}>
                            Exibindo apenas os {recentGeneratedDraftIds.length} rascunhos gerados nesta execução para este perfil.
                        </div>
                        <button
                            onClick={() => setRecentGeneratedDraftIds([])}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem' }}
                        >
                            Ver todos os rascunhos do perfil
                        </button>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem', marginBottom: '1.25rem' }}>
                    {[
                        { label: 'Inbox', value: filteredDrafts.length, color: '#60a5fa' },
                        { label: 'Selecionados', value: selectedDraftIds.length, color: '#a78bfa' },
                        { label: 'Conflitos', value: conflicts.length, color: conflicts.length > 0 ? '#f87171' : '#34d399' },
                        { label: 'Buracos', value: gaps, color: gaps > 0 ? '#fbbf24' : '#34d399' },
                    ].map(card => (
                        <div key={card.label} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '1rem' }}>
                            <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{card.label}</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: card.color }}>{card.value}</div>
                        </div>
                    ))}
                </div>

                {(conflicts.length > 0 || gaps > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                        {conflicts.length > 0 && (
                            <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>Conflitos de agenda</div>
                                {conflicts.slice(0, 3).map(conflict => (
                                    <div key={conflict.key} style={{ color: '#fecaca', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                        {formatDate(conflict.items[0]?.scheduledFor)} · {conflict.items.length} itens
                                    </div>
                                ))}
                            </div>
                        )}
                        {gaps > 0 && (
                            <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                                <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>Buracos na agenda</div>
                                <div style={{ color: '#fde68a', fontSize: '0.8rem' }}>
                                    Faltam {gaps} peças para atingir a meta semanal atual deste perfil.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {selectedVisibleDrafts.length >= 2 && (
                    <div style={{ marginBottom: '1.25rem', padding: '1rem', borderRadius: '0.75rem', background: '#111113', border: '1px solid #27272a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>Comparação de variações</h3>
                                <p style={{ margin: '0.3rem 0 0', color: '#71717a', fontSize: '0.8rem' }}>
                                    Selecione até 3 drafts desta seção para comparar lado a lado.
                                </p>
                            </div>
                            <button onClick={() => setSelectedDraftIds([])} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                                Limpar seleção
                            </button>
                            <button onClick={handleApproveSelected} className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                                ✅ Aprovar seleção ({selectedVisibleDrafts.length})
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedVisibleDrafts.length}, minmax(0, 1fr))`, gap: '1rem' }}>
                            {selectedVisibleDrafts.map(draft => (
                                <div key={draft.id} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.75rem', overflow: 'hidden' }}>
                                    <div style={{ aspectRatio: getDraftAspectRatio(draft), background: '#09090b' }}>
                                        {draft.htmlContent ? (
                                            <iframe
                                                srcDoc={cleanHtmlCarousel(draft.htmlContent)}
                                                style={{ width: '100%', height: '100%', border: 'none' }}
                                                sandbox="allow-same-origin allow-scripts"
                                                title={`Compare ${draft.id}`}
                                            />
                                        ) : (
                                            <img src={draft.thumbnailUrl || draft.mediaUrls?.[0]} alt="Comparação" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                    </div>
                                    <div style={{ padding: '0.85rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#a78bfa', marginBottom: '0.35rem' }}>
                                            {draft.pillarName || 'Sem pilar'} · {getCampaignLabel(draft.scheduledFor)}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#e4e4e7', lineHeight: 1.45 }}>
                                            {(editingCaption[draft.id] ?? draft.caption ?? draft.script ?? '').slice(0, 180) || 'Sem texto'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {loadingDrafts && <div style={{ textAlign: 'center', padding: '4rem', color: '#52525b' }}>Carregando...</div>}

                {!loadingDrafts && drafts.length === 0 && (
                    <div style={{ border: '2px dashed #27272a', borderRadius: '0.75rem', padding: '4rem', textAlign: 'center', color: '#52525b' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Nenhum rascunho pendente</h3>
                        <button onClick={() => setStep('plan')} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
                            Criar novo plano
                        </button>
                    </div>
                )}

                {!loadingDrafts && drafts.length > 0 && (
                    <>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                            {REVIEW_TABS.map(tab => {
                                const isActive = reviewTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setReviewTab(tab.key)}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '999px',
                                            border: isActive ? '1px solid rgba(124,58,237,0.75)' : '1px solid #27272a',
                                            background: isActive ? 'rgba(124,58,237,0.14)' : '#18181b',
                                            color: isActive ? '#e9d5ff' : '#a1a1aa',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <span>{tab.icon}</span>
                                        <span>{tab.label}</span>
                                        <span style={{ color: isActive ? '#fff' : '#71717a' }}>{tabCounts[tab.key]}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '0.75rem', background: '#111113', border: '1px solid #27272a', color: '#a1a1aa', fontSize: '0.85rem' }}>
                            <strong style={{ color: '#fff' }}>{REVIEW_TABS.find(tab => tab.key === reviewTab)?.label}</strong>
                            {' · '}
                            {reviewTab === 'feed' && 'preview com imagem, carrosséis HTML e caption/agendamento'}
                            {reviewTab === 'stories' && 'preview vertical com frames e elementos interativos'}
                            {reviewTab === 'reels' && 'preview com vídeo/capa, script e duração'}
                        </div>

                        {visibleDrafts.length === 0 ? (
                            <div style={{ border: '1px dashed #27272a', borderRadius: '0.75rem', padding: '2.5rem', textAlign: 'center', color: '#71717a' }}>
                                Nenhum rascunho nesta seção para o filtro selecionado.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {visibleDrafts.map(draft => {
                                    const caption = editingCaption[draft.id] !== undefined ? editingCaption[draft.id] : (draft.caption || draft.script || '');
                                    const pillarIdx = preview?.pillars.findIndex(p => p.id === draft.pillarId) ?? -1;
                                    const color = pillarIdx >= 0 ? getPillarColor(pillarIdx) : '#7c3aed';
                                    const draftFormat = getDraftFormat(draft);
                                    const renderPremiumOverlay = shouldRenderPremiumOverlay(draft);
                                    const aspectRatio = getDraftAspectRatio(draft);
                                    const tab = getDraftReviewTab(draft);
                                    const idx = slideIndex[draft.id] || 0;
                                    const total = draft.mediaUrls?.length || 0;
                                    const currentMediaUrl = tab === 'reels'
                                        ? (draft.videoUrl || draft.thumbnailUrl || draft.mediaUrls?.[0])
                                        : draft.mediaUrls?.[idx];
                                    const goTo = (n: number) => setSlideIndex(prev => ({ ...prev, [draft.id]: Math.max(0, Math.min(total - 1, n)) }));
                                    const profileName = profiles.find(profile => profile.id === draft.businessProfileId)?.name;

                                    // For HTML carousels: extract slides for per-slide navigation
                                    const htmlSlides = draft.htmlContent
                                        ? (htmlSlideCache[draft.id] || (htmlSlideCache[draft.id] = extractHtmlSlides(draft.htmlContent)))
                                        : [];
                                    const htmlTotal = htmlSlides.length;
                                    const htmlIdx = idx;
                                    const goToHtml = (n: number) => setSlideIndex(prev => ({ ...prev, [draft.id]: Math.max(0, Math.min(htmlTotal - 1, n)) }));

                                    return (
                                        <div key={draft.id} style={{ background: '#18181b', border: selectedDraftIds.includes(draft.id) ? '1px solid #8b5cf6' : '1px solid #27272a', borderRadius: '0.75rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: selectedDraftIds.includes(draft.id) ? '0 0 0 1px rgba(139,92,246,0.2)' : 'none' }}>
                                            {draft.htmlContent ? (
                                                <div style={{ position: 'relative', aspectRatio, background: '#09090b', overflow: 'hidden' }}>
                                                    <label style={{ position: 'absolute', top: '0.55rem', left: '0.55rem', zIndex: 11, display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.68)', borderRadius: '999px', padding: '0.25rem 0.5rem', color: '#fff', fontSize: '0.72rem' }}>
                                                        <input type="checkbox" checked={selectedDraftIds.includes(draft.id)} onChange={() => toggleDraftSelection(draft.id)} />
                                                        Comparar
                                                    </label>
                                                    {/* Render only the current slide's HTML */}
                                                    <iframe
                                                        key={`${draft.id}-slide-${htmlIdx}`}
                                                        srcDoc={htmlSlides[htmlIdx] || wrapSingleSlide(draft.htmlContent)}
                                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                                        sandbox="allow-same-origin allow-scripts"
                                                        title={`HTML Carousel Slide ${htmlIdx + 1}`}
                                                    />
                                                    {/* Badge */}
                                                    <span style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '999px', pointerEvents: 'none' }}>
                                                        🎨 HTML {htmlTotal > 1 ? `${htmlIdx + 1}/${htmlTotal}` : ''}
                                                    </span>
                                                    {/* Navigation arrows (only if more than 1 slide) */}
                                                    {htmlTotal > 1 && (
                                                        <>
                                                            <button
                                                                onClick={() => goToHtml(htmlIdx - 1)}
                                                                disabled={htmlIdx === 0}
                                                                style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', cursor: htmlIdx === 0 ? 'default' : 'pointer', opacity: htmlIdx === 0 ? 0.25 : 1, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                                            >‹</button>
                                                            <button
                                                                onClick={() => goToHtml(htmlIdx + 1)}
                                                                disabled={htmlIdx === htmlTotal - 1}
                                                                style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', cursor: htmlIdx === htmlTotal - 1 ? 'default' : 'pointer', opacity: htmlIdx === htmlTotal - 1 ? 0.25 : 1, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                                            >›</button>
                                                            {/* Dot indicators */}
                                                            <div style={{ position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.3rem', zIndex: 10 }}>
                                                                {htmlSlides.map((_, di) => (
                                                                    <div key={di} onClick={() => goToHtml(di)} style={{ width: di === htmlIdx ? '16px' : '6px', height: '6px', borderRadius: '999px', background: di === htmlIdx ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', transition: 'width 0.2s' }} />
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ) : total > 0 || currentMediaUrl ? (
                                                <div style={{ position: 'relative', aspectRatio, background: '#09090b', overflow: 'hidden' }}>
                                                    <label style={{ position: 'absolute', top: '0.55rem', left: '0.55rem', zIndex: 11, display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.68)', borderRadius: '999px', padding: '0.25rem 0.5rem', color: '#fff', fontSize: '0.72rem' }}>
                                                        <input type="checkbox" checked={selectedDraftIds.includes(draft.id)} onChange={() => toggleDraftSelection(draft.id)} />
                                                        Comparar
                                                    </label>
                                                    {tab === 'reels' && isLikelyVideoUrl(draft.videoUrl || draft.mediaUrls?.[0]) ? (
                                                        <video src={draft.videoUrl || draft.mediaUrls?.[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted controls playsInline />
                                                    ) : renderPremiumOverlay ? (
                                                        /* Premium: canvas-accurate preview (matches what gets saved) */
                                                        <PremiumCanvasPreview
                                                            backgroundImage={draft.mediaUrls[idx]}
                                                            layout={buildPremiumLayoutFromDraft(draft, idx)}
                                                            apiBaseUrl={api.defaults.baseURL || 'http://localhost:3001'}
                                                        />
                                                    ) : (
                                                        <img src={currentMediaUrl} alt={`Preview ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    )}
                                                    {total > 1 && tab !== 'reels' && !renderPremiumOverlay && (
                                                        <>
                                                            <span style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
                                                                {idx + 1} / {total}
                                                            </span>
                                                            <button
                                                                onClick={() => goTo(idx - 1)}
                                                                disabled={idx === 0}
                                                                style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            >‹</button>
                                                            <button
                                                                onClick={() => goTo(idx + 1)}
                                                                disabled={idx === total - 1}
                                                                style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: idx === total - 1 ? 'default' : 'pointer', opacity: idx === total - 1 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            >›</button>
                                                            <div style={{ position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.3rem' }}>
                                                                {draft.mediaUrls.map((_, di) => (
                                                                    <div key={di} onClick={() => goTo(di)} style={{ width: di === idx ? '16px' : '6px', height: '6px', borderRadius: '999px', background: di === idx ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'width 0.2s' }} />
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                    {total > 1 && tab !== 'reels' && renderPremiumOverlay && (
                                                        /* Premium: ‹ › arrows for slide nav */
                                                        <>
                                                            <button
                                                                onClick={() => goTo(idx - 1)}
                                                                disabled={idx === 0}
                                                                style={{ position: 'absolute', left: '0.4rem', top: '30%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}
                                                            >‹</button>
                                                            <button
                                                                onClick={() => goTo(idx + 1)}
                                                                disabled={idx === total - 1}
                                                                style={{ position: 'absolute', right: '0.4rem', top: '30%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: idx === total - 1 ? 'default' : 'pointer', opacity: idx === total - 1 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}
                                                            >›</button>
                                                        </>
                                                    )}
                                                </div>

                                            ) : null}

                                            {/* ── Premium filmstrip ─────────────────────────────── */}
                                            {renderPremiumOverlay && total > 1 && tab !== 'reels' && (
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '6px',
                                                    padding: '8px 10px',
                                                    background: '#0d0d0d',
                                                    overflowX: 'auto',
                                                    scrollbarWidth: 'none',
                                                }}>
                                                    {draft.mediaUrls.filter(Boolean).map((imgUrl, di) => {
                                                        const isActive = di === idx;
                                                        const thumbLayout = buildPremiumLayoutFromDraft(draft, di);
                                                        return (
                                                            <div
                                                                key={di}
                                                                onClick={() => goTo(di)}
                                                                style={{
                                                                    flexShrink: 0,
                                                                    width: '52px',
                                                                    height: '65px',
                                                                    borderRadius: '4px',
                                                                    overflow: 'hidden',
                                                                    position: 'relative',
                                                                    cursor: 'pointer',
                                                                    border: isActive
                                                                        ? '2px solid #a78bfa'
                                                                        : '2px solid rgba(255,255,255,0.08)',
                                                                    boxShadow: isActive
                                                                        ? '0 0 0 1px rgba(167,139,250,0.4)'
                                                                        : 'none',
                                                                    transition: 'border-color 0.15s, box-shadow 0.15s',
                                                                    opacity: isActive ? 1 : 0.65,
                                                                }}
                                                            >
                                                                <PremiumCanvasPreview
                                                                    backgroundImage={imgUrl}
                                                                    layout={thumbLayout}
                                                                    apiBaseUrl={api.defaults.baseURL || 'http://localhost:3001'}
                                                                />
                                                                <span style={{
                                                                    position: 'absolute',
                                                                    bottom: '2px',
                                                                    right: '3px',
                                                                    fontSize: '9px',
                                                                    fontWeight: 700,
                                                                    color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                                                                    lineHeight: 1,
                                                                    pointerEvents: 'none',
                                                                }}>
                                                                    {di + 1}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* ── Refinar imagem com IA ────────────────────────── */}
                                            {!draft.htmlContent && (draft.mediaUrls?.length > 0) && tab !== 'reels' && (
                                                <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(139,92,246,0.06)', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                                                    {refinedPreview[draft.id] ? (
                                                        /* Show refined result with accept/discard */
                                                        <div>
                                                            <p style={{ fontSize: '0.7rem', color: '#a78bfa', marginBottom: '0.4rem', fontWeight: 600 }}>✨ Resultado do refinamento{total > 1 ? ` (slide ${idx + 1})` : ''}</p>
                                                            <img src={refinedPreview[draft.id].imageUrl} alt="Refinada" style={{ width: '100%', maxHeight: '140px', objectFit: 'contain', borderRadius: '6px', marginBottom: '0.5rem', background: '#09090b' }} />
                                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                                <button
                                                                    onClick={() => handleAcceptRefinement(draft)}
                                                                    style={{ flex: 1, padding: '0.35rem', background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', borderRadius: '6px', color: '#6ee7b7', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                                                                >
                                                                    ✅ Aplicar
                                                                </button>
                                                                <button
                                                                    onClick={() => setRefinedPreview(prev => { const n = { ...prev }; delete n[draft.id]; return n; })}
                                                                    style={{ flex: 1, padding: '0.35rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', color: '#fca5a5', fontSize: '0.75rem', cursor: 'pointer' }}
                                                                >
                                                                    ✖ Descartar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Prompt input + refine button */
                                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                            <input
                                                                type="text"
                                                                placeholder={total > 1 ? `✨ Refinar slide ${idx + 1} com IA…` : '✨ Refinar imagem com IA…'}
                                                                value={refinePrompts[draft.id] || ''}
                                                                onChange={e => setRefinePrompts(prev => ({ ...prev, [draft.id]: e.target.value }))}
                                                                onKeyDown={e => e.key === 'Enter' && !refiningImage[draft.id] && handleRefineImage(draft, idx)}
                                                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', color: '#e4e4e7', padding: '0.35rem 0.5rem', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none' }}
                                                            />
                                                            <button
                                                                onClick={() => handleRefineImage(draft, idx)}
                                                                disabled={refiningImage[draft.id] || !refinePrompts[draft.id]?.trim()}
                                                                style={{ padding: '0.35rem 0.6rem', background: refiningImage[draft.id] ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.3)', border: '1px solid rgba(139,92,246,0.5)', borderRadius: '6px', color: '#c4b5fd', fontSize: '0.75rem', cursor: refiningImage[draft.id] ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: (!refinePrompts[draft.id]?.trim() && !refiningImage[draft.id]) ? 0.5 : 1 }}
                                                            >
                                                                {refiningImage[draft.id] ? '⏳' : '✨'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                    {draft.pillarName && (
                                                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: `${color}22`, border: `1px solid ${color}55`, color, fontWeight: 500 }}>
                                                            {draft.pillarName}
                                                        </span>
                                                    )}
                                                    {draftProfileFilter === 'all' && profileName && (
                                                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: '#e4e4e7' }}>
                                                            🧩 {profileName}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: '#71717a' }}>
                                                        {FORMAT_ICONS[draftFormat]} {FORMAT_LABELS[draftFormat] || draftFormat}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(124,58,237,0.12)', color: '#c4b5fd' }}>
                                                        {getReviewStateLabel(draft.reviewState)}
                                                    </span>
                                                    {draft.scheduledFor && (
                                                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: '#71717a' }}>
                                                            📅 {formatDate(draft.scheduledFor)}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(96,165,250,0.12)', color: '#93c5fd' }}>
                                                        🎯 {getCampaignLabel(draft.scheduledFor)}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#71717a' }}>
                                                    {tab === 'feed' && !draft.htmlContent && <span>{draft.draftModel || 'FeedPostDraft'}</span>}
                                                    {tab === 'feed' && draft.htmlContent && <span>🎨 {htmlSlides.length || draft.slideCount || 0} slide(s) HTML</span>}
                                                    {tab === 'feed' && draft.htmlContent && <span>exportação: {draft.exportStatus || 'not_exported'}</span>}
                                                    {tab === 'stories' && <span>{draft.frameCount || draft.mediaUrls.length || 0} frame(s)</span>}
                                                    {tab === 'stories' && <span>{(draft.interactiveElements || []).length} interação(ões)</span>}
                                                    {tab === 'reels' && <span>{draft.duration ? `${draft.duration}s` : 'duração pendente'}</span>}
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.7rem', color: '#52525b', display: 'block', marginBottom: '0.3rem' }}>📅 Agendamento</label>
                                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                        <input
                                                            type="datetime-local"
                                                            defaultValue={formatDateTimeLocal(draft.scheduledFor)}
                                                            onChange={e => setEditingSchedule(prev => ({ ...prev, [draft.id]: e.target.value }))}
                                                            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a', borderRadius: '0.375rem', color: '#e4e4e7', padding: '0.4rem 0.5rem', fontSize: '0.8rem', fontFamily: 'inherit' }}
                                                        />
                                                        {editingSchedule[draft.id] !== undefined && (
                                                            <button
                                                                onClick={() => handleSaveSchedule(draft.id)}
                                                                disabled={savingSchedule[draft.id]}
                                                                style={{ padding: '0.4rem 0.7rem', background: '#7c3aed', border: 'none', borderRadius: '0.375rem', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', opacity: savingSchedule[draft.id] ? 0.5 : 1 }}
                                                            >
                                                                {savingSchedule[draft.id] ? '...' : '✓'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.7rem', color: '#52525b', display: 'block', marginBottom: '0.3rem' }}>{getCaptionLabel(draft)}</label>
                                                    <textarea
                                                        value={caption}
                                                        onChange={e => setEditingCaption(prev => ({ ...prev, [draft.id]: e.target.value }))}
                                                        rows={tab === 'reels' ? 5 : 4}
                                                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a', borderRadius: '0.375rem', color: '#e4e4e7', padding: '0.5rem', fontSize: '0.8rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                                                    />
                                                    {editingCaption[draft.id] !== undefined && editingCaption[draft.id] !== (draft.caption || draft.script || '') && (
                                                        <p style={{ fontSize: '0.7rem', color: '#60a5fa', margin: '0.2rem 0 0' }}>Editado · será salvo ao aprovar</p>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                                    <button
                                                        onClick={() => setConfirmingDraft(draft)}
                                                        disabled={actioning[draft.id]}
                                                        className="btn btn-primary"
                                                        style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', opacity: actioning[draft.id] ? 0.4 : 1 }}
                                                    >
                                                        {actioning[draft.id] ? '...' : '✅ Aprovar'}
                                                    </button>
                                                    {draftFormat === 'carousel-premium' && (
                                                        <button
                                                            onClick={() => handleOpenPremiumEditor(draft)}
                                                            className="btn btn-secondary"
                                                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                                                        >
                                                            ✏️ Editar Premium
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => {
                                                            setSelectedDraftForPrompt(draft);
                                                            setPromptText(draft.generationPrompt || '');
                                                        }}
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="Ver Prompt"
                                                    >
                                                        👁️
                                                    </button>
                                                    <button
                                                        onClick={() => setRejectingDraft(draft)}
                                                        disabled={actioning[draft.id]}
                                                        style={{ flex: 1, padding: '0.5rem', fontSize: '0.875rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '0.375rem', cursor: 'pointer', opacity: actioning[draft.id] ? 0.4 : 1 }}
                                                        title="Rejeitar rascunho"
                                                    >
                                                        ❌
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </>
        );
    };

    const renderRejectModal = () => {
        if (!rejectingDraft) return null;
        const isLoading = actioning[rejectingDraft.id];

        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
                <div style={{ background: '#18181b', border: '1px solid #ef444444', borderRadius: '1rem', width: '100%', maxWidth: '400px', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🗑️</div>
                    <h3 style={{ margin: '0 0 1rem', color: '#fff' }}>Descartar Rascunho?</h3>
                    <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.5 }}>
                        Tem certeza que deseja remover este conteúdo da mesa de revisão? Esta ação não pode ser desfeita.
                    </p>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={() => setRejectingDraft(null)}
                            disabled={isLoading}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '0.75rem' }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => handleReject(rejectingDraft.id)}
                            disabled={isLoading}
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '0.75rem', background: '#ef4444', borderColor: '#ef4444' }}
                        >
                            {isLoading ? '...' : 'Sim, Descartar'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderConfirmModal = () => {
        if (!confirmingDraft) return null;
        const htmlSlideCache = htmlSlideCacheRef.current;
        const isLoading = actioning[confirmingDraft.id];
        const isHtmlDraft = Boolean(confirmingDraft.htmlContent);
        const renderPremiumOverlay = shouldRenderPremiumOverlay(confirmingDraft);
        const aspectRatio = getDraftAspectRatio(confirmingDraft);
        const reviewTabForDraft = getDraftReviewTab(confirmingDraft);
        // For premium carousels: reuse the same slideIndex tracked in the card grid
        const modalSlideIdx = slideIndex[confirmingDraft.id] || 0;
        const modalSlideTotal = (confirmingDraft.mediaUrls || []).length;
        const previewMedia = confirmingDraft.videoUrl || confirmingDraft.thumbnailUrl || confirmingDraft.mediaUrls[modalSlideIdx] || confirmingDraft.mediaUrls[0];
        // For HTML carousels: extract individual slides for navigation
        const htmlModalSlides = isHtmlDraft
            ? (htmlSlideCache[confirmingDraft.id] || (htmlSlideCache[confirmingDraft.id] = extractHtmlSlides(confirmingDraft.htmlContent || '')))
            : [];
        const htmlModalSlideIdx = isHtmlDraft ? Math.min(modalSlideIdx, Math.max(0, htmlModalSlides.length - 1)) : 0;
        const htmlModalSlideTotal = htmlModalSlides.length;

        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '2rem' }}>
                <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '1rem', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🎨</span>
                            <h3 style={{ margin: 0 }}>Aprovação Visual e Sincronização</h3>
                        </div>
                        <button onClick={() => setConfirmingDraft(null)} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                    </div>

                    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                        {/* Preview Area */}
                        <div style={{ flex: 1, padding: '2rem', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ position: 'relative', width: '100%', maxWidth: reviewTabForDraft === 'stories' || reviewTabForDraft === 'reels' ? '270px' : '320px', aspectRatio, background: '#000', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid #27272a' }}>
                                    {isHtmlDraft ? (
                                        <>
                                            <iframe
                                                key={htmlModalSlideIdx}
                                                srcDoc={htmlModalSlides[htmlModalSlideIdx] || cleanHtmlCarousel(confirmingDraft.htmlContent || '')}
                                                style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
                                                sandbox="allow-same-origin allow-scripts"
                                                title={`HTML Carousel Slide ${htmlModalSlideIdx + 1}`}
                                            />
                                            {htmlModalSlideTotal > 1 && (
                                                <>
                                                    <span style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '999px', zIndex: 10 }}>
                                                        {htmlModalSlideIdx + 1} / {htmlModalSlideTotal}
                                                    </span>
                                                    <button
                                                        onClick={() => setSlideIndex(prev => ({ ...prev, [confirmingDraft.id]: Math.max(0, htmlModalSlideIdx - 1) }))}
                                                        disabled={htmlModalSlideIdx === 0}
                                                        style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: htmlModalSlideIdx === 0 ? 'default' : 'pointer', opacity: htmlModalSlideIdx === 0 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                                    >‹</button>
                                                    <button
                                                        onClick={() => setSlideIndex(prev => ({ ...prev, [confirmingDraft.id]: Math.min(htmlModalSlideTotal - 1, htmlModalSlideIdx + 1) }))}
                                                        disabled={htmlModalSlideIdx === htmlModalSlideTotal - 1}
                                                        style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: htmlModalSlideIdx === htmlModalSlideTotal - 1 ? 'default' : 'pointer', opacity: htmlModalSlideIdx === htmlModalSlideTotal - 1 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                                    >›</button>
                                                    <div style={{ position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.3rem', zIndex: 10 }}>
                                                        {htmlModalSlides.map((_, di) => (
                                                            <div key={di} onClick={() => setSlideIndex(prev => ({ ...prev, [confirmingDraft.id]: di }))} style={{ width: di === htmlModalSlideIdx ? '14px' : '4px', height: '4px', borderRadius: di === htmlModalSlideIdx ? '2px' : '50%', background: di === htmlModalSlideIdx ? '#fff' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s' }} />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    ) : reviewTabForDraft === 'reels' && isLikelyVideoUrl(confirmingDraft.videoUrl || confirmingDraft.mediaUrls[0]) ? (
                                        <video src={confirmingDraft.videoUrl || confirmingDraft.mediaUrls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls muted playsInline />
                                    ) : (
                                        <img src={previewMedia} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                                    )}
                                    {renderPremiumOverlay && (
                                        <div style={{ position: 'absolute', inset: 0 }}>
                                            <PremiumPostPreview
                                                layout={buildPremiumLayoutFromDraft(confirmingDraft, modalSlideIdx)}
                                                backgroundImage={confirmingDraft.mediaUrls[modalSlideIdx]}
                                            />
                                        </div>
                                    )}
                                    {/* Carousel navigation arrows for premium carousels */}
                                    {renderPremiumOverlay && modalSlideTotal > 1 && (
                                        <>
                                            <span style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '999px', zIndex: 10 }}>
                                                {modalSlideIdx + 1} / {modalSlideTotal}
                                            </span>
                                            <button
                                                onClick={() => setSlideIndex(prev => ({ ...prev, [confirmingDraft.id]: Math.max(0, (prev[confirmingDraft.id] || 0) - 1) }))}
                                                disabled={modalSlideIdx === 0}
                                                style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: modalSlideIdx === 0 ? 'default' : 'pointer', opacity: modalSlideIdx === 0 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                            >‹</button>
                                            <button
                                                onClick={() => setSlideIndex(prev => ({ ...prev, [confirmingDraft.id]: Math.min(modalSlideTotal - 1, (prev[confirmingDraft.id] || 0) + 1) }))}
                                                disabled={modalSlideIdx === modalSlideTotal - 1}
                                                style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: modalSlideIdx === modalSlideTotal - 1 ? 'default' : 'pointer', opacity: modalSlideIdx === modalSlideTotal - 1 ? 0.3 : 1, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                            >›</button>
                                            <div style={{ position: 'absolute', bottom: '0.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.3rem', zIndex: 10 }}>
                                                {confirmingDraft.mediaUrls.map((_, di) => (
                                                    <div key={di} onClick={() => setSlideIndex(prev => ({ ...prev, [confirmingDraft.id]: di }))} style={{ width: di === modalSlideIdx ? '14px' : '4px', height: '4px', borderRadius: di === modalSlideIdx ? '2px' : '50%', background: di === modalSlideIdx ? '#fff' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s' }} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                {/* Slide count badge below preview */}
                                {isHtmlDraft && htmlModalSlideTotal > 1 && (
                                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                                        🖼️ {htmlModalSlideTotal} slides HTML — navegue para revisar cada um
                                    </span>
                                )}
                                {renderPremiumOverlay && modalSlideTotal > 1 && (
                                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                                        ✨ {modalSlideTotal} slides — navegue para revisar cada um
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Confirmation Details */}
                        <div style={{ width: '360px', padding: '1.5rem', borderLeft: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#fff' }}>Próximos Passos:</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {[
                                        { icon: '🎨', text: isHtmlDraft ? 'Renderizar slides, converter para JPG e aprovar' : 'Aplicar overlays e validar o preview final' },
                                        { icon: '📚', text: 'Salvar na Library do Perfil de Negócio' },
                                        { icon: '🏷️', text: `Transição de estado: ${getReviewStateLabel(confirmingDraft.reviewState)} → Aprovado` },
                                    ].map((item, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.85rem', color: '#a1a1aa' }}>
                                            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                            <span>{item.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#60a5fa', background: 'rgba(96,165,250,0.08)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(96,165,250,0.2)', lineHeight: 1.4 }}>
                                    Escolha se este conteúdo deve seguir para agendamento ou se deve apenas entrar na Library.
                                </div>
                                {getDraftFormat(confirmingDraft) === 'carousel-premium' && (
                                    <>
                                        <button
                                            onClick={() => handleRegenerateSlide(confirmingDraft.id, modalSlideIdx)}
                                            disabled={isLoading}
                                            className="btn btn-secondary"
                                            style={{ padding: '0.85rem', fontWeight: 600, color: '#fb923c', borderColor: 'rgba(251,146,60,0.3)', background: 'rgba(251,146,60,0.05)' }}
                                            title="Utilizar IA para gerar uma nova imagem apenas para o slide atual"
                                        >
                                            🔄 Regerar imagem {modalSlideIdx + 1} com IA
                                        </button>
                                        <button
                                            onClick={() => handleOpenPremiumEditor(confirmingDraft)}
                                            disabled={isLoading}
                                            className="btn btn-secondary"
                                            style={{ padding: '0.85rem', fontWeight: 600 }}
                                        >
                                            ✏️ Editar layout premium
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => handleApprove(confirmingDraft.id, 'schedule')}
                                    disabled={isLoading}
                                    className="btn btn-primary"
                                    style={{ padding: '0.85rem', fontWeight: 600, fontSize: '0.95rem' }}
                                >
                                    {isLoading ? '⏳ Processando...' : '🚀 Agendar agora'}
                                </button>
                                <button
                                    onClick={() => handleApprove(confirmingDraft.id, 'library')}
                                    disabled={isLoading}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.85rem', fontWeight: 600, fontSize: '0.95rem' }}
                                >
                                    {isLoading ? '⏳ Processando...' : '📚 Enviar só para Library'}
                                </button>
                                <button
                                    onClick={() => setConfirmingDraft(null)}
                                    disabled={isLoading}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.85rem' }}
                                >
                                    Voltar para revisão
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderApprovalSelectionModal = () => {
        if (!approvalSelection) return null;
        const isLoading = approvalSelection.ids.some(id => actioning[id]);

        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1090, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ width: '100%', maxWidth: '520px', background: '#111113', border: '1px solid #27272a', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <h3 style={{ margin: '0 0 0.35rem', color: '#fff' }}>Aprovar {approvalSelection.destinationLabel}</h3>
                        <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.9rem', lineHeight: 1.5 }}>
                            {approvalSelection.ids.length} conteúdo(s) selecionado(s). Escolha o destino após a aprovação.
                        </p>
                    </div>
                    <div style={{ padding: '0.85rem 1rem', borderRadius: '0.75rem', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#bfdbfe', fontSize: '0.85rem', lineHeight: 1.5 }}>
                        `Agendar agora` mantém o fluxo operacional do post. `Enviar só para Library` aprova e arquiva o conteúdo apenas na biblioteca.
                    </div>
                    <button
                        onClick={() => approveDraftIds(approvalSelection.ids, 'schedule')}
                        disabled={isLoading}
                        className="btn btn-primary"
                        style={{ padding: '0.9rem', fontWeight: 600 }}
                    >
                        {isLoading ? '⏳ Processando...' : '🚀 Agendar agora'}
                    </button>
                    <button
                        onClick={() => approveDraftIds(approvalSelection.ids, 'library')}
                        disabled={isLoading}
                        className="btn btn-secondary"
                        style={{ padding: '0.9rem', fontWeight: 600 }}
                    >
                        {isLoading ? '⏳ Processando...' : '📚 Enviar só para Library'}
                    </button>
                    <button
                        onClick={() => setApprovalSelection(null)}
                        disabled={isLoading}
                        className="btn btn-secondary"
                        style={{ padding: '0.9rem' }}
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    };

    // ---------------------------------------------------------------------------
    // Main render
    // ---------------------------------------------------------------------------
    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container" style={{ maxWidth: '1200px' }}>
                <BackButton />

                {/* Page header + step indicator */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ margin: '0 0 1rem' }}>Content Autopilot</h1>
                    <div style={{ display: 'flex', gap: '0', background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem', overflow: 'hidden', width: 'fit-content' }}>
                        {([
                            { key: 'plan', label: '1. Planejar', icon: '🗓️' },
                            { key: 'approve', label: '2. Aprovar', icon: '🔍' },
                            { key: 'generating', label: '3. Gerar', icon: '🤖' },
                            { key: 'review', label: '4. Revisar', icon: '✅' },
                        ] as { key: Step; label: string; icon: string }[]).map((s) => {
                            const stepOrder: Step[] = ['plan', 'approve', 'generating', 'review'];
                            const currentIdx = stepOrder.indexOf(step);
                            const thisIdx = stepOrder.indexOf(s.key);
                            const isActive = step === s.key;
                            const isDone = thisIdx < currentIdx;
                            const canJumpToApprove = s.key === 'approve' && step === 'plan' && canAdvanceToApprove;
                            const isClickable = (isDone || canJumpToApprove) && step !== 'generating';
                            const textColor = isActive
                                ? '#fff'
                                : isDone
                                    ? '#a1a1aa'
                                    : canJumpToApprove
                                        ? '#d4d4d8'
                                        : '#52525b';
                            const background = isActive
                                ? 'linear-gradient(135deg,#7c3aed,#a78bfa)'
                                : canJumpToApprove
                                    ? 'rgba(124,58,237,0.08)'
                                    : 'transparent';
                            return (
                                <div
                                    key={s.key}
                                    style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: isActive ? 600 : 400, color: textColor, background, borderRight: '1px solid #27272a', cursor: isClickable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                    onClick={() => isClickable ? setStep(s.key) : undefined}
                                >
                                    <span>{s.icon}</span>
                                    <span>{s.label}</span>
                                    {isDone && <span style={{ fontSize: '0.65rem', color: '#22c55e' }}>✓</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Current step content */}
                {step === 'plan' && renderPlanStep()}
                {step === 'approve' && renderApproveStep()}
                {step === 'generating' && renderGeneratingStep()}
                {step === 'review' && renderReviewStep()}

                {/* Pending drafts banner (when on plan/approve step and there are drafts) */}
                {(step === 'plan' || step === 'approve') && !loadingDrafts && drafts.length > 0 && (
                    <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#d8b4fe' }}>
                            📋 {drafts.length} rascunho{drafts.length !== 1 ? 's' : ''} aguardando sua revisão
                        </p>
                        <button onClick={() => setStep('review')} className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.4rem 1rem' }}>
                            Ver rascunhos →
                        </button>
                    </div>
                )}
            </div>

            {selectedDraftForPrompt && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '1rem', width: '100%', maxWidth: '600px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Prompt de Geração</h3>
                            <button onClick={() => setSelectedDraftForPrompt(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#a1a1aa' }}>
                            Abaixo está a instrução utilizada pela IA. Você pode alterá-la para ajustar o estilo ou conteúdo e regerar o post.
                        </p>
                        <textarea
                            value={promptText}
                            onChange={e => setPromptText(e.target.value)}
                            rows={10}
                            style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', borderRadius: '0.5rem', color: '#e4e4e7', padding: '1rem', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.5, boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => setSelectedDraftForPrompt(null)}
                                className="btn btn-secondary"
                                style={{ flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRegenerate}
                                disabled={regenerating || !promptText}
                                className="btn btn-primary"
                                style={{ flex: 2 }}
                            >
                                {regenerating ? '⏳ Regerando...' : '🤖 Regerar Post'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <PremiumEditorModal
                isOpen={Boolean(premiumEditorDraft && premiumEditorLayout)}
                layout={premiumEditorLayout}
                backgroundImage={premiumEditorDraft && premiumEditorLayout
                    ? (
                        // Use sourceMediaUrls (raw photo before baking) when available,
                        // so the editor shows the original background image — not the
                        // already-composited version that has the template baked in.
                        Array.isArray(premiumEditorDraft.sourceMediaUrls) && premiumEditorDraft.sourceMediaUrls.length > 0
                            ? (premiumEditorDraft.sourceMediaUrls[Number(premiumEditorLayout.slideIndex || 0)] || premiumEditorDraft.sourceMediaUrls[0])
                            : premiumEditorDraft.mediaUrls[Number(premiumEditorLayout.slideIndex || 0)]
                    )
                    : undefined}
                onClose={() => {
                    if (savingPremiumLayout) return;
                    setPremiumEditorDraft(null);
                    setPremiumEditorLayout(null);
                }}
                onChange={handlePremiumEditorChange}
                onAction={handleSavePremiumEditor}
                actionLabel={savingPremiumLayout ? 'Salvando...' : 'Salvar no rascunho'}
                allowBackgroundUpload={false}
                actionDisabled={savingPremiumLayout}
                slideLabel={premiumEditorLayout
                    ? `Slide ${Number(premiumEditorLayout.slideIndex || 0) + 1} de ${Math.max(1, Number(premiumEditorLayout.slideCount || 1))}`
                    : undefined}
                onPreviousSlide={() => {
                    if (!premiumEditorDraft || !premiumEditorLayout) return;
                    const nextIndex = Math.max(0, Number(premiumEditorLayout.slideIndex || 0) - 1);
                    setPremiumEditorLayout(buildPremiumLayoutFromDraft(premiumEditorDraft, nextIndex));
                }}
                onNextSlide={() => {
                    if (!premiumEditorDraft || !premiumEditorLayout) return;
                    const totalSlides = Math.max(1, Number(premiumEditorLayout.slideCount || premiumEditorDraft.mediaUrls?.length || 1));
                    const nextIndex = Math.min(totalSlides - 1, Number(premiumEditorLayout.slideIndex || 0) + 1);
                    setPremiumEditorLayout(buildPremiumLayoutFromDraft(premiumEditorDraft, nextIndex));
                }}
                canGoPrevious={Boolean(premiumEditorLayout && Number(premiumEditorLayout.slideIndex || 0) > 0)}
                canGoNext={Boolean(
                    premiumEditorLayout
                    && Number(premiumEditorLayout.slideIndex || 0) < Math.max(0, Number(premiumEditorLayout.slideCount || 1) - 1)
                )}
                apiBaseUrl={api.defaults.baseURL || 'http://localhost:3001'}
            />
            {renderApprovalSelectionModal()}
            {renderConfirmModal()}
            {renderRejectModal()}
        </div>
    );
}
