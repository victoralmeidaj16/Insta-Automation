'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function AccountsPage() {
    const [accounts, setAccounts] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ username: '', email: '', password: '', stayLoggedIn: true });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        try {
            const res = await api.get('/api/accounts');
            setAccounts(res.data.accounts);
        } catch (error) {
            toast.error('Erro ao carregar contas');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/api/accounts', formData);
            toast.success('Conta adicionada! Verificando login...');
            setShowModal(false);
            setFormData({ username: '', email: '', password: '', stayLoggedIn: true });
            await loadAccounts();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (id) => {
        try {
            toast.loading('Verificando login...');
            const res = await api.post(`/api/accounts/${id}/verify`);
            toast.dismiss();
            if (res.data.result.success) {
                toast.success('Login verificado!');
                loadAccounts();
            } else {
                toast.error(res.data.result.message);
            }
        } catch (error) {
            toast.dismiss();
            toast.error('Erro ao verificar login');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Tem certeza que deseja remover esta conta?')) return;
        try {
            await api.delete(`/api/accounts/${id}`);
            toast.success('Conta removida');
            loadAccounts();
        } catch (error) {
            toast.error('Erro ao remover conta');
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <div className="flex-between mb-lg">
                    <h1>Contas Instagram</h1>
                    <button onClick={() => setShowModal(true)} className="btn btn-primary">
                        + Adicionar Conta
                    </button>
                </div>

                <div className="grid grid-2">
                    {accounts.map(acc => (
                        <div key={acc.id} className="card-glass">
                            <div className="flex-between mb-md">
                                <h3>@{acc.username}</h3>
                                <span className={`badge badge-${acc.status === 'active' ? 'success' : acc.status === 'error' ? 'error' : 'pending'}`}>
                                    {acc.status}
                                </span>
                            </div>
                            <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>{acc.email}</p>
                            <div className="flex gap-sm">
                                <button onClick={() => handleVerify(acc.id)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                                    Verificar
                                </button>
                                <button onClick={() => handleDelete(acc.id)} className="btn btn-danger" style={{ padding: '0.5rem 1rem' }}>
                                    Remover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {accounts.length === 0 && (
                    <div className="card-glass text-center" style={{ padding: '3rem' }}>
                        <h2>Nenhuma conta adicionada</h2>
                        <p>Adicione sua primeira conta Instagram para começar</p>
                    </div>
                )}

                {/* Modal */}
                {showModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div className="card-glass" style={{ maxWidth: '500px', width: '90%', padding: '2rem' }}>
                            <h2 className="mb-md">Adicionar Conta</h2>
                            <form onSubmit={handleSubmit}>
                                <div className="input-group">
                                    <label className="input-label">Username</label>
                                    <input className="input" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Email</label>
                                    <input type="email" className="input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Senha</label>
                                    <input type="password" className="input" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                                </div>
                                <div className="flex gap-md mt-md">
                                    <button type="submit" className="btn btn-primary" disabled={loading}>
                                        {loading ? 'Adicionando...' : 'Adicionar'}
                                    </button>
                                    <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
