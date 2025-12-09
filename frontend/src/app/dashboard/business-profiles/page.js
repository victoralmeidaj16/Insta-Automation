'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import BackButton from '@/components/BackButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import toast from 'react-hot-toast';

export default function BusinessProfilesPage() {
    const router = useRouter();
    const { profiles, selectedProfile, setSelectedProfile, createProfile, updateProfile, deleteProfile, loadProfiles } = useBusinessProfile();
    const [showModal, setShowModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        branding: {
            primaryColor: '#8e44ad',
            secondaryColor: '#e74c3c',
            logoUrl: '',
            style: '',
            guidelines: '' // New: Brand guidelines document
        },
        aiPreferences: {
            defaultAspectRatio: '1:1',
            style: '',
            tone: '',
            promptTemplate: '', // New: Base prompt/instructions
            favoritePrompts: []
        }
    });
    const [newPromptName, setNewPromptName] = useState('');
    const [newPromptText, setNewPromptText] = useState('');

    useEffect(() => {
        loadProfiles();
    }, []);

    const handleOpenModal = (profile = null) => {
        if (profile) {
            setEditingProfile(profile);
            setFormData({
                name: profile.name,
                description: profile.description || '',
                branding: profile.branding || formData.branding,
                aiPreferences: profile.aiPreferences || formData.aiPreferences
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: '',
                description: '',
                branding: {
                    primaryColor: '#8e44ad',
                    secondaryColor: '#e74c3c',
                    logoUrl: '',
                    style: '',
                    guidelines: ''
                },
                aiPreferences: {
                    defaultAspectRatio: '1:1',
                    style: '',
                    tone: '',
                    promptTemplate: '',
                    favoritePrompts: []
                }
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!formData.name || formData.name.trim() === '') {
            toast.error('⚠️ Nome do perfil é obrigatório!');
            return;
        }

        try {
            if (editingProfile) {
                await updateProfile(editingProfile.id, formData);
                toast.success(`✅ Perfil "${formData.name}" atualizado com sucesso!`);
            } else {
                await createProfile(formData);
                toast.success(`✅ Perfil "${formData.name}" criado com sucesso!`);
            }
            setShowModal(false);
        } catch (error) {
            toast.error(`❌ Erro ao salvar perfil: ${error.message}`);
        }
    };

    const handleDelete = async (profileId) => {
        const profile = profiles.find(p => p.id === profileId);
        const profileName = profile?.name || 'este perfil';

        if (!confirm(`⚠️ Tem certeza que deseja excluir "${profileName}"?\n\nTodas as contas vinculadas serão desvinculadas automaticamente.`)) {
            return;
        }

        try {
            await deleteProfile(profileId);
            toast.success(`✅ Perfil "${profileName}" excluído com sucesso!`);
        } catch (error) {
            toast.error(`❌ Erro ao excluir perfil: ${error.message}`);
        }
    };

    const handleAddFavoritePrompt = () => {
        if (!newPromptName.trim() || !newPromptText.trim()) {
            toast.error('⚠️ Preencha nome e texto do prompt!');
            return;
        }

        const newPrompt = {
            id: Date.now().toString(),
            name: newPromptName,
            text: newPromptText,
            createdAt: new Date().toISOString()
        };

        setFormData({
            ...formData,
            aiPreferences: {
                ...formData.aiPreferences,
                favoritePrompts: [...(formData.aiPreferences.favoritePrompts || []), newPrompt]
            }
        });

        setNewPromptName('');
        setNewPromptText('');
        toast.success('✅ Prompt adicionado à biblioteca!');
    };

    const handleDeleteFavoritePrompt = (promptId) => {
        setFormData({
            ...formData,
            aiPreferences: {
                ...formData.aiPreferences,
                favoritePrompts: formData.aiPreferences.favoritePrompts.filter(p => p.id !== promptId)
            }
        });
        toast.success('Prompt removido da biblioteca');
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <BackButton />
                <Breadcrumbs />
                <div className="flex-between mb-lg">
                    <h1>Perfis de Negócio</h1>
                    <button onClick={() => handleOpenModal()} className="btn btn-primary">
                        + Criar Perfil
                    </button>
                </div>

                <div className="grid grid-3">
                    {profiles.map(profile => (
                        <div
                            key={profile.id}
                            className="card-glass"
                            style={{
                                borderLeft: `4px solid ${profile.branding?.primaryColor || '#8e44ad'}`,
                                cursor: 'pointer',
                                background: selectedProfile?.id === profile.id ? 'rgba(142, 68, 173, 0.1)' : undefined
                            }}
                            onClick={() => setSelectedProfile(profile)}
                        >
                            <div className="flex-between mb-md">
                                <h3 style={{ color: profile.branding?.primaryColor || '#8e44ad' }}>
                                    {profile.name}
                                </h3>
                                {selectedProfile?.id === profile.id && (
                                    <span className="badge badge-success">Ativo</span>
                                )}
                            </div>

                            {profile.description && (
                                <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: '#a1a1aa' }}>
                                    {profile.description}
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', marginBottom: '1rem' }}>
                                <div style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    background: 'rgba(255,255,255,0.05)'
                                }}>
                                    <span style={{ color: '#8e44ad' }}>●</span> {profile.branding?.primaryColor}
                                </div>
                                <div style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    background: 'rgba(255,255,255,0.05)'
                                }}>
                                    Aspect: {profile.aiPreferences?.defaultAspectRatio || '1:1'}
                                </div>
                            </div>

                            <div className="flex gap-sm">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProfile(profile);
                                        router.push('/dashboard/generate');
                                    }}
                                    className="btn btn-primary"
                                    style={{ padding: '0.5rem 1rem', flex: 1 }}
                                >
                                    Usar no AI Generator
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenModal(profile);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(profile.id);
                                    }}
                                    className="btn btn-danger"
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {profiles.length === 0 && (
                    <div className="card-glass text-center" style={{ padding: '3rem' }}>
                        <h2>Nenhum perfil criado</h2>
                        <p>Crie seu primeiro perfil de negócio para organizar suas contas Instagram</p>
                    </div>
                )}

                {/* Modal */}
                {showModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        overflowY: 'auto',
                        padding: '2rem'
                    }}>
                        <div className="card-glass" style={{ maxWidth: '600px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
                            <h2 className="mb-md">{editingProfile ? 'Editar Perfil' : 'Criar Perfil'}</h2>
                            <form onSubmit={handleSubmit}>
                                {/* Basic Info */}
                                <div className="input-group">
                                    <label className="input-label">Nome do Perfil *</label>
                                    <input
                                        className="input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ex: Loja de Sapatos Nike"
                                        required
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Descrição</label>
                                    <textarea
                                        className="input"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Breve descrição do negócio"
                                        rows={2}
                                    />
                                </div>

                                {/* AI Preferences */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>Preferências de Geração de IA</h3>

                                <div className="input-group">
                                    <label className="input-label">Prompt Base / Instruções de Geração</label>
                                    <textarea
                                        className="input"
                                        value={formData.aiPreferences.promptTemplate}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            aiPreferences: { ...formData.aiPreferences, promptTemplate: e.target.value }
                                        })}
                                        placeholder="Cole aqui seus comandos/exemplos de prompts para geração de imagens desta empresa. Ex: 'Fotografia profissional de produtos esportivos, fundo branco, alta resolução, iluminação natural...'"
                                        rows={6}
                                        style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Este texto será automaticamente adicionado aos seus prompts no AI Generator
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Diretrizes da Marca (Guidelines)</label>
                                    <textarea
                                        className="input"
                                        value={formData.branding.guidelines}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            branding: { ...formData.branding, guidelines: e.target.value }
                                        })}
                                        placeholder="Cole aqui o documento completo com cores, fontes, estilo visual, exemplos, etc."
                                        rows={8}
                                        style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Documentação completa da identidade visual da empresa
                                    </small>
                                </div>

                                {/* Favorite Prompts Library */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>📚 Biblioteca de Prompts</h3>

                                <div style={{ background: 'rgba(124, 58, 237, 0.1', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                                    <div className="input-group">
                                        <label className="input-label">Nome do Prompt</label>
                                        <input
                                            className="input"
                                            value={newPromptName}
                                            onChange={(e) => setNewPromptName(e.target.value)}
                                            placeholder="Ex: Produto com fundo branco"
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Texto do Prompt</label>
                                        <textarea
                                            className="input"
                                            value={newPromptText}
                                            onChange={(e) => setNewPromptText(e.target.value)}
                                            placeholder="Professional product photography, white background, high quality..."
                                            rows={3}
                                            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleAddFavoritePrompt}
                                        className="btn btn-secondary"
                                        style={{ width: '100%' }}
                                    >
                                        ➕ Adicionar à Biblioteca
                                    </button>
                                </div>

                                {formData.aiPreferences.favoritePrompts && formData.aiPreferences.favoritePrompts.length > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <p style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>
                                            Prompts salvos ({formData.aiPreferences.favoritePrompts.length}):
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {formData.aiPreferences.favoritePrompts.map(prompt => (
                                                <div
                                                    key={prompt.id}
                                                    style={{
                                                        padding: '0.75rem',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        borderRadius: '0.5rem',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}
                                                >
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                                                            {prompt.name}
                                                        </p>
                                                        <p style={{
                                                            fontSize: '0.75rem',
                                                            color: '#71717a',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            margin: 0
                                                        }}>
                                                            {prompt.text}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteFavoritePrompt(prompt.id)}
                                                        className="btn btn-danger"
                                                        style={{ padding: '0.5rem', fontSize: '0.75rem' }}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-md mt-md">
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                        {editingProfile ? 'Atualizar' : 'Criar'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="btn btn-secondary"
                                        style={{ flex: 1 }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
