'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardHeader() {
    const pathname = usePathname();

    const navItems = [
        { href: '/dashboard', label: '📊 Dashboard', icon: '📊' },
        { href: '/dashboard/generate', label: '✨ AI Generator', icon: '✨' },
        { href: '/dashboard/history', label: '🕒 Histórico', icon: '🕒' },
        { href: '/dashboard/create-post', label: '📸 Criar Post', icon: '📸' },
    ];

    return (
        <header style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid #27272a',
            zIndex: 1000,
            padding: '1rem 2rem'
        }}>
            <div style={{
                maxWidth: '1400px',
                margin: '0 auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                {/* Logo */}
                <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                    <h1 style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0
                    }}>
                        Insta-Automation
                    </h1>
                </Link>

                {/* Navigation */}
                <nav style={{ display: 'flex', gap: '0.5rem' }}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '0.5rem',
                                    background: isActive ? '#7c3aed' : 'transparent',
                                    color: isActive ? '#fff' : '#a1a1aa',
                                    textDecoration: 'none',
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User Info (placeholder) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 600
                    }}>
                        U
                    </div>
                </div>
            </div>
        </header>
    );
}
