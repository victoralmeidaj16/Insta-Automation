import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ProfileSwitcher from './ProfileSwitcher';

// Outline icons — stroke 1.75px, colored via currentColor
const ICON_PATHS = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></>,
    sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.5 2.5L16 9.5" /></>,
    grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
};

function NavIcon({ name }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICON_PATHS[name]}
        </svg>
    );
}

export default function DashboardHeader() {
    const pathname = usePathname();
    const router = useRouter();

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: 'home' },
        { href: '/dashboard/generate', label: 'AI Generator', icon: 'sparkle' },
        { href: '/dashboard/review', label: 'Revisão', icon: 'check' },
        { href: '/dashboard/library', label: 'Library', icon: 'grid' },
        { href: '/dashboard/calendar', label: 'Calendário', icon: 'calendar' },
    ];

    return (
        <header style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: '#0C1014',
            borderBottom: '1px solid rgba(245, 245, 245, 0.06)',
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
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#F5F5F5',
                        margin: 0
                    }}>
                        Insta-Automation
                    </h1>
                </Link>

                {/* Navigation */}
                <nav style={{
                    display: 'flex',
                    gap: '0.5rem',
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
                                    borderRadius: '14px',
                                    background: isActive ? '#F5F5F5' : '#25292F',
                                    color: isActive ? '#0C1014' : '#F5F5F5',
                                    textDecoration: 'none',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    transition: 'background-color 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}
                            >
                                <span style={{ display: 'flex', color: isActive ? '#0C1014' : '#EAEBEB' }}>
                                    <NavIcon name={item.icon} />
                                </span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Business Profile Switcher */}
                <ProfileSwitcher />

                {/* User */}
                <button
                    type="button"
                    onClick={() => router.push('/dashboard/business-profiles')}
                    aria-label="Perfis de negócio"
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#25292F',
                        color: '#EAEBEB',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                >
                    <NavIcon name="user" />
                </button>
            </div>
        </header>
    );
}
