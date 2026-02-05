import { useState, useRef, useEffect } from 'react';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';

export default function ProfileSwitcher({ style = {}, className = '' }) {
    const { profiles, selectedProfile, setSelectedProfile } = useBusinessProfile();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (profiles.length === 0) return null;

    return (
        <div ref={dropdownRef} className={className} style={{ position: 'relative', flexShrink: 0, ...style }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.75rem',
                    background: selectedProfile ? 'rgba(124, 58, 237, 0.2)' : 'rgba(39, 39, 42, 0.8)',
                    border: selectedProfile ? '1px solid rgba(124, 58, 237, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                    minWidth: '180px',
                    justifyContent: 'space-between'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {selectedProfile ? (
                        <span style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: '#7c3aed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.625rem',
                            fontWeight: 700
                        }}>
                            {selectedProfile.name.charAt(0).toUpperCase()}
                        </span>
                    ) : (
                        <span>🌐</span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedProfile ? selectedProfile.name : 'Todos os Perfis'}
                    </span>
                </div>
                <span style={{ fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    right: 0,
                    minWidth: '100%',
                    background: 'rgba(18, 18, 18, 0.98)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.75rem',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(12px)',
                    zIndex: 1000
                }}>
                    <div
                        onClick={() => {
                            setSelectedProfile(null);
                            setIsOpen(false);
                        }}
                        style={{
                            padding: '0.75rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            background: !selectedProfile ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!selectedProfile) return;
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            if (!selectedProfile) return;
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        🌐 Todos os Perfis
                    </div>

                    {profiles.map(profile => (
                        <div
                            key={profile.id}
                            onClick={() => {
                                setSelectedProfile(profile);
                                setIsOpen(false);
                            }}
                            style={{
                                padding: '0.75rem 1rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                background: selectedProfile?.id === profile.id ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                                transition: 'background 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                            onMouseEnter={(e) => {
                                if (selectedProfile?.id === profile.id) return;
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                                if (selectedProfile?.id === profile.id) return;
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <span style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: '#7c3aed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.625rem',
                                fontWeight: 700,
                                flexShrink: 0
                            }}>
                                {profile.name.charAt(0).toUpperCase()}
                            </span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {profile.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
