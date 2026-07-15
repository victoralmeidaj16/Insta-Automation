# Insta-Automation — Plataforma de Automação de Conteúdo para Instagram

Plataforma web completa para criação, geração com IA, agendamento e publicação automatizada de conteúdo no Instagram. Suporta múltiplas contas, perfis de negócio, geração semanal de conteúdo com aprovação e criação de Reels com IA.

---

## Funcionalidades

### Geração de Conteúdo com IA
- Geração de imagens via OpenAI (GPT-4o), Google Gemini e Replicate
- Carrossel com sequenciamento inteligente de slides
- Carrossel em HTML com templates editáveis
- Carrossel premium com composição científica e overlay de titular
- Geração de ideias e legendas com tom personalizado
- Extração de estilo visual a partir de prompts
- Geração de variações editoriais por pilar de conteúdo
- Planejamento semanal de conteúdo com workflow de aprovação

### Gestão de Contas e Perfis
- Múltiplas contas Instagram com credenciais criptografadas (AES)
- Perfis de negócio com kit de marca, paleta, logo e pilares editoriais
- Vinculação de contas a perfis específicos
- Preferências de IA por perfil

### Posts e Agendamento
- Formatos suportados: estático, carrossel, vídeo, Story, Reel
- Agendamento por data e hora
- Edição de posts pendentes
- Calendário visual de posts agendados
- Rastreamento de status em tempo real (pending → processing → success/error)

### Video Reels
- Pipeline completo: roteiro → âncora visual → cenas → animação → merge final
- Aprovação de cada cena antes da animação
- Geração de vídeo com Kling AI
- Player com suporte a range requests (streaming)

### Biblioteca e Upload
- Biblioteca de mídia com detecção de duplicatas por hash
- Reformatação automática para proporção Instagram via Gemini
- Salvamento automático de imagens geradas na biblioteca
- Suporte a upload multipart (até 100MB)

### Automação
- Comportamento humanizado: scroll randômico, curtidas, delays variáveis
- Fila de publicação com retry automático e backoff exponencial
- Geração em background com rastreamento de status por `jobId`
- Cookies persistentes para sessões Instagram

---

## Arquitetura

```
Insta-Automation/
├── backend/                   # Node.js + Express (ES Modules)
│   └── src/
│       ├── routes/            # API REST (accounts, posts, ai, library, auto-generate, video-reels, ...)
│       ├── services/          # Lógica de negócio
│       │   ├── aiService.js             # Geração de imagens e texto (OpenAI, Gemini, Replicate)
│       │   ├── postService.js           # CRUD de posts + publicação
│       │   ├── schedulerService.js      # Agendamento com node-cron
│       │   ├── businessProfileService.js
│       │   ├── contentGeneratorService.js  # Geração semanal por pilar
│       │   ├── htmlExportService.js     # Carrossel HTML
│       │   └── videoReelsService.js     # Pipeline de Reels
│       ├── automation/        # Puppeteer / Playwright (publicação Instagram)
│       ├── domain/            # Modelos e regras de formatação
│       ├── utils/             # brandProfiles, klingClient, helpers
│       ├── middleware/        # Auth Firebase, rate limiting
│       ├── config/            # Firebase Admin
│       └── queues/            # Sistema de filas (Bull)
│
└── frontend/                  # Next.js 14 + React 18
    └── src/
        ├── app/dashboard/     # Páginas (App Router)
        │   ├── accounts/
        │   ├── business-profiles/
        │   ├── calendar/
        │   ├── create-post/
        │   ├── generate/
        │   ├── history/
        │   ├── library/
        │   ├── posts/
        │   ├── review/
        │   ├── upload-manager/
        │   └── video-reels/
        ├── components/        # Header, PostsStatusWidget, ProfileSwitcher, ...
        ├── contexts/          # AuthContext, BusinessProfileContext
        └── lib/               # Firebase client, Axios API client
```

---

## Tech Stack

| Camada | Tecnologias |
|--------|-------------|
| Backend | Node.js, Express 4, ES Modules |
| IA / Imagens | OpenAI GPT-4o, Google Gemini, Replicate |
| IA / Vídeo | Kling AI |
| Automação | Puppeteer, Playwright |
| Banco de Dados | Firebase Firestore |
| Storage | Firebase Storage |
| Auth | Firebase Admin SDK + JWT |
| Agendamento | node-cron |
| Filas | Bull + Redis |
| Imagens | Sharp, FFmpeg, fluent-ffmpeg |
| Frontend | Next.js 14, React 18, TypeScript |
| Estilo | CSS (globals + CSS-in-JS) |
| Notificações | react-hot-toast |
| Upload | react-dropzone |
| Datas | date-fns |

---

## Instalação

### Pré-requisitos
- Node.js 18+
- Redis (para filas)
- Firebase Project (Firestore + Storage + Auth habilitados)
- Chaves de API: OpenAI, Google Generative AI, Replicate, Kling

### 1. Clone e instale

```bash
git clone <repo-url>
cd Insta-Automation

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Variáveis de ambiente — Backend (`backend/.env`)

```env
# Firebase Admin
FIREBASE_PROJECT_ID=seu-projeto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Servidor
PORT=3011
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Redis
REDIS_URL=redis://localhost:6379

