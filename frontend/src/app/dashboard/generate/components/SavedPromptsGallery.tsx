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
            background: 'rgba(24, 24, 27, 0.6)', 
            borderRadius: '1rem', 
            border: '1px solid rgba(63, 63, 70, 0.6)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                    🔖 Galeria de Prompts da Marca
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#71717a', margin: 0 }}>Salve ou use modelos de base para agilizar</p>
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
                        border: '1px solid #27272a',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.75rem',
                        fontSize: '0.875rem',
                        color: '#fff',
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
                        background: !similarPromptBase ? '#18181b' : '#3b82f6',
                        color: '#fff',
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
                    <p style={{ fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                                    background: '#18181b',
                                    borderRadius: '1rem',
                                    width: '180px',
                                    height: '240px',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    border: '1px solid #27272a',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                            >
                                <div
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        background: savedPrompt.imageUrl
                                            ? `url(${savedPrompt.imageUrl}) center center / cover no-repeat`
                                            : 'linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(167, 139, 250, 0.1) 100%)',
                                        opacity: savedPrompt.imageUrl ? 0.7 : 1,
                                    }}
                                />
                                <div style={{ 
                                    position: 'absolute', 
                                    bottom: 0, 
                                    left: 0, 
                                    right: 0, 
                                    padding: '1rem', 
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    justifyContent: 'flex-end', 
                                    height: '100%', 
                                    pointerEvents: 'none' 
                                }}>
                                    <strong style={{ 
                                        fontSize: '0.85rem', 
                                        display: 'block', 
                                        color: '#fff', 
                                        marginBottom: '0.25rem', 
                                        whiteSpace: 'nowrap', 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis',
                                        textShadow: '0 1px 3px rgba(0,0,0,0.8)'
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
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '999px',
                                            padding: '0.6rem 1rem',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: generatingCoverFor === savedPrompt.id ? 'wait' : 'pointer',
                                            zIndex: 10,
                                            whiteSpace: 'nowrap',
                                            opacity: generatingCoverFor === savedPrompt.id ? 0.7 : 1,
                                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
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
