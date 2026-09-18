import { db } from '../config/firebase.js';
import { findAvailableScheduleSlots } from '../utils/scheduleConfig.js';

// Posts nestes estados não seguram mais o horário: ele volta para o pool.
const RELEASED_STATUSES = new Set([
    'rejected',
    'expired',
    'cancelled',
    'canceled',
    'library',
    'failed',
    'error'
]);

function toDate(value) {
    if (!value) return null;
    const date = value.toDate?.() || new Date(value);
    return Number.isNaN(date?.getTime?.()) ? null : date;
}

/**
 * Horários futuros já comprometidos com outros posts do mesmo perfil —
 * agendados, aprovados ou rascunhos com data definida à mão.
 *
 * A consulta filtra por `scheduledFor` (índice de campo único) e restringe o
 * perfil em memória: posts sem data ficam de fora automaticamente e o volume
 * de agendamentos futuros é pequeno.
 */
export async function getReservedSlotTimes(businessProfileId, { excludePostIds = [], from = new Date() } = {}) {
    const reserved = new Set();
    if (!businessProfileId) return reserved;

    const excluded = new Set(excludePostIds.filter(Boolean));
    const snapshot = await db.collection('posts')
        .where('scheduledFor', '>=', from)
        .get();

    snapshot.forEach(doc => {
        if (excluded.has(doc.id)) return;
        const data = doc.data() || {};
        if (data.businessProfileId !== businessProfileId) return;
        if (RELEASED_STATUSES.has(data.status)) return;

        const scheduledFor = toDate(data.scheduledFor);
        if (scheduledFor) reserved.add(scheduledFor.getTime());
    });

    return reserved;
}

/**
 * Distribui `kinds` ('post' | 'story') pelos próximos horários livres do
 * cronograma, na ordem recebida. Não grava nada — quem chama decide se
 * persiste (aprovação) ou só exibe (projeção na tela de revisão).
 */
export async function allocateSlotsForKinds({
    businessProfileId,
    schedule,
    kinds = [],
    from = new Date(),
    reserved = null,
    excludePostIds = []
}) {
    if (kinds.length === 0) return [];

    const reservedTimes = reserved || await getReservedSlotTimes(businessProfileId, { excludePostIds, from });
    const isSlotTaken = slot => reservedTimes.has(slot.getTime());

    return kinds.map(kind => {
        const [slot] = findAvailableScheduleSlots({
            schedule,
            kind: kind === 'story' ? 'story' : 'post',
            count: 1,
            from,
            isSlotTaken
        });

        if (slot) reservedTimes.add(slot.getTime());
        return slot || null;
    });
}

/**
 * Próximo horário livre para um único conteúdo. Devolve null quando o
 * cronograma não tem nenhuma vaga dentro do horizonte de busca.
 */
export async function allocateNextScheduleSlot({ businessProfileId, schedule, kind = 'post', from = new Date(), excludePostIds = [] }) {
    const [slot] = await allocateSlotsForKinds({
        businessProfileId,
        schedule,
        kinds: [kind],
        from,
        excludePostIds
    });
    return slot || null;
}
