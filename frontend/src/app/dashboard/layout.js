'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import DashboardHeader from '@/components/DashboardHeader';

export default function DashboardLayout({ children }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Login desabilitado temporariamente
    // useEffect(() => {
    //     if (!loading && !user) {
    //         router.push('/');
    //     }
    // }, [user, loading, router]);

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '100vh' }}>
                <div className="loading" style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--gradient-instagram)' }}></div>
            </div>
        );
    }

    // if (!user) {
    //     return null;
    // }

    return (
        <>
            <DashboardHeader />
            <div style={{ paddingTop: '80px' }}>
                {children}
            </div>
        </>
    );
}
