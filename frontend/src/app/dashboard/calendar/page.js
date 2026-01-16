'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';

export default function CalendarPage() {
    const router = useRouter();
    const { selectedProfile } = useBusinessProfile();

    // State
    const [currentDate, setCurrentDate] = useState(new Date());
    // const [accounts, setAccounts] = useState([]); // Removed
    // const [selectedAccount, setSelectedAccount] = useState(''); // Removed
    const [posts, setPosts] = useState([]);
    const [mediaLibrary, setMediaLibrary] = useState([]);
    const [draggedItem, setDraggedItem] = useState(null);
    const [hoveredDate, setHoveredDate] = useState(null);

    // Schedule Modal
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleData, setScheduleData] = useState({
        date: null,
        time: '10:00',
        type: 'static',
        caption: ''
    });
    const [pendingDrop, setPendingDrop] = useState(null);

    // Edit Modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [editData, setEditData] = useState({
        date: null,
        time: '10:00',
        type: 'static',
        caption: ''
    });

    // Initial Load & Profile Changes
    useEffect(() => {
        if (selectedProfile) {
            // loadAccounts(); // No longer needed
            loadLibraryItems(); // Load "Pronto" items for this profile
            loadPosts(); // Load posts for this profile
        } else {
            // Clear data if no profile selected
            // setAccounts([]);
            setPosts([]);
            setMediaLibrary([]);
        }
    }, [selectedProfile]);

    // Load Posts when Month changes (or profile changes, covered above)
    // useEffect(() => { // Merged into above or handled by currentDate change?
    //     if (selectedAccount) {
    //         loadPosts();
    //     } else {
    //         setPosts([]);
    //     }
    // }, [currentDate]); 

    // Re-fetch posts when date changes (if we were paginating, but we aren't really)
    // For now, let's just re-fetch on mount/profile change. 
    // If month change needs new data, we'd add currentDate dependency to a useEffect.
    // Assuming backend returns ALL pending/scheduled posts for now, or we filter in memory?
    // The previous code had `[selectedAccount, currentDate]` dependency.
    useEffect(() => {
        if (selectedProfile) {
            loadPosts();
        }
    }, [selectedProfile, currentDate]);


    const loadLibraryItems = async () => {
        if (!selectedProfile) return;
        try {
            const res = await api.get('/api/library', {
                params: { businessProfileId: selectedProfile.id }
            });

            // Filter for 'pronto' items
            const readyItems = res.data
                .filter(item => item.tag === 'pronto')
                .map(item => ({
                    id: item.id,
                    type: item.type,
                    mediaUrls: item.mediaUrls,
                    caption: item.caption,
                    thumbnail: item.mediaUrls[0] || '', // Ensure thumbnail exists
                    isLibraryItem: true,
                    status: item.status, // 'available', 'scheduled', 'posted'
                    isScheduled: item.isScheduled
                }));

            console.log('📚 Library items loaded:', readyItems.length);
            setMediaLibrary(readyItems);
        } catch (error) {
            console.error('❌ Erro ao carregar biblioteca:', error);
            // Don't toast error here to avoid annoyance if library is just empty or initial load fails silently
        }
    };

    const loadPosts = async () => {
        if (!selectedProfile) return;
        try {
            // Use selectedProfile.id as accountId
            const res = await api.get('/api/posts', {
                params: { accountId: selectedProfile.id }
            });
            // Status correto é 'pending' para posts agendados
            const scheduledPosts = res.data.posts.filter(p => p.status === 'pending' || p.status === 'scheduled' || p.status === 'success');
            console.log('📋 Posts agendados carregados:', scheduledPosts.length);
            setPosts(scheduledPosts);
        } catch (error) {
            console.error('❌ Erro ao carregar posts:', error);
        }
    };

    // Calendar Logic
    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const today = new Date();

    const getDaysInMonth = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfMonth = new Date(year, month, 1).getDay();

        const daysArray = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            daysArray.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            daysArray.push(new Date(year, month, i));
        }
        return daysArray;
    };

    const days = getDaysInMonth();

    const changeMonth = (offset) => {
        const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
        setCurrentDate(new Date(newDate));
    };

    const getPostsForDate = (date) => {
        return posts.filter(post => {
            const postDate = new Date(post.scheduledFor);
            return postDate.getDate() === date.getDate() &&
                postDate.getMonth() === date.getMonth() &&
                postDate.getFullYear() === date.getFullYear();
        });
    };

    // Handlers
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        formData.append('businessProfileId', selectedProfile.id);

        const toastId = toast.loading('Enviando arquivos...');
        try {
            await api.post('/api/library', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Arquivos enviados!', { id: toastId });
            loadLibraryItems();
        } catch (error) {
            console.error(error);
            toast.error('Erro no upload', { id: toastId });
        }
    };

    const handleDragStart = (e, item) => {
        setDraggedItem(item);
    };

    const handleDragOver = (e, date) => {
        e.preventDefault();
        setHoveredDate(date);
    };

    const handleDrop = (e, date) => {
        e.preventDefault();
        if (!draggedItem) return;

        setPendingDrop({ draggedItem, date });
        setScheduleData({
            date: date,
            time: '10:00',
            type: draggedItem.type || 'static',
            caption: draggedItem.caption || '',
            libraryItemId: draggedItem.id
        });
        setShowScheduleModal(true);
        setDraggedItem(null);
        setHoveredDate(null);
    };

    const handleConfirmSchedule = async (immediate = false) => {
        try {
            if (!scheduleData.date && !immediate) {
                toast.error('Data inválida');
                return;
            }

            const scheduledDate = new Date(scheduleData.date);
            const [hours, minutes] = scheduleData.time.split(':');
            scheduledDate.setHours(parseInt(hours), parseInt(minutes));

            const sourceItem = pendingDrop?.draggedItem;

            const postData = {
                accountId: selectedProfile.id,
                type: scheduleData.type,
                caption: scheduleData.caption,
                mediaUrls: sourceItem?.mediaUrls || [],
                libraryItemId: sourceItem?.isLibraryItem ? sourceItem.id : null,
                scheduledFor: immediate ? null : scheduledDate.toISOString(),
                isImmediate: immediate
            };

            // Just create the post, backend handles execution if needed? 
            // Or different endpoint? Typically same endpoint with isImmediate flag?
            // Assuming standard create post for now.
            await api.post('/api/posts', postData);

            if (immediate) {
                toast.success('Post enviado para a fila de execução!');
            } else {
                toast.success('Agendado com sucesso!');
            }

            setShowScheduleModal(false);
            setPendingDrop(null);
            setScheduleData({ ...scheduleData, date: null, caption: '' });
            loadPosts();
            loadLibraryItems();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao agendar post.');
        }
    };

    const handleEditPost = (post) => {
        setEditingPost(post);
        setEditData({
            date: new Date(post.scheduledFor),
            time: new Date(post.scheduledFor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            type: post.type,
            caption: post.caption || ''
        });
        setShowEditModal(true);
    };

    const handleUpdatePost = async () => {
        try {
            const newDate = new Date(editData.date);
            const [h, m] = editData.time.split(':'); // Assuming time is HH:mm string from input
            if (h && m) newDate.setHours(h, m);

            await api.put(`/api/posts/${editingPost.id}`, {
                ...editData,
                scheduledFor: newDate.toISOString(),
                caption: editData.caption
            });
            toast.success('Post atualizado!');
            setShowEditModal(false);
            setEditingPost(null);
            loadPosts();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar');
        }
    };

    const handleDeletePost = async () => {
        if (!confirm('Tem certeza?')) return;
        try {
            await api.delete(`/api/posts/${editingPost.id}`);
            toast.success('Post excluído');
            setShowEditModal(false);
            setEditingPost(null);
            loadPosts();
            loadLibraryItems();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao excluir');
        }
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <BackButton />

                <div className="flex-between mb-lg">
                    <div>
                        <h1>📅 Calendário de Posts</h1>
                        <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Perfil: <strong style={{ color: '#7c3aed' }}>{selectedProfile.name}</strong></p>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {selectedProfile.instagram?.username ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                                <span className="text-xl">📸</span>
                                <div>
                                    <p className="text-xs text-purple-400 font-medium">Conta Conectada</p>
                                    <p className="text-sm font-bold text-white">@{selectedProfile.instagram.username}</p>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '0.5rem', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                ⚠️ Sem credenciais configuradas
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
                    {/* Media Library Sidebar */}
                    <div className="card-glass" style={{ padding: '1.5rem', height: 'fit-content', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 className="mb-md">📚 Biblioteca ("Pronto")</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                            Arraste para o calendário
                        </p>

                        {/* ... upload button ... */}
                        <label
                            className="btn btn-primary"
                            style={{ width: '100%', marginBottom: '1rem', cursor: 'pointer', textAlign: 'center', display: 'block' }}
                        >
                            ➕ Upload Rápido
                            <input
                                type="file"
                                accept="image/*,video/mp4"
                                multiple
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                        </label>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {mediaLibrary.map((item) => (
                                <div
                                    key={item.id}
                                    draggable={!item.isScheduled && item.status !== 'posted'} // Disable drag if already scheduled/posted
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    style={{
                                        padding: '0.75rem',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: (item.isScheduled || item.status === 'posted') ? 'default' : 'grab',
                                        border: '2px solid transparent',
                                        transition: 'all 0.2s ease',
                                        opacity: (item.isScheduled || item.status === 'posted') ? 0.7 : 1,
                                        position: 'relative'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!item.isScheduled && item.status !== 'posted') {
                                            e.currentTarget.style.borderColor = '#8e44ad';
                                            e.currentTarget.style.transform = 'scale(1.02)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = 'transparent';
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <img
                                            src={item.thumbnail}
                                            alt="Thumbnail"
                                            style={{
                                                width: '60px',
                                                height: '60px',
                                                objectFit: 'cover',
                                                borderRadius: 'var(--radius-sm)',
                                                pointerEvents: 'none',
                                                background: '#000',
                                                filter: (item.isScheduled || item.status === 'posted') ? 'grayscale(0.5)' : 'none'
                                            }}
                                        />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <p style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: '500' }}>
                                                    {item.type === 'carousel' ? '🎠 Carrossel' : '📸 Imagem'}
                                                </p>

                                                {/* Status Badge */}
                                                {item.status === 'posted' ? (
                                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', fontWeight: 'bold' }}>
                                                        POSTADO
                                                    </span>
                                                ) : (item.isScheduled || item.status === 'scheduled') ? (
                                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', fontWeight: 'bold' }}>
                                                        AGENDADO
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.caption || 'Sem legenda'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {mediaLibrary.length === 0 && (
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>
                                    Nenhum item "Pronto" na biblioteca deste perfil.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Calendar */}
                    <div className="card-glass" style={{ padding: '2rem' }}>
                        {/* Month Navigation */}
                        <div className="flex-between mb-lg">
                            <button
                                onClick={() => changeMonth(-1)}
                                className="btn btn-secondary"
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                ← Anterior
                            </button>
                            <h2 style={{ fontSize: '1.5rem' }}>
                                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                            </h2>
                            <button
                                onClick={() => changeMonth(1)}
                                className="btn btn-secondary"
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                Próximo →
                            </button>
                        </div>

                        {/* Day Names */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '0.5rem',
                            marginBottom: '0.5rem'
                        }}>
                            {dayNames.map(day => (
                                <div
                                    key={day}
                                    style={{
                                        textAlign: 'center',
                                        fontWeight: '600',
                                        fontSize: '0.875rem',
                                        color: '#8e44ad',
                                        padding: '0.5rem'
                                    }}
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Days */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '0.5rem'
                        }}>
                            {days.map((date, index) => {
                                const isToday = date && date.toDateString() === today.toDateString();
                                const isPast = date && date < today;
                                const postsForDate = date ? getPostsForDate(date) : [];
                                const isHovered = hoveredDate && date &&
                                    hoveredDate.toDateString() === date.toDateString();

                                return (
                                    <div
                                        key={index}
                                        onDragOver={(e) => date && !isPast && handleDragOver(e, date)}
                                        onDrop={(e) => date && !isPast && handleDrop(e, date)}
                                        style={{
                                            minHeight: '120px',
                                            padding: '0.5rem',
                                            background: !date ? 'transparent' :
                                                isHovered ? 'rgba(142, 68, 173, 0.2)' :
                                                    isToday ? 'rgba(142, 68, 173, 0.1)' :
                                                        'rgba(255,255,255,0.03)',
                                            border: isToday ? '2px solid #8e44ad' : '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 'var(--radius-md)',
                                            opacity: isPast ? 0.5 : 1,
                                            cursor: date && !isPast ? 'pointer' : 'default',
                                            transition: 'all 0.2s ease',
                                            position: 'relative'
                                        }}
                                    >
                                        {date && (
                                            <>
                                                <div style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: isToday ? '700' : '500',
                                                    color: isToday ? '#8e44ad' : 'var(--text-primary)',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    {date.getDate()}
                                                </div>

                                                {/* Scheduled Posts */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    {postsForDate.map(post => {
                                                        const isPosted = post.status === 'success';
                                                        return (
                                                            <div
                                                                key={post.id}
                                                                onClick={() => handleEditPost(post)}
                                                                style={{
                                                                    fontSize: '0.65rem',
                                                                    padding: '0.25rem',
                                                                    background: isPosted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(142, 68, 173, 0.3)',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    borderLeft: isPosted ? '3px solid #22c55e' : '3px solid #8e44ad',
                                                                    overflow: 'hidden',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease',
                                                                    opacity: isPosted ? 0.8 : 1
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = isPosted ? 'rgba(34, 197, 94, 0.3)' : 'rgba(142, 68, 173, 0.5)';
                                                                    e.currentTarget.style.transform = 'scale(1.02)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = isPosted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(142, 68, 173, 0.3)';
                                                                    e.currentTarget.style.transform = 'scale(1)';
                                                                }}
                                                                title={isPosted ? "Postado" : "Agendado: " + post.caption}
                                                            >
                                                                {/* Thumbnail */}
                                                                {post.mediaUrls && post.mediaUrls[0] && (
                                                                    <img
                                                                        src={post.mediaUrls[0]}
                                                                        alt="Post"
                                                                        style={{
                                                                            width: '28px',
                                                                            height: '28px',
                                                                            objectFit: 'cover',
                                                                            borderRadius: '3px',
                                                                            flexShrink: 0
                                                                        }}
                                                                    />
                                                                )}

                                                                {/* Info */}
                                                                <div style={{
                                                                    flex: 1,
                                                                    overflow: 'hidden',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '2px'
                                                                }}>
                                                                    {/* Time & Type */}
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.25rem',
                                                                        minWidth: 0
                                                                    }}>
                                                                        <span>
                                                                            {post.type === 'carousel' ? '🎠' :
                                                                                post.type === 'video' ? '🎥' :
                                                                                    post.type === 'reel' ? '🎬' :
                                                                                        post.type === 'story' ? '📖' : '📸'}
                                                                        </span>
                                                                        <span style={{ fontWeight: '600', fontSize: '0.6rem' }}>
                                                                            {new Date(post.scheduledFor).toLocaleTimeString('pt-BR', {
                                                                                hour: '2-digit',
                                                                                minute: '2-digit'
                                                                            })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ); // Closing map expression
                                                    })}
                                                </div>

                                                {/* Drop Zone Indicator */}
                                                {isHovered && draggedItem && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        right: 0,
                                                        bottom: 0,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'rgba(142, 68, 173, 0.3)',
                                                        borderRadius: 'var(--radius-md)',
                                                        border: '2px dashed #8e44ad'
                                                    }}>
                                                        <span style={{ fontSize: '1.5rem' }}>➕</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Schedule Configuration Modal */}
            {
                showScheduleModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        padding: '2rem'
                    }}>
                        <div className="card-glass" style={{
                            maxWidth: '500px',
                            width: '100%',
                            padding: '2rem',
                            position: 'relative'
                        }}>
                            <h2 className="mb-md">📅 Configurar Agendamento</h2>

                            <p style={{
                                fontSize: '0.875rem',
                                color: 'var(--text-tertiary)',
                                marginBottom: '1.5rem'
                            }}>
                                Configure os detalhes do post para <strong style={{ color: '#8e44ad' }}>
                                    {scheduleData.date?.toLocaleDateString('pt-BR')}
                                </strong>
                            </p>

                            <div className="input-group">
                                <label className="input-label">Tipo de Post</label>
                                <select
                                    className="input"
                                    value={scheduleData.type}
                                    onChange={(e) => setScheduleData({ ...scheduleData, type: e.target.value })}
                                >
                                    <option value="static">📸 Post Estático (1 imagem)</option>
                                    <option value="carousel">🎠 Carrossel (múltiplas imagens)</option>
                                    <option value="video">🎥 Vídeo</option>
                                    <option value="reel">🎬 Reel</option>
                                    <option value="story">📖 Story</option>
                                </select>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Horário</label>
                                <input
                                    type="time"
                                    className="input"
                                    value={scheduleData.time}
                                    onChange={(e) => setScheduleData({ ...scheduleData, time: e.target.value })}
                                />
                                <small style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                                    Padrão: 10:00 (10h da manhã)
                                </small>
                            </div>

                            {scheduleData.type !== 'story' && (
                                <div className="input-group">
                                    <label className="input-label">Legenda (opcional)</label>
                                    <textarea
                                        className="input"
                                        value={scheduleData.caption}
                                        onChange={(e) => setScheduleData({ ...scheduleData, caption: e.target.value })}
                                        placeholder="Escreva a legenda do post..."
                                        rows={4}
                                    />
                                </div>
                            )}

                            <div className="flex gap-md mt-lg">
                                <button
                                    onClick={handleConfirmSchedule}
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                >
                                    ✅ Confirmar Agendamento
                                </button>
                                {scheduleData.date && new Date().toDateString() === scheduleData.date.toDateString() && (
                                    <button
                                        onClick={() => handleConfirmSchedule(true)}
                                        className="btn"
                                        style={{
                                            flex: 1,
                                            background: 'linear-gradient(135deg, #ff0080, #7928ca)',
                                            border: 'none',
                                            color: '#fff',
                                            fontWeight: '600',
                                            boxShadow: '0 4px 15px rgba(255, 0, 128, 0.3)'
                                        }}
                                    >
                                        🔥 Postar Agora
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setShowScheduleModal(false);
                                        setPendingDrop(null);
                                        setScheduleData({
                                            date: null,
                                            time: '10:00',
                                            type: 'static',
                                            caption: ''
                                        });
                                    }}
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Edit Post Modal code... (similar structure to schedule modal) */}
            {
                showEditModal && editingPost && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        padding: '2rem'
                    }}>
                        <div className="card-glass" style={{
                            maxWidth: '500px',
                            width: '100%',
                            padding: '2rem',
                            position: 'relative'
                        }}>
                            <h2 className="mb-md">✏️ Editar Agendamento</h2>

                            <p style={{
                                fontSize: '0.875rem',
                                color: 'var(--text-tertiary)',
                                marginBottom: '1.5rem'
                            }}>
                                Editando post de <strong style={{ color: '#8e44ad' }}>
                                    {editData.date?.toLocaleDateString('pt-BR')}
                                </strong>
                            </p>

                            <div className="input-group">
                                <label className="input-label">Tipo de Post</label>
                                <select
                                    className="input"
                                    value={editData.type}
                                    onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                                >
                                    <option value="static">📸 Post Estático (1 imagem)</option>
                                    <option value="carousel">🎠 Carrossel (múltiplas imagens)</option>
                                    <option value="video">🎥 Vídeo</option>
                                    <option value="reel">🎬 Reel</option>
                                    <option value="story">📖 Story</option>
                                </select>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Horário</label>
                                <input
                                    type="time"
                                    className="input"
                                    value={editData.time}
                                    onChange={(e) => setEditData({ ...editData, time: e.target.value })}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Legenda</label>
                                <textarea
                                    className="input"
                                    value={editData.caption}
                                    onChange={(e) => setEditData({ ...editData, caption: e.target.value })}
                                    rows={4}
                                />
                            </div>

                            <div className="flex gap-md mt-lg">
                                <button
                                    onClick={handleUpdatePost}
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                >
                                    💾 Salvar Alterações
                                </button>
                                <button
                                    onClick={handleDeletePost}
                                    className="btn"
                                    style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                                >
                                    🗑️ Excluir Post
                                </button>
                            </div>
                            <button
                                onClick={() => {
                                    setShowEditModal(false);
                                    setEditingPost(null);
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '1rem',
                                    right: '1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer'
                                }}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )
            }
        </div>
        </div >
    );
}
