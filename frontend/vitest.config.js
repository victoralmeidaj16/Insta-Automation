import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.js'],
        // Restrito a .jsx, qualquer teste .js/.ts era ignorado sem aviso.
        include: ['src/**/*.test.{js,jsx,ts,tsx}'],
        clearMocks: true,
    },
});
