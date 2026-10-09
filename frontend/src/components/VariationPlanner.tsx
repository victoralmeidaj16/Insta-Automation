import React from 'react';

interface Variation {
    headline: string;
    visualConcept: string;
    captionDraft: string;
}

interface VariationPlannerProps {
    variations: Variation[];
    onUpdateVariation: (index: number, field: keyof Variation, value: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    onCancel: () => void;
}

export default function VariationPlanner({ variations, onUpdateVariation, onGenerate, isGenerating, onCancel }: VariationPlannerProps) {
    return (
        <div style={{ background: '#25292F', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(245, 245, 245, 0.08)', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#F5F5F5' }}>🎨 Planejamento de Variações</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={onCancel} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'transparent', border: '1px solid rgba(245, 245, 245, 0.14)', color: '#F5F5F5', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button
                        onClick={onGenerate}
                        disabled={isGenerating}
                        style={{
                            padding: '0.5rem 1.5rem',
                            borderRadius: '0.5rem',
                            background: '#10b981',
                            border: 'none',
                            color: '#F5F5F5',
                            fontWeight: 600,
                            cursor: isGenerating ? 'not-allowed' : 'pointer',
                            opacity: isGenerating ? 0.7 : 1
                        }}
                    >
                        {isGenerating ? 'Gerando Imagens...' : `Gerar ${variations.length} Imagens`}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {variations.map((v, i) => (
                    <div key={i} style={{ background: '#25292F', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(245, 245, 245, 0.14)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>Variação {i + 1}</span>
                        </div>

                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'rgba(245, 245, 245, 0.55)', marginBottom: '0.25rem' }}>MANCHETE (HEADLINE)</label>
                                <input
                                    type="text"
                                    value={v.headline}
                                    onChange={(e) => onUpdateVariation(i, 'headline', e.target.value)}
                                    style={{ width: '100%', background: '#25292F', border: '1px solid rgba(245, 245, 245, 0.14)', padding: '0.5rem', borderRadius: '0.25rem', color: '#F5F5F5', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'rgba(245, 245, 245, 0.55)', marginBottom: '0.25rem' }}>CONCEITO VISUAL (PROMPT BASE)</label>
                                <textarea
                                    value={v.visualConcept}
                                    onChange={(e) => onUpdateVariation(i, 'visualConcept', e.target.value)}
                                    rows={3}
                                    style={{ width: '100%', background: '#25292F', border: '1px solid rgba(245, 245, 245, 0.14)', padding: '0.5rem', borderRadius: '0.25rem', color: '#F5F5F5', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
