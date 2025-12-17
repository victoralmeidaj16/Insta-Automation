'use client';

import DashboardHeader from '@/components/DashboardHeader';
import { AuthProvider } from '@/contexts/AuthContext';
import { BusinessProfileProvider } from '@/contexts/BusinessProfileContext';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function DashboardLayout({ children }) {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <BusinessProfileProvider>
                    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
                        <DashboardHeader />
                        <main style={{ paddingTop: '80px' }}>
                            {children}
                        </main>
                    </div>
                </BusinessProfileProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}
