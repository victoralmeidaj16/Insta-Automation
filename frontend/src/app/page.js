'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        // Redirecionar direto para dashboard (login desabilitado)
        router.push('/dashboard');
    }, [router]);

    return (
        <div className="flex-center" style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="card-glass fade-in" style={{ maxWidth: '450px', width: '100%', padding: '2.5rem' }}>
                <div className="text-center">
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📸 InstaBot</h1>
                    <p>Redirecionando para dashboard...</p>
                </div>
            </div>
        </div>
    );
}
