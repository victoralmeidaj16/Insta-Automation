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
    const parseLines = (value) => value.split('\n').map(line => line.trim()).filter(Boolean);
    const [showModal, setShowModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        brandKey: '',
        description: '',
        brandContext: '',
        contentStrategy: '',
        targetAudience: '',
        productService: '',
        instagram: {
            username: ''
        },
        branding: {
            primaryColor: '#8e44ad',
            secondaryColor: '#e74c3c',
            logoUrl: '',
            style: '',
            guidelines: ''
        },
        brandKit: {
            visualReferenceUrls: [],
            appUiReferenceUrls: [],
            referencePrompts: []
        },
        aiPreferences: {
            defaultAspectRatio: '1:1',
            style: '',
            tone: '',
            photographyStyle: '',
            prohibitedElements: '',
            favoritePrompts: []
        }
    });
    const [newPromptName, setNewPromptName] = useState('');
    const [newPromptText, setNewPromptText] = useState('');

    const [showPromptLibrary, setShowPromptLibrary] = useState(false);
    const [isExtractingStyle, setIsExtractingStyle] = useState(false);
    const [stylePrompt, setStylePrompt] = useState('');
    const [showStyleExtractor, setShowStyleExtractor] = useState(false);

    useEffect(() => {
        loadProfiles();
    }, []);



    const handleOpenModal = (profile = null) => {
        if (profile) {
            setEditingProfile(profile);
            setFormData({
                name: profile.name,
                brandKey: profile.brandKey || '',
                description: profile.description || '',
                brandContext: profile.brandContext || '',
                contentStrategy: profile.contentStrategy || '',
                targetAudience: profile.targetAudience || '',
                productService: profile.productService || '',
                instagram: profile.instagram || { username: '' },
                branding: profile.branding || formData.branding,
                brandKit: profile.brandKit || formData.brandKit,
                aiPreferences: profile.aiPreferences || formData.aiPreferences
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: '',
                brandKey: '',
                description: '',
                brandContext: '',
                contentStrategy: '',
                targetAudience: '',
                productService: '',
                instagram: {
                    username: ''
                },
                branding: {
                    primaryColor: '#8e44ad',
                    secondaryColor: '#e74c3c',
                    logoUrl: '',
                    style: '',
                    guidelines: ''
                },
                brandKit: {
                    visualReferenceUrls: [],
                    appUiReferenceUrls: [],
                    referencePrompts: []
                },
                aiPreferences: {
                    defaultAspectRatio: '1:1',
                    style: '',
                    tone: '',
                    photographyStyle: '',
                    prohibitedElements: '',
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


    const handleExtractStyle = async () => {
        if (!stylePrompt.trim()) {
            toast.error('Cole um prompt para extrair o estilo!');
            return;
        }

        setIsExtractingStyle(true);
        try {
            const response = await api.post('/api/ai/extract-style', { prompt: stylePrompt });
            if (response.data.success && response.data.style) {
                setFormData({
                    ...formData,
                    branding: { ...formData.branding, style: response.data.style }
                });
                toast.success('✨ Estilo extraído com sucesso!');
                setShowStyleExtractor(false);
                setStylePrompt('');
            }
        } catch (error) {
            console.error('Error extracting style:', error);
            toast.error('Erro ao extrair estilo. Tente novamente.');
        } finally {
            setIsExtractingStyle(false);
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    {profile.name?.toLowerCase().includes('inner boost') && (
                                        <img
                                            src="/logos/inner-boost-logo.png"
                                            alt="Inner Boost Logo"
                                            style={{
                                                width: '40px',
                                                height: '40px',
                                                objectFit: 'cover',
                                                borderRadius: '50%',
                                                border: '2px solid rgba(124, 58, 237, 0.5)',
                                                flexShrink: 0
                                            }}
                                        />
                                    )}
                                    <h3 style={{
                                        color: '#fff',
                                        fontSize: '1.1rem',
                                        fontWeight: 600,
                                        margin: 0
                                    }}>
                                        {profile.name}
                                    </h3>
                                </div>
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
                                    <label className="input-label">Brand Key</label>
                                    <select
                                        className="input"
                                        value={formData.brandKey || ''}
                                        onChange={(e) => setFormData({ ...formData, brandKey: e.target.value })}
                                    >
                                        <option value="">Automático pelo nome</option>
                                        <option value="fitswap">Fitswap</option>
                                        <option value="inner-boost">Inner Boost</option>
                                        <option value="viver-mais">Viver Mais</option>
                                    </select>
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Use um identificador estável da marca para evitar depender de match por nome.
                                    </small>
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

                                <div className="input-group">
                                    <label className="input-label">Contexto da Marca (para a IA) 🧠</label>
                                    <textarea
                                        className="input"
                                        value={formData.brandContext}
                                        onChange={(e) => setFormData({ ...formData, brandContext: e.target.value })}
                                        placeholder="Ex: A Nutriverse é uma marca de suplementos premium com posicionamento clean e moderno. Foco em nutrição esportiva para atletas de alta performance. Tom de voz: científico mas acessível."
                                        rows={4}
                                        style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Informações detalhadas sobre a marca que a IA usará para gerar ideias e variações de posts mais relevantes.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Estratégia de Conteúdo / Pilares Editoriais 📚</label>
                                    <textarea
                                        className="input"
                                        value={formData.contentStrategy}
                                        onChange={(e) => setFormData({ ...formData, contentStrategy: e.target.value })}
                                        placeholder="Cole aqui os pilares de conteúdo, frequências e tipos de posts (ex: Conteúdo Âncora, Utilitário, etc.)"
                                        rows={6}
                                        style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Define os tipos de posts e a frequência sugerida que a IA deve priorizar ao gerar ideias.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Público-Alvo (Target Audience)</label>
                                    <input
                                        className="input"
                                        value={formData.targetAudience}
                                        onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                                        placeholder="Ex: Mulheres empreendedoras, 30-45 anos, focadas em carreira..."
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
                                        Essencial para a IA personalizar a linguagem e o tom.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Produto ou Serviço Oferecido</label>
                                    <input
                                        className="input"
                                        value={formData.productService}
                                        onChange={(e) => setFormData({ ...formData, productService: e.target.value })}
                                        placeholder="Ex: Mentoria de Liderança, Curso de Marketing, Terapia Online..."
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
                                        Ajuda a IA a criar metáforas visuais mais relevantes.
                                    </small>
                                </div>




                                {/* Post Settings for Upload-Post */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>Configurações de Postagem</h3>

                                <div className="input-group">
                                    <label className="input-label">Usuário Instagram (Upload-Post)</label>
                                    <input
                                        className="input"
                                        type="text"
                                        value={formData.instagram?.username || ''}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            instagram: { ...formData.instagram, username: e.target.value }
                                        })}
                                        placeholder="@username"
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
                                        Necessário apenas para identificar a conta na API de agendamento.
                                    </small>
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
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Documentação completa da identidade visual da empresa
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Referências Visuais da Marca (URLs)</label>
                                    <textarea
                                        className="input"
                                        value={(formData.brandKit?.visualReferenceUrls || []).join('\n')}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            brandKit: {
                                                ...formData.brandKit,
                                                visualReferenceUrls: parseLines(e.target.value)
                                            }
                                        })}
                                        placeholder="Uma URL por linha para posts aprovados, fotos de produto, layouts, etc."
                                        rows={4}
                                        style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Essas imagens são anexadas automaticamente como referência visual para a IA.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Referências da UI do App (URLs)</label>
                                    <textarea
                                        className="input"
                                        value={(formData.brandKit?.appUiReferenceUrls || []).join('\n')}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            brandKit: {
                                                ...formData.brandKit,
                                                appUiReferenceUrls: parseLines(e.target.value)
                                            }
                                        })}
                                        placeholder="Uma URL por linha para screenshots reais da interface do app"
                                        rows={3}
                                        style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Para Fitswap, isso ajuda o modelo a sugerir uma interface mais fiel que um glow genérico.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <div className="flex-between">
                                        <label className="input-label">Estilo Visual (Prompt Base para Imagens)</label>
                                        <button
                                            type="button"
                                            onClick={() => setShowStyleExtractor(!showStyleExtractor)}
                                            style={{
                                                fontSize: '0.75rem',
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#d8b4fe',
                                                cursor: 'pointer',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            ✨ Extrair de um Prompt
                                        </button>
                                    </div>

                                    {showStyleExtractor && (
                                        <div style={{
                                            background: 'rgba(124, 58, 237, 0.1)',
                                            padding: '1rem',
                                            borderRadius: '0.5rem',
                                            marginBottom: '0.5rem',
                                            border: '1px solid #8b5cf6'
                                        }}>
                                            <p style={{ fontSize: '0.8rem', color: '#ddd', marginBottom: '0.5rem' }}>
                                                Cole um prompt de imagem que você gostou e a IA vai "copiar" o estilo dele para usar na sua conta.
                                            </p>
                                            <textarea
                                                className="input"
                                                value={stylePrompt}
                                                onChange={(e) => setStylePrompt(e.target.value)}
                                                placeholder="Cole o prompt de referência aqui..."
                                                rows={3}
                                                style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleExtractStyle}
                                                disabled={isExtractingStyle}
                                                className="btn btn-primary"
                                                style={{ width: '100%', fontSize: '0.8rem', padding: '0.4rem' }}
                                            >
                                                {isExtractingStyle ? '🔮 Extraindo...' : '🔮 Extrair Estilo Mágico'}
                                            </button>
                                        </div>
                                    )}

                                    <textarea
                                        className="input"
                                        value={formData.branding.style}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            branding: { ...formData.branding, style: e.target.value }
                                        })}
                                        placeholder="Ex: Personagem 3D estilizado, textura laranja, iluminação de abajur, ambiente dark..."
                                        rows={3}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Este estilo será aplicado automaticamente em todas as imagens geradas.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Estilo Fotográfico / Direção de Arte 📸</label>
                                    <textarea
                                        className="input"
                                        value={formData.aiPreferences?.photographyStyle || ''}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            aiPreferences: { ...formData.aiPreferences, photographyStyle: e.target.value }
                                        })}
                                        placeholder="Ex: Minimalista premium, iluminação dramática de estúdio, grão de filme 35mm, tons pastéis..."
                                        rows={3}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        Define a estética visual profunda das fotos de fundo.
                                    </small>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Elementos Proibidos ou Evitar 🚫</label>
                                    <textarea
                                        className="input"
                                        value={formData.aiPreferences?.prohibitedElements || ''}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            aiPreferences: { ...formData.aiPreferences, prohibitedElements: e.target.value }
                                        })}
                                        placeholder="Ex: Fotos de banco genéricas, luz solar direta, cor vermelha, crianças, ambientes bagunçados..."
                                        rows={2}
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem', display: 'block' }}>
                                        O que a IA NUNCA deve incluir nas imagens de fundo.
                                    </small>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                    <div className="input-group" style={{ flex: 1 }}>
                                        <label className="input-label">Cor Primária</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="color"
                                                value={formData.branding.primaryColor || '#8e44ad'}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    branding: { ...formData.branding, primaryColor: e.target.value }
                                                })}
                                                style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    border: 'none',
                                                    borderRadius: '0.25rem',
                                                    cursor: 'pointer',
                                                    background: 'transparent'
                                                }}
                                            />
                                            <input
                                                type="text"
                                                className="input"
                                                value={formData.branding.primaryColor || ''}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    branding: { ...formData.branding, primaryColor: e.target.value }
                                                })}
                                                placeholder="#HEX"
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group" style={{ flex: 1 }}>
                                        <label className="input-label">Cor Secundária</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="color"
                                                value={formData.branding.secondaryColor || '#e74c3c'}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    branding: { ...formData.branding, secondaryColor: e.target.value }
                                                })}
                                                style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    border: 'none',
                                                    borderRadius: '0.25rem',
                                                    cursor: 'pointer',
                                                    background: 'transparent'
                                                }}
                                            />
                                            <input
                                                type="text"
                                                className="input"
                                                value={formData.branding.secondaryColor || ''}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    branding: { ...formData.branding, secondaryColor: e.target.value }
                                                })}
                                                placeholder="#HEX"
                                            />
                                        </div>
                                    </div>
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
                                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>📚 Prompts de Referência (Para a IA aprender)</h3>
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
                )
                }
            </div >
        </div >
    );
}
