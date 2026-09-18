# Ajustes pendentes de experiência e edição

**Projeto:** Insta-Automation  
**Origem:** revisão de aproximadamente 5 minutos em 17/09/2026  
**Versão analisada:** `38015d0`  
**Status:** implementação em andamento — alterações de código e testes automatizados feitos; critérios de aceite em interface e provedor ainda precisam de validação controlada antes de marcar os itens.

A revisão combinou navegação em produção e leitura do código. Os problemas que poderiam alterar ou publicar conteúdos foram analisados no código, sem executar essas ações em produção. As referências de linhas correspondem à versão analisada.

## Prioridades

- **P1:** preservar conteúdos e evitar publicações ou ações com alcance inesperado.
- **P2:** corrigir informações, salvamento, filtros e agendamento.
- **P3:** simplificar a organização e o uso do editor.

## P1 — Conteúdo e controle de publicação

### 01. Preservar os slides ao refinar um carrossel

- [ ] Implementar e validar.

**Problema:** “Usar esta versão” envia `mediaUrls: [refinedImageUrl]`, substituindo todos os slides por uma única imagem. “Editar esta imagem” também reduz a lista a uma imagem.

**Ajuste:** selecionar o slide em edição e substituir somente sua posição, preservando a ordem e os demais slides.

**Aceite:** refinar o slide 2 de um carrossel com 5 imagens mantém as 5 imagens; somente o slide 2 muda. Cancelar preserva o conteúdo original.

**Referência:** `frontend/src/app/dashboard/library/page.tsx:722` e `:4019`.

### 02. Sincronizar edições e exclusões com os agendamentos

- [ ] Implementar e validar.

**Problema:** editar ou excluir um item na Biblioteca altera somente `library_items`. O post e o job externo podem continuar usando o conteúdo anterior e publicar mesmo após a exclusão na Biblioteca.

**Ajuste:** oferecer “Salvar e atualizar agendamento” e “Cancelar agendamento”; identificar os posts vinculados e confirmar o resultado no provedor. Explicar quando uma ação afeta somente a cópia da biblioteca. Se houver múltiplos agendamentos, mostrar quais serão afetados.

**Aceite:** a mídia e a legenda publicadas correspondem à versão confirmada; cancelar impede a publicação; falhas externas não são apresentadas como sucesso e permitem nova tentativa.

**Referências:** `backend/src/routes/library.js:601`, `:653`, `:673`; `backend/src/services/postService.js:688`.

### 03. Respeitar os filtros na aprovação em lote

- [ ] Implementar e validar.

**Problema confirmado na interface:** com Tudy selecionado e 6 itens visíveis, “Aprovar Fila da Semana (14)” seleciona 14 conteúdos. O botão usa todos os rascunhos, sem restringir perfil ou semana.

**Ajuste:** aplicar os filtros ativos à seleção; apresentar perfil, quantidade, tipos e datas na confirmação. Uma ação global deve indicar explicitamente seu alcance.

**Aceite:** aprovar uma seção filtrada afeta somente os itens dessa seção; o contador e a confirmação correspondem à seleção real.

**Referência:** `frontend/src/app/dashboard/review/page.tsx:1993`.

### 04. Representar e proteger a pausa dos stories

- [ ] Implementar e validar.

**Problema confirmado:** stories pausados aparecem como “Pronto para revisão”, com datas previstas e botão Aprovar. Zerar `storiesPerWeek` interrompe a geração semanal, mas não representa um bloqueio global de publicação manual.

**Ajuste:** criar estado explícito “Pausado para revisão”, excluir esses itens das aprovações em lote e exigir retomada explícita. Aplicar a proteção também no backend, nos caminhos de aprovação e publicação.

**Aceite:** um story pausado não é publicado por aprovação em lote ou automação; o motivo da pausa aparece na interface; retomar é uma ação específica. Preservar a pausa atual de FitSwap e Tudy durante a implementação e os testes.

**Referências:** `backend/src/services/contentGeneratorService.js:2074`; `frontend/src/app/dashboard/review/page.tsx:2411`.

### 05. Evitar ações sobre seleções ocultas

- [ ] Implementar e validar.

**Risco identificado no código:** a seleção da Biblioteca permanece ao trocar perfil ou filtros. Uma ação em lote pode afetar itens que já não aparecem na tela.

**Ajuste:** limpar a seleção na troca de perfil e limitar ações ao filtro ativo, ou mostrar explicitamente as seleções ocultas antes de agir.

**Aceite:** selecionar itens no FitSwap e mudar para Tudy não permite alterar ou excluir silenciosamente os itens do FitSwap.

**Referência:** `frontend/src/app/dashboard/library/page.tsx:183`, `:295`, `:1733`.

## P2 — Salvamento, informações e agendamento

### 06. Separar salvamento de reformatação com IA

- [ ] Implementar e validar.

**Problema:** salvar legenda ou tag pode acionar uma reformatação de imagem com IA quando a proporção está fora do padrão.

**Ajuste:** separar “Salvar alterações” de “Ajustar proporção”; apresentar a nova imagem para aceite antes de substituir a original.

**Aceite:** salvar apenas a legenda não gera imagem nem muda a mídia. A reformatação é explícita e pode ser descartada.

**Referência:** `frontend/src/app/dashboard/library/page.tsx:883`.

### 07. Exibir corretamente a frequência zero de stories

- [ ] Implementar e validar.

