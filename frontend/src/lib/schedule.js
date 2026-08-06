// Leitura única das flags de automação de um perfil de negócio.
//
// Existiam duas leituras concorrentes no mesmo dashboard: a matriz de controle
// usava `contentSchedule.autoGenerationEnabled` e o banner usava
// `autoGenerateSettings.enabled || autoPostEnabled`, campos que nenhum perfil
// tem. O banner anunciava "DESLIGADO" mesmo com o piloto ativo.
//
// Espelha a normalização do backend (utils/scheduleConfig.js): quando a flag
// nova não existe, o modo legado decide.

export function isAutopilotEnabled(profile) {
    const schedule = profile?.contentSchedule || {};
    if (typeof schedule.autoGenerationEnabled === 'boolean') {
        return schedule.autoGenerationEnabled;
    }
    const legacyMode = schedule.autonomyMode || profile?.autonomyMode;
    return legacyMode !== 'manual';
}

export function isAutoApproveEnabled(profile) {
    return profile?.contentSchedule?.autoApproveFallbackEnabled === true;
}
