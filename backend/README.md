# Instagram Automation Backend

Backend da plataforma de automação para Instagram com comportamento humanizado.

## 🚀 Tecnologias

- Node.js + Express
- Puppeteer (automação de navegador)
- Firebase (Firestore + Storage + Auth)
- Bull (sistema de filas)
- Redis
- Node-cron (agendamento)

## 📦 Instalação

```bash
npm install
```

## ⚙️ Configuração

1. Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

2. Configure as variáveis de ambiente no `.env`:

```.env
# Firebase Admin SDK (obtenha no Console do Firebase)
FIREBASE_PROJECT_ID=seu-projeto
FIREBASE_CLIENT_EMAIL=email@projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Server
PORT=3001
NODE_ENV=development

# Redis (Render fornece gratuitamente)
REDIS_URL=redis://localhost:6379

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Chave de criptografia (gere uma aleatória)
ENCRYPTION_KEY=sua-chave-secreta-aqui
```

3. Certifique-se de ter o Redis rodando:

```bash
# Mac (com Homebrew)
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis
```

## 🏃 Executar

### Desenvolvimento (com auto-reload)

```bash
npm run dev
```

### Produção

```bash
npm start
```

## 📡 Endpoints da API

### Health Check
- `GET /health` - Verificar status do servidor

### Accounts
- `POST /api/accounts` - Adicionar conta Instagram
- `GET /api/accounts` - Listar contas
- `PUT /api/accounts/:id` - Atualizar conta
- `DELETE /api/accounts/:id` - Remover conta
- `POST /api/accounts/:id/verify` - Verificar login

### Posts
- `POST /api/posts` - Criar post (imediato ou agendado)
- `GET /api/posts` - Listar posts (com filtros)
- `GET /api/posts/:id` - Detalhes do post
- `DELETE /api/posts/:id` - Cancelar/deletar post

### Upload
- `POST /api/upload` - Upload de mídia(s)

### Stats
- `GET /api/stats` - Estatísticas da fila

## 🎭 Comportamento Humanizado

O sistema simula ações humanas antes de postar:
- ✅ Scrolling aleatório do feed
- ✅ Curtir 2-4 posts aleatórios
- ✅ Pausar em posts (3-8 segundos)
- ✅ Delays aleatórios entre ações
- ✅ User-agent randomizado
- ✅ Viewport randomizado

## 🔒 Segurança

- Credenciais do Instagram são criptografadas
- Cookies salvos localmente para "manter logado"
- Autenticação via Firebase Auth JWT
- Validação de todas as entradas

## 📝 Logs

O sistema exibe logs detalhados no console:
- 🔐 Login
- 🎭 Comportamento humanizado
- 📸 Upload de posts
- ✅ Sucesso
- ❌ Erros

## 🚢 Deploy no Render

1. Crie um novo Web Service no Render
2. Conecte seu repositório
3. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Adicione as variáveis de ambiente
5. Adicione um Redis (gratuito) no Render
6. Deploy!

## ⚠️ Avisos

- Este projeto **viola os Termos de Serviço do Instagram**
- Use por sua conta e risco
- Apenas para fins educacionais
