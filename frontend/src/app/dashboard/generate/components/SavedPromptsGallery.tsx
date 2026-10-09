import React from 'react';
import toast from 'react-hot-toast';

interface SavedPromptsGalleryProps {
    selectedProfile: any;
    similarPromptBase: string;
    setSimilarPromptBase: (v: string) => void;
    handleSavePromptToProfile: (p: string) => Promise<void>;
    handleGenerateFromSavedPrompt: (p: string) => void;
    handleGenerateCoverForSavedPrompt: (e: React.MouseEvent, p: any) => void;
    generatingCoverFor: string | null;
}

export const SavedPromptsGallery: React.FC<SavedPromptsGalleryProps> = ({
    selectedProfile,
    similarPromptBase,
    setSimilarPromptBase,
    handleSavePromptToProfile,
    handleGenerateFromSavedPrompt,
    handleGenerateCoverForSavedPrompt,
    generatingCoverFor
}) => {
    return (
        <div style={{ 
            marginBottom: '2rem', 
            padding: '1.25rem', 
            background: '#25292F', 
            borderRadius: '1rem', 
            border: '1px solid #25292F',
            boxShadow: 'none'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#F5F5F5', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                    🔖 Galeria de Prompts da Marca
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'rgba(245, 245, 245, 0.55)', margin: 0 }}>Salve ou use modelos de base para agilizar</p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <input
                    type="text"
                    value={similarPromptBase}
                    onChange={(e) => setSimilarPromptBase(e.target.value)}
                    placeholder="Cole um prompt de referência para salvar..."
                    className="input"
                    style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(245, 245, 245, 0.08)',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.75rem',
                        fontSize: '0.875rem',
                        color: '#F5F5F5',
                        transition: 'border-color 0.2s'
                    }}
                />
                <button
                    onClick={() => {
                        handleSavePromptToProfile(similarPromptBase).then(() => setSimilarPromptBase(''));
                    }}
                    disabled={!similarPromptBase}
                    className="btn hover-lift"
                    style={{
                        padding: '0.5rem 1.25rem',
                        background: !similarPromptBase ? '#25292F' : '#F5F5F5',
                        color: !similarPromptBase ? '#F5F5F5' : '#0C1014',
                        border: 'none',
                        borderRadius: '0.75rem',
                        cursor: !similarPromptBase ? 'not-allowed' : 'pointer',
                        opacity: !similarPromptBase ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                    }}
                >
                    💾 Salvar Prompt
                </button>
            </div>

            {selectedProfile?.aiPreferences?.favoritePrompts && selectedProfile.aiPreferences.favoritePrompts.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                    <p style={{ fontSize: '0.8rem', color: 'rgba(245, 245, 245, 0.7)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📚 Clique para usar como base:
                    </p>
                    <div style={{ 
                        display: 'flex', 
                        gap: '1rem', 
                        overflowX: 'auto', 
                        paddingBottom: '1rem', 
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                    }}>
                        {selectedProfile.aiPreferences.favoritePrompts.map((savedPrompt: any) => (
                            <div
                                key={savedPrompt.id}
                                onClick={() => handleGenerateFromSavedPrompt(savedPrompt.text)}
                                className="hover-lift"
                                style={{
                                    position: 'relative',
                                    background: '#25292F',
                                    borderRadius: '1rem',
                                    width: '180px',
                                    height: '240px',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    border: '1px solid rgba(245, 245, 245, 0.08)',
                                    overflow: 'hidden',
                                    boxShadow: 'none',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                            >
                                <div
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        background: savedPrompt.imageUrl
                                            ? `url(${savedPrompt.imageUrl}) center center / cover no-repeat`
                                            : 'rgba(245, 245, 245, 0.06)',
                                        opacity: savedPrompt.imageUrl ? 0.7 : 1,
                                    }}
                                />
                                <div style={{ 
                                    position: 'absolute', 
                                    bottom: 0, 
                                    left: 0, 
                                    right: 0, 
                                    padding: '1rem', 
                                    background: 'rgba(12, 16, 20, 0.78)', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    justifyContent: 'flex-end', 
                                    height: '100%', 
                                    pointerEvents: 'none' 
                                }}>
                                    <strong style={{ 
                                        fontSize: '0.85rem', 
                                        display: 'block', 
                                        color: '#F5F5F5', 
                                        marginBottom: '0.25rem', 
                                        whiteSpace: 'nowrap', 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis',
                                        textShadow: 'none'
                                    }}>
                                        {savedPrompt.name}
                                    </strong>
                                </div>
                                {!savedPrompt.imageUrl && savedPrompt.name !== 'Carrossel Fitswap' && (
                                    <button
                                        onClick={(e) => handleGenerateCoverForSavedPrompt(e, savedPrompt)}
                                        disabled={generatingCoverFor === savedPrompt.id}
                                        style={{
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            background: 'rgba(59, 130, 246, 0.95)',
                                            color: '#F5F5F5',
                                            border: 'none',
                                            borderRadius: '999px',
                                            padding: '0.6rem 1rem',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: generatingCoverFor === savedPrompt.id ? 'wait' : 'pointer',
                                            zIndex: 10,
                                            whiteSpace: 'nowrap',
                                            opacity: generatingCoverFor === savedPrompt.id ? 0.7 : 1,
                                            boxShadow: 'none'
                                        }}
                                    >
                                        {generatingCoverFor === savedPrompt.id ? '⏳ Gerando...' : '🎨 Gerar Capa'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
