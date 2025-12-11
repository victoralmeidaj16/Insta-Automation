# 🐛 Debug do Calendário - Guia de Teste

## ✅ Correções Implementadas

### 1. **Status Correto dos Posts**
- ❌ ANTES: Filtrava por `status === 'scheduled'`
- ✅ AGORA: Filtra por `status === 'pending'` (status correto do backend)

### 2. **Logs de Debug Adicionados**
- Console logs em cada etapa crítica
- Mensagens de erro mais descritivas
- Rastreamento completo do fluxo de dados

### 3. **Tratamento de Timezone**
- Comparação de datas melhorada
- Usa data local em vez de ISO string pura
- Evita problemas de fuso horário

## 🧪 Como Testar

### Passo 1: Abrir Dev Tools
1. Abra a página `/dashboard/calendar`
2. Pressione `F12` ou `Cmd+Option+I` (Mac)
3. Vá para a aba **Console**

### Passo 2: Adicionar Mídia à Biblioteca
1. Clique em "➕ Adicionar Mídia"
2. Selecione uma ou mais imagens
3. **Verifique no console:**
   ```
   📤 Fazendo upload de X arquivo(s)...
   ✅ Upload concluído: {urls: [...]}
   📚 Biblioteca atualizada: [...]
   ```

### Passo 3: Selecionar uma Conta
1. No dropdown superior, selecione uma conta ativa
2. **Verifique no console:**
   ```
   📋 Posts agendados carregados: X
   ```

### Passo 4: Arrastar e Soltar
1. Arraste um card da biblioteca de mídia
2. Solte sobre uma data **futura** no calendário
3. **Verifique no console:**
   ```
   🎯 Drop iniciado: {
     date: "2025-12-XX...",
     draggedItem: {...},
     selectedAccount: "..."
   }
   📤 Enviando post para API: {
     accountId: "...",
     type: "static",
     mediaUrls: [...],
     scheduledFor: "..."
   }
   ✅ Resposta da API: {
     message: "Post agendado com sucesso",
     post: {...}
   }
   📋 Posts agendados carregados: X
   ```

### Passo 5: Verificar o Resultado
1. O post deve aparecer no card da data selecionada
2. Deve mostrar o ícone correto (📸, 🎠, etc)
3. Deve mostrar "12:00" como horário

## 🔍 Possíveis Erros e Soluções

### Erro: "Selecione uma conta primeiro"
**Causa:** Nenhuma conta selecionada no dropdown
**Solução:** Selecione uma conta ativa

### Erro: "accountId, type e mediaUrls (array) são obrigatórios"
**Causa:** Dados incompletos sendo enviados
**Verificar:**
- `draggedItem.mediaUrls` existe e é array
- `selectedAccount` não está vazio
- Console log mostra os dados corretos

### Erro: "Resource not found" ou 403
**Causa:** Problema de autenticação ou permissões
**Verificar:**
- Token de autenticação válido
- Conta pertence ao usuário logado

### Posts não aparecem após drag & drop
**Possíveis causas:**
1. Status errado do post no backend ✅ CORRIGIDO
2. Problema de timezone ✅ CORRIGIDO  
3. Backend não está salvando o post
4. Filtro de conta incorreto

**Como verificar:**
- Veja os logs do console
- Verifique se `loadPosts()` foi chamado
- Verifique quantos posts foram retornados
- Use Firestore Console para ver se o post foi salvo

## 📊 Estrutura do Post Agendado

```javascript
{
  id: "...",
  userId: "...",
  accountId: "...",
  businessProfileId: "..." ou null,
  type: "static" | "carousel" | "video" | "story" | "reel",
  mediaUrls: ["https://..."],
  caption: "",
  scheduledFor: "2025-12-11T15:00:00.000Z",  // ISO 8601
  status: "pending",  // ← STATUS CORRETO!
  errorMessage: null,
  postedAt: null,
  createdAt: "2025-12-10T..."
}
```

## 🎯 Próximos Passos se Ainda Não Funcionar

1. **Verificar rota de API**
   - Backend está rodando?
   - Rota `/api/posts` está respondendo?

2. **Verificar autenticação**
   - Token está sendo enviado?
   - Header Authorization correto?

3. **Verificar Firestore**
   - Permissões corretas?
   - Coleção 'posts' existe?

4. **Compartilhar logs do console**
   - Copie TODOS os logs do console
   - Especialmente os logs com emoji (🎯, 📤, ✅, ❌)

## 💡 Dica Final

Se não aparecer nenhum log no console ao arrastar, pode ser que:
- O evento de drag não está sendo capturado
- JavaScript não está carregando
- Há erro de sintaxe (verifique aba Console)

---

**Última atualização:** 2025-12-10
