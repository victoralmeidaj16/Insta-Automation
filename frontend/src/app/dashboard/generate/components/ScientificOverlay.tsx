import React from 'react';

// Helper to parse the structured scientific prompt
export const parseScientificPrompt = (fullPrompt: string) => {
    try {
        const bgMatch = fullPrompt.match(/\[BACKGROUND:\s*(.*?)\]/i);
        const hlMatch = fullPrompt.match(/\[HEADLINE:\s*(.*?)\]/i);
        const subMatch = fullPrompt.match(/\[SUBHEADLINE:\s*(.*?)\]/i);
        const hgMatch = fullPrompt.match(/\[HIGHLIGHTS:\s*(.*?)\]/i);

        return {
            background: bgMatch ? bgMatch[1].trim() : fullPrompt,
            headline: hlMatch ? hlMatch[1].trim() : '',
            subheadline: subMatch ? subMatch[1].trim() : '',
            highlights: hgMatch ? hgMatch[1].trim().split(',').map((s: string) => s.trim().toUpperCase()) : []
        };
    } catch (e) {
        return { background: fullPrompt, headline: '', subheadline: '', highlights: [] };
    }
};

// Component to render the Scientific Overlay
export const ScientificOverlay = ({ 
    prompt, 
    logoUrl, 
    brandName, 
    primaryColor = '#A6F000' 
}: { 
    prompt: string, 
    logoUrl?: string, 
    brandName?: string,
    primaryColor?: string
}) => {
    const { headline, subheadline, highlights } = parseScientificPrompt(prompt);
    
    if (!headline) return null;

    // Helper to render text with highlights
    const renderHeadline = () => {
        let text = headline;
        let parts = [text];
        
        highlights.forEach((h: string) => {
            if (!h) return;
            const newParts: string[] = [];
            parts.forEach((p: string) => {
                const regex = new RegExp(`(${h})`, 'gi');
                const split = p.split(regex);
                newParts.push(...split);
            });
            parts = newParts;
        });

        return parts.map((part, i) => {
            const isHighlight = highlights.some((h: string) => h && part.toUpperCase() === h.toUpperCase());
            return (
                <span 
                    key={i} 
                    style={{ 
                        color: isHighlight ? primaryColor : '#ffffff',
                        textShadow: isHighlight ? '0 2px 15px rgba(0,0,0,0.45)' : 'none'
                    }}
                >
                    {part}
                </span>
            );
        });
    };

    return (
        <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '45%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0) 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '60px 8%',
            pointerEvents: 'none',
            fontFamily: 'Inter, -apple-system, sans-serif',
            zIndex: 10
        }}>
            {/* Logo Section */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '1px',
                marginBottom: '40px',
                width: '100%',
                justifyContent: 'center'
            }}>
                <div style={{ width: '120px', height: '2px', background: 'white', opacity: 0.4 }} />
                {logoUrl ? (
                    <img src={logoUrl} alt="Logo" style={{ height: '24px', objectFit: 'contain' }} />
                ) : (
                    <span style={{ fontSize: '18px', textTransform: 'uppercase' }}>{brandName || 'FitSwap'}</span>
                )}
                <div style={{ width: '120px', height: '2px', background: 'white', opacity: 0.4 }} />
            </div>

            {/* Content Section */}
            <div style={{
                maxWidth: '600px',
                textAlign: 'center'
            }}>
                <div style={{
                    fontSize: '48px',
                    fontWeight: 900,
                    lineHeight: '1.1',
                    color: 'white',
                    textTransform: 'uppercase',
                    marginBottom: '18px'
                }}>
                    {renderHeadline()}
                </div>
                {subheadline && (
                    <div style={{
                        fontSize: '20px',
                        color: '#d1d5db',
                        fontWeight: 500
                    }}>
                        {subheadline}
                    </div>
                )}
            </div>
        </div>
    );
};

