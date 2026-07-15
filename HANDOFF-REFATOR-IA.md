# HANDOFF — Refator dos fluxos de geração de conteúdo IA (branding + copy coerente)

> Documento de continuidade. Escrito para uma LLM (ou dev) retomar a implementação sem contexto prévio.
> Plano original aprovado pelo usuário. Progresso: **Commits 0, 1, 2, 3, 4, 5, 6 e 7 CONCLUÍDOS**, Commit 8 pendente.

> Implementação C1: foram adicionados os campos de IA ao `brandKit`, os presets de Fitswap, Tudy, ElevePic e Inner Boost receberam direção de voz/copy/visual como dados, o merge passou a respeitar substituição de listas curadas, e foi criado `buildBrandPromptSections()` com testes unitários.

> Última implementação: **Commit 2 concluído em 15/07/2026**. `getEditorialSystemPrompt`, a geração de carrossel HTML (inclusive JSON estruturado) e `generateImageCaption` agora usam `buildBrandPromptSections()`. Os hardcodes específicos de Tudy nesses fluxos foram removidos; os formatos `[WHITE_OVERLAY]` (Fitswap) e `[PREMIUM_OVERLAY]` (premium) foram preservados. `DEBUG_PROMPTS=1` registra o system prompt final antes de chamadas de IA. Validação: `node --check` nos módulos alterados e `npm test -- --run tests/brandProfiles.test.js tests/brandPromptSections.test.js tests/carouselPromptService.test.js` (**13 testes aprovados**).

> Última implementação: **Commit 3 concluído em 15/07/2026**. `generateCarouselPrompts` e `generateCarouselSlideConcepts` agora recebem `slides[]` via JSON Schema estrito, fazem no máximo uma chamada de repair para slides faltantes e serializam somente ao final para as tags legadas. A duplicação silenciosa foi removida. `refineBackgroundPrompts` passou a refinar `slides[].background` antes da serialização. O Gemini do conteúdo estruturado ElevePic pede `application/json`. Validação: sintaxe dos módulos e roundtrip do serializador contra as gramáticas de autopilot/frontend (**17 testes específicos aprovados**). A suíte total continua com a falha preexistente de `post-flow.test.js` sobre o argumento adicional `undefined` em `checkJobStatus`.

> Última implementação: **Commit 4 concluído em 15/07/2026**. `POST /api/ai/generate-caption` aceita `businessProfileId`, resolve o perfil no backend e aplica `identity`/`voice`/`caption` pelo builder. A geração foi extraída para `captionService.generateCaptionFromBrief`, pronta para reuso pelo Content Plan do C5; sem perfil, conserva o prompt genérico. Os quatro call sites de generate/library enviam o perfil selecionado. Validação: checagem de sintaxe e testes de prompt de legenda (**19 testes específicos aprovados**); a única falha da suíte completa permanece a preexistente em `post-flow.test.js`.

> Última implementação: **Commit 5 concluído em 15/07/2026**. Criado `contentPlanService.generateContentPlan()` com JSON Schema estrito para narrativa, slides, legenda, hashtags e CTA; repair único para slides faltantes e refinamento dos backgrounds antes da entrega. A rota `POST /api/ai/generate-content-plan` resolve o perfil no servidor e dá precedência ao `brandKit` persistido. No modo premium, o frontend usa essa rota em uma única ação, mantém tags compatíveis com o editor, envia `slide.background` diretamente à geração de imagem e preenche a legenda com hashtags. Validação: **21 testes específicos aprovados**, compilação Next concluída antes da etapa de lint e fluxo novo sem erros no `tsc`; permanecem erros globais preexistentes de lint/TypeScript e a falha conhecida em `post-flow.test.js`.

> Última implementação: **Commit 6 concluído em 15/07/2026**. Criado `contentQaService` com scan local case/acento-insensitive de `forbiddenWords` e meta-copy, bypass da LLM quando não há regras nem suspeitas e revisão estruturada por `gpt-4o-mini` nos demais casos. `generateContentPlan({ qa: true })` faz no máximo uma regeneração direcionada dos slides/caption ofensores, preserva backgrounds já refinados e executa apenas recheck local; qualquer falha de QA degrada para `warnings: []`. A rota aceita `qa` (default `true`) e retorna warnings. Validação: **25 testes específicos aprovados**; a única falha da suíte completa permanece a preexistente em `post-flow.test.js`.

