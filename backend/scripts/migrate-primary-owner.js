import fs from 'fs/promises';
import path from 'path';
import { db } from '../src/config/firebase.js';
import {
    DEFAULT_SCHEDULE_TIMEZONE,
    addDaysInTimeZone,
    getNextWeekStart,
    getScheduleWeekKey,
    getZonedDateParts,
} from '../src/utils/scheduleConfig.js';

const OLD_UID = 'A9NJto9KIOSgYJg8uRj8u5xAvAg1';
const NEW_UID = 'urL2RUboHscN40FGOwXtt0vYfdt1';
const FITSWAP_PROFILE_ID = 'SSsSBwl7GYhbEGfgBOFH';
const MIGRATION_ID = 'primary-owner-and-draft-recovery-v1';
const COLLECTIONS = ['businessProfiles', 'accounts', 'posts', 'library_items', 'ai_history'];
const applyChanges = process.argv.includes('--apply');

function serialize(value) {
    if (value?.toDate) return { __timestamp: value.toDate().toISOString() };
    if (Array.isArray(value)) return value.map(serialize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serialize(nested)]));
    }
    return value;
}

function weekdayOffset(dayName) {
    return {
        monday: 0,
        tuesday: 1,
        wednesday: 2,
        thursday: 3,
        friday: 4,
        saturday: 5,
        sunday: 6,
    }[dayName];
}

async function collectOwnerDocuments() {
    const result = {};
    for (const collection of COLLECTIONS) {
        const snapshot = await db.collection(collection).where('userId', '==', OLD_UID).get();
        result[collection] = snapshot.docs;
    }
    return result;
}

async function countOwnerDocuments(userId) {
    const counts = {};
    for (const collection of COLLECTIONS) {
        const snapshot = await db.collection(collection).where('userId', '==', userId).get();
        counts[collection] = snapshot.size;
    }
    return counts;
}

async function createBackup(documents, drafts, schedulerRuns) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve('backups');
    await fs.mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `owner-migration-${stamp}.json`);
    const payload = {
        migrationId: MIGRATION_ID,
        createdAt: new Date().toISOString(),
        oldUid: OLD_UID,
        newUid: NEW_UID,
        collections: Object.fromEntries(Object.entries(documents).map(([collection, docs]) => [
            collection,
            docs.map(doc => ({ id: doc.id, data: serialize(doc.data()) })),
        ])),
        drafts: drafts.map(doc => ({ id: doc.id, data: serialize(doc.data()) })),
        schedulerRuns: schedulerRuns.map(doc => ({ id: doc.id, data: serialize(doc.data()) })),
    };
    await fs.writeFile(backupPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    return backupPath;
}

async function commitInBatches(items, updater) {
    for (let offset = 0; offset < items.length; offset += 400) {
        const batch = db.batch();
        for (const item of items.slice(offset, offset + 400)) updater(batch, item);
        await batch.commit();
    }
}

