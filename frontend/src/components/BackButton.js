'use client';

import { useRouter } from 'next/navigation';

export default function BackButton({ href = '/dashboard', label = 'Voltar' }) {
    const router = useRouter();

    return (
        <button
            onClick={() => router.push(href)}
            className="btn btn-secondary"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                marginBottom: '1rem',
                width: 'fit-content'
            }}
        >
            <span>←</span> {label}
        </button>
    );
}
