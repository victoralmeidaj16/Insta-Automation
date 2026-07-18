'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

const styles = {
    critical: { accent: '#fb7185', wash: 'rgba(251, 113, 133, 0.10)', label: 'Conexão necessária' },
    warning: { accent: '#fbbf24', wash: 'rgba(251, 191, 36, 0.10)', label: 'Acompanhamento necessário' }
};

export default function OperationalAlerts({ profileId = null }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const response = await api.get('/api/alerts', { params: profileId ? { profileId } : {} });
                if (mounted) setAlerts(response.data.alerts || []);
            } catch {
                // Alertas são auxiliares: a falha desta consulta não deve bloquear o dashboard.
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        const interval = setInterval(load, 60000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [profileId]);

    if (loading || alerts.length === 0) return null;

    return (
        <section aria-label="Alertas operacionais" style={{
            marginBottom: '1.5rem',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '1rem',
            overflow: 'hidden',
            background: 'linear-gradient(115deg, rgba(21,24,31,0.98), rgba(12,14,19,0.96))',
            boxShadow: '0 22px 50px rgba(0,0,0,0.20)'
        }}>
            <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem',
                padding: '1rem 1.2rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.08)'
            }}>
                <div>
                    <p style={{ margin: 0, color: '#8b95a7', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        Centro de operação
                    </p>
                    <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.05rem', color: '#f8fafc' }}>
                        {alerts.length} {alerts.length === 1 ? 'ponto requer atenção' : 'pontos requerem atenção'}
                    </h2>
                </div>
                <span style={{ color: '#64748b', fontSize: '0.72rem' }}>Atualização automática</span>
            </div>

            <div style={{ padding: '0.35rem 0.55rem 0.55rem' }}>
                {alerts.map(alert => {
                    const tone = styles[alert.severity] || styles.warning;
                    const href = alert.kind === 'processing_stuck' ? '/dashboard/calendar' : '/dashboard/business-profiles';
                    return (
                        <div key={alert.id} style={{
                            display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: '0.8rem', alignItems: 'center',
                            padding: '0.8rem 0.65rem', borderRadius: '0.7rem', background: tone.wash, marginTop: '0.35rem'
                        }}>
                            <span aria-hidden="true" style={{ alignSelf: 'stretch', borderRadius: '999px', background: tone.accent }} />
                            <div>
                                <p style={{ margin: 0, color: tone.accent, fontSize: '0.67rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tone.label}</p>
                                <p style={{ margin: '0.18rem 0 0', color: '#f8fafc', fontSize: '0.9rem', fontWeight: 700 }}>{alert.title} · {alert.profileName}</p>
                                <p style={{ margin: '0.2rem 0 0', color: '#aab3c2', fontSize: '0.8rem', lineHeight: 1.45 }}>{alert.message}</p>
                            </div>
                            <Link href={href} style={{
                                color: '#f8fafc', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none',
                                padding: '0.45rem 0.6rem', border: `1px solid ${tone.accent}`, borderRadius: '0.45rem', whiteSpace: 'nowrap'
                            }}>
                                {alert.action} →
                            </Link>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
