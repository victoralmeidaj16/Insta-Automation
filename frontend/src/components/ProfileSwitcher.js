import { useMemo } from 'react';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';

export default function ProfileSwitcher({ style = {}, className = '' }) {
    const { profiles, selectedProfile, setSelectedProfile } = useBusinessProfile();

    const selectedValue = selectedProfile?.id || '__all__';

    const selectedLabel = useMemo(() => {
        if (!selectedProfile) return 'Todos os Perfis';
        return selectedProfile.name || 'Perfil sem nome';
    }, [selectedProfile]);

    if (profiles.length === 0) return null;

    return (
        <div
            className={className}
            style={{
                position: 'relative',
                flexShrink: 0,
                minWidth: '220px',
                ...style
            }}
        >
            <span
                style={{
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    zIndex: 1,
                    fontSize: '0.95rem'
                }}
            >
                🌐
            </span>

            <select
                value={selectedValue}
                onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === '__all__') {
                        setSelectedProfile(null);
                        return;
                    }

                    const profile = profiles.find((item) => item.id === nextValue) || null;
                    setSelectedProfile(profile);
                }}
                aria-label="Selecionar perfil de negócio"
                style={{
                    width: '100%',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    padding: '0.8rem 2.8rem 0.8rem 2.5rem',
                    borderRadius: '0.9rem',
                    background: selectedProfile ? 'rgba(124, 58, 237, 0.2)' : 'rgba(39, 39, 42, 0.85)',
                    border: selectedProfile ? '1px solid rgba(124, 58, 237, 0.45)' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: selectedProfile ? '0 0 0 1px rgba(124, 58, 237, 0.12)' : 'none',
                    backdropFilter: 'blur(10px)',
                    textOverflow: 'ellipsis'
                }}
                title={selectedLabel}
            >
                <option value="__all__">Todos os Perfis</option>
                {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                        {profile.name || 'Perfil sem nome'}
                    </option>
                ))}
            </select>

            <span
                style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '0.8rem'
                }}
            >
                ▼
            </span>
        </div>
    );
}