> Última implementação: **Commit 7 concluído em 15/07/2026**. O gerador HTML deixou de instruir ou exemplificar URLs externas de imagem: todas as marcas agora usam `data-ai-prompt` para imagens geradas por IA ou composição CSS pura. `libraryImageTreatment` foi encadeado da rota ao serviço com modos `auto`/`heavy`/`light` (`auto` mantém o tratamento pesado; `light` usa scrim `rgba(0,0,0,0.35)` sem blur). O reparador conta tokens exatos de `class="slide"`, faz um único retry se a IA alterar a quantidade e produz erro 422 claro se ainda houver divergência. Validação: sintaxe, ausência de referências ao Unsplash e **30 testes específicos aprovados**; a falha preexistente da suíte total permanece documentada no Commit 3.

---

## 1. Objetivo geral

Hoje só 4 marcas (Fitswap, Tudy, ElevePic, Inner Boost) geram conteúdo de alta qualidade porque seus briefings estão **hardcoded** nos prompts do backend. Perfis novos caem em prompts genéricos fracos. Além disso: copy dos slides e legenda são geradas desconectadas; parsing por `---SEPARATOR---` **duplica slides silenciosamente**; `/generate-caption` ignora o perfil; carrossel HTML instrui URLs do `source.unsplash.com` (serviço MORTO).

Meta: qualquer marca com perfil preenchido no Firestore recebe o mesmo nível de direção criativa das 4 "VIP", com copy coerente entre slides + legenda + CTA.

---

## 2. ⚠️ CONTRATOS QUE NÃO PODEM QUEBRAR

O formato de tags abaixo é contrato consumido em **5 lugares**. Ele deve ser PRESERVADO nas fronteiras das APIs:

```
[PREMIUM_OVERLAY] [BACKGROUND: ...] [HEADLINE: ...] [SUBHEADLINE: ...] [HIGHLIGHTS: a, b]
[WHITE_OVERLAY] [BACKGROUND: ...] [HEADLINE: ...] [HIGHLIGHTS: ...]   (formato Fitswap)
```

Consumidores (verificados):
1. **frontend/src/app/dashboard/generate/components/PremiumCarouselEditor.tsx** — `buildPremiumLayoutFromPrompt()` (~linha 375-463) parseia `[TITLE:]` OU `[HEADLINE:]` + `[HIGHLIGHTS:]`; `extractPremiumBackgroundPrompt()` (~465-471) parseia `[BACKGROUND:]`. O overlay premium é renderizado **CLIENT-SIDE em canvas** (`renderPremiumPostToDataUrl`) — NÃO tocar nesse renderer.
2. **backend/src/services/image/imageGenerationService.js** — `generateSingleImage` parseia/remove `[WHITE_OVERLAY]`/`[PREMIUM_OVERLAY]`/`[BACKGROUND:]` (~linhas 124-150). Composições server-side são puladas quando `skipLegacyOverlayComposition: true` (o frontend SEMPRE envia isso no modo premium — backend retorna só o background cru).
3. **backend/src/services/contentGeneratorService.js** — AUTOPILOT semanal (disparado por schedulerService → `generateWeeklyPlan`). Tem seus PRÓPRIOS regexes de tags nas linhas ~219, ~1432, ~1744, ~1905-1907. **NÃO MODIFICAR ESTE ARQUIVO.** Qualquer mudança no formato quebra o autopilot silenciosamente (roda agendado, falha não aparece em teste manual).
4. **backend/src/services/carousel/brandContextService.js** — `parseStructuredFitswapPrompt` (~linha 89).
5. **backend/src/routes/ai.js** — rota `/composite-scientific` parseia `[HEADLINE:]`/`[SUBHEADLINE:]`/`[HIGHLIGHTS:]`.

Resposta de `POST /api/ai/generate-carousel-prompts` deve continuar `{ success, prompts: string[] }` com as tags.

---

## 3. Fatos descobertos (economize tempo, não re-derive)

