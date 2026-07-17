# Insta-Automation — Arquitetura da Plataforma

> Documento técnico para replicação do sistema em outros projetos via IA (vibe coding).
> Foco: estrutura, fluxo de dados, padrões de design e decisões técnicas.

---

## Visão Geral

Plataforma SaaS de automação de conteúdo para Instagram. Usuários criam **perfis de negócio** (Business Profiles) com identidade de marca, geram conteúdo com IA (imagens, carouseis, reels), gerenciam uma biblioteca de mídia e agendam publicações.

**Pilares funcionais:**
1. Geração de conteúdo via IA (imagem, carousel, HTML, legenda)
2. Biblioteca de mídia com tags e status
3. Agendamento e publicação automática no Instagram
4. Perfis de marca com personalização de IA
5. Calendário editorial e auto-geração semanal

---

## Stack Tecnológica

### Backend
| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js |
| Banco de dados | Firebase Firestore |
| Armazenamento | Firebase Cloud Storage |
| Processamento de imagem | Sharp |
| Fila de tarefas | Bull + Redis |
| Agendamento | node-cron (a cada minuto) |
| HTTP Client | Axios |

### Frontend
| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 13+ (App Router) |
| Linguagens | TypeScript + JavaScript |
| Estado global | React Context API |
| Auth | Firebase Auth SDK |
| HTTP | Axios com interceptors |
| Notificações | react-hot-toast |

### APIs Externas
| Serviço | Uso |
|---------|-----|
| OpenAI (GPT-4 Vision) | Geração de prompts, legendas, ideias, HTML |
| Google Gemini Vision | Geração de imagens (primário) |
| Replicate / Seedream | Geração de imagens (alternativo) |
| ElevenLabs | TTS para narração de Reels |
| Upload-Post API | Agendamento e publicação no Instagram |
| Firebase | Auth, Firestore, Cloud Storage |
| Apify | Web scraping para análise de concorrentes |

---

## Estrutura de Diretórios

```
/
├── backend/
│   └── src/
│       ├── server.js              # Entry point — porta 3001, timeout 5min
│       ├── app.js                 # Express setup, CORS, middleware
│       ├── routes/                # Handlers HTTP (12 módulos)
│       │   ├── ai.js              # Geração de imagem, carousel, legenda, HTML
│       │   ├── posts.js           # CRUD de posts + execução
│       │   ├── business-profiles.js
│       │   ├── library.js
│       │   └── ...
│       ├── services/              # Lógica de negócio
│       │   ├── aiService.js       # Barrel re-export dos subserviços de IA
│       │   ├── image/
│       │   │   ├── imageGenerationService.js
│       │   │   ├── imageGenerationAdapters.js  # Gemini / Seedream
│       │   │   └── imageStorageService.js
│       │   ├── carousel/
│       │   │   └── carouselPromptService.js
│       │   ├── content/
│       │   │   └── captionService.js
│       │   ├── businessProfileService.js
│       │   ├── postService.js
│       │   ├── schedulerService.js
│       │   ├── uploadPostService.js   # Wrapper Upload-Post API
│       │   └── premiumCompositionService.js
│       ├── middleware/
│       │   ├── auth.js            # Firebase JWT auth
│       │   └── logging.js
│       ├── utils/
│       │   └── brandProfiles.js   # 5 presets de marca + merge
│       ├── config/
│       │   └── firebase.js
│       ├── templates/             # Templates HTML de carousel
│       ├── cron/                  # Jobs agendados
│       ├── queues/                # Bull queues
│       └── domain/                # Modelos e regras de formato
│
└── frontend/
    └── src/
        ├── app/
        │   └── dashboard/
        │       ├── generate/      # UI de geração de conteúdo
        │       ├── library/       # Biblioteca de mídia
        │       ├── calendar/      # Calendário de publicações
        │       ├── business-profiles/
        │       ├── accounts/
        │       ├── video-reels/
        │       ├── competitors/
        │       └── review/
        ├── components/            # Componentes reutilizáveis
        ├── contexts/              # BusinessProfileContext
        └── lib/
            └── api.js             # Axios com auth + retry automático
```

