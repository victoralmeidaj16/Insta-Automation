import React from 'react';
import { PostIdea } from '../types';

interface PostIdeasModalProps {
    showIdeasModal: boolean;
    setShowIdeasModal: (v: boolean) => void;
    selectedProfile: any;
    ideas: PostIdea[];
    handleSelectIdea: (idea: PostIdea) => void;
}

export const PostIdeasModal: React.FC<PostIdeasModalProps> = ({
    showIdeasModal,
    setShowIdeasModal,
    selectedProfile,
    ideas,
    handleSelectIdea
}) => {
    if (!showIdeasModal) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
        }} onClick={() => setShowIdeasModal(false)}>
            <div style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '1rem',
                padding: '2rem',
                maxWidth: '900px',
                width: '100%',
                maxHeight: '85vh',
                overflow: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #27272a', paddingBottom: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                            ✨ Brainstorm de Ideias
                        </h2>
                        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            Sugestões baseadas no perfil <b>{selectedProfile?.name}</b>
                        </p>
                    </div>
                    <button
                        onClick={() => setShowIdeasModal(false)}
                        style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.5rem' }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                    {ideas.map((idea, index) => (
                        <div key={index} onClick={() => handleSelectIdea(idea)} style={{
                            background: '#09090b',
                            border: '1px solid #27272a',
                            borderRadius: '0.75rem',
                            padding: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem',
                            transition: 'transform 0.2s, border-color 0.2s',
                            cursor: 'pointer'
                        }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#7c3aed';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#27272a';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{
                                    background: idea.type === 'carousel' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    color: idea.type === 'carousel' ? '#a78bfa' : '#34d399',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '999px',
                                }}>
                                    {idea.type === 'carousel' ? `🎠 Carrossel (${idea.slideCount})` : '📸 Post Único'}
                                </div>
                            </div>

                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem', lineHeight: '1.3' }}>
                                    {idea.title}
                                </h3>
                                <p style={{ fontSize: '0.875rem', color: '#d4d4d8', lineHeight: '1.5' }}>
                                    {idea.description.split(/(\*\*.*?\*\*)/).map((part, i) =>
                                        part.startsWith('**') && part.endsWith('**')
                                            ? <strong key={i} style={{ color: '#fff' }}>{part.slice(2, -2)}</strong>
                                            : part
                                    )}
                                </p>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: '#71717a', fontStyle: 'italic', borderTop: '1px solid #27272a', paddingTop: '1rem', marginTop: 'auto' }}>
                                💡 {idea.reason}
                            </div>

                            <button
                                onClick={() => handleSelectIdea(idea)}
                                className="btn"
                                style={{
                                    width: '100%',
                                    marginTop: '1rem',
                                    padding: '0.75rem',
                                    background: '#7c3aed',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    color: '#fff',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Usar essa Ideia
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
