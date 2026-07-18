import admin from 'firebase-admin';
import { createHash } from 'crypto';
import { db } from '../src/config/firebase.js';

const apply = process.argv.includes('--apply');

function normalized(value) {
    return String(value || '')
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function nonEmptyStrings(values) {
    return Array.isArray(values)
        ? values.map((value) => String(value || '').trim()).filter(Boolean)
        : [];
}

function appendMissing(existing, heading, values) {
    const items = nonEmptyStrings(values).filter((value) => !normalized(existing).includes(normalized(value)));
    if (!items.length) return existing || '';

    const section = `${heading}:\n${items.map((item) => `- ${item}`).join('\n')}`;
    return [String(existing || '').trim(), section].filter(Boolean).join('\n\n');
}

function migratedPrompts(existing, legacyPrompts, profileId) {
    const current = Array.isArray(existing) ? existing : [];
    const knownTexts = new Set(current.map((prompt) => normalized(prompt?.text || prompt)));
    const additions = nonEmptyStrings(legacyPrompts)
        .filter((prompt) => !knownTexts.has(normalized(prompt)))
        .map((text, index) => ({
            id: `legacy-${createHash('sha1').update(`${profileId}:${text}`).digest('hex').slice(0, 12)}`,
            name: `Referência migrada ${index + 1}`,
            text,
            createdAt: new Date().toISOString(),
        }));

    return [...current, ...additions];
}

async function migrateProfile(doc) {
    const profile = doc.data();
    const kit = profile.brandKit || {};
    const preferences = profile.aiPreferences || {};
    const legacyKeys = ['editorialLines', 'uiPatterns', 'valuePillars', 'referencePrompts'];
    const hasLegacyBrandKit = legacyKeys.some((key) => Object.hasOwn(kit, key));
    const hasLegacyTone = Object.hasOwn(preferences, 'tone');

    if (!hasLegacyBrandKit && !hasLegacyTone) return null;

    const nextKit = { ...kit };
    const nextPreferences = { ...preferences };
    const nextBranding = { ...(profile.branding || {}) };

    nextBranding.guidelines = appendMissing(nextBranding.guidelines, 'PADRÕES DE UI DA MARCA', kit.uiPatterns);
    nextKit.voice = appendMissing(nextKit.voice, 'TOM COMPLEMENTAR', preferences.tone ? [preferences.tone] : []);
    delete nextPreferences.tone;

    const patch = {
        contentStrategy: appendMissing(profile.contentStrategy, 'LINHAS EDITORIAIS ADICIONAIS', kit.editorialLines),
        brandContext: appendMissing(profile.brandContext, 'PILARES DE VALOR', kit.valuePillars),
        branding: nextBranding,
        aiPreferences: { ...nextPreferences, favoritePrompts: migratedPrompts(nextPreferences.favoritePrompts, kit.referencePrompts, doc.id) },
        'brandKit.voice': nextKit.voice,
        updatedAt: new Date(),
        'brandKit.editorialLines': admin.firestore.FieldValue.delete(),
        'brandKit.uiPatterns': admin.firestore.FieldValue.delete(),
        'brandKit.valuePillars': admin.firestore.FieldValue.delete(),
        'brandKit.referencePrompts': admin.firestore.FieldValue.delete(),
    };

    console.log(`${profile.name || doc.id}: linhas=${nonEmptyStrings(kit.editorialLines).length}, ui=${nonEmptyStrings(kit.uiPatterns).length}, valores=${nonEmptyStrings(kit.valuePillars).length}, tom=${preferences.tone ? 'sim' : 'não'}, prompts=${nonEmptyStrings(kit.referencePrompts).length}`);
    if (apply) await doc.ref.update(patch);
    return patch;
}

const snapshot = await db.collection('businessProfiles').get();
let affected = 0;

for (const doc of snapshot.docs) {
    if (await migrateProfile(doc)) affected += 1;
}

console.log(`${apply ? 'Migrados' : 'Prévia'}: ${affected} perfil(is).`);
if (!apply) console.log('Execute com --apply para gravar as alterações.');
