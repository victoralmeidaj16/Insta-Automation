# 📸 InstaBot - Plataforma de Automação Instagram

Plataforma web completa para automação de postagens no Instagram com comportamento humanizado, suporte a múltiplas contas, agendamento e sistema de filas.

> ⚠️ **AVISO IMPORTANTE**: Este projeto **viola os Termos de Serviço do Instagram** e é apenas para fins educacionais. O uso pode resultar em bloqueio permanente de contas. Use por sua conta e risco.

## ✨ Funcionalidades

- 🤖 **Automação Inteligente** - Puppeteer com comportamento humanizado
- 🎭 **Anti-Detecção** - Scrolling, curtidas, delays aleatórios
- 📱 **Múltiplos Formatos** - Post estático, carrossel, vídeo, Reel, Story
- ⏰ **Agendamento** - Posts imediatos ou agendados
- 🔐 **Multi-Conta** - Gerenciamento de várias contas Instagram
- 🔒 **Segurança** - Credenciais criptografadas, cookies persistentes
- ☁️ **Firebase** - Firestore + Storage + Auth
- 📊 **Dashboard Moderno** - Interface intuitiva e responsiva

## 🏗️ Arquitetura

```
instagram-automation/
├── backend/           # Node.js + Express + Puppeteer
│   ├── src/
│   │   ├── automation/        # Motor de automação Instagram
│   │   ├── config/            # Configuração Firebase
│   │   ├── services/          # Lógica de negócio
│   │   ├── routes/            # API REST
│   │   ├── queues/            # Sistema de filas (Bull)
│   │   └── middleware/        # Autenticação
│   └── package.json
│
└── frontend/          # Next.js + React
    ├── src/
    │   ├── app/               # Pages (App Router)
    │   ├── lib/               # Firebase + API client
    │   ├── contexts/          # Auth context
    │   └── components/        # (Future)
    └── package.json
```

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js 18+ 
- Firebase Project (Firestore + Storage + Auth habilitados)
- Redis (para sistema de filas)

### 1. Clone o Repositório

```bash
cd /Users/victoralmeidaj16/.gemini/antigravity/scratch/instagram-automation
```

### 2. Configurar Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com)
2. Crie um novo projeto
3. Habilite **Authentication** (Email/Password)
4. Habilite **Firestore Database**
5. Habilite **Storage**
6. Gere credenciais:
   - **Service Account** (para backend): Settings → Service Accounts → Generate new private key
   - **Web App** (para frontend): Project Settings → Add app → Web

### 3. Backend

```bash
cd backend
npm install

# Copiar .env
cp .env.example .env

# Editar .env com suas credenciais Firebase
nano .env
```

Configurar `.env`:

```env
# Firebase Admin SDK (do arquivo JSON baixado)
FIREBASE_PROJECT_ID=seu-projeto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Server
PORT=3001
NODE_ENV=development

# Redis (local ou Render)
REDIS_URL=redis://localhost:6379

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Chave de criptografia (gere uma aleatória)
ENCRYPTION_KEY=$(openssl rand -base64 32)
```

### 4. Frontend

```bash
cd ../frontend
npm install

# Copiar .env
cp .env.example .env.local

# Editar .env.local
nano .env.local
```

Configurar `.env.local`:

```env
# Firebase Client SDK (da configuração Web App)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-projeto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123...
NEXT_PUBLIC_FIREBASE_APP_ID=1:123...:web:abc...

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 5. Redis (Desenvolvimento Local)

**Mac:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

## 🏃 Executar Localmente

### Terminal 1 - Backend
```bash
cd backend
npm run dev
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
```

Acesse: `http://localhost:3000`

## 📡 API Endpoints

### Accounts
- `POST /api/accounts` - Adicionar conta
- `GET /api/accounts` - Listar contas
- `PUT /api/accounts/:id` - Atualizar conta
- `DELETE /api/accounts/:id` - Remover conta
- `POST /api/accounts/:id/verify` - Verificar login

### Posts
- `POST /api/posts` - Criar post
- `GET /api/posts?status=pending&type=static` - Listar posts
- `GET /api/posts/:id` - Detalhes do post
- `DELETE /api/posts/:id` - Cancelar/deletar

### Upload
- `POST /api/upload` - Upload de mídias (multipart/form-data)

### Stats
- `GET /api/stats` - Estatísticas da fila
- `GET /health` - Health check

## 🚢 Deploy no Render

### Backend

