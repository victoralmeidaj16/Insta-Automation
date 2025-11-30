import axios from 'axios';
import { auth } from './firebase';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(async (config) => {
    const user = auth.currentUser;

    if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

// Interceptor para lidar com erros
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            console.error('API Error:', error.response.data);
            throw new Error(error.response.data.error || 'Erro na requisição');
        } else if (error.request) {
            console.error('Network Error:', error.request);
            throw new Error('Erro de conexão com o servidor');
        } else {
            console.error('Error:', error.message);
            throw error;
        }
    }
);

export default api;
