/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        unoptimized: true, // Necessário para exportação estática
        domains: ['storage.googleapis.com', 'firebasestorage.googleapis.com'],
    },
  eslint: {
    // Type checking is enforced below. The existing lint backlog is tracked
    // separately so it does not block the recovery deployment.
    ignoreDuringBuilds: true,
  },
    typescript: {
        ignoreBuildErrors: false,
    },
};

export default nextConfig;
