import { describe, expect, it } from 'vitest';
import {
    assertLibraryItemAccepted,
    isVideoLibraryItem,
    LIBRARY_VIDEO_REJECTION_MESSAGE
} from '../src/domain/formatRules.js';

describe('Library media rules', () => {
    it.each(['video', 'reel', 'carousel-html-video'])('rejects the %s format', (format) => {
        expect(isVideoLibraryItem({ format })).toBe(true);
        expect(() => assertLibraryItemAccepted({ format })).toThrow(LIBRARY_VIDEO_REJECTION_MESSAGE);
    });

    it('rejects legacy reel drafts by content family or videoUrl', () => {
        expect(isVideoLibraryItem({ type: 'static', contentFamily: 'reel' })).toBe(true);
        expect(isVideoLibraryItem({ type: 'static', videoUrl: 'https://cdn.example.com/legacy.mp4' })).toBe(true);
        expect(isVideoLibraryItem({ format: 'legacy', type: 'REEL' })).toBe(true);
    });

    it('rejects video media URLs even when query strings or fragments are present', () => {
        expect(isVideoLibraryItem({
            type: 'static',
            mediaUrls: ['https://cdn.example.com/media.MOV?token=abc#preview']
        })).toBe(true);
    });

    it('accepts image and HTML Library items', () => {
        expect(() => assertLibraryItemAccepted({
            format: 'static',
            mediaUrls: ['https://cdn.example.com/image.webp']
        })).not.toThrow();
        expect(() => assertLibraryItemAccepted({ format: 'carousel-html', htmlCode: '<main />' })).not.toThrow();
    });

    it('exposes a 400 status for service and route error handling', () => {
        try {
            assertLibraryItemAccepted({ format: 'reel' });
            throw new Error('Expected validation to fail');
        } catch (error) {
            expect(error.statusCode).toBe(400);
        }
    });
});
