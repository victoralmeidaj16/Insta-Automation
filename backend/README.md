# Insta-Automation Backend

API Express da plataforma de geração, revisão e agendamento de conteúdo para Instagram.

## Requisitos

- Node.js compatível com o `package-lock.json`
- Firebase Auth, Firestore e Storage
- Credenciais OpenAI/Gemini conforme os recursos utilizados
- Conta Upload-Post para agendamento externo

## Instalação local

```bash
npm install
cp .env.example .env
npm run dev
```

O backend local usa `http://localhost:3011` quando `PORT=3011`.

## Variáveis principais

```env
PORT=3011
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
ALLOWED_USER_UIDS=<uid-firebase-administrativo>

FIREBASE_PROJECT_ID=<projeto>
FIREBASE_CLIENT_EMAIL=<service-account>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

CRON_USERNAME=uptimerobot
CRON_PASSWORD=<senha-forte>
ENABLE_IN_PROCESS_SCHEDULER=false
```

Consulte `.env.example` para integrações adicionais. Nunca versione `.env`, arquivos `.env.vercel.*`, senhas ou tokens.

## Autenticação

- `/health` é público e retorna dados mínimos.
- `/internal/cron/tick` usa HTTP Basic com `CRON_USERNAME` e `CRON_PASSWORD`.
- Todas as rotas `/api/*` exigem `Authorization: Bearer <Firebase ID token>`.
- Apenas UIDs presentes em `ALLOWED_USER_UIDS` são aceitos.
- Serviços e rotas validam propriedade antes de acessar contas, perfis, posts e biblioteca.

## Scheduler

Em produção, `ENABLE_IN_PROCESS_SCHEDULER=false`. O UptimeRobot chama `/internal/cron/tick` a cada cinco minutos. Cada tick:

1. adquire um lease transacional no Firestore;
2. sincroniza jobs Upload-Post;
3. retoma geração semanal elegível e idempotente;
4. atualiza heartbeat e estado terminal.

O `node-cron` permanece apenas como fallback explícito para desenvolvimento e só inicia quando `ENABLE_IN_PROCESS_SCHEDULER=true`.

## Endpoints principais

- `GET /health`
- `GET|POST /internal/cron/tick`
- `/api/accounts`
- `/api/posts`
- `/api/upload`
- `/api/ai`
- `/api/history`
- `/api/business-profiles`
- `/api/library`
- `/api/auto-generate`
- `/api/alerts`

Posts cujo provedor externo não confirmou um `job_id` recebem `schedule_error`; eles não são publicados localmente como fallback.

## Validação

```bash
npm test -- --run
```

Scripts operacionais exigem IDs e credenciais por variáveis de ambiente. Scripts destrutivos ou de backfill usam dry-run por padrão quando disponível.

## Deploy no Render

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Configure os segredos exclusivamente em **Environment**.
- Mantenha `ENABLE_IN_PROCESS_SCHEDULER=false` quando o UptimeRobot estiver ativo.