- **Vitest já configurado** em backend e frontend (`npm test` → `vitest run`). Teste existente: `backend/tests/post-flow.test.js`.
- **Bug no PUT do perfil**: `backend/src/routes/business-profiles.js` linha ~171 faz `updates.brandKit = { ...(profile.brandKit || {}), ...brandKit }` onde `profile` vem de `getBusinessProfile()` que JÁ aplica `mergeBrandProfileDefaults` → **grava conteúdo do preset no Firestore**. Corrigir: mesclar contra o doc BRUTO do Firestore (ler `db.collection('businessProfiles').doc(id).get()` direto), não o merged.
- **source.unsplash.com está desativado** — instrução na linha ~312 do htmlCarouselService gera imagens quebradas.
- O frontend monta o contexto em `buildSelectedProfileContext()` em **frontend/src/app/dashboard/generate/page.tsx** ~linha 417-433 (envia brandKey, brandName, brandContext, brandKit, contentStrategy, targetAudience, productService, tone, profileDescription, cores, guidelines, brandingStyle, branding, aiPreferences).
- `mergeBrandProfileDefaults` acontece **na leitura** (businessProfileService) → **não é necessária migração do Firestore**; os presets cobrem as 4 marcas VIP automaticamente.
- Modelos em uso: OpenAI `gpt-4o` / `gpt-4o-mini` (lib `openai` já importada em carouselPromptService), Gemini `gemini-2.0-flash` via axios REST (constante `GEMINI_MODEL`/`GEMINI_URL` no topo do htmlCarouselService — criada no Commit 0).

---

## 4. ✅ COMMIT 0 — CONCLUÍDO (não refazer)

- Removida rota órfã `POST /generate-next-prompt` de `backend/src/routes/ai.js` + função `generateNextCarouselPrompt` de `carouselPromptService.js` + export no barrel `aiService.js`. (Não tinha nenhum consumidor.)
- Removido bloco morto `getFallbackLogo` em ai.js (a função não existia em postService; import dinâmico retornava undefined). Substituído por fallback direto: `profile?.branding?.logoUrl || profile?.branding?.logo || null`.
- Criadas constantes `GEMINI_MODEL = 'gemini-2.0-flash'` e `GEMINI_URL` no topo de `htmlCarouselService.js`; todas as 4 URLs hardcoded e o log mentiroso ("3.1 Pro Preview") agora usam as constantes.
- Sintaxe validada com `node --check` em todos os arquivos tocados.

---

## 5. ✅ COMMIT 1 — Schema brandKit + presets como dados + merge + prompt builder (CONCLUÍDO)

### 5.1 Novos campos em `brandKit` (todos opcionais)

```js
brandKit: {
  // ...campos existentes (personality, coreMessage, archetype, valuePillars,
  //    editorialLines, doAlways, neverUse, visualReferenceUrls, appUiReferenceUrls,
  //    referencePrompts, uiPatterns, carouselTemplate, customColors)...
  voice: '',                    // voz da marca, 1 parágrafo
  toneRules: [],                // string[]: regras de tom imperativas
  copyArchetypes: [],           // string[]: arquétipos de headline com exemplo
  headlineExamples: [],         // string[]: headlines reais na voz da marca
  narrativeStructure: {
    description: '',            // ex: "dor → ciência → mito → método → CTA"
    slideRoles: []              // [{position:'1'|'2'|'middle'|'last-1'|'last', role:'', rules:''}]
  },
  ctaRules: [],                 // string[]
  forbiddenWords: [],           // string[]: banidas na copy (alimenta QA do C6)
  forbiddenVisuals: [],         // string[]: banidas em prompts de imagem
  visualIdentity: {
    photographyStyle: '', colorUsage: '', typographyFeel: '',
    imagePromptGuidelines: []   // string[]
  },
  captionRules: [],             // string[]
  hashtagStrategy: ''           // string
}
```

### 5.2 Extração dos prompts hardcoded → presets (MOVER VERBATIM, não reescrever)

Em `backend/src/utils/brandProfiles.js`, preencher os novos campos dos presets transcrevendo o conteúdo de:

| Fonte hardcoded | Destino no preset |
|---|---|
| `carouselPromptService.js` bloco Fitswap (`isFitswapContext`, ~linhas 128-184 pré-C0): identidade, arquétipos de headline ("QUEBRA DE MITO: Não é disciplina—é [X]"...), regras de background, exemplos de output | preset `fitswap`: `voice`, `copyArchetypes`, `toneRules`, `visualIdentity.imagePromptGuidelines`, `headlineExamples` |
| Bloco Elevepic (~188-221): cores do template (#C7CEDA, #3F507A, #2A3142), cenas literais de status, contrastes amador vs premium | preset `elevepic`: idem |
| Bloco Tudy (~224-271): "REGRA DE OURO — VALOR PRIMEIRO, APP DEPOIS", estrutura narrativa slide 1=hook/2=ciência/.../último=CTA, arquétipos com exemplos, regras de background dark | preset `tudy`: `voice`, `narrativeStructure` (description + slideRoles com positions), `copyArchetypes`, `headlineExamples`, `ctaRules`, `forbiddenWords` (["O Tudy faz","Com o Tudy","Use o Tudy","Baixe o Tudy" antes do CTA — modelar como regra]), `visualIdentity` |
| Bloco Tudy no PREMIUM_OVERLAY (`tudyNarrativeBlock`, ~60-70) | mesmo destino (consolidar com o de cima) |
| `brandContextService.js` `buildFallbackImagePrompt` bloco Inner Boost (~164-208): paleta Black #0B0B0D/Neon Blue/Neon Green, mood introspectivo | preset `inner-boost`: `visualIdentity` |
| `htmlCarouselService.js` regras Tudy hardcoded (system prompts, procurar por "Tudy" e "tudy.com.br", ~linhas 155-157 e 330-331): CTA de app-download, "link na bio", não inventar URLs | preset `tudy`: `ctaRules` |
| Bloco premium-genérico de `getEditorialSystemPrompt` (~59-125): "PRINCÍPIO CENTRAL: metáfora visual", processo de criação, regras técnicas, formato de output | **NÃO é dado de marca** → vira o ESQUELETO compartilhado do builder/prompt (Commit 2) |

### 5.3 Merge — `mergeBrandProfileDefaults` (brandProfiles.js ~linha 673)

Estender `mergeBrandKit` (~linha 659) com helper para os novos campos:
- **Escalares** (`voice`, `hashtagStrategy`): perfil vence se truthy.
- **Arrays de regras** (`toneRules`, `copyArchetypes`, `headlineExamples`, `ctaRules`, `forbiddenWords`, `forbiddenVisuals`, `captionRules`): perfil **SUBSTITUI** o preset quando não-vazio (NÃO usar `mergeArrayValues`/union — listas curadas precisam ser removíveis pelo usuário).
- **Objetos** (`narrativeStructure`, `visualIdentity`): merge raso por chave, perfil vence; `slideRoles`/`imagePromptGuidelines` substituem se não-vazios.

### 5.4 Prompt builder — novo em `backend/src/services/carousel/brandContextService.js`

```js
export function buildBrandPromptSections(context = {}, opts = {})
// opts: { slideCount?: number, format?: 'carousel'|'html'|'caption'|'plan' }
// retorna { identity, voice, narrative, visual, cta, caption, compose(sectionNames?) }
```

- `identity`: brandName, coreMessage, archetype, personality, targetAudience, productService, profileDescription, brandContext.
- `voice`: voice + toneRules + copyArchetypes + headlineExamples + forbiddenWords ("PROIBIDO na copy: ...").
- `narrative`: narrativeStructure com positions resolvidas contra `opts.slideCount` (`'middle'` → slides 2..N-2, `'last-1'` → N-1, `'last'` → N).
- `visual`: visualIdentity + forbiddenVisuals + doAlways/neverUse + cores via `hexToColorName` (já existe no mesmo arquivo) + logo.
- `cta`: ctaRules. `caption`: captionRules + hashtagStrategy.
- `compose(names)`: junta as seções pedidas com cabeçalhos markdown-like; **omite seções vazias**; nunca imprimir "undefined".

### 5.5 Testes (C1)

- `backend/tests/brandProfiles.test.js`: semântica de merge de cada campo novo (preset-only / perfil-override / substituir-não-unir para arrays de regra).
- `backend/tests/brandPromptSections.test.js`: snapshot de `compose()` para os presets fitswap/tudy/elevepic/inner-boost + 1 perfil genérico sintético com todos os campos + 1 perfil vazio (seções omitidas, sem "undefined").

---

## 6. ✅ COMMIT 2 — Ligar o builder (equivalência de comportamento) (CONCLUÍDO)

- `getEditorialSystemPrompt` (carouselPromptService.js) mantém a assinatura `(description, count, context)`. Substituir os if-blocks de marca (isFitswapContext / isElevepicContext / isTudyContext / tudyNarrativeBlock) por `buildBrandPromptSections(context, {slideCount: count}).compose(['identity','voice','narrative','visual','cta'])` inserido no esqueleto compartilhado (o antigo bloco premium-genérico). O fallback genérico usa o MESMO builder.
  - Atenção: o formato de output difere por modo — Fitswap usa `[WHITE_OVERLAY]`+`[HEADLINE:]`, premium usa `[PREMIUM_OVERLAY]`+`[TITLE:]`. Manter a escolha do formato de output por `isFitswapBrand(context)` / `context.isPremiumCarousel`, mas o CONTEÚDO de marca vem do builder.
- `generateHtmlCarousel` (htmlCarouselService.js): injetar seções identity/voice/visual/cta no system prompt (~linhas 284-333); DELETAR os hardcodes Tudy (vêm do preset via builder). Idem em `generateElevepicContentJson` (regras Tudy no prompt ~155-157).
- `captionService.generateImageCaption` (content/captionService.js ~linha 43): trocar o lookup de preset por nome (`normalizeBrandKey({brandName: profileName})` ~47-51) por aceitar um objeto de contexto e usar o builder. Manter compatibilidade com a assinatura atual (chamada por library page e contentGeneratorService:933/2173 — verificar assinatura usada lá antes de mudar; se preciso, adicionar parâmetro opcional `context` no fim).
- **Verificação**: flag `DEBUG_PROMPTS=1` que loga o system prompt final; gerar para as 4 marcas antes/depois e diff manual (meta: mesmas regras presentes, wording ~verbatim).

---

## 7. ✅ COMMIT 3 — Structured output + serializador de tags (CONCLUÍDO)

Em `carouselPromptService.js`:

1. Schema OpenAI strict:
```js
const CAROUSEL_SLIDES_SCHEMA = {
  name: 'carousel_slides', strict: true,
  schema: { type:'object', additionalProperties:false, required:['slides'],
    properties:{ slides:{ type:'array', items:{
      type:'object', additionalProperties:false,
      required:['background','headline','subheadline','highlights'],
      properties:{ background:{type:'string'}, headline:{type:'string'},
        subheadline:{type:'string'}, highlights:{type:'array',items:{type:'string'}} } } } } }
};
// uso: response_format: { type:'json_schema', json_schema: CAROUSEL_SLIDES_SCHEMA }
```
(strict exige todos required → instruir no prompt a usar `""`/`[]` quando não aplicável.)

2. Função pura exportada:
```js
export function serializeSlideToTagPrompt(slide, { premium = false, white = false } = {})
// premium → "[PREMIUM_OVERLAY] [BACKGROUND: ...] [HEADLINE: ...] [SUBHEADLINE: ...] [HIGHLIGHTS: a, b]"
// white   → "[WHITE_OVERLAY] ..." (Fitswap)
```
- Emitir `HEADLINE`/`SUBHEADLINE` (autopilot e frontend aceitam; frontend aceita TITLE **ou** HEADLINE).
- **Sanitizar `]` e `|` dos valores** (corrompem o parsing). Highlights unidos por vírgula (o parser de `brandContextService.parseStructuredFitswapPrompt` faz split por vírgula).
- Omitir tags de campos vazios.

3. `generateCarouselPrompts` e `generateCarouselSlideConcepts`: pedir JSON com o schema → `slides.map(s => serializeSlideToTagPrompt(s, {...}))`. Resposta da rota INALTERADA.
4. **DELETAR** o split por `---SEPARATOR---` e a duplicação silenciosa (bloco `while (prompts.length < count) prompts.push(prompts[prompts.length-1])`, ~linhas 696-706 pré-refactor e equivalente em generateCarouselSlideConcepts ~522-525). Em falta de slides: 1 repair call estruturado pedindo APENAS os faltantes (passando os existentes como contexto) → se ainda faltar, `throw new Error(...)` (500 real).
5. `refineBackgroundPrompts` (~327-434): passar a operar sobre `slides[].background` (strings) ANTES da serialização, em vez de cards com tags.
6. Gemini: adicionar `generationConfig: { responseMimeType: 'application/json' }` (+ `responseSchema` se desejar) em `generateElevepicContentJson`.

**Teste mais importante do refactor** — `backend/tests/tagSerializer.test.js`: roundtrip do output de `serializeSlideToTagPrompt` contra:
- os regexes LITERAIS do autopilot (copiar de contentGeneratorService.js linhas ~219, ~1432, ~1744, ~1905-1907, com comentário apontando a origem);
- a gramática do frontend (`/\[(?:TITLE|HEADLINE):\s*(.*?)\]/i`, `/\[HIGHLIGHTS:\s*(.*?)\]/i`, `/\[BACKGROUND:\s*(.*?)\]/i`);
- casos com `]` e `|` nos valores (sanitização).

---

## 8. ✅ COMMIT 4 — /generate-caption com perfil (CONCLUÍDO)

- Rota `POST /generate-caption` em ai.js (~linha 563 pré-refactor, procurar pelo comentário "Gera caption para imagem usando GPT"): aceitar `businessProfileId` opcional → `getBusinessProfile(id)` (já importado no arquivo) → system prompt via `buildBrandPromptSections(profile, {format:'caption'}).compose(['identity','voice','caption'])`. Sem profileId → comportamento legado. Modelo `gpt-4o` (hoje é `gpt-4`).
- Extrair para `captionService.generateCaptionFromBrief({ brief, context, tone, includeHashtags, language })` (reusado pelo content plan no C5).
- Frontend — adicionar `businessProfileId: selectedProfile?.id` nos 4 call sites:
  - `frontend/src/app/dashboard/generate/page.tsx` ~1214-1219 (`handleGenerateHtmlCaption`) e ~1247-1252 (`handleGenerateCaption`);
  - `frontend/src/app/dashboard/library/page.tsx` ~944 e ~1144 (a página já tem `selectedProfile` no escopo — ver usos de businessProfileId em ~988/1022/1094).

---

## 9. ✅ COMMIT 5 — Content plan unificado (slides + legenda + CTA em 1 chamada) (CONCLUÍDO)

Novo `backend/src/services/content/contentPlanService.js`:
```js
export async function generateContentPlan({ description, count, context, premium = true })
// → { narrative, slides:[{background, headline, subheadline, highlights[]}],
//     caption, hashtags[], cta }
```
- 1 chamada `gpt-4o` com json_schema strict (schema do C3 + narrative/caption/hashtags/cta, todos required).
- System prompt: `buildBrandPromptSections(context, {slideCount: count, format:'plan'}).compose()` + esqueleto do plano (a legenda DEVE continuar o arco narrativo dos slides; CTA consistente com o último slide; legenda usa captionRules/hashtagStrategy).
- Reusar repair pattern do C3; rodar `refineBackgroundPrompts` sobre `slides[].background` quando premium.

Nova rota em ai.js:
```
POST /api/ai/generate-content-plan
body: { description, count, businessProfileId?, context?, premium? }
resp: { success: true, plan, warnings: [] }
```
Perfil carregado server-side quando profileId presente (perfil vence sobre context do cliente para brandKit).

**Coexistência**: `/generate-carousel-prompts` fica intacta (autopilot + fluxo não-premium).

Frontend `generate/page.tsx`:
- `handleGenerateAllPrompts` (~656-681): em modo premium → chamar `/generate-content-plan`.
- Construir os cards a partir do JSON do plano. **VERIFICAR** as props do `PremiumCarouselEditor`: se só aceitar strings com tags, serializar os slides do plano com a MESMA gramática client-side (fallback garantido-compatível). **O renderer canvas (`renderPremiumPostToDataUrl`) NÃO é tocado.**
- Geração de imagem: enviar `plan.slides[i].background` direto a `/generate-single-image` com `skipLegacyOverlayComposition: true`.
- Prefill da legenda: `plan.caption + '\n\n' + plan.hashtags.join(' ')`.

---

## 10. ✅ COMMIT 6 — QA de marca (CONCLUÍDO)

Novo `backend/src/services/content/contentQaService.js`:
```js
export async function reviewContentPlan(plan, context)
// → { ok, issues:[{target:'slide'|'caption', index:number|null, rule, detail}] }
```
- Checks JS baratos primeiro (scan de `forbiddenWords` — case/acento-insensitive); PULAR a chamada LLM se não há regras nem suspeitas.
- `gpt-4o-mini` com json_schema: forbiddenWords, menção prematura do produto vs narrativeStructure, headline que só repete o tema, meta-copy placeholder ("Tema central", "Conteúdo criado para...").
- Integração em `generateContentPlan` (flag `qa: true` default na rota): issues → 1 regeneração direcionada só dos slides/caption ofensores (reusar repair-call com as issues como constraints) → re-check APENAS local → retornar `warnings` para o que sobrar. **Nunca lança** — try/catch degrada para warnings vazios.

---

## 11. ✅ COMMIT 7 — Fixes do carrossel HTML (CONCLUÍDO)

Em `htmlCarouselService.js`:
- Remover a instrução `source.unsplash.com` (branch else do isElevepic no system prompt, ~linha 312 pré-refactor): substituir por "sem imagem aplicável, use CSS puro (gradientes das cores da marca, formas geométricas); NUNCA referencie URLs externas de imagem". Estender o caminho `data-ai-prompt` (pipeline `postProcessHtmlImages`, já existente e funcional) para todas as marcas, não só ElevePic.
- Library images (~267-280): novo param `libraryImageTreatment: 'auto'|'heavy'|'light'` em `generateHtmlCarousel` (threaded da rota `/generate-html-carousel`; default `'auto'` = comportamento atual heavy; `'light'` = scrim sutil `rgba(0,0,0,0.35)` sem blur).
- `fixHtmlCarousel` (~554-612): helper puro `export function countCarouselSlides(html)` — contar ocorrências do container de slide (`class="slide"` é o marcador usado nos templates; CONFIRMAR no HTML gerado). Contar antes/depois → mismatch = 1 retry com "output deve conter exatamente N slides" no prompt → ainda errado = throw; a rota `/fix-html-carousel` retorna **422** com mensagem clara.

---

## 12. COMMIT 8 — UI de edição do perfil + fix do PUT

- **Fix do PUT primeiro** (ver seção 3, bug do merge contra doc merged).
- `frontend/src/app/dashboard/business-profiles/page.js`: nova seção colapsável "Identidade de marca (IA)" seguindo padrões existentes da página:
  - Textareas: `brandKit.voice`, `brandKit.hashtagStrategy`, `brandKit.narrativeStructure.description`, `brandKit.visualIdentity.{photographyStyle,colorUsage,typographyFeel}`.
  - Editores de lista (copiar padrão do `visualReferenceUrls`, ~823-827): `toneRules`, `copyArchetypes`, `headlineExamples`, `ctaRules`, `forbiddenWords`, `forbiddenVisuals`, `captionRules`, `visualIdentity.imagePromptGuidelines`.
  - `narrativeStructure.slideRoles`: editor de linhas repetíveis (select position + inputs role/rules), espelhando o CRUD de `editorialPillars` (~1316-1422).
  - Expor também `personality`, `coreMessage`, `archetype` (gap pré-existente — hoje só existem em presets).
- `formData` é inicializado em ~19-32 e hidratado em ~108-131 — adicionar os novos campos lá.

---

## 13. Verificação por commit

| Commit | Como verificar |
|---|---|
| C1 | `cd backend && npm test` (novos testes de merge + snapshot do builder) |
| C2 | `DEBUG_PROMPTS=1`, gerar carrossel para as 4 marcas, diff dos prompts old-vs-new; 1 geração real por marca no generate page |
| C3 | teste roundtrip serializador × regexes autopilot + frontend; fluxo premium no generate page renderiza cards; forçar shortage (max_tokens baixo em dev) para ver repair → falha alta |
| C4 | curl com/sem businessProfileId (voz deve diferir); exercitar os 4 call sites |
| C5 | curl `/generate-content-plan` (tudy, count 5 e 8) → validar schema; fluxo premium completo no frontend |
| C6 | unit do scan forbiddenWords; perfil de teste com palavra proibida induzida pelo tema → warning/regeneração |
| C7 | unit `countCarouselSlides`; gerar HTML e `grep source.unsplash` (deve estar ausente); fix com instrução que derruba slides → 422 |
| C8 | editar perfil genérico, salvar, recarregar, gerar conteúdo e ver campos no prompt logado |

Backend roda com `npm run dev` (porta e env já configurados no repo; precisa de `OPENAI_API_KEY` e `GEMINI_API_KEY` no .env).

## 14. Riscos principais

1. **Regressão de qualidade de prompt (C2)** — extração verbatim + diff manual; commit isolado revertível.
2. **Drift do serializador quebrando o autopilot silenciosamente** — o teste de roundtrip com regexes literais é OBRIGATÓRIO.
3. **json_schema strict**: todos os campos required; convenção `""`/`[]` no serializador; omitir tags vazias.
4. **PUT do perfil gravando preset no Firestore** — corrigir antes de expor a UI (C8).
5. **Contrato do PremiumCarouselEditor (C5)** — fallback: serializar o plano com a mesma gramática de tags no client.
6. **NÃO tocar**: `contentGeneratorService.js`, `premiumCompositionService.js`, `renderPremiumPostToDataUrl`.