async function main() {
    const now = new Date();
    const documents = await collectOwnerDocuments();
    const draftsSnapshot = await db.collection('posts')
        .where('businessProfileId', '==', FITSWAP_PROFILE_ID)
        .where('status', '==', 'draft')
        .get();
    const drafts = draftsSnapshot.docs.filter(doc => doc.data().recoveryMigrationId !== MIGRATION_ID);
    const schedulerSnapshot = await db.collection('schedulerRuns').get();
    const stuckRuns = schedulerSnapshot.docs.filter(doc => {
        const data = doc.data();
        const leaseUntil = data.leaseUntil?.toDate?.() || null;
        return data.status === 'running' && (!leaseUntil || leaseUntil < now);
    });

    const targetMonday = getNextWeekStart(now, DEFAULT_SCHEDULE_TIMEZONE);
    const targetWeekKey = getScheduleWeekKey(targetMonday, DEFAULT_SCHEDULE_TIMEZONE);
    const counts = Object.fromEntries(Object.entries(documents).map(([key, docs]) => [key, docs.length]));
    const summary = {
        mode: applyChanges ? 'apply' : 'dry-run',
        migrationId: MIGRATION_ID,
        ownerDocuments: counts,
        draftsToReschedule: drafts.length,
        staleRunsToRecover: stuckRuns.length,
        targetWeekKey,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!applyChanges) return;

    const backupPath = await createBackup(documents, drafts, stuckRuns);
    console.log(`Backup criado em ${backupPath}`);

    const ownerItems = Object.entries(documents).flatMap(([collection, docs]) => docs.map(doc => ({ collection, doc })));
    await commitInBatches(ownerItems, (batch, { doc }) => batch.update(doc.ref, {
        userId: NEW_UID,
        migratedFromUserId: OLD_UID,
        ownerMigrationId: MIGRATION_ID,
        migratedAt: now,
        updatedAt: now,
    }));

    await commitInBatches(drafts, (batch, doc) => {
        const draft = doc.data();
        const originalDate = draft.scheduledFor?.toDate?.() || new Date(draft.scheduledFor);
        const parts = getZonedDateParts(originalDate, DEFAULT_SCHEDULE_TIMEZONE);
        const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
        const scheduledFor = addDaysInTimeZone(
            targetMonday,
            weekdayOffset(parts.dayName),
            DEFAULT_SCHEDULE_TIMEZONE,
            time,
        );
        batch.update(doc.ref, {
            userId: NEW_UID,
            scheduledFor,
            status: 'draft',
            isDraft: true,
            externalScheduler: null,
            externalJobId: null,
            externalPayload: null,
            schedulingError: null,
            targetWeekKey,
            recoveryMigrationId: MIGRATION_ID,
            recoveredAt: now,
            updatedAt: now,
        });
    });

    for (const doc of drafts) {
        const draft = doc.data();
        if (!draft.libraryItemId) continue;
        const migratedDraft = await doc.ref.get();
        const scheduledFor = migratedDraft.data().scheduledFor;
        await db.collection('library_items').doc(draft.libraryItemId).set({
            userId: NEW_UID,
            scheduledFor,
            scheduledPostId: doc.id,
            isScheduled: false,
            status: 'editar',
            updatedAt: now,
        }, { merge: true });
    }

    await commitInBatches(stuckRuns, (batch, doc) => batch.set(doc.ref, {
        status: 'failed',
        failureReason: 'stale-recovered',
        error: 'Execução antiga recuperada pela migração de estabilização.',
        failedAt: now,
        updatedAt: now,
        leaseUntil: null,
    }, { merge: true }));

    await db.collection('schedulerRuns').doc(`weekly_${FITSWAP_PROFILE_ID}_${targetWeekKey}`).set({
        kind: 'weekly-generation',
        profileId: FITSWAP_PROFILE_ID,
        targetWeekKey,
        status: 'recovered',
        generated: drafts.length,
        failed: 0,
        recoveryMigrationId: MIGRATION_ID,
        finishedAt: now,
        updatedAt: now,
        leaseUntil: null,
    }, { merge: true });

    const migratedDrafts = await db.collection('posts')
        .where('businessProfileId', '==', FITSWAP_PROFILE_ID)
        .where('recoveryMigrationId', '==', MIGRATION_ID)
        .get();
    const verification = {
        oldOwnerAfter: await countOwnerDocuments(OLD_UID),
        newOwnerAfter: await countOwnerDocuments(NEW_UID),
        recoveredDrafts: migratedDrafts.size,
        recoveredDraftsWithExternalJob: migratedDrafts.docs.filter(doc => Boolean(doc.data().externalJobId)).length,
        recoveredDraftStatuses: [...new Set(migratedDrafts.docs.map(doc => doc.data().status))],
    };

    console.log(JSON.stringify({ ...summary, backupPath, verification, completed: true }, null, 2));
}

main().then(() => process.exit(0)).catch(error => {
    console.error('Falha na migração:', error);
    process.exit(1);
});