**Problema confirmado:** o banco guarda zero para FitSwap e Tudy, mas o formulário exibe sete devido a `storiesPerWeek || 7`. Abrir o formulário, por si só, não reativa os stories.

**Ajuste:** preservar zero usando `??` e apresentar a situação de geração/publicação com clareza.

**Aceite:** informar zero, salvar e reabrir mantém zero; editar outro campo não altera a frequência.

**Referência:** `frontend/src/app/dashboard/business-profiles/page.js:1695`.

### 08. Corrigir os contadores da Biblioteca

- [ ] Implementar e validar.

**Problema confirmado:** “Publicados” permanece em zero mesmo com itens publicados na tela. “Total” usa somente a página carregada e não acompanha “Carregar mais”.

**Ajuste:** retornar totais agregados por perfil ou rotular os números como itens carregados, mantendo coerência com os filtros.

**Aceite:** os números representam o escopo indicado e continuam corretos ao filtrar, trocar perfil e carregar mais itens.

**Referência:** `frontend/src/app/dashboard/library/page.tsx:261`.

### 09. Proteger alterações ainda não salvas

- [ ] Implementar e validar.

**Problema:** clicar fora fecha o editor sem aviso. Aceitar uma imagem refinada fecha o modal sem salvar a legenda editada. O botão Salvar permite cliques repetidos durante a requisição.

**Ajuste:** manter um rascunho local de edição, indicar alterações pendentes, confirmar descarte e bloquear envios repetidos. Aceitar uma imagem deve atualizar a prévia preservando os demais campos.

**Aceite:** imagem, legenda e tipo editados permanecem no formulário até salvar ou descartar; falha no salvamento preserva o trabalho; cliques repetidos não duplicam operações.

**Referência:** `frontend/src/app/dashboard/library/page.tsx:722`, `:3723`, `:4197`.

### 10. Permitir voltar da data manual ao próximo horário livre

- [ ] Implementar e validar.

**Problema:** o frontend ignora o salvamento de um campo de data vazio e a API rejeita esse valor, embora uma mensagem recomende limpar a data.

**Ajuste:** adicionar “Usar próximo horário livre”, persistindo `scheduledFor: null` e recalculando a previsão.

**Aceite:** um rascunho com data manual pode voltar ao modo automático; após reabrir, continua sem data fixa e recebe um horário ao ser aprovado.

**Referências:** `frontend/src/app/dashboard/review/page.tsx:790`; `backend/src/routes/auto-generate.js:501`.

### 11. Corrigir a paginação com filtro de tipo

- [ ] Reproduzir com dados controlados, implementar e validar.

**Risco identificado no código:** o backend limita documentos antes de filtrar por tipo. Quando o lote não contém o tipo procurado, pode retornar vazio com `hasMore: true`; o cursor do frontend não avança.

**Ajuste:** devolver o cursor da última entrada examinada independentemente dos resultados filtrados, ou aplicar o filtro na consulta com os índices necessários.

**Aceite:** itens antigos continuam acessíveis mesmo quando um lote intermediário não contém o tipo selecionado; não há repetição de páginas nem itens duplicados.

**Referências:** `backend/src/routes/library.js:395`; `frontend/src/app/dashboard/library/page.tsx:271`.

### 12. Manter tipo e formato consistentes

- [ ] Implementar e validar.

**Problema identificado no código:** o editor envia `type`, mas o backend não persiste o formato normalizado. `type` e `format` podem divergir, fazendo outras rotinas usarem o tipo anterior.

**Ajuste:** centralizar a normalização e persistir os campos de forma consistente; validar quantidade de imagens e regras específicas de stories/carrosséis.

**Aceite:** trocar o tipo e reabrir mantém o tipo escolhido; filtros, proporção, legenda e publicação usam a mesma classificação. Conversões incompatíveis apresentam orientação clara.

**Referências:** `frontend/src/app/dashboard/library/page.tsx:907`; `backend/src/routes/library.js:606`.

## P3 — Organização do editor e facilidade de uso

- [ ] **Editor em duas áreas:** imagem completa e navegação de slides à esquerda; ferramentas de Texto, Imagem e Publicação à direita. Empilhar em telas pequenas, sem rolagem horizontal.
- [ ] **Barra fixa de ações:** Salvar, Cancelar, progresso e indicação de alterações pendentes sempre acessíveis.
- [ ] **Navegação visual:** miniaturas numeradas, slide selecionado destacado, zoom e comparação Antes/Depois.
- [ ] **Histórico de versões:** recuperar a imagem anterior e desfazer refinamentos ou substituições sem perder os outros slides.
- [ ] **Linguagem consistente:** usar Biblioteca, Legenda, Revisão e Agendamento; distinguir aprovação do plano de aprovação para publicação. Avaliar o fluxo “Planejar → Gerar → Revisar → Agendar”.
- [ ] **Contexto dentro do editor:** mostrar perfil, formato, estado de publicação, agendamento ativo e eventual pausa.

## Ordem de execução e validação

1. Resolver os itens P1, priorizando preservação dos slides e controle dos agendamentos.
2. Corrigir salvamento e informações P2, com testes de regressão para os comportamentos afetados.
3. Aplicar as melhorias P3 sobre os fluxos corrigidos.
4. Verificar imagens únicas, carrosséis, stories pausados, itens agendados e troca de perfis.
5. Testar cancelamento, falhas do provedor e operações de publicação com mocks ou ambiente controlado; não publicar conteúdo real para validar a interface.
6. Marcar cada item como concluído somente após validar seus critérios de aceite e registrar o commit correspondente.
