import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'InstaBot - Automação Instagram',
    description: 'Plataforma de automação para posts no Instagram',
};

export default function RootLayout({ children }) {
    return (
        <html lang="pt-BR">
            <body className={inter.className}>
                <AuthProvider>
                    {children}
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            style: {
                                background: '#1e1e1e',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                            },
                            success: {
                                iconTheme: {
                                    primary: '#27ae60',
                                    secondary: '#fff',
                                },
                            },
                            error: {
                                iconTheme: {
                                    primary: '#e74c3c',
                                    secondary: '#fff',
                                },
                            },
                        }}
                    />
                </AuthProvider>
            </body>
        </html>
    );
}
