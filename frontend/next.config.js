/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        unoptimized: true, // Necessário para exportação estática
        domains: ['storage.googleapis.com', 'firebasestorage.googleapis.com'],
    },
    output: 'export',
};

export default nextConfig;
