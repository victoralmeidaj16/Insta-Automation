import axios from 'axios';
import { auth } from './firebase';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    timeout: 30000, // 30 seconds default timeout
});

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(async (config) => {
    const user = auth.currentUser;

    if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }

    // Add retry counter to config
    config.metadata = config.metadata || { retryCount: 0 };

    return config;
});

// Interceptor para lidar com erros e retry automático
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;

        // Don't retry if:
        // 1. No config
        // 2. Max retries reached
        // 3. Request method is not idempotent (POST)
        // 4. Error is 4xx (client error, não adianta retry)
        if (
            !config ||
            config.metadata.retryCount >= MAX_RETRIES ||
            (config.method === 'post' && !config.metadata.retryable) ||
            (error.response && error.response.status >= 400 && error.response.status < 500)
        ) {
            return handleError(error);
        }

        // Increment retry count
        config.metadata.retryCount += 1;

        // Calculate delay with exponential backoff
        const delay = RETRY_DELAY * Math.pow(2, config.metadata.retryCount - 1);

        console.warn(
            `🔄 Retry ${config.metadata.retryCount}/${MAX_RETRIES} for ${config.url} after ${delay}ms`
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry request
        return api(config);
    }
);

// Enhanced error handling
function handleError(error) {
    let errorMessage = 'Erro desconhecido';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response) {
        // Server responded with error
        errorCode = `HTTP_${error.response.status}`;
        errorMessage = error.response.data?.error || error.response.data?.message || `Erro ${error.response.status}`;

        console.error('❌ API Error:', {
            status: error.response.status,
            url: error.config?.url,
            method: error.config?.method,
            error: error.response.data
        });

        // Handle specific HTTP errors
        if (error.response.status === 401) {
            errorMessage = 'Não autorizado. Faça login novamente.';
            // Could trigger logout here
        } else if (error.response.status === 403) {
            errorMessage = 'Acesso negado.';
        } else if (error.response.status === 404) {
            errorMessage = 'Recurso não encontrado.';
        } else if (error.response.status === 429) {
            errorMessage = 'Muitas requisições. Tente novamente em alguns minutos.';
        } else if (error.response.status >= 500) {
            errorMessage = 'Erro no servidor. Tente novamente.';
        }
    } else if (error.request) {
        // Request made but no response
        errorCode = 'NETWORK_ERROR';
        errorMessage = 'Sem conexão com o servidor. Verifique sua internet.';

        console.error('❌ Network Error:', {
            url: error.config?.url,
            method: error.config?.method
        });
    } else {
        // Something else happened
        errorCode = 'REQUEST_ERROR';
        errorMessage = error.message || 'Erro ao fazer requisição';

        console.error('❌ Request Error:', error.message);
    }

    // Create enhanced error object
    const enhancedError = new Error(errorMessage);
    enhancedError.code = errorCode;
    enhancedError.originalError = error;
    enhancedError.config = error.config;

    throw enhancedError;
}

// Helper function to make requests retryable
export function makeRetryable(config) {
    return {
        ...config,
        metadata: {
            ...(config.metadata || {}),
            retryable: true
        }
    };
}

export default api;
