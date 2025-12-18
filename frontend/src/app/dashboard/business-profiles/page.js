'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import BackButton from '@/components/BackButton';
import Breadcrumbs from '@/components/Breadcrumbs';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function BusinessProfilesPage() {
    const router = useRouter();
    const { profiles, selectedProfile, setSelectedProfile, createProfile, updateProfile, deleteProfile, loadProfiles } = useBusinessProfile();
    const [showModal, setShowModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        instagram: {
            username: '',
            password: ''
        },
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
            // promptTemplate removed
            favoritePrompts: []
        }
    });
    const [newPromptName, setNewPromptName] = useState('');
    const [newPromptText, setNewPromptText] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [showPromptLibrary, setShowPromptLibrary] = useState(false);

    useEffect(() => {
        loadProfiles();
    }, []);

    const handleConnectInstagram = async () => {
        if (!editingProfile) return;

        setIsConnecting(true);
        const toastId = toast.loading('🔐 Tentando conectar ao Instagram...');

        try {
            await api.post(`/api/business-profiles/${editingProfile.id}/connect`, {
                username: formData.instagram.username,
                password: formData.instagram.password
            });

            toast.success('✅ Conectado com sucesso!', { id: toastId });
            handleOpenModal(null); // Close modal 
            loadProfiles(); // Reload to see updates potentially
        } catch (error) {
            console.error('Connection failed:', error);
            const msg = error.response?.data?.error || error.message;
            toast.error(`❌ Falha na conexão: ${msg}`, { id: toastId, duration: 5000 });

            if (msg.includes('twoFactor') || msg.includes('checkpoint')) {
                alert('⚠️ O Instagram pediu verificação de dois fatores. Por favor, verifique seu celular/email e tente novamente (ainda estamos implementando a inserção do código aqui).');
            }
        } finally {
            setIsConnecting(false);
        }
    };

    const handleOpenModal = (profile = null) => {
        if (profile) {
            setEditingProfile(profile);
            setFormData({
                name: profile.name,
                description: profile.description || '',
                instagram: profile.instagram || { username: '', password: '' },
                branding: profile.branding || formData.branding,
                aiPreferences: profile.aiPreferences || formData.aiPreferences
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: '',
                description: '',
                instagram: {
                    username: '',
                    password: ''
                },
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {profiles.map(profile => (
                        <div
                            key={profile.id}
                            style={{
                                background: '#18181b', // Darker background like library
                                borderRadius: '0.75rem',
                                border: selectedProfile?.id === profile.id ? '1px solid #8e44ad' : '1px solid #27272a',
                                padding: '1.5rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                boxShadow: selectedProfile?.id === profile.id ? '0 0 20px rgba(142, 68, 173, 0.15)' : 'none'
                            }}
                            onClick={() => setSelectedProfile(profile)}
                            onMouseEnter={(e) => {
                                if (selectedProfile?.id !== profile.id) {
                                    e.currentTarget.style.borderColor = '#3f3f46';
                                    e.currentTarget.style.background = '#27272a';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (selectedProfile?.id !== profile.id) {
                                    e.currentTarget.style.borderColor = '#27272a';
                                    e.currentTarget.style.background = '#18181b';
                                }
                            }}
                        >
                            <div className="flex-between mb-md">
                                <h3 style={{
                                    color: '#fff',
                                    fontSize: '1.1rem',
                                    fontWeight: 600,
                                    margin: 0
                                }}>
                                    {profile.name}
                                </h3>
                                {selectedProfile?.id === profile.id && (
                                    <span style={{
                                        background: 'rgba(142, 68, 173, 0.2)',
                                        color: '#d8b4fe',
                                        border: '1px solid #8e44ad',
                                        fontSize: '0.75rem',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '999px',
                                        fontWeight: 500
                                    }}>
                                        Ativo
                                    </span>
                                )}
                            </div>

                            {profile.description && (
                                <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem', color: '#a1a1aa', flex: 1 }}>
                                    {profile.description}
                                </p>
                            )}

                            <div style={{
                                display: 'flex',
                                gap: '1rem',
                                fontSize: '0.75rem',
                                marginBottom: '1.5rem',
                                color: '#71717a'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: profile.branding?.primaryColor || '#8e44ad'
                                    }} />
                                    Cor da Marca
                                </div>
                                <div>|</div>
                                <div>
                                    Aspecto: {profile.aiPreferences?.defaultAspectRatio || '1:1'}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProfile(profile);
                                        router.push('/dashboard/generate');
                                    }}
                                    className="btn"
                                    style={{
                                        padding: '0.5rem 1rem',
                                        flex: 2,
                                        background: '#27272a',
                                        border: '1px solid #3f3f46',
                                        color: '#fff',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    Gerar Conteúdo
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenModal(profile);
                                    }}
                                    className="btn"
                                    style={{
                                        padding: '0.5rem 1rem',
                                        flex: 1,
                                        background: 'transparent',
                                        border: '1px solid #3f3f46',
                                        color: '#a1a1aa'
                                    }}
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(profile.id);
                                    }}
                                    className="btn"
                                    style={{
                                        padding: '0.5rem',
                                        background: 'transparent',
                                        border: '1px solid #ef4444',
                                        color: '#ef4444',
                                        opacity: 0.7
                                    }}
                                    title="Excluir"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {profiles.length === 0 && (
                    <div style={{
                        border: '2px dashed #27272a',
                        borderRadius: '0.75rem',
                        padding: '4rem',
                        textAlign: 'center',
                        color: '#71717a'
                    }}>
                        <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>Nenhum perfil criado</h2>
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
                        <div className="card-glass" style={{ maxWidth: '600px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{
                                    position: 'absolute',
                                    top: '1rem',
                                    right: '1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#a1a1aa',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    lineHeight: 1,
                                    zIndex: 10
                                }}
                                onMouseEnter={(e) => e.target.style.color = '#fff'}
                                onMouseLeave={(e) => e.target.style.color = '#a1a1aa'}
                            >
                                ×
                            </button>
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

                                {/* Instagram Credentials */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>📱 Credenciais do Instagram</h3>

                                <div className="input-group">
                                    <label className="input-label">Usuário/Email do Instagram</label>
                                    <input
                                        className="input"
                                        type="text"
                                        value={formData.instagram.username}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            instagram: { ...formData.instagram, username: e.target.value }
                                        })}
                                        placeholder="@username ou email@example.com"
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Senha do Instagram</label>
                                    <input
                                        className="input"
                                        type="password"
                                        value={formData.instagram.password}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            instagram: { ...formData.instagram, password: e.target.value }
                                        })}
                                        placeholder="Senha da conta Instagram"
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        🔒 Suas credenciais serão armazenadas de forma segura
                                    </small>

                                    {editingProfile && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <button
                                                type="button"
                                                onClick={handleConnectInstagram}
                                                disabled={isConnecting || !formData.instagram.username || !formData.instagram.password}
                                                className="btn"
                                                style={{
                                                    width: '100%',
                                                    background: formData.instagram.password ? '#7c3aed' : '#27272a',
                                                    color: '#fff',
                                                    opacity: (isConnecting || !formData.instagram.username || !formData.instagram.password) ? 0.7 : 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                {isConnecting ? (
                                                    <>⏳ Conectando...</>
                                                ) : (
                                                    <>🔑 Testar Conexão & Salvar</>
                                                )}
                                            </button>
                                            <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.5rem', textAlign: 'center' }}>
                                                Isso irá verificar o login e ativar a automação para esta conta.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* AI Preferences */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>Preferências de Geração de IA</h3>

                                {/* Prompt Base removed as requested */}

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
                                <div
                                    onClick={() => setShowPromptLibrary(!showPromptLibrary)}
                                    style={{
                                        marginTop: '1.5rem',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        padding: '0.5rem',
                                        borderRadius: '0.5rem',
                                        background: showPromptLibrary ? 'rgba(255,255,255,0.05)' : 'transparent',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>📚 Biblioteca de Prompts</h3>
                                    <span style={{ fontSize: '1.5rem', transform: showPromptLibrary ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                        ▼
                                    </span>
                                </div>

                                {showPromptLibrary && (
                                    <>
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
                                    </>
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
