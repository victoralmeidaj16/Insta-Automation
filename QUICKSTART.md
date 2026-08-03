# Início rápido — Insta-Automation

## 1. Instalar dependências

```bash
cd backend
npm install

cd ../frontend
npm install
```

## 2. Configurar ambientes locais

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Preencha as credenciais Firebase sem versionar esses arquivos. O aplicativo usa:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3011`
- projeto Firebase: `studyy-8312b`
- único administrador: `123indiozinhos@gmail.com`

No Firebase Auth, o método Email/Password precisa estar habilitado.

## 3. Executar

Terminal do backend:

```bash
cd backend
npm run dev
```

Terminal do frontend:

```bash
cd frontend
npm run dev
```

Acesse `http://localhost:3000` e faça login com a conta administrativa existente. A aplicação não oferece cadastro público.

## 4. Agendamento

Em desenvolvimento, mantenha:

```env
ENABLE_IN_PROCESS_SCHEDULER=false
```

Em produção, o UptimeRobot chama o endpoint protegido do Render a cada cinco minutos:

```text
https://insta-automation-backend-by1w.onrender.com/internal/cron/tick
```

Use HTTP Basic com os mesmos valores de `CRON_USERNAME` e `CRON_PASSWORD` configurados no Render. O método HEAD do plano gratuito é aceito.

## 5. Fluxo de conteúdo

1. Selecione o perfil de negócio.
2. Gere ou envie mídia.
3. Revise os drafts.
4. Aprove somente o conteúdo desejado.
5. O Upload-Post agenda a publicação e retorna `job_id`.

Fitswap permanece em `publishingMode: review`; drafts nunca são publicados automaticamente.

## Verificações

```bash
cd backend && npm test -- --run
cd ../frontend && npm test -- --run
npx tsc --noEmit
npm run build
```

Respostas esperadas em produção:

- `/health` sem token: `200`
- `/api/accounts` sem token: `401`
- `/internal/cron/tick` sem Basic Auth: `401`
- cron autenticado: `200` ou `202`

## Segurança

- Nunca versione `.env`, `.env.local` ou `.env.vercel.*`.
- Nunca grave senhas em scripts.
- Use chaves Upload-Post por perfil e rotacione-as quando houver suspeita de exposição.
- Não use `npm audit fix --force` nesta recuperação.
