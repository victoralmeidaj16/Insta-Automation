# 🚀 Guia de Início Rápido - InstaBot

## ✅ Passo a Passo para Começar

### 1. Instalação das Dependências

As dependências estão sendo instaladas automaticamente. Aguarde a conclusão de:
- ✅ Backend (Node.js packages)
- ✅ Frontend (Next.js packages)

### 2. Verificar Firebase

O Firebase já está configurado com suas credenciais:
- ✅ Project ID: `studyy-8312b`
- ✅ Backend: Configurado em `backend/.env`
- ✅ Frontend: Configurado em `frontend/.env.local`

**Importante**: Certifique-se de que no [Firebase Console](https://console.firebase.google.com/project/studyy-8312b) você habilitou:
1. **Authentication** → Método "Email/Password"
2. **Firestore Database** → Criar database (modo teste ou produção)
3. **Storage** → Criar bucket

### 3. Instalar Redis (obrigatório para o sistema de filas)

**Mac (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Verificar se está rodando:**
```bash
redis-cli ping
# Deve retornar: PONG
```

### 4. Executar a Aplicação

Após a conclusão da instalação das dependências, abra 2 terminais:

**Terminal 1 - Backend:**
```bash
cd /Users/victoralmeidaj16/.gemini/antigravity/scratch/instagram-automation/backend
npm run dev
```

Você deve ver:
```
============================================================
🚀 Servidor rodando na porta 3001
📍 http://localhost:3001
🌍 Ambiente: development
============================================================

⏰ Scheduler iniciado - verificando posts a cada minuto
✅ Scheduler de posts iniciado
```

**Terminal 2 - Frontend:**
```bash
cd /Users/victoralmeidaj16/.gemini/antigravity/scratch/instagram-automation/frontend
npm run dev
```

Você deve ver:
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
  
✓ Ready in 2.5s
```

### 5. Acessar a Aplicação

Abra seu navegador em: **http://localhost:3000**

### 6. Primeiro Uso

1. **Criar conta no sistema:**
   - Email: seu@email.com
   - Senha: suasenha123
   - Clique em "Criar Conta"

2. **Adicionar conta Instagram:**
   - Vá para "Contas"
   - Clique em "+ Adicionar Conta"
   - Preencha:
     - Username: seu_usuario_instagram (sem @)
     - Email: email_do_instagram@exemplo.com
     - Senha: senha_do_instagram
   - Clique em "Adicionar"

3. **Verificar login:**
   - Clique em "Verificar" na conta adicionada
   - **IMPORTANTE**: Um navegador abrirá (modo visível em desenvolvimento)
   - Se aparecer 2FA, responda manualmente
   - Aguarde o login completar
   - Os cookies serão salvos automaticamente

4. **Criar primeiro post:**
   - Vá para "+ Novo Post"
   - Selecione a conta
   - Escolha "Post Estático"
   - Faça upload de uma imagem
   - Escreva uma legenda
   - Opções:
     - **Postar Agora**: Executa imediatamente
     - **Agendar**: Escolha data/hora futura

5. **Acompanhar execução:**
   - Vá para "Posts"
   - Veja o status:
     - 🟣 **Pending**: Agendado, aguardando horário
     - 🟠 **Processing**: Em execução agora
     - 🟢 **Success**: Publicado com sucesso
     - 🔴 **Error**: Falha (veja mensagem de erro)

### 7. Comportamento Humanizado

Durante a execução, você verá nos logs do backend:

```
🎭 Iniciando simulação de comportamento humano...
🎭 Comportamento humano: Rolando o feed...
✅ Rolou o feed 3 vezes
🎭 Comportamento humano: Curtindo posts aleatórios...
✅ Curtiu 2 posts
🎭 Comportamento humano: Pausando em um post...
✅ Pausou por 5.2s
✅ Comportamento humano simulado com sucesso!

📸 Criando post estático...
➕ Abrindo modal de criação...
📤 Fazendo upload da imagem...
⏭️ Avançando...
✍️ Adicionando legenda...
🚀 Compartilhando post...
✅ Post publicado com sucesso!
```

## 🔧 Troubleshooting Rápido

### Redis não conecta
```bash
# Verificar se Redis está rodando
brew services list | grep redis

# Iniciar Redis
brew services start redis
```

### Backend dá erro de Firebase
- Verifique se criou Firestore Database e Storage no Firebase Console
- Verifique se as credenciais estão corretas em `backend/.env`

### Login do Instagram falha
- Tente desabilitar 2FA temporariamente (para testes)
- Use conta de teste, não sua conta principal
- Verifique se Instagram não bloqueou temporariamente

### Post fica em "processing" indefinidamente
- Verifique logs do backend (Terminal 1)
- Redis pode estar offline
- Reinicie o backend

## ⚠️ Lembrete de Segurança

> **IMPORTANTE**: Esta automação viola os Termos de Serviço do Instagram
> - Use apenas para fins educacionais
> - Teste com contas descartáveis
> - Volume recomendado: **2-3 posts por dia**
> - Intervalo mínimo: **4-6 horas entre posts**

## 📊 Próximas Etapas

Após testar localmente:
1. Considere deploy no Render (veja README.md)
2. Configure regras de segurança do Firebase
3. Implemente monitoramento de logs
4. Adicione mais contas gradualmente

---

**Dúvidas?** Consulte o [README.md](./README.md) completo ou o [walkthrough.md](../brain/.../walkthrough.md)

🎉 **Boa sorte e use com responsabilidade!**
