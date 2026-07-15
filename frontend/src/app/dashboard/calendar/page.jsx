'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessProfile } from '@/contexts/BusinessProfileContext';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import BackButton from '@/components/BackButton';
import PostsStatusWidget from '@/components/PostsStatusWidget';

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

    // Auto-Fill Modal
    const [showAutoFillModal, setShowAutoFillModal] = useState(false);
    const [autoFillConfig, setAutoFillConfig] = useState({
        postDays: [1, 3, 5],
        postTimes: ['09:00', '18:00'],
        storyDays: [0, 1, 2, 3, 4, 5, 6],
        storyTimes: ['08:00', '20:00'],
        startDate: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })(),
        count: 'all'
    });
    const [autoFillPreview, setAutoFillPreview] = useState([]);
    const [autoFillLoading, setAutoFillLoading] = useState(false);

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
                params: { businessProfileId: selectedProfile.id, tag: 'pronto', limit: 200 }
            });

            // Filter for 'pronto' items and exclude already posted ones
            const readyItems = (res.data?.items || [])
                .filter(item => item.tag === 'pronto' && !item.isPosted && item.status !== 'posted')
                .map(item => ({
                    id: item.id,
                    type: item.type,
                    format: item.format,
                    mediaUrls: item.mediaUrls || [],
                    caption: item.caption,
                    htmlCode: item.htmlCode || null,
                    thumbnail: item.mediaUrls?.[0] || '',
                    isLibraryItem: true,
                    status: item.status,
                    isScheduled: item.isScheduled,
                    isPosted: item.isPosted
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
            // Use selectedProfile.id as businessProfileId
            const res = await api.get('/api/posts', {
                params: { businessProfileId: selectedProfile.id, limit: 500 }
            });
            const scheduledPosts = res.data.posts.filter(p =>
                p.status === 'scheduled' || p.status === 'processing' || p.status === 'success' || p.status === 'pending'
            );
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
    today.setHours(0, 0, 0, 0); // Normalize to start of day

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

    function getCalendarDate(post) {
        return parseDate(post.scheduledFor || post.postedAt || post.createdAt);
    }

    const getPostsForDate = (date) => {
        return posts.filter(post => {
            const postDate = getCalendarDate(post);
            if (!postDate || isNaN(postDate.getTime())) return false;

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
        console.log('DEBUG handleConfirmSchedule called:', { immediate, scheduleDate: scheduleData.date, scheduleTime: scheduleData.time });
        try {
            if (!scheduleData.date && !immediate) {
                toast.error('Data inválida');
                return;
            }

            const scheduledDate = new Date(scheduleData.date);
            const [hours, minutes] = scheduleData.time.split(':');
            scheduledDate.setHours(parseInt(hours), parseInt(minutes));

            const sourceItem = pendingDrop?.draggedItem;

            // Extract only serializable primitives to avoid circular references
            const cleanMediaUrls = sourceItem?.mediaUrls ? [...sourceItem.mediaUrls] : [];
            const libraryItemId = sourceItem?.isLibraryItem ? String(sourceItem.id) : null;
            const isHtmlDrop = Boolean(sourceItem?.htmlCode) || sourceItem?.type === 'carousel-html' || sourceItem?.type === 'html' || sourceItem?.format === 'html';
            // Normalize story type: 'stories' is a display alias — backend expects 'story'
            const resolveDropType = (t) => {
                if (!t) return 'static';
                if (t === 'stories') return 'story';
                if (t === 'carousel-premium') return 'carousel';
                return t;
            };
            const dropType = isHtmlDrop ? 'carousel-html' : resolveDropType(scheduleData.type || sourceItem?.type || 'static');

            const postData = {
                accountId: String(selectedProfile.id),
                type: dropType,
                format: dropType,
                caption: String(scheduleData.caption || ''),
                mediaUrls: isHtmlDrop ? [] : cleanMediaUrls,
                libraryItemId: libraryItemId,
                scheduledFor: immediate ? null : scheduledDate.toISOString(),
                isImmediate: Boolean(immediate),
                ...(isHtmlDrop ? { htmlCode: sourceItem?.htmlCode || null } : {})
            };

            // Just create the post, backend handles execution if needed? 
            // Or different endpoint? Typically same endpoint with isImmediate flag?
            // Assuming standard create post for now.
            console.log('DEBUG: postData payload:', JSON.stringify(postData, null, 2));
            await api.post('/api/posts', postData);

            if (immediate) {
                toast.success('Post enviado ao Upload-Post!');
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

    const parseDate = (dateVal) => {
        if (!dateVal) return new Date();
        if (typeof dateVal === 'object' && dateVal._seconds) {
            return new Date(dateVal._seconds * 1000);
        }
        return new Date(dateVal);
    };

    const handleEditPost = (post) => {
        const postDate = getCalendarDate(post);
        setEditingPost(post);
        setEditData({
            date: postDate,
            time: postDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
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

    const DAY_NAME_TO_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

    const isStoryItem = (item) => {
        const fmt = (item.format || item.type || '').toLowerCase();
        return fmt === 'story' || fmt === 'stories';
    };

    const buildAutoFillPreview = (config) => {
        const allAvailable = mediaLibrary.filter(item => !item.isScheduled && item.status !== 'posted');
        const storyItems = allAvailable.filter(isStoryItem);
        const postItems = allAvailable.filter(i => !isStoryItem(i));
        const total = allAvailable.length;
        const limit = config.count === 'all' ? total : Math.min(parseInt(config.count) || total, total);

        const start = new Date(config.startDate + 'T00:00:00');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let cursor = start < today ? new Date(today) : new Date(start);

        const postSlots = [];
        const storySlots = [];
        let safety = 0;

        const nowMs = Date.now();
        const isFutureSlot = (date, time) => {
            const d = new Date(date);
            const [h, m] = time.split(':');
            d.setHours(parseInt(h), parseInt(m), 0, 0);
            return d.getTime() > nowMs;
        };

        while ((postSlots.length < postItems.length || storySlots.length < storyItems.length) && safety < 365) {
            const dayNum = cursor.getDay();
            if (config.postDays.includes(dayNum)) {
                for (const time of (config.postTimes?.length ? config.postTimes : ['09:00'])) {
                    if (postSlots.length < postItems.length && isFutureSlot(cursor, time))
                        postSlots.push({ date: new Date(cursor), time, slotType: 'post' });
                }
            }
            if (config.storyDays.includes(dayNum)) {
                for (const time of (config.storyTimes?.length ? config.storyTimes : ['12:00'])) {
                    if (storySlots.length < storyItems.length && isFutureSlot(cursor, time))
                        storySlots.push({ date: new Date(cursor), time, slotType: 'story' });
                }
            }
            cursor.setDate(cursor.getDate() + 1);
            safety++;
        }

        return [
            ...postSlots.map((slot, i) => ({ ...slot, item: postItems[i] })),
            ...storySlots.map((slot, i) => ({ ...slot, item: storyItems[i] }))
        ]
            .filter(p => p.item)
            .sort((a, b) => {
                const toMs = ({ date, time }) => { const d = new Date(date); const [h, m] = time.split(':'); d.setHours(+h, +m, 0, 0); return d.getTime(); };
                return toMs(a) - toMs(b);
            })
            .slice(0, limit);
    };

    const handleOpenAutoFill = () => {
        const schedule = selectedProfile?.contentSchedule || {};
        const allNums = [0, 1, 2, 3, 4, 5, 6];
        const fromNames = (names) => (names || []).map(d => DAY_NAME_TO_NUM[d]).filter(n => n !== undefined);

        const derived = {
            postDays: schedule.preferredDays?.length ? fromNames(schedule.preferredDays) : [1, 3, 5],
            postTimes: schedule.preferredTimes?.length ? schedule.preferredTimes : ['09:00', '18:00'],
            storyDays: schedule.storyPreferredDays?.length ? fromNames(schedule.storyPreferredDays) : allNums,
            storyTimes: schedule.storyPreferredTimes?.length ? schedule.storyPreferredTimes : ['08:00', '20:00'],
            startDate: autoFillConfig.startDate,
            count: autoFillConfig.count
        };
        setAutoFillConfig(derived);
        setAutoFillPreview(buildAutoFillPreview(derived));
        setShowAutoFillModal(true);
    };

    const handleAutoFillConfigChange = (newConfig) => {
        setAutoFillConfig(newConfig);
        setAutoFillPreview(buildAutoFillPreview(newConfig));
    };

    const handleConfirmAutoFill = async () => {
        if (autoFillPreview.length === 0) { toast.error('Nenhum post disponível para agendar.'); return; }
        setAutoFillLoading(true);
        const toastId = toast.loading(`Agendando ${autoFillPreview.length} posts...`);
        // carousel-premium is not directly postable — treat as carousel
        // 'stories' is a display alias — normalize to 'story' so the backend recognizes the format
        const resolvePostType = (t) => {
            if (t === 'carousel-premium') return 'carousel';
            if (t === 'stories') return 'story';
            return t || 'static';
        };
        const isStoryType = (item) => {
            const t = (item.format || item.type || '').toLowerCase();
            return t === 'story' || t === 'stories';
        };
        const isHtmlItem = (item) => Boolean(item.htmlCode) || item.type === 'carousel-html' || item.format === 'carousel-html' || item.type === 'html' || item.format === 'html';

        let ok = 0, fail = 0;
        const failedItems = [];
        for (const { date, time, item } of autoFillPreview) {
            try {
                const scheduledDate = new Date(date);
                const [h, m] = time.split(':');
                scheduledDate.setHours(parseInt(h), parseInt(m), 0, 0);

                if (scheduledDate.getTime() <= Date.now()) {
                    fail++;
                    failedItems.push({ item, err: `Horário ${time} de ${scheduledDate.toLocaleDateString('pt-BR')} já passou — ignorado` });
                    continue;
                }

                const isHtml = isHtmlItem(item);

                if (isHtml && !item.htmlCode) {
                    throw new Error(`Item "${item.caption?.substring(0, 30) || item.id}" é HTML mas sem código — reabra a biblioteca e salve novamente.`);
                }

                await api.post('/api/posts', {
                    accountId: String(selectedProfile.id),
                    type: isHtml ? 'carousel-html' : resolvePostType(item.type),
                    format: isHtml ? 'carousel-html' : resolvePostType(item.type),
                    caption: String(item.caption || ''),
                    mediaUrls: isHtml ? [] : [...(item.mediaUrls || [])],
                    libraryItemId: String(item.id),
                    scheduledFor: scheduledDate.toISOString(),
                    isImmediate: false,
                    ...(isHtml ? { htmlCode: item.htmlCode } : {})
                });
                ok++;
            } catch (err) {
                fail++;
                failedItems.push({ item, err: err?.response?.data?.error || err?.message || 'erro desconhecido' });
            }
        }
        if (failedItems.length > 0) {
            console.error('❌ Auto-Fill falhou em alguns posts:', failedItems);
            const errMsg = failedItems.map(f => `• ${f.err}`).join('\n');
            toast.error(`${fail} post(s) falharam:\n${errMsg}`, { duration: 8000 });
        }
        setAutoFillLoading(false);
        toast.dismiss(toastId);
        if (fail === 0) toast.success(`✅ ${ok} posts agendados com sucesso!`);
        else toast.success(`✅ ${ok} agendados, ${fail} falharam — veja erros acima.`);
        setShowAutoFillModal(false);
        loadPosts();
        loadLibraryItems();
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem' }}>
            <div className="container">
                <BackButton />

                <div className="flex-between mb-lg">
                    <div>
                        <h1>📅 Calendário de Posts</h1>
                        {selectedProfile ? (
                            <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Perfil: <strong style={{ color: '#7c3aed' }}>{selectedProfile.name}</strong></p>
                        ) : (
                            <p style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Todos os perfis</p>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {selectedProfile && selectedProfile.instagram?.username ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                                <span className="text-xl">📸</span>
                                <div>
                                    <p className="text-xs text-purple-400 font-medium">Conta Conectada</p>
                                    <p className="text-sm font-bold text-white">@{selectedProfile.instagram.username}</p>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '0.5rem', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                ⚠️ {selectedProfile ? 'Sem credenciais configuradas' : 'Selecione um perfil'}
                            </div>
                        )}
                    </div>
                </div>

                <PostsStatusWidget />

                {/* ── Calendar ──────────────────────────────────────────────── */}
                <div className="card-glass" style={{ padding: '2rem', marginTop: '1.5rem' }}>
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
                                                        const isInFlight = post.status === 'processing';
                                                        return (
                                                            <div
                                                                key={post.id}
                                                                onClick={() => handleEditPost(post)}
                                                                style={{
                                                                    fontSize: '0.65rem',
                                                                    padding: '0.25rem',
                                                                    background: isPosted ? 'rgba(34, 197, 94, 0.2)' : isInFlight ? 'rgba(251, 191, 36, 0.18)' : 'rgba(142, 68, 173, 0.3)',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    borderLeft: isPosted ? '3px solid #22c55e' : isInFlight ? '3px solid #f59e0b' : '3px solid #8e44ad',
                                                                    overflow: 'hidden',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease',
                                                                    opacity: isPosted ? 0.8 : 1
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = isPosted ? 'rgba(34, 197, 94, 0.3)' : isInFlight ? 'rgba(251, 191, 36, 0.28)' : 'rgba(142, 68, 173, 0.5)';
                                                                    e.currentTarget.style.transform = 'scale(1.02)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = isPosted ? 'rgba(34, 197, 94, 0.2)' : isInFlight ? 'rgba(251, 191, 36, 0.18)' : 'rgba(142, 68, 173, 0.3)';
                                                                    e.currentTarget.style.transform = 'scale(1)';
                                                                }}
                                                                title={isPosted ? "Postado" : isInFlight ? "Enviado ao Upload-Post" : "Agendado: " + post.caption}
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
                                                                            {getCalendarDate(post).toLocaleTimeString('pt-BR', {
                                                                                hour: '2-digit',
                                                                                minute: '2-digit'
                                                                            })}
                                                                        </span>
                                                                    </div>

                                                                    {/* Published Label */}
                                                                    {isPosted && (
                                                                        <div style={{
                                                                            fontSize: '0.55rem',
                                                                            fontWeight: '700',
                                                                            color: '#22c55e',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '2px',
                                                                            marginTop: '2px'
                                                                        }}>
                                                                            <span>✅ Postado</span>
                                                                        </div>
                                                                    )}
                                                                    {isInFlight && (
                                                                        <div style={{
                                                                            fontSize: '0.55rem',
                                                                            fontWeight: '700',
                                                                            color: '#fbbf24',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '2px',
                                                                            marginTop: '2px'
                                                                        }}>
                                                                            <span>⏳ Em processamento</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Quick Delete "x" */}
                                                                {!isPosted && !isInFlight && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (confirm('Deseja realmente cancelar este agendamento?')) {
                                                                                api.delete(`/api/posts/${post.id}`)
                                                                                    .then(() => {
                                                                                        toast.success('Post cancelado');
                                                                                        loadPosts();
                                                                                        loadLibraryItems();
                                                                                    })
                                                                                    .catch(err => {
                                                                                        console.error(err);
                                                                                        toast.error('Erro ao cancelar');
                                                                                    });
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            background: 'rgba(239, 68, 68, 0.8)',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            borderRadius: '50%',
                                                                            width: '16px',
                                                                            height: '16px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: '10px',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s ease',
                                                                            marginLeft: '4px',
                                                                            zIndex: 10
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            e.currentTarget.style.background = '#ef4444';
                                                                            e.currentTarget.style.transform = 'scale(1.2)';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                                                                            e.currentTarget.style.transform = 'scale(1)';
                                                                        }}
                                                                        title="Cancelar agendamento"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Drop Zone Indicator */}
                                                {
                                                    isHovered && draggedItem && (
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
                                                    )
                                                }
                                            </>
                                        )
                                        }
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                {/* ── Posts Prontos — tira horizontal ──────────────────────── */}
                <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                ✅ Posts Prontos
                            </h3>
                            {mediaLibrary.length > 0 && (
                                <span style={{ fontSize: '0.72rem', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: '20px', padding: '2px 9px', fontWeight: 600 }}>
                                    {mediaLibrary.length} {mediaLibrary.length === 1 ? 'post' : 'posts'}
                                </span>
                            )}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                Arraste para o calendário para agendar
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {mediaLibrary.filter(i => !i.isScheduled && i.status !== 'posted').length > 0 && (
                                <button
                                    onClick={handleOpenAutoFill}
                                    style={{ cursor: 'pointer', padding: '6px 14px', background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(168,85,247,0.2))', border: '1px solid rgba(168,85,247,0.5)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '5px' }}
                                >
                                    🪄 Auto-Fill
                                </button>
                            )}
                            <label style={{ cursor: 'pointer', padding: '6px 14px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                ➕ Upload Rápido
                                <input type="file" accept="image/*,video/mp4" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>

                    {mediaLibrary.length === 0 ? (
                        <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                            Nenhum post marcado como "Pronto" neste perfil. Vá à Library e marque posts como prontos.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px', paddingTop: '4px' }}>
                            {mediaLibrary.map((item) => {
                                const locked = item.isScheduled || item.status === 'posted';
                                return (
                                    <div
                                        key={item.id}
                                        draggable={!locked}
                                        onDragStart={(e) => handleDragStart(e, item)}
                                        title={locked ? (item.isScheduled ? 'Já agendado' : 'Já postado') : (item.caption || 'Sem legenda')}
                                        style={{
                                            flexShrink: 0,
                                            width: '90px',
                                            background: 'rgba(255,255,255,0.04)',
                                            border: locked ? '2px solid rgba(255,255,255,0.06)' : '2px solid transparent',
                                            borderRadius: '10px',
                                            overflow: 'hidden',
                                            cursor: locked ? 'default' : 'grab',
                                            opacity: locked ? 0.55 : 1,
                                            transition: 'all 0.15s ease',
                                            position: 'relative',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!locked) {
                                                e.currentTarget.style.borderColor = '#8e44ad';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(142,68,173,0.3)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = locked ? 'rgba(255,255,255,0.06)' : 'transparent';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    >
                                        {/* Thumbnail */}
                                        <div style={{ position: 'relative', width: '90px', height: '90px', background: '#111' }}>
                                            {item.thumbnail ? (
                                                <img
                                                    src={item.thumbnail}
                                                    alt=""
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block' }}
                                                />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: 'rgba(255,255,255,0.2)' }}>
                                                    {item.type?.includes('carousel') || item.type === 'html' ? '🎠' : item.type === 'video' ? '🎥' : '📸'}
                                                </div>
                                            )}

                                            {/* type pill */}
                                            <div style={{ position: 'absolute', bottom: '4px', left: '4px', fontSize: '0.58rem', fontWeight: 700, background: 'rgba(0,0,0,0.7)', color: '#e2e8f0', borderRadius: '4px', padding: '1px 5px', pointerEvents: 'none' }}>
                                                {item.type?.includes('carousel') || item.type === 'html' ? '🎠 ' + (item.type.includes('html') ? 'HTML' : 'Carrossel') : item.type === 'video' ? '🎥 Vídeo' : '📸 Estático'}
                                            </div>

                                            {/* status badge */}
                                            {item.isScheduled && (
                                                <div style={{ position: 'absolute', top: '4px', right: '4px', fontSize: '0.55rem', fontWeight: 700, background: 'rgba(234,179,8,0.85)', color: '#000', borderRadius: '4px', padding: '1px 5px', pointerEvents: 'none' }}>
                                                    AGEND.
                                                </div>
                                            )}
                                        </div>

                                        {/* caption */}
                                        <div style={{ padding: '5px 6px', fontSize: '0.62rem', color: 'var(--text-tertiary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                                            {item.caption || <span style={{ color: 'rgba(255,255,255,0.15)', fontStyle: 'italic' }}>sem legenda</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
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
                                <label className="input-label">Tipo de Post (Detectado Automaticamente)</label>
                                <div 
                                    className="input" 
                                    style={{ 
                                        background: 'rgba(255,255,255,0.05)', 
                                        color: 'var(--text-secondary)', 
                                        cursor: 'not-allowed', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        opacity: 0.8 
                                    }}
                                >
                                    {scheduleData.type === 'static' && '📸 Post Estático (1 imagem)'}
                                    {scheduleData.type === 'carousel' && '🎠 Carrossel (múltiplas imagens)'}
                                    {(scheduleData.type === 'carousel-html' || scheduleData.type === 'html') && '🎠 Carrossel (HTML/ElevePic)'}
                                    {scheduleData.type === 'carousel-premium' && '🎠 Carrossel Premium'}
                                    {scheduleData.type === 'video' && '🎥 Vídeo'}
                                    {scheduleData.type === 'reel' && '🎬 Reel'}
                                    {(scheduleData.type === 'story' || scheduleData.type === 'stories') && '📱 Story'}
                                    {!['static', 'carousel', 'carousel-html', 'html', 'carousel-premium', 'video', 'reel', 'story', 'stories'].includes(scheduleData.type) && `📌 ${scheduleData.type}`}
                                </div>
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
                                    onClick={() => handleConfirmSchedule()}
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
                                    disabled={editingPost.status === 'success' || editingPost.status === 'processing'}
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
                                    disabled={editingPost.status === 'success' || editingPost.status === 'processing'}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Legenda</label>
                                <textarea
                                    className="input"
                                    value={editData.caption}
                                    onChange={(e) => setEditData({ ...editData, caption: e.target.value })}
                                    rows={4}
                                    disabled={editingPost.status === 'success' || editingPost.status === 'processing'}
                                />
                            </div>

                            <div className="flex gap-md mt-lg">
                                {editingPost.status === 'success' || editingPost.status === 'processing' ? (
                                    <div style={{
                                        width: '100%',
                                        padding: '1rem',
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        border: '1px solid rgba(34, 197, 94, 0.2)',
                                        borderRadius: 'var(--radius-md)',
                                        color: '#22c55e',
                                        fontSize: '0.9rem',
                                        textAlign: 'center',
                                        fontWeight: '500'
                                    }}>
                                        {editingPost.status === 'processing'
                                            ? '⏳ Este post já foi entregue ao Upload-Post e não deve mais ser alterado localmente.'
                                            : '✨ Este post já foi publicado e não pode ser alterado.'}
                                    </div>
                                ) : (
                                    <>
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
                                    </>
                                )}
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
            {/* Auto-Fill Modal */}
            {showAutoFillModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '2rem' }}>
                    <div className="card-glass" style={{ maxWidth: '560px', width: '100%', padding: '2rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button onClick={() => setShowAutoFillModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>

                        <h2 style={{ marginBottom: '0.25rem' }}>🪄 Auto-Fill do Calendário</h2>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                            Distribui posts e stories prontos nos próximos dias conforme as configurações do perfil.
                        </p>

                        {/* Summary chips */}
                        {(() => {
                            const all = mediaLibrary.filter(i => !i.isScheduled && i.status !== 'posted');
                            const stories = all.filter(isStoryItem).length;
                            const posts = all.length - stories;
                            return (
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#c4b5fd', padding: '3px 10px', borderRadius: '20px' }}>
                                        {posts} post{posts !== 1 ? 's' : ''} prontos
                                    </span>
                                    <span style={{ fontSize: '0.75rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', padding: '3px 10px', borderRadius: '20px' }}>
                                        {stories} stor{stories !== 1 ? 'ies' : 'y'} prontos
                                    </span>
                                </div>
                            );
                        })()}

                        {/* Posts config */}
                        <div style={{ padding: '0.75rem', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '10px', marginBottom: '0.75rem' }}>
                            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a78bfa', marginBottom: '0.6rem' }}>Posts</p>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.35rem' }}>Dias</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((name, idx) => {
                                        const active = autoFillConfig.postDays.includes(idx);
                                        return (
                                            <button key={idx} onClick={() => {
                                                const days = active ? autoFillConfig.postDays.filter(d => d !== idx) : [...autoFillConfig.postDays, idx].sort();
                                                handleAutoFillConfigChange({ ...autoFillConfig, postDays: days });
                                            }} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.05)', border: active ? '1px solid rgba(168,85,247,0.7)' : '1px solid rgba(255,255,255,0.1)', color: active ? '#c4b5fd' : 'var(--text-tertiary)' }}>
                                                {name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.35rem' }}>Horários</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                                    {(autoFillConfig.postTimes || []).map((t, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.5)', borderRadius: '6px', padding: '2px 6px' }}>
                                            <input type="time" value={t} style={{ background: 'transparent', border: 'none', color: '#d8b4fe', fontSize: '0.78rem', outline: 'none', width: '5.2rem', cursor: 'pointer' }}
                                                onChange={e => { const times = [...autoFillConfig.postTimes]; times[i] = e.target.value; handleAutoFillConfigChange({ ...autoFillConfig, postTimes: times }); }} />
                                            <button onClick={() => { const times = autoFillConfig.postTimes.filter((_, idx) => idx !== i); handleAutoFillConfigChange({ ...autoFillConfig, postTimes: times }); }} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '0.9rem' }}>×</button>
                                        </div>
                                    ))}
                                    {autoFillConfig.postTimes.length < 4 && (
                                        <button onClick={() => handleAutoFillConfigChange({ ...autoFillConfig, postTimes: [...autoFillConfig.postTimes, '12:00'] })} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.73rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid #3f3f46', color: '#a1a1aa' }}>+ Horário</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Stories config */}
                        <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', marginBottom: '0.75rem' }}>
                            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6ee7b7', marginBottom: '0.6rem' }}>Stories</p>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.35rem' }}>Dias</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((name, idx) => {
                                        const active = autoFillConfig.storyDays.includes(idx);
                                        return (
                                            <button key={idx} onClick={() => {
                                                const days = active ? autoFillConfig.storyDays.filter(d => d !== idx) : [...autoFillConfig.storyDays, idx].sort();
                                                handleAutoFillConfigChange({ ...autoFillConfig, storyDays: days });
                                            }} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)', border: active ? '1px solid rgba(16,185,129,0.6)' : '1px solid rgba(255,255,255,0.1)', color: active ? '#6ee7b7' : 'var(--text-tertiary)' }}>
                                                {name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.35rem' }}>Horários</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                                    {(autoFillConfig.storyTimes || []).map((t, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', padding: '2px 6px' }}>
                                            <input type="time" value={t} style={{ background: 'transparent', border: 'none', color: '#6ee7b7', fontSize: '0.78rem', outline: 'none', width: '5.2rem', cursor: 'pointer' }}
                                                onChange={e => { const times = [...autoFillConfig.storyTimes]; times[i] = e.target.value; handleAutoFillConfigChange({ ...autoFillConfig, storyTimes: times }); }} />
                                            <button onClick={() => { const times = autoFillConfig.storyTimes.filter((_, idx) => idx !== i); handleAutoFillConfigChange({ ...autoFillConfig, storyTimes: times }); }} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '0.9rem' }}>×</button>
                                        </div>
                                    ))}
                                    {autoFillConfig.storyTimes.length < 4 && (
                                        <button onClick={() => handleAutoFillConfigChange({ ...autoFillConfig, storyTimes: [...autoFillConfig.storyTimes, '12:00'] })} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.73rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid #3f3f46', color: '#a1a1aa' }}>+ Horário</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Start date + count */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">A partir de</label>
                                <input type="date" className="input" value={autoFillConfig.startDate}
                                    onChange={e => handleAutoFillConfigChange({ ...autoFillConfig, startDate: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Quantidade</label>
                                <select className="input" value={autoFillConfig.count}
                                    onChange={e => handleAutoFillConfigChange({ ...autoFillConfig, count: e.target.value })}>
                                    <option value="all">Todos ({mediaLibrary.filter(i => !i.isScheduled && i.status !== 'posted').length})</option>
                                    {[5,10,15,20,30].filter(n => n <= mediaLibrary.filter(i => !i.isScheduled && i.status !== 'posted').length).map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Preview */}
                        <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '10px' }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a78bfa', marginBottom: '0.5rem' }}>
                                📋 Preview — {autoFillPreview.length} item{autoFillPreview.length !== 1 ? 's' : ''} serão agendados
                                {autoFillPreview.length > 0 && (() => {
                                    const sc = autoFillPreview.filter(p => p.slotType === 'story').length;
                                    const pc = autoFillPreview.length - sc;
                                    return <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}> ({pc} post{pc !== 1 ? 's' : ''} + {sc} stor{sc !== 1 ? 'ies' : 'y'})</span>;
                                })()}
                            </p>
                            {autoFillPreview.length === 0 ? (
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Nenhum item disponível ou nenhum dia selecionado.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                                    {autoFillPreview.map(({ date, time, slotType, item }, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            <span style={{ color: slotType === 'story' ? '#10b981' : '#7c3aed', fontWeight: 700, minWidth: '118px' }}>
                                                {date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} {time}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', background: slotType === 'story' ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)', color: slotType === 'story' ? '#6ee7b7' : '#c4b5fd', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                                                {slotType === 'story' ? 'story' : (item?.type || 'post')}
                                            </span>
                                            {item?.thumbnail ? (
                                                <img src={item.thumbnail} alt="" style={{ width: '18px', height: '18px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{slotType === 'story' ? '📖' : (item?.type === 'carousel' || item?.type === 'carousel-html') ? '🎠' : (item?.type === 'html' || item?.htmlCode) ? '🖥️' : item?.type === 'video' ? '🎥' : '📸'}</span>
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                {item?.caption || <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.2)' }}>sem legenda</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button
                                onClick={handleConfirmAutoFill}
                                disabled={autoFillLoading || autoFillPreview.length === 0}
                                style={{
                                    flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: autoFillPreview.length === 0 ? 'not-allowed' : 'pointer',
                                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                    color: '#fff', fontWeight: 700, fontSize: '0.9rem', opacity: autoFillPreview.length === 0 ? 0.5 : 1,
                                    transition: 'opacity 0.15s ease'
                                }}
                            >
                                {autoFillLoading ? '⏳ Agendando...' : `🪄 Confirmar Auto-Fill (${autoFillPreview.length})`}
                            </button>
                            <button onClick={() => setShowAutoFillModal(false)} className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >

    );
}
