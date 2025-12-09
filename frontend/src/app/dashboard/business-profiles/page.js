'use client';

import { useState, useEffect } from 'react';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import BackButton from '@/components/BackButton';
import toast from 'react-hot-toast';

export default function BusinessProfilesPage() {
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
            style: ''
        },
        aiPreferences: {
            defaultAspectRatio: '1:1',
            style: '',
            tone: '',
            favoritePrompts: []
        }
    });

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
                    style: ''
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
        try {
            if (editingProfile) {
                await updateProfile(editingProfile.id, formData);
            } else {
                await createProfile(formData);
            }
            setShowModal(false);
        } catch (error) {
            // Error handling done in context
        }
    };

    const handleDelete = async (profileId) => {
        if (!confirm('Tem certeza que deseja excluir este perfil? Todas as contas devem ser desvinculadas primeiro.')) return;
        try {
            await deleteProfile(profileId);
        } catch (error) {
            // Error handling done in context
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <BackButton />
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
                                        handleOpenModal(profile);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.5rem 1rem', flex: 1 }}
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(profile.id);
                                    }}
                                    className="btn btn-danger"
                                    style={{ padding: '0.5rem 1rem', flex: 1 }}
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

                                {/* Branding */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>Branding</h3>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="input-group">
                                        <label className="input-label">Cor Primária</label>
                                        <input
                                            type="color"
                                            className="input"
                                            value={formData.branding.primaryColor}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                branding: { ...formData.branding, primaryColor: e.target.value }
                                            })}
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Cor Secundária</label>
                                        <input
                                            type="color"
                                            className="input"
                                            value={formData.branding.secondaryColor}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                branding: { ...formData.branding, secondaryColor: e.target.value }
                                            })}
                                        />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Estilo da Marca</label>
                                    <input
                                        className="input"
                                        value={formData.branding.style}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            branding: { ...formData.branding, style: e.target.value }
                                        })}
                                        placeholder="Ex: Moderno, minimalista, esportivo"
                                    />
                                </div>

                                {/* AI Preferences */}
                                <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>Preferências de IA</h3>

                                <div className="input-group">
                                    <label className="input-label">Aspect Ratio Padrão</label>
                                    <select
                                        className="input"
                                        value={formData.aiPreferences.defaultAspectRatio}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            aiPreferences: { ...formData.aiPreferences, defaultAspectRatio: e.target.value }
                                        })}
                                    >
                                        <option value="1:1">1:1 (Feed)</option>
                                        <option value="4:5">4:5 (Feed Vertical)</option>
                                        <option value="16:9">16:9 (Horizontal)</option>
                                        <option value="9:16">9:16 (Stories/Reels)</option>
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Estilo de Geração</label>
                                    <input
                                        className="input"
                                        value={formData.aiPreferences.style}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            aiPreferences: { ...formData.aiPreferences, style: e.target.value }
                                        })}
                                        placeholder="Ex: Fotografia de produto, lifestyle, corporativo"
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Tom de Voz</label>
                                    <input
                                        className="input"
                                        value={formData.aiPreferences.tone}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            aiPreferences: { ...formData.aiPreferences, tone: e.target.value }
                                        })}
                                        placeholder="Ex: Profissional, casual, motivacional"
                                    />
                                </div>

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
