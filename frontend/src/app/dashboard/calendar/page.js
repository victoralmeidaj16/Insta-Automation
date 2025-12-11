'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';

export default function CalendarPage() {
    const router = useRouter();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
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

    useEffect(() => {
        loadAccounts();
        loadPosts();
        loadPendingMedia();
    }, []);

    useEffect(() => {
        if (selectedAccount) {
            loadPosts();
        }
    }, [selectedAccount, currentDate]);

    const loadPendingMedia = () => {
        const pendingMedia = localStorage.getItem('pendingCalendarMedia');
        if (pendingMedia) {
            try {
                const media = JSON.parse(pendingMedia);
                const newMediaItem = {
                    id: media.timestamp.toString(),
                    type: media.type,
                    mediaUrls: media.mediaUrls,
                    caption: media.caption,
                    thumbnail: media.mediaUrls[0]
                };
                setMediaLibrary(prev => [...prev, newMediaItem]);
                localStorage.removeItem('pendingCalendarMedia');
                toast.success(`✅ ${media.mediaUrls.length} imagem(ns) do AI Generator adicionada(s)!`);
                console.log('📥 Mídia do AI Generator carregada:', newMediaItem);
            } catch (error) {
                console.error('Erro ao carregar mídia pendente:', error);
            }
        }
    };

    const loadAccounts = async () => {
        try {
            const res = await api.get('/api/accounts');
            const activeAccounts = res.data.accounts.filter(a => a.status === 'active');
            setAccounts(activeAccounts);
            if (activeAccounts.length > 0 && !selectedAccount) {
                setSelectedAccount(activeAccounts[0].id);
            }
        } catch (error) {
            toast.error('Erro ao carregar contas');
        }
    };

    const loadPosts = async () => {
        try {
            const params = selectedAccount ? { accountId: selectedAccount } : {};
            const res = await api.get('/api/posts', { params });
            // Status correto é 'pending' para posts agendados (não 'scheduled')
            const scheduledPosts = res.data.posts.filter(p => p.status === 'pending' || p.status === 'scheduled');
            console.log('📋 Posts agendados carregados:', scheduledPosts.length);
            setPosts(scheduledPosts);
        } catch (error) {
            console.error('❌ Erro ao carregar posts:', error);
        }
    };

    // Calendar utilities
    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days = [];

        // Add empty slots for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push(new Date(year, month, day));
        }

        return days;
    };

    const getPostsForDate = (date) => {
        if (!date) return [];

        // Normalizar para data local sem timezone
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const filtered = posts.filter(post => {
            if (!post.scheduledFor) return false;

            const postDate = new Date(post.scheduledFor);
            const postYear = postDate.getFullYear();
            const postMonth = String(postDate.getMonth() + 1).padStart(2, '0');
            const postDay = String(postDate.getDate()).padStart(2, '0');
            const postDateStr = `${postYear}-${postMonth}-${postDay}`;

            return postDateStr === dateStr;
        });

        return filtered;
    };

    const changeMonth = (offset) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
    };

    // Drag and Drop handlers
    const handleDragStart = (e, item) => {
        console.log('🟢 DRAG START:', item);
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOver = (e, date) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        console.log('🟡 DRAG OVER:', date.toLocaleDateString());
        // Sempre atualiza - quando mudar de card, atualiza automaticamente
        setHoveredDate(date);
    };

    const handleDrop = async (e, date) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔴 DROP DISPARADO!', date);
        setHoveredDate(null);

        if (!draggedItem || !date) {
            console.log('❌ Sem draggedItem ou date');
            toast.error('⚠️ Erro ao soltar mídia');
            return;
        }

        if (!selectedAccount) {
            console.log('❌ Sem conta selecionada');
            toast.error('⚠️ Selecione uma conta primeiro');
            return;
        }

        console.log('🎯 Drop iniciado:', {
            date: date.toISOString(),
            draggedItem,
            selectedAccount
        });

        // Armazenar dados e abrir modal
        setPendingDrop({ draggedItem, date });
        setScheduleData({
            date: date,
            time: '10:00',
            type: draggedItem.type || 'static',
            caption: draggedItem.caption || ''
        });
        setShowScheduleModal(true);
        setDraggedItem(null);
    };

    const handleConfirmSchedule = async () => {
        if (!pendingDrop) return;

        const { draggedItem, date } = pendingDrop;

        // Criar data com horário escolhido
        const [hours, minutes] = scheduleData.time.split(':');
        const scheduledDate = new Date(date);
        scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        try {
            const postData = {
                accountId: selectedAccount,
                type: scheduleData.type,
                caption: scheduleData.caption,
                mediaUrls: draggedItem.mediaUrls || [],
                scheduledFor: scheduledDate.toISOString(),
            };

            console.log('📤 Enviando post para API:', postData);

            const response = await api.post('/api/posts', postData);
            console.log('✅ Resposta da API:', response.data);

            toast.success(`📅 Post agendado para ${date.toLocaleDateString('pt-BR')} às ${scheduleData.time}!`);

            // Recarregar posts
            await loadPosts();

            // Fechar modal e limpar estados
            setShowScheduleModal(false);
            setPendingDrop(null);
            setScheduleData({
                date: null,
                time: '10:00',
                type: 'static',
                caption: ''
            });
        } catch (error) {
            console.error('❌ Erro completo:', error);
            const errorMsg = error.response?.data?.error || error.message || 'Erro desconhecido';
            toast.error(`❌ Erro ao agendar: ${errorMsg}`);
        }
    };

    // Open edit modal for existing post
    const handleEditPost = (post) => {
        const postDate = new Date(post.scheduledFor);
        const hours = String(postDate.getHours()).padStart(2, '0');
        const minutes = String(postDate.getMinutes()).padStart(2, '0');

        setEditingPost(post);
        setEditData({
            date: postDate,
            time: `${hours}:${minutes}`,
            type: post.type,
            caption: post.caption || ''
        });
        setShowEditModal(true);
    };

    // Update existing post
    const handleUpdatePost = async () => {
        if (!editingPost) return;

        try {
            const [hours, minutes] = editData.time.split(':');
            const scheduledDate = new Date(editData.date);
            scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            const updateData = {
                type: editData.type,
                caption: editData.caption,
                scheduledFor: scheduledDate.toISOString()
            };

            console.log('📤 Atualizando post:', updateData);

            await api.put(`/api/posts/${editingPost.id}`, updateData);

            toast.success('✅ Post atualizado com sucesso!');
            await loadPosts();

            setShowEditModal(false);
            setEditingPost(null);
            setEditData({
                date: null,
                time: '10:00',
                type: 'static',
                caption: ''
            });
        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
            toast.error(`❌ Erro ao atualizar: ${error.response?.data?.error || error.message}`);
        }
    };

    // Delete post
    const handleDeletePost = async () => {
        if (!editingPost) return;

        if (!confirm('Tem certeza que deseja excluir este post agendado?')) {
            return;
        }

        try {
            console.log('🗑️ Deletando post:', editingPost.id);

            await api.delete(`/api/posts/${editingPost.id}`);

            toast.success('🗑️ Post excluído com sucesso!');
            await loadPosts();

            setShowEditModal(false);
            setEditingPost(null);
            setEditData({
                date: null,
                time: '10:00',
                type: 'static',
                caption: ''
            });
        } catch (error) {
            console.error('❌ Erro ao deletar:', error);
            toast.error(`❌ Erro ao deletar: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        console.log('📤 Fazendo upload de', files.length, 'arquivo(s)...');

        try {
            const uploadFormData = new FormData();
            files.forEach(file => uploadFormData.append('files', file));

            const uploadRes = await api.post('/api/upload', uploadFormData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            console.log('✅ Upload concluído:', uploadRes.data);

            const newMediaItem = {
                id: Date.now().toString(),
                type: files.length > 1 ? 'carousel' : 'static',
                mediaUrls: uploadRes.data.urls,
                caption: '',
                thumbnail: uploadRes.data.urls[0]
            };

            setMediaLibrary([...mediaLibrary, newMediaItem]);
            toast.success(`✅ ${files.length} mídia(s) adicionada(s) à biblioteca!`);
            console.log('📚 Biblioteca atualizada:', [...mediaLibrary, newMediaItem]);
        } catch (error) {
            console.error('❌ Erro no upload:', error);
            toast.error(`❌ Erro ao fazer upload: ${error.message}`);
        }
    };

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const days = getDaysInMonth(currentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <BackButton />

                <div className="flex-between mb-lg">
                    <h1>📅 Calendário de Posts</h1>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <select
                            className="input"
                            value={selectedAccount}
                            onChange={(e) => setSelectedAccount(e.target.value)}
                            style={{ minWidth: '200px' }}
                        >
                            <option value="">Todas as contas</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>@{acc.username}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
                    {/* Media Library Sidebar */}
                    <div className="card-glass" style={{ padding: '1.5rem', height: 'fit-content' }}>
                        <h3 className="mb-md">📚 Biblioteca de Mídia</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                            Arraste as mídias para o calendário para agendar
                        </p>

                        <label
                            htmlFor="media-upload"
                            className="btn btn-primary"
                            style={{ width: '100%', marginBottom: '1rem', cursor: 'pointer', textAlign: 'center' }}
                        >
                            ➕ Adicionar Mídia
                        </label>
                        <input
                            id="media-upload"
                            type="file"
                            accept="image/*,video/mp4"
                            multiple
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {mediaLibrary.map((item) => (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    style={{
                                        padding: '0.75rem',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'grab',
                                        border: '2px solid transparent',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#8e44ad';
                                        e.currentTarget.style.transform = 'scale(1.02)';
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
                                                pointerEvents: 'none'
                                            }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontSize: '0.75rem', color: '#8e44ad', fontWeight: '500' }}>
                                                {item.type === 'carousel' ? '🎠 Carrossel' : '📸 Imagem'}
                                            </p>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                {item.mediaUrls.length} arquivo(s)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {mediaLibrary.length === 0 && (
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>
                                    Nenhuma mídia na biblioteca
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
                                                    {postsForDate.map(post => (
                                                        <div
                                                            key={post.id}
                                                            onClick={() => handleEditPost(post)}
                                                            style={{
                                                                fontSize: '0.65rem',
                                                                padding: '0.25rem',
                                                                background: 'rgba(142, 68, 173, 0.3)',
                                                                borderRadius: 'var(--radius-sm)',
                                                                borderLeft: '3px solid #8e44ad',
                                                                overflow: 'hidden',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(142, 68, 173, 0.5)';
                                                                e.currentTarget.style.transform = 'scale(1.02)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'rgba(142, 68, 173, 0.3)';
                                                                e.currentTarget.style.transform = 'scale(1)';
                                                            }}
                                                            title="Clique para editar"
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
                                                                <div style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis'
                                                                }}>
                                                                    <span>
                                                                        {post.type === 'carousel' ? '🎠' :
                                                                            post.type === 'video' ? '🎥' :
                                                                                post.type === 'reel' ? '🎬' :
                                                                                    post.type === 'story' ? '📖' : '📸'}
                                                                    </span>
                                                                    <span style={{ fontWeight: '600' }}>
                                                                        {new Date(post.scheduledFor).toLocaleTimeString('pt-BR', {
                                                                            hour: '2-digit',
                                                                            minute: '2-digit'
                                                                        })}
                                                                    </span>
                                                                </div>
                                                                {post.caption && (
                                                                    <div style={{
                                                                        fontSize: '0.6rem',
                                                                        color: 'rgba(255,255,255,0.7)',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis'
                                                                    }}>
                                                                        {post.caption}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
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

                {/* Schedule Configuration Modal */}
                {showScheduleModal && (
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
                )}

                {/* Edit Post Modal */}
                {showEditModal && editingPost && (
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
                            <h2 className="mb-md">✏️ Editar Post Agendado</h2>

                            <p style={{
                                fontSize: '0.875rem',
                                color: 'var(--text-tertiary)',
                                marginBottom: '1.5rem'
                            }}>
                                ID: <strong style={{ color: '#8e44ad', fontSize: '0.75rem' }}>
                                    {editingPost.id.substring(0, 8)}...
                                </strong>
                            </p>

                            {/* Tipo de Post */}
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

                            {/* Horário */}
                            <div className="input-group">
                                <label className="input-label">Horário</label>
                                <input
                                    type="time"
                                    className="input"
                                    value={editData.time}
                                    onChange={(e) => setEditData({ ...editData, time: e.target.value })}
                                />
                                <small style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                                    Data: {editData.date?.toLocaleDateString('pt-BR')}
                                </small>
                            </div>

                            {/* Legenda */}
                            {editData.type !== 'story' && (
                                <div className="input-group">
                                    <label className="input-label">Legenda (opcional)</label>
                                    <textarea
                                        className="input"
                                        value={editData.caption}
                                        onChange={(e) => setEditData({ ...editData, caption: e.target.value })}
                                        placeholder="Escreva a legenda do post..."
                                        rows={4}
                                    />
                                </div>
                            )}

                            {/* Botões */}
                            <div className="flex gap-md mt-lg" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {/* Atualizar */}
                                <button
                                    onClick={handleUpdatePost}
                                    className="btn btn-primary"
                                    style={{ width: '100%' }}
                                >
                                    ✅ Salvar Alterações
                                </button>

                                {/* Deletar */}
                                <button
                                    onClick={handleDeletePost}
                                    className="btn"
                                    style={{
                                        width: '100%',
                                        background: '#ef4444',
                                        border: 'none',
                                        color: '#fff'
                                    }}
                                >
                                    🗑️ Excluir Post
                                </button>

                                {/* Cancelar */}
                                <button
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingPost(null);
                                        setEditData({
                                            date: null,
                                            time: '10:00',
                                            type: 'static',
                                            caption: ''
                                        });
                                    }}
                                    className="btn btn-secondary"
                                    style={{ width: '100%' }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