1. Crie um **Web Service** no Render
2. Conecte seu repositório Git
3. Configure:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Environment**: Node
4. Adicione todas as variáveis de ambiente do `.env`
5. Adicione um **Redis** instance (gratuito no Render)
6. Copie a **Internal Redis URL** e cole em `REDIS_URL`
7. Deploy!

### Frontend

1. Crie um **Static Site** no Render (ou use Vercel)
2. Configure:
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/.next`
3. Adicione as variáveis de ambiente do `.env.local`
4. Atualize `NEXT_PUBLIC_API_URL` com a URL do backend
5. Deploy!

**Alternativa**: Deploy do frontend na [Vercel](https://vercel.com) (mais simples para Next.js)

## 🎭 Como Funciona?

### 1. Comportamento Humanizado

Antes de cada postagem, o sistema simula ações humanas:

- 🖱️ Scrolling aleatório do feed (2-4 vezes)
- ❤️ Curtir 2-4 posts aleatórios
- ⏸️ Pausar em posts (3-8 segundos)
- ⏱️ Delays aleatórios entre ações (1-5s)
- 🔄 User-agent randomizado
- 📱 Viewport randomizado

### 2. Persistência de Sessão

- Primeiro login: manual (suporta 2FA)
- Cookies salvos localmente
- Logins subsequentes: automáticos
- "Manter logado" ativado por padrão

### 3. Sistema de Filas

- Posts imediatos → fila imediata
- Posts agendados → verificação a cada minuto
- 3 tentativas em caso de falha
- Retry com backoff exponencial

### 4. Limpeza Automática

Após publicação bem-sucedida:
- ✅ Mídias deletadas do Firebase Storage
- 💰 Economia de custos
- 📊 Apenas metadados mantidos no Firestore

## 💡 Uso Recomendado

### Volume Seguro
- **2-3 posts por dia** por conta
- **Intervalo mínimo**: 4-6 horas entre posts
- **Evite**: Múltiplos posts simultâneos

### Horários Ideais
- Manhã: 8h-10h
- Almoço: 12h-14h  
- Noite: 18h-21h

### Boas Práticas
1. ✅ Comece com 1 conta para testar
2. ✅ Use contas "descartáveis" para testes
3. ✅ Monitore logs de perto
4. ❌ Não use conta principal/comercial
5. ❌ Não abuse do volume

## 🐛 Troubleshooting

### "Login falhou"
- Verifique credenciais
- Tente login manual primeiro
- Verifique se 2FA está desabilitado (ou responda manualmente)

### "Botão não encontrado"
- Instagram mudou a interface
- Atualize os seletores em `src/automation/instagram.js`

### "Post travado em 'processing'"
- Verifique logs do backend
- Redis pode estar offline
- Reinicie o servidor

### Cookies não salvam
- Verifique permissões da pasta `cookies/`
- Certifique-se que `COOKIES_DIR` existe

## 📊 Estrutura do Firestore

### Collection: `accounts`
```json
{
  "userId": "string",
  "username": "string",
  "email": "encrypted",
  "password": "encrypted",
  "status": "active|error|blocked",
  "stayLoggedIn": true,
  "lastVerified": "timestamp",
  "createdAt": "timestamp"
}
```

### Collection: `posts`
```json
{
  "userId": "string",
  "accountId": "string",
  "type": "static|carousel|video|story|reel",
  "mediaUrls": ["array"],
  "caption": "string",
  "scheduledFor": "timestamp|null",
  "status": "pending|processing|success|error",
  "errorMessage": "string|null",
  "postedAt": "timestamp|null",
  "createdAt": "timestamp"
}
```

## 🔒 Segurança

- ✅ Credenciais criptografadas (AES)
- ✅ Cookies salvos localmente
- ✅ JWT para autenticação frontend
- ✅ Validação de entrada
- ✅ CORS configurado
- ✅ HTTPS recomendado em produção

## 📝 Logs

O sistema exibe logs detalhados:

```
🔐 Iniciando login para @username...
📝 Preenchendo credenciais...
✅ Login bem-sucedido!
🎭 Iniciando simulação de comportamento humano...
🖱️ Rolando o feed...
❤️ Curtiu 3 posts
⏸️ Pausou por 5.2s
📸 Criando post estático...
✅ Post publicado com sucesso!
```

## 🤝 Contribuindo

Este é um projeto educacional. Contribuições são bem-vindas:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## ⚖️ Licença

MIT - Apenas para fins educacionais

## 📞 Suporte

- 🐛 Issues: [GitHub Issues](#)
- 📧 Email: [seu-email@example.com](#)

---

**Desenvolvido com ❤️ para educação. Não nos responsabilizamos pelo uso indevido.**