---

## Modelos de Dados (Firestore)

### `businessProfiles`
```js
{
  userId: string,
  name: string,
  brandKey: 'fitswap' | 'tudy' | 'inner-boost' | 'viver-mais' | 'elevepic' | null,
  branding: {
    primaryColor: string,       // ex: '#2257F5'
    secondaryColor: string,
    style: string,              // descrição textual do estilo visual
    typography: { heading, body },
    brandKit: {
      customColors: string[],
      logoUrl: string,
      referenceImages: string[]
    }
  },
  aiPreferences: {
    defaultAspectRatio: '1:1' | '4:5' | '16:9' | '9:16',
    defaultModel: 'gemini' | 'seedream',
    savedPrompts: string[],     // prompts favoritos
    guidelines: string          // instruções customizadas para a IA
  },
  editorialPillars: [
    { name: string, description: string, percentage: number }
  ],
  contentSchedule: {
    postsPerWeek: number,
    storiesPerWeek: number,
    autoGenerateDay: string,    // 'monday', 'tuesday', etc.
    autoGenerateTime: string    // 'HH:MM'
  },
  carouselTemplate: {
    name: string,
    slideCount: number,
    slideStructure: string[]    // ex: ['HOOK', 'CIÊNCIA', 'MITO', 'SOLUÇÃO', 'CTA']
  }
}
```

### `posts`
```js
{
  userId: string,
  accountId: string,
  businessProfileId: string,
  type: 'static' | 'carousel' | 'story' | 'reel' | 'carousel-html',
  format: string,
  mediaUrls: string[],
  caption: string,
  scheduledFor: Timestamp | null,
  status: 'draft' | 'pending' | 'published' | 'failed',
  externalScheduleId: string,   // ID retornado pelo Upload-Post API
  isWaitingForHtmlExport: boolean,
  premiumLayouts: object[],     // overlays de carousel premium
  createdAt: Timestamp
}
```

### `library_items`
```js
{
  userId: string,
  businessProfileId: string,
  type: 'image' | 'carousel' | 'video' | 'html',
  mediaUrls: string[],
  caption: string,
  tag: 'editar' | 'pronto' | 'postado',
  isScheduled: boolean,
  isPosted: boolean,
  fileHash: string,             // MD5 para detecção de duplicatas
  createdAt: Timestamp
}
```

### `accounts`
```js
{
  userId: string,
  username: string,
  platform: 'instagram',
  businessProfileId: string,
  status: 'active' | 'error'
}
```

### `html_carousel_templates`
```js
{
  businessProfileId: string,
  name: string,
  html: string,
  createdAt: Timestamp
}
```

### `auto_generated_ideas`
```js
{
  businessProfileId: string,
  ideas: [{ title, description, pillar, format }],
  generatedAt: Timestamp
}
```

---

## Rotas da API

### `/api/ai` — Geração de Conteúdo IA

| Método | Rota | Função |
|--------|------|--------|
| POST | `/generate` | Geração legada (simples ou carousel) |
| POST | `/generate-single-image` | Gera 1 imagem com contexto de marca completo |
| POST | `/generate-carousel-prompts` | Gera todos os prompts do carousel de uma vez |
| POST | `/generate-next-prompt` | Gera 1 prompt progressivo por vez |
| POST | `/generate-html-carousel` | Gera carousel HTML/CSS completo |
| GET | `/html-templates` | Lista templates HTML salvos |
| POST | `/html-templates` | Salva template HTML customizado |
| POST | `/generate-caption` | Gera legenda para post |
| POST | `/composite-scientific` | Aplica overlay científico/premium na imagem |

### `/api/posts`

| Método | Rota | Função |
|--------|------|--------|
| GET | `/` | Lista posts com filtros |
| POST | `/` | Cria post (imediato ou agendado) |
| PUT | `/:id` | Atualiza post |
| DELETE | `/:id` | Remove post |
| POST | `/:id/execute` | Publica post imediatamente |

### `/api/library`

