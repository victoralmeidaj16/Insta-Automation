import React from 'react';

interface IdeaMiniCardProps {
    title: string;
    reason: string;
    onSelect: () => void;
}

export default function IdeaMiniCard({ title, reason, onSelect }: IdeaMiniCardProps) {
    return (
        <div
            onClick={onSelect}
            style={{
                background: 'rgba(39, 39, 42, 0.6)',
                border: '1px solid #3f3f46',
                borderRadius: '0.75rem',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                minWidth: '200px',
                flex: 1
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#10b981';
                e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#3f3f46';
                e.currentTarget.style.background = 'rgba(39, 39, 42, 0.6)';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{title}</h4>
                <span style={{ fontSize: '1.2rem' }}>✨</span>
            </div>
            <div style={{ margin: 0, fontSize: '0.75rem', color: '#a1a1aa' }}>
                {formatIdeaContent(reason)}
            </div>
        </div>
    );
}

function formatIdeaContent(content: string) {
    if (!content) return null;

    // Keys to look for
    const keys = [
        'TEMA / CONTEÚDO:',
        'HEADLINE:',
        'SUBHEADLINE:',
        'FRASE DE PRODUTO:',
        'FRASE IDENTITÁRIA:',
        'CTA:',
        'DESCRIÇÃO DA IMAGEM:',
        'VISUAL STYLE:',
        'DESCRIÇÃO:'
    ];

    // Split content by preserving delimiters
    // We'll replace keys with a special marker to split easily
    let formattedHtml = content;

    // Safety check just in case
    if (typeof content !== 'string') return content;

    // Simple approach: split by newline first if available, 
    // but the issue is they are "tudo junto" (all together).
    // So we assume they might be stuck mainly by the uppercase Key.

    // We return an array of elements
    return content.split(/(?=(?:TEMA \/ CONTEÚDO:|HEADLINE:|SUBHEADLINE:|FRASE DE PRODUTO:|FRASE IDENTITÁRIA:|CTA:|DESCRIÇÃO DA IMAGEM:|VISUAL STYLE:|DESCRIÇÃO:))/g)
        .map((part, index) => {
            const matchedKey = keys.find(k => part.trim().startsWith(k));
            if (matchedKey) {
                const value = part.replace(matchedKey, '').trim();
                return (
                    <div key={index} style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ color: '#e4e4e7', display: 'block' }}>{matchedKey}</strong>
                        <span>{value}</span>
                    </div>
                );
            }
            // If no key match (e.g. valid start text), just return it
            if (!part.trim()) return null;
            return <p key={index} style={{ margin: 0, marginBottom: '0.5rem' }}>{part}</p>;
        });
}
