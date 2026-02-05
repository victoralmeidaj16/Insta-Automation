'use client';

import BackButton from './BackButton';
import Breadcrumbs from './Breadcrumbs';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    showBreadcrumbs?: boolean;
    actions?: React.ReactNode;
}

export default function PageHeader({
    title,
    subtitle,
    showBack = true,
    showBreadcrumbs = true,
    actions
}: PageHeaderProps) {
    return (
        <div style={{ marginBottom: '2rem' }}>
            {showBack && <BackButton />}
            {showBreadcrumbs && <Breadcrumbs />}

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1rem'
            }}>
                <div>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: 700,
                        marginBottom: subtitle ? '0.5rem' : 0
                    }}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p style={{
                            fontSize: '0.875rem',
                            color: '#a1a1aa',
                            margin: 0
                        }}>
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && <div>{actions}</div>}
            </div>
        </div>
    );
}
