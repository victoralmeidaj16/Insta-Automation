'use client';

import { useEffect } from 'react';

interface ImageLightboxProps {
    images: string[];
    currentIndex: number;
    onClose: () => void;
    onNavigate: (index: number) => void;
    onDownload: (url: string, index: number) => void;
}

export default function ImageLightbox({ images, currentIndex, onClose, onNavigate, onDownload }: ImageLightboxProps) {
    const currentImage = images[currentIndex];

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
            if (e.key === 'ArrowRight' && currentIndex < images.length - 1) onNavigate(currentIndex + 1);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, images.length, onClose, onNavigate]);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.95)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem'
            }}
            onClick={onClose}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    zIndex: 2001
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
                ×
            </button>

            {/* Download button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDownload(currentImage, currentIndex);
                }}
                style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '4rem',
                    background: 'rgba(124, 58, 237, 0.8)',
                    border: '1px solid rgba(124, 58, 237, 1)',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                    zIndex: 2001
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124, 58, 237, 1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(124, 58, 237, 0.8)'}
            >
                ⬇️ Download
            </button>

            {/* Counter */}
            {images.length > 1 && (
                <div
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: '#fff',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        zIndex: 2001
                    }}
                >
                    {currentIndex + 1} / {images.length}
                </div>
            )}

            {/* Previous button */}
            {currentIndex > 0 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(currentIndex - 1);
                    }}
                    style={{
                        position: 'absolute',
                        left: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#fff',
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        zIndex: 2001
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                >
                    ‹
                </button>
            )}

            {/* Next button */}
            {currentIndex < images.length - 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(currentIndex + 1);
                    }}
                    style={{
                        position: 'absolute',
                        right: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#fff',
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        zIndex: 2001
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                >
                    ›
                </button>
            )}

            {/* Image */}
            <img
                src={currentImage}
                alt={`Preview ${currentIndex + 1}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '90%',
                    maxHeight: '90%',
                    objectFit: 'contain',
                    borderRadius: '0.5rem',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
                }}
            />

            {/* Thumbnail strip for multiple images */}
            {images.length > 1 && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '1rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '0.5rem',
                        background: 'rgba(0, 0, 0, 0.7)',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        maxWidth: '90%',
                        overflowX: 'auto',
                        zIndex: 2001
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {images.map((img, idx) => (
                        <img
                            key={idx}
                            src={img}
                            alt={`Thumbnail ${idx + 1}`}
                            onClick={() => onNavigate(idx)}
                            style={{
                                width: '60px',
                                height: '60px',
                                objectFit: 'cover',
                                borderRadius: '0.375rem',
                                cursor: 'pointer',
                                border: idx === currentIndex ? '2px solid #7c3aed' : '2px solid transparent',
                                opacity: idx === currentIndex ? 1 : 0.6,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => {
                                if (idx !== currentIndex) e.currentTarget.style.opacity = '0.6';
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
