'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({ children }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '100vh' }}>
                <div className="loading" style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--gradient-instagram)' }}></div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return <>{children}</>;
}
