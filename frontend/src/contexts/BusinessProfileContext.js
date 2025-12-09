'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const BusinessProfileContext = createContext();

export function BusinessProfileProvider({ children }) {
    const [profiles, setProfiles] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load profiles on mount
    useEffect(() => {
        loadProfiles();
    }, []);

    // Persist selected profile to localStorage
    useEffect(() => {
        if (selectedProfile) {
            localStorage.setItem('selectedBusinessProfile', selectedProfile.id);
        } else {
            localStorage.removeItem('selectedBusinessProfile');
        }
    }, [selectedProfile]);

    const loadProfiles = async () => {
        try {
            const res = await api.get('/api/business-profiles');
            setProfiles(res.data.profiles || []);

            // Restore previously selected profile from localStorage
            const savedProfileId = localStorage.getItem('selectedBusinessProfile');
            if (savedProfileId && res.data.profiles) {
                const savedProfile = res.data.profiles.find(p => p.id === savedProfileId);
                if (savedProfile) {
                    setSelectedProfile(savedProfile);
                }
            }
        } catch (error) {
            console.error('Error loading business profiles:', error);
            toast.error('Erro ao carregar perfis de negócio');
        } finally {
            setLoading(false);
        }
    };

    const createProfile = async (profileData) => {
        try {
            const res = await api.post('/api/business-profiles', profileData);
            await loadProfiles();
            toast.success('Perfil criado com sucesso!');
            return res.data.profile;
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao criar perfil');
            throw error;
        }
    };

    const updateProfile = async (profileId, updates) => {
        try {
            await api.put(`/api/business-profiles/${profileId}`, updates);
            await loadProfiles();
            // Update selected profile if it was updated
            if (selectedProfile?.id === profileId) {
                const updated = profiles.find(p => p.id === profileId);
                if (updated) {
                    setSelectedProfile({ ...updated, ...updates });
                }
            }
            toast.success('Perfil atualizado!');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao atualizar perfil');
            throw error;
        }
    };

    const deleteProfile = async (profileId) => {
        try {
            await api.delete(`/api/business-profiles/${profileId}`);
            await loadProfiles();
            // Clear selection if deleted profile was selected
            if (selectedProfile?.id === profileId) {
                setSelectedProfile(null);
            }
            toast.success('Perfil excluído!');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir perfil');
            throw error;
        }
    };

    const linkAccountToProfile = async (accountId, profileId) => {
        try {
            await api.post(`/api/business-profiles/${profileId}/link-account`, { accountId });
            toast.success('Conta vinculada ao perfil!');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao vincular conta');
            throw error;
        }
    };

    const value = {
        profiles,
        selectedProfile,
        setSelectedProfile,
        loading,
        loadProfiles,
        createProfile,
        updateProfile,
        deleteProfile,
        linkAccountToProfile,
    };

    return (
        <BusinessProfileContext.Provider value={value}>
            {children}
        </BusinessProfileContext.Provider>
    );
}

export function useBusinessProfile() {
    const context = useContext(BusinessProfileContext);
    if (!context) {
        throw new Error('useBusinessProfile must be used within BusinessProfileProvider');
    }
    return context;
}