| Método | Rota | Função |
|--------|------|--------|
| GET | `/` | Lista itens paginados (filtros: tag, tipo, status) |
| POST | `/` | Cria item a partir de URLs existentes |
| POST | `/upload` | Upload de arquivos + criação de item |
| POST | `/upload-files` | Upload apenas (sem criar item) |

### `/api/business-profiles`

| Método | Rota | Função |
|--------|------|--------|
| GET | `/` | Lista perfis do usuário |
| POST | `/` | Cria perfil com merge de preset de marca |
| PUT | `/:id` | Atualiza perfil |
| DELETE | `/:id` | Remove perfil |
| POST | `/:id/link-account` | Vincula conta Instagram ao perfil |

---

## Fluxo de Dados Completo

### Fluxo 1 — Geração de Imagem Simples

```
[Frontend] Usuário digita prompt + seleciona perfil
     ↓
POST /api/ai/generate-single-image
     ├── Busca businessProfile no Firestore
     ├── Monta context: branding + guidelines + savedPrompts + referenceImages
     ├── Detecta modelo: 'gemini' ou 'seedream'
     ├── Injeta imagens de referência do brandKit (logos, screenshots)
     ├── Chama generateImages()
     │   └── generateImageWithGemini(prompt, aspectRatio, referenceImages, context)
     │       → API Google Gemini Vision
     │       → Retorna URL da imagem
     ├── Aplica overlay premium se isPremiumCarousel=true
     │   └── premiumCompositionService.createPremiumComposition()
     │       → Sharp compositing (headline, subheadline, keywords, logo)
     └── Salva no Firebase Storage
     ↓
Response: { success, image: URL, prompt, aspectRatio, model }
     ↓
[Frontend] Exibe imagem + opções (salvar na biblioteca / agendar)
```

### Fluxo 2 — Geração de Carousel (Todos os Prompts de Uma Vez)

```
[Frontend] Descrição do carousel + número de cards
     ↓
POST /api/ai/generate-carousel-prompts
     ├── getEditorialSystemPrompt(description, count, context)
     │   ├── Insere template narrativo do perfil (ex: HOOK → CIÊNCIA → MITO → SOLUÇÃO → CTA)
     │   ├── Insere paleta de cores do brandKit
     │   └── Retorna system prompt com centenas de tokens
     ├── GPT-4 Vision (com imagens de referência se disponíveis)
     └── Retorna: prompts[] (um por card)
     ↓
Para cada prompt:
  POST /api/ai/generate-single-image
     └── Gemini → imagem gerada
     ↓
[Frontend] Exibe todos os cards do carousel
```

### Fluxo 3 — Geração Progressiva (Card por Card)

```
[Frontend] Inicia carousel, exibe skeleton do card 1
     ↓
Loop i = 0 até totalCards-1:
  POST /api/ai/generate-next-prompt
     ├── Passa: description, cardIndex=i, previousPrompts[]
     ├── GPT-4: "Gere prompt para o card X considerando os anteriores Y, Z"
     └── Retorna: { prompt, cardIndex }
     ↓
  POST /api/ai/generate-single-image com prompt
     └── Gemini → imagem
     ↓
  [Frontend] Adiciona card, exibe skeleton do próximo
```

### Fluxo 4 — Carousel HTML

```
[Frontend] Tópico + número de slides + template selecionado
     ↓
POST /api/ai/generate-html-carousel
     ├── Busca businessProfile com branding completo
     ├── Carrega últimas 20 imagens da biblioteca do perfil
     ├── Carrega template HTML customizado se informado
     ├── generateHtmlCarousel(topic, context, template, slideCount, customHtml)
     │   └── GPT-4: "Crie HTML/CSS de carousel com slides e design de marca"
     └── Retorna: { success, html: string }
     ↓
[Frontend] Renderiza HTML em iframe para preview
  Opções: editar código, exportar como PNG, agendar
```

### Fluxo 5 — Criação e Agendamento de Post

