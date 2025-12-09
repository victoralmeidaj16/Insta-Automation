'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Breadcrumbs() {
    const pathname = usePathname();

    // Map paths to readable names
    const pathMap = {
        '/dashboard': 'Dashboard',
        '/dashboard/generate': 'AI Generator',
        '/dashboard/history': 'Histórico',
        '/dashboard/create-post': 'Criar Post',
        '/dashboard/posts': 'Posts',
        '/dashboard/accounts': 'Contas',
        '/dashboard/business-profiles': 'Perfis de Negócio'
    };

    // Don't show breadcrumbs on dashboard home
    if (pathname === '/dashboard') return null;

    const pathSegments = pathname.split('/').filter(Boolean);
    const breadcrumbs = [];

    // Always start with Dashboard
    breadcrumbs.push({ name: 'Dashboard', path: '/dashboard' });

    // Add current page
    if (pathMap[pathname]) {
        breadcrumbs.push({ name: pathMap[pathname], path: pathname });
    }

    return (
        <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            color: '#a1a1aa',
            marginBottom: '1.5rem'
        }}>
            {breadcrumbs.map((crumb, index) => (
                <div key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {index > 0 && <span style={{ color: '#52525b' }}>›</span>}
                    {index === breadcrumbs.length - 1 ? (
                        <span style={{ color: '#fff', fontWeight: 500 }}>{crumb.name}</span>
                    ) : (
                        <Link
                            href={crumb.path}
                            style={{
                                color: '#a1a1aa',
                                textDecoration: 'none',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#a1a1aa'}
                        >
                            {crumb.name}
                        </Link>
                    )}
                </div>
            ))}
        </nav>
    );
}