# Criptografia de credenciais
ENCRYPTION_KEY=<openssl rand -base64 32>

# IA
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
REPLICATE_API_TOKEN=r8_...
KLING_API_KEY=...
KLING_API_SECRET=...
```

### 3. Variáveis de ambiente — Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123...
NEXT_PUBLIC_FIREBASE_APP_ID=1:123...:web:abc...

NEXT_PUBLIC_API_URL=http://localhost:3011
```

### 4. Executar em desenvolvimento

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Acesse: `http://localhost:3000`

---

## API — Principais Endpoints

### Accounts `/api/accounts`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar contas |
| POST | `/` | Adicionar conta |
| PUT | `/:id` | Atualizar conta |
| DELETE | `/:id` | Remover conta |
| POST | `/:id/verify` | Verificar login |

### Posts `/api/posts`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar posts (filtros: status, type, accountId, businessProfileId) |
| POST | `/` | Criar post |
| GET | `/:id` | Detalhes do post |
| PUT | `/:id` | Editar post pendente |
| DELETE | `/:id` | Cancelar/deletar |

### AI `/api/ai`
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/generate` | Gerar imagens (simples ou carrossel) |
| POST | `/generate-caption` | Gerar legenda |
| POST | `/generate-ideas` | Gerar ideias de posts |
| POST | `/generate-html-carousel` | Gerar carrossel HTML |
| POST | `/composite-scientific` | Overlay de composição científica |
| POST | `/generate-variations` | Variações editoriais |

### Auto-Generate `/api/auto-generate`
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/preview` | Pré-visualizar plano semanal |
| POST | `/weekly` | Gerar plano semanal (background) |
| GET | `/status/:profileId` | Status do job em background |
| GET | `/drafts` | Listar drafts pendentes |
| POST | `/drafts/:id/approve` | Aprovar e agendar draft |
| POST | `/drafts/:id/reject` | Rejeitar draft |

### Library `/api/library`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar itens (paginação por cursor) |
| POST | `/upload` | Upload direto (detecção de duplicatas) |
| POST | `/` | Criar item de URL existente |
| PUT | `/:id` | Atualizar item |
| DELETE | `/:id` | Deletar item |
| POST | `/:id/format` | Reformatar para proporção Instagram |

### Video Reels `/api/video-reels`
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/` | Criar projeto de Reel |
| POST | `/:id/generate-anchor` | Gerar imagem âncora |
| POST | `/:id/approve-anchor` | Aprovar/rejeitar âncora |
| POST | `/:id/generate-scenes` | Gerar cenas |
| POST | `/:id/scenes/:sceneId/approve` | Aprovar cena |
| POST | `/:id/merge` | Merge final do vídeo |

### Business Profiles `/api/business-profiles`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar perfis |
| POST | `/` | Criar perfil |
| PUT | `/:id` | Atualizar perfil |
| DELETE | `/:id` | Deletar perfil |
| POST | `/:id/link-account` | Vincular conta ao perfil |

---

## Estrutura do Firestore

### `accounts`
```json
{
  "userId": "string",
  "username": "string",
  "email": "encrypted",
  "password": "encrypted",
  "businessProfileId": "string",
  "status": "active | error | blocked",
  "lastVerified": "timestamp"
}
```

### `posts`
```json
{
  "userId": "string",
  "accountId": "string",
  "businessProfileId": "string",
  "type": "static | carousel | video | story | reel",
  "format": "image | carousel | carousel-html | carousel-premium | video | reel",
  "mediaUrls": ["array"],
  "caption": "string",
  "scheduledFor": "timestamp | null",
  "status": "draft | pending | processing | success | error",
  "source": "manual | auto-generated",
  "pillar": "string | null",
  "createdAt": "timestamp"
}
```

### `businessProfiles`
```json
{
  "userId": "string",
  "name": "string",
  "description": "string",
  "branding": { "primaryColor": "string", "fonts": [], "logoUrl": "string" },
  "aiPreferences": { "style": "string", "tone": "string" },
  "contentStrategy": { "pillars": [], "postingFrequency": "string" }
}
```

### `library`
```json
{
  "userId": "string",
  "businessProfileId": "string",
  "mediaUrls": ["array"],
  "htmlContent": "string | null",
  "tag": "string",
  "fileHash": "string",
  "createdAt": "timestamp"
}
```

---

## Segurança

- Credenciais Instagram criptografadas com AES antes de salvar no Firestore
- Autenticação via Firebase Auth + JWT em todas as rotas protegidas
- CORS configurado para aceitar apenas origem do frontend
- Rate limiting nas rotas de IA
- Validação de entrada em todos os endpoints
- Cookies de sessão armazenados localmente (nunca no banco)

---

## Troubleshooting

**Backend não sobe (conflito de porta)**
```bash
lsof -ti:3011 | xargs kill -9
cd backend && npm run dev
```

**Post travado em `processing`**
- Verifique se o Redis está rodando
- Confira os logs do backend em `backend/.dev-log.txt`

**Placeholder literal nas imagens geradas**
- Já corrigido: os prompts de overlay não passam mais texto literal para a IA de imagem

**Erro de índice composto no Firestore**
- Já corrigido: filtragem de datas movida para o código da aplicação

---

## Licença

MIT — Projeto para uso educacional e de desenvolvimento pessoal.
