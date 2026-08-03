'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import DashboardHeader from '@/components/DashboardHeader';
import { AuthProvider } from '@/contexts/AuthContext';
import { BusinessProfileProvider } from '@/contexts/BusinessProfileContext';
import ErrorBoundary from '@/components/ErrorBoundary';

function DashboardGuard({ children }) {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/');
            } else if (user.email !== '123indiozinhos@gmail.com') {
                logout().then(() => {
                    router.push('/');
                });
            }
        }
    }, [user, loading, router, logout]);

    if (loading || !user || user.email !== '123indiozinhos@gmail.com') {
        return (
            <div className="flex-center" style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                <div className="card-glass fade-in" style={{ maxWidth: '450px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
                    <h2 style={{ marginBottom: '1rem' }}>📸 InstaBot</h2>
                    <p>Verificando autenticação...</p>
                </div>
            </div>
        );
    }

    return children;
}

export default function DashboardLayout({ children }) {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <DashboardGuard>
                    <BusinessProfileProvider>
                        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
                            <DashboardHeader />
                            <main style={{ paddingTop: '80px' }}>
                                {children}
                            </main>
                        </div>
                    </BusinessProfileProvider>
                </DashboardGuard>
            </AuthProvider>
        </ErrorBoundary>
    );
}
