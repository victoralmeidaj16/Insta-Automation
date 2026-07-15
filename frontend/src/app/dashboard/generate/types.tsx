export interface PremiumLayout {
    brandName: string;
    title: string;
    highlightText: string;
    description: string;
    descriptionEnabled: boolean;
    descriptionColor: string;
    primaryColor: string;
    logoIcon: string;
    logoUrl?: string;
    backgroundImage?: string;
    imageOffsetX?: number;
    imageOffsetY?: number;
    imageScale?: number;
    gradientOpacity?: number;
    slideIndex?: number;
    slideCount?: number;
    hideOverlay?: boolean;
}

export interface CarouselCard {
    concept?: string;
    prompt: string;
    backgroundPrompt?: string;
    image?: string;
    premiumBaseImage?: string;
    premiumOverlayApplied?: boolean;
    isGeneratingImage: boolean;
    isGeneratingPrompt?: boolean;
    premiumLayout?: PremiumLayout;
}

export interface PostIdea {
    title: string;
    description: string;
    type: 'carousel' | 'static';
    slideCount: number;
    reason: string;
}

export interface Variation {
    headline: string;
    visualConcept: string;
    captionDraft: string;
}