```
[Frontend] Seleciona mídia + escreve legenda + define data
     ↓
POST /api/posts/
     ├── Valida: accountId, type, mediaUrls (ou htmlCode)
     ├── Resolve conta → businessProfile se necessário
     ├── Se scheduledFor informado:
     │   ├── uploadPostService.schedulePost()
     │   │   ├── Download das imagens por URL
     │   │   ├── Multipart form data para Upload-Post API
     │   │   │   Fields: user, platform[], photo/video, caption, scheduled_date, timezone
     │   │   └── Retorna: { externalScheduleId }
     │   └── Salva post no Firestore com externalScheduleId
     └── Se imediato:
         └── Background: executePost(postId)
             └── Upload-Post API → Instagram
     ↓
Scheduler (a cada minuto):
     ├── GET Upload-Post API → status dos posts agendados
     ├── Atualiza status no Firestore
     └── Marca como 'published' quando confirmado
```

### Fluxo 6 — Gerenciamento de Biblioteca

```
[Frontend] Usuário faz upload de imagens
     ↓
POST /api/library/upload (multipart)
     ├── Calcula MD5 de cada arquivo (anti-duplicata)
     ├── Upload para Firebase Storage: uploads/{userId}/{timestamp}_{filename}
     ├── Cria library_items no Firestore: { mediaUrls, fileHash, tag: 'editar' }
     └── Retorna: { items[], duplicatesSkipped }
     ↓
GET /api/library?businessProfileId=X&tag=pronto&limit=24
     ├── Query paginada no Firestore
     ├── Sync background de posts agendados
     └── Retorna: { items[], hasMore }
     ↓
[Frontend] Grid de itens com filtros por tag e tipo
  Usuário seleciona item → usa em post ou agenda
```

### Fluxo 7 — Auto-Geração Semanal

```
Scheduler (a cada minuto) → schedulerService.runWeeklyAutoGeneration()
     ↓
Para cada perfil com autoGenerateDay + autoGenerateTime configurados:
     ├── Verifica se horário atual coincide com agendamento
     ├── generateCarouselIdeas(profile)
     │   ├── GPT-4 gera ideias por pilar editorial
     │   └── Retorna: [{ title, description, pillar, format }]
     └── Salva em auto_generated_ideas no Firestore
     ↓
[Frontend] Usuário vê ideias na dashboard → converte em post
```

---

## Sistema de Presets de Marca

**Arquivo:** `backend/src/utils/brandProfiles.js`

5 marcas pré-configuradas, cada uma com:
- Paleta de cores (primária, secundária, neutros)
- Estilo visual (descrição textual para a IA)
- 4 pilares editoriais com distribuição de frequência
- Template de carousel (estrutura obrigatória de slides)
- Prompts de referência salvos (5 exemplos detalhados por marca)
- Tipografia preferida
- Preferências de IA (aspect ratio padrão, modelo, etc.)

**Padrão de uso:**

```js
// 1. Usuário cria perfil com brandKey
POST /api/business-profiles/
{ brandKey: 'tudy', name: 'Tudy App', ... }

// 2. Backend faz merge automático
mergeBrandProfileDefaults(profile)
// → combina preset Tudy + overrides do usuário
// → retorna perfil enriquecido

// 3. Toda geração de conteúdo usa o perfil enriquecido
generateImages(prompt, aspectRatio, count, brandingStyle, isEditorial, context)
//   context = perfil completo com branding, guidelines, savedPrompts, referenceImages
```

**Estrutura de preset:**
```js
{
  brandKey: 'tudy',
  branding: {
    primaryColor: '#2257F5',
    secondaryColor: '#7C3AED',
    style: 'Dark premium focused. Deep navy backgrounds. Electric blue accents.',
    typography: { heading: 'Space Grotesk Bold', body: 'IBM Plex Sans' }
  },
  editorialPillars: [
    { name: 'Prática Ativa', description: '...', percentage: 30 },
    { name: 'IA Que Organiza', description: '...', percentage: 25 },
    ...
  ],
  carouselTemplate: {
    name: 'Mirror Sequence',
    slideStructure: ['HOOK', 'CIÊNCIA', 'MITO', 'SOLUÇÃO', 'CTA']
  },
  aiPreferences: {
    defaultAspectRatio: '4:5',
    savedPrompts: [ /* 5 prompts detalhados */ ]
  }
}
```

