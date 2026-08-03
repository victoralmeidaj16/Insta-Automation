'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext({});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        async function restoreSession() {
            try {
                const response = await fetch('/api/auth/session', { cache: 'no-store' });
                const data = await response.json();
                if (active && response.ok && data.user) {
                    setUser(data.user);
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        restoreSession();

        return () => {
            active = false;
        };
    }, []);

    const login = async (email, password) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();

        if (!response.ok) {
            const error = new Error(data.error || 'Não foi possível autenticar.');
            error.code = data.code || 'auth/login-failed';
            throw error;
        }

        setUser(data.user);
        return data.user;
    };

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
    };

    const value = {
        user,
        loading,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
