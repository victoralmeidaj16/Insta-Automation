'use client';

import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('🔴 Error Boundary caught:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });

        // Log to analytics/monitoring service here
        // Example: logErrorToService(error, errorInfo);
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });

        // Reload page or navigate to safe route
        if (this.props.onReset) {
            this.props.onReset();
        } else {
            window.location.href = '/dashboard';
        }
    };

    render() {
        if (this.state.hasError) {
            // Custom error UI
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
                }}>
                    <div className="card-glass" style={{
                        maxWidth: '600px',
                        padding: '2rem',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            fontSize: '4rem',
                            marginBottom: '1rem'
                        }}>
                            😵
                        </div>

                        <h1 style={{
                            fontSize: '2rem',
                            marginBottom: '1rem',
                            background: 'linear-gradient(135deg, #8e44ad 0%, #c44569 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                        }}>
                            Oops! Algo deu errado
                        </h1>

                        <p style={{
                            color: 'var(--text-secondary)',
                            marginBottom: '2rem',
                            fontSize: '1rem'
                        }}>
                            Não se preocupe, já registramos o erro e vamos investigar.
                        </p>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details style={{
                                marginBottom: '2rem',
                                padding: '1rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                textAlign: 'left'
                            }}>
                                <summary style={{
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    color: '#ef4444',
                                    marginBottom: '0.5rem'
                                }}>
                                    🐛 Detalhes do Erro (dev only)
                                </summary>
                                <pre style={{
                                    fontSize: '0.75rem',
                                    overflow: 'auto',
                                    color: '#fca5a5',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}>
                                    {this.state.error.toString()}
                                    {'\n\n'}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleReset}
                                className="btn btn-primary"
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    fontSize: '1rem'
                                }}
                            >
                                🔄 Tentar Novamente
                            </button>

                            <button
                                onClick={() => window.location.href = '/'}
                                className="btn btn-secondary"
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    fontSize: '1rem'
                                }}
                            >
                                🏠 Voltar ao Início
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