---

## Sistema de Geração de Imagens

### Adapters (Strategy Pattern)

```js
// Roteamento por modelo
if (model === 'seedream') {
  return generateImageWithSeedream(prompt, aspectRatio)
} else {
  return generateImageWithGemini(prompt, aspectRatio, referenceImages, context)
}
```

**Gemini:**
- Multi-modal: aceita imagens de referência para correspondência de estilo
- Recebe: prompt enriquecido + logos + screenshots da marca
- Retorna: URL da imagem gerada

**Seedream:**
- Apenas texto → imagem (sem referências visuais)
- Usado como fallback

### Context Building (geração consciente de marca)

```js
// Antes de chamar a API de imagem, backend monta contexto completo:
const context = {
  businessProfile: { name, branding, style, guidelines },
  brandKit: { customColors, logoUrl, referenceImages },
  savedPrompts: [...],           // prompts anteriores favoritos
  editorialPillars: [...],
  carouselTemplate: { slideStructure }
}

// O system prompt da IA inclui:
// - Paleta de cores obrigatória
// - Estilo visual da marca
// - Estrutura narrativa do slide atual
// - Instruções específicas do perfil
```

---

## Composição de Overlay Premium

**Serviço:** `premiumCompositionService.js`

Usa **Sharp** para compositar imagem base + overlay visual:

```
Imagem base (gerada pela IA)
     +
Painel semi-transparente com:
  ├── Headline (fonte grande, cor de destaque da marca)
  ├── Subheadline (fonte menor)
  ├── 2-3 keywords destacadas
  └── Logo da marca (canto inferior)
     ↓
Imagem final composta → Firebase Storage → URL pública
```

**Temas por marca:**
- Fitswap: Accent `#6F9800`, painel verde `#EEF2E8`
- Elevepic: Accent `#3F507A`, painel preto
- Genérico: Neon accent sobre fundo escuro

---

## Autenticação e Autorização

```
[Frontend] Firebase Auth SDK
     ↓ Login → JWT Token
     ↓
[Axios Interceptor] api.js
     → Adiciona header: Authorization: Bearer {token}
     ↓
[Backend Middleware] auth.js
     → Verifica JWT com Firebase Admin SDK
     → Extrai userId
     → Adiciona req.userId para rotas downstream
     ↓
[Services]
     → Todas queries incluem userId como filtro
     → Isolamento total entre usuários
```

---

## Scheduler e Sincronização de Posts

**node-cron:** executa a cada minuto

```js
// schedulerService.js
cron.schedule('* * * * *', async () => {
  await syncScheduledPosts()       // sincroniza status da Upload-Post API
  const ready = await getReadyPosts()  // posts locais com scheduledFor <= agora
  for (const post of ready) {
    await executePost(post.id)     // publica via Upload-Post API
  }
  await runWeeklyAutoGeneration()  // gera conteúdo se horário bater
})
```

---

## Axios Client (Frontend)

**Arquivo:** `frontend/src/lib/api.js`

```js
// Interceptor de request: adiciona auth token automaticamente
axiosInstance.interceptors.request.use(async (config) => {
  const token = await getCurrentUserToken()
  config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor de response: retry automático com exponential backoff
axiosInstance.interceptors.response.use(null, async (error) => {
  if (shouldRetry(error) && retryCount < 3) {
    await sleep(2 ** retryCount * 1000)  // 1s, 2s, 4s
    return axiosInstance(originalRequest)
  }
  throw mapErrorToUserMessage(error)
})

// Retry apenas em: 5xx, 429, GET/DELETE/POST seguro
// Erros mapeados: 401 → "Não autorizado", 403 → "Acesso negado", etc.
```

---

## Padrões Arquiteturais Usados

