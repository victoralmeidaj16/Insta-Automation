'use client';

import DashboardHeader from '@/components/DashboardHeader';
import { AuthProvider } from '@/contexts/AuthContext';
import { BusinessProfileProvider } from '@/contexts/BusinessProfileContext';

export default function DashboardLayout({ children }) {
    return (
        <AuthProvider>
            <BusinessProfileProvider>
                <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
                    <DashboardHeader />
                    <main>
                        {children}
                    </main>
                </div>
            </BusinessProfileProvider>
        </AuthProvider>
    );
}
