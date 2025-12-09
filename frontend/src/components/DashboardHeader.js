'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';

function ProfileSwitcher() {
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
        <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.75rem',
                    background: selectedProfile
                        ? `linear-gradient(135deg, ${selectedProfile.branding?.primaryColor || '#7c3aed'} 0%, ${selectedProfile.branding?.secondaryColor || '#a78bfa'} 100%)`
                        : 'rgba(39, 39, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
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
                    <span>🏢</span>
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
                    background: 'rgba(18, 18, 18, 0.98)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.75rem',
                    minWidth: '220px',
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
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: profile.branding?.primaryColor || '#8e44ad',
                                flexShrink: 0
                            }} />
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

export default function DashboardHeader() {
    const pathname = usePathname();

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: '📊' },
        { href: '/dashboard/generate', label: 'AI Generator', icon: '✨' },
        { href: '/dashboard/history', label: 'Histórico', icon: '🕒' },
        { href: '/dashboard/create-post', label: 'Criar Post', icon: '📸' },
    ];

    return (
        <header style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            zIndex: 1000,
            padding: '1rem 2rem'
        }}>
            <div style={{
                maxWidth: '1400px',
                margin: '0 auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '2rem'
            }}>
                {/* Logo */}
                <Link href="/dashboard" style={{ textDecoration: 'none', flexShrink: 0 }}>
                    <h1 style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0
                    }}>
                        Insta-Automation
                    </h1>
                </Link>

                {/* Navigation Cards */}
                <nav style={{
                    display: 'flex',
                    gap: '0.75rem',
                    flex: 1,
                    justifyContent: 'center'
                }}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    padding: '0.625rem 1rem',
                                    borderRadius: '0.75rem',
                                    background: isActive
                                        ? 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)'
                                        : 'rgba(39, 39, 42, 0.8)',
                                    border: '1px solid',
                                    borderColor: isActive ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                                    color: '#fff',
                                    textDecoration: 'none',
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    backdropFilter: 'blur(8px)',
                                    boxShadow: isActive
                                        ? '0 4px 12px rgba(124, 58, 237, 0.3)'
                                        : 'none',
                                    transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = 'rgba(39, 39, 42, 1)';
                                        e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.3)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = 'rgba(39, 39, 42, 0.8)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }
                                }}
                            >
                                <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Business Profile Switcher */}
                <ProfileSwitcher />

                {/* User Avatar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexShrink: 0
                }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.5), 0 0 0 4px rgba(124, 58, 237, 0.2)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                    }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        U
                    </div>
                </div>
            </div>
        </header>
    );
}