| Padrão | Onde | Por quê |
|--------|------|---------|
| Service Layer | backend/services/ | Separa lógica de negócio das rotas |
| Barrel Export | aiService.js | Compatibilidade retroativa ao modularizar |
| Strategy Pattern | imageGenerationAdapters.js | Troca de modelo de IA sem mudar código chamador |
| Context Object | Geração de imagem | Passa branding completo para a IA |
| Polling | schedulerService.js | Sincroniza status de posts externos (1 req/min) |
| Cursor Pagination | library API | Evita carregar todos os itens de uma vez |
| MD5 Dedup | library/upload | Previne upload de duplicatas |
| Progressive Generation | carousel | UX: mostra cards conforme gerados |
| Merge Defaults | brandProfiles.js | Presets de marca + overrides do usuário |
| JWT Middleware | auth.js | Segurança centralizada em todas as rotas |
| Exponential Backoff | api.js (Axios) | Resiliência a falhas transitórias de API |
| Bull Queue | queues/ | Async para operações pesadas (composição, vídeo) |

---

## Variáveis de Ambiente Necessárias

```env
# Firebase (Admin SDK)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# OpenAI
OPENAI_API_KEY=

# Google Gemini (via Replicate ou diretamente)
GOOGLE_AI_API_KEY=          # ou
REPLICATE_API_TOKEN=

# Seedream (alternativo)
SEEDREAM_API_KEY=

# ElevenLabs (TTS para Reels)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2

# Upload-Post (Instagram scheduling)
UPLOAD_POST_API_KEY=

# App
PORT=3001
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

---

## Como Replicar Este Sistema

### Núcleo mínimo para um novo projeto similar:

**1. Setup base**
```
Express + Firebase Admin SDK + Firestore + Cloud Storage
```

**2. Auth**
```
Firebase Auth no frontend
Middleware JWT no backend que extrai userId
Todas as queries filtram por userId
```

**3. Modelo de dados central**
```
Collection: businessProfiles → identidade da marca
Collection: library_items   → mídia com tags
Collection: posts           → agendamento e status
```

**4. Pipeline de geração de conteúdo**
```
Rota /generate-single-image
  → Busca perfil → monta context → chama Gemini → salva Storage → retorna URL

Rota /generate-carousel-prompts
  → GPT-4 com system prompt rico → retorna N prompts

Loop: para cada prompt → /generate-single-image
```

**5. Agendamento**
```
node-cron a cada minuto
  → Verificar posts prontos para publicar
  → Chamar API de publicação (Upload-Post ou Meta API diretamente)
  → Atualizar status no Firestore
```

**6. Sistema de marca**
```
Objeto de configuração por marca (cores, estilo, pilares, prompts)
Função mergeBrandProfileDefaults(profile) → enriquece com preset
Context injetado em toda chamada de IA
```

**7. Biblioteca**
```
Upload → Firebase Storage → criar documento Firestore
Lista paginada com filtros por tag/tipo/status
```

**8. Frontend**
```
Next.js App Router
React Context para perfil selecionado
Axios com interceptors (auth + retry)
Pages: generate, library, calendar, profiles, review
```

---

## Decisões de Design Notáveis

**Por que polling e não webhooks para status de posts?**
O Upload-Post API não suporta webhooks, então o scheduler verifica o status a cada minuto. Para projetos futuros com a Meta API diretamente, webhooks são preferíveis.

**Por que dois modos de geração de carousel (all-at-once vs progressivo)?**
All-at-once é mais rápido e coerente narrativamente. Progressivo tem melhor UX (usuário vê progresso) mas é mais lento. Ambos são mantidos porque diferentes perfis preferem cada abordagem.

**Por que presets de marca em vez de configuração livre?**
Reduz a fricção de onboarding. O usuário escolhe uma marca e tudo já está configurado: cores, estilo, pilares, narrativa de carousel. Pode sobrescrever qualquer campo depois.

**Por que Sharp para composição e não Canvas?**
Sharp é mais performático para operações de servidor, suporta SVG nativo e tem API mais simples para composição de camadas. Canvas exigiria X11 no servidor.

**Por que GPT-4 para prompts e Gemini para imagens?**
GPT-4 é superior em seguir instruções complexas e manter coerência narrativa (ideal para gerar múltiplos prompts). Gemini Vision é melhor em transformar prompts em imagens fotorrealistas com referências visuais.
