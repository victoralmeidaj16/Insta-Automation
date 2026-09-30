# Revisão dos carrosséis HTML e da UX — 24/09/2026

## Escopo e evidência

Revisão breve do código atual, templates, geração, Biblioteca, Revisão e exportação. Conferido também `AJUSTES_UX_EDICAO.md`: parte das correções anteriores já aparece implementada no editor de imagens. Nenhuma alteração funcional ou publicação foi realizada.

A inspeção visual do arquivo local foi bloqueada pela política do navegador. Os problemas abaixo são achados de código e riscos derivados dos fluxos; não representam reprodução em produção nem validação visual em celular.

Testes existentes executados: 3 testes da prévia no frontend e 28 testes de HTML, conteúdo dos templates e agendamento no backend, todos aprovados. Os testes da prévia conferem o HTML injetado, não o resultado visual renderizado.

## Prioridade 1 — revisão completa e preservação do trabalho

### 1. Permitir revisar todos os slides no mesmo editor

**Evidência:** geração, modal de prévia e editor HTML da Biblioteca chamam `prepareHtmlCarouselPreview(html)` sem índice. O helper seleciona o slide zero e aplica `display:none` aos demais. A geração ainda orienta “Arraste para rolar”. A tela de Revisão já usa índice por slide.

**Alteração:** extrair um visualizador compartilhado com miniaturas numeradas, anterior/próximo, teclado e contador “Slide 2 de 7”. O editor controla a navegação; scripts de navegação do template não devem disputar esse controle.

**Aceite:** todos os slides podem ser vistos na geração, Biblioteca e Revisão, sem telas vazias ao navegar; o texto de orientação corresponde aos controles reais.

Referências: `frontend/src/lib/htmlCarouselPreview.ts:19`; `frontend/src/app/dashboard/generate/page.tsx:2308`; `frontend/src/app/dashboard/library/page.tsx:2987`; `frontend/src/app/dashboard/review/page.tsx:388`.

### 2. Preservar rascunhos, versões e alterações do HTML

**Evidência:** `closeHtmlEditModal` limpa os campos sem comparar alterações; clicar fora chama essa função. A correção por IA substitui o HTML inteiro. Uma nova geração limpa HTML e legenda antes de obter sucesso. O salvamento local existente não inclui `generatedHtml` nem `htmlCaption`.

**Alteração:** rascunho por usuário/perfil, indicador de salvamento, confirmação de descarte e histórico com Desfazer. Gerar ou corrigir cria uma versão candidata, com “Aplicar” e “Descartar”, preservando a anterior quando houver erro.

**Aceite:** falha de geração, atualização da página e fechamento acidental não eliminam trabalho; uma correção pode ser desfeita.

Referências: `frontend/src/app/dashboard/library/page.tsx:1270`, `:1479`; `frontend/src/app/dashboard/generate/page.tsx:293`, `:1520`.

### 3. Vincular o conteúdo ao perfil que o originou

**Evidência:** HTML e legenda ficam em estados sem perfil de origem. Trocar perfil atualiza preferências/modelos, mas não limpa nem isola esse resultado. Salvar usa o `selectedProfile.id` atual.

**Risco:** gerar para uma marca, trocar de perfil e salvar o conteúdo na biblioteca de outra.

**Alteração:** guardar `originProfileId` no rascunho e na operação em andamento; mostrar a marca junto da prévia; restaurar o rascunho específico ao trocar de perfil e ignorar respostas de operações obsoletas.

**Aceite:** o conteúdo da marca A não é salvo como B por uma troca de seletor, inclusive durante geração.

Referências: `frontend/src/app/dashboard/generate/page.tsx:189`, `:335`, `:1588`.

### 4. Manter HTML, miniaturas e exportações na mesma versão

**Evidência:** a exportação persiste `mediaUrls` e `hasExportedImages`; editar `htmlCode` não invalida esses campos. A Biblioteca prefere mídia existente à miniatura HTML. O editor HTML também não oferece o fluxo de atualização de agendamento do editor de imagens: envia legenda no PUT comum, que bloqueia conteúdos agendados com 409.

**Alteração:** versionar o conteúdo e a exportação, indicar “Prévia precisa ser atualizada”, regenerar apenas quando necessário e oferecer uma ação explícita para atualizar agendamentos vinculados. Incluir `htmlCode` entre os campos que afetam publicação nas proteções do backend.

**Aceite:** após editar, nenhuma miniatura antiga aparece como versão atual; o usuário sabe qual versão está agendada e recebe um caminho claro para atualizá-la.

Referências: `backend/src/services/htmlExportService.js:329`; `backend/src/routes/library.js:740`; `frontend/src/app/dashboard/library/page.tsx:1512`, `:2370`.

## Prioridade 2 — qualidade visual e facilidade de edição

### 5. Unificar a prévia e a exportação; validar a composição inteira

**Evidência:** frontend e backend mantêm ajustes de layout separados. A prévia reduz texto em `h1…li`, sem `div`; a exportação também inclui `div`. O Bold usa títulos em `div.hl-main`. Ambos os ajustes verificam largura, não altura. `clampCopy` também pode cortar uma frase e remover sua marcação ao exceder o limite.

**Alteração:** um contrato comum de renderização, dimensões e tipografia; validação de texto fora da área, imagens ausentes e rodapés sobrepostos. Apresentar aviso por slide e opção de encurtar o texto, evitando depender de redução silenciosa de fonte. Usar o mesmo render final na aprovação e no download.

**Aceite:** textos longos em português, listas e CTAs permanecem legíveis e inteiros em todos os templates. A versão aprovada corresponde à exportada.

Referências: `frontend/src/lib/htmlCarouselPreview.ts:63`; `backend/src/services/htmlExportService.js:63`; `backend/src/templates/elevepic/bold.html:368`; `backend/src/services/carouselTemplateService.js:389`.

### 6. Trocar a edição de código por campos visuais

**Evidência:** a geração dá uma coluna grande ao código-fonte; a Biblioteca oferece um textarea de HTML e correção por instrução à IA. Os templates já possuem marcadores `EP` e schemas de conteúdo que podem apoiar edição estruturada.

**Alteração:** prévia como área principal; painel com Texto, Imagem e Estilo; campos de título, corpo e CTA; ajuste de foto; código numa área “Avançado”. Começar pelos templates estruturados e manter o editor de código como alternativa para HTML livre. Refinamento deve permitir escolher “Este slide” ou “Carrossel inteiro”.

**Aceite:** alterar título, destaque e imagem de um slide não exige escrever HTML nem regenerar todo o carrossel.

Referências: `frontend/src/app/dashboard/generate/page.tsx:2214`; `frontend/src/app/dashboard/library/page.tsx:3171`; `backend/src/services/carouselTemplateService.js:221`, `:1056`.

### 7. Adaptar editor e navegação a telas pequenas

**Evidência:** geração usa coluna fixa de 420px; o editor HTML tem coluna mínima de 360px; o cabeçalho reúne cinco links e seletor de perfil numa linha. Não há adaptação específica nesses trechos.

**Alteração:** empilhar prévia e ferramentas em telas estreitas; manter proporção 4:5 com largura disponível; miniaturas roláveis e barra de ações fixa; navegação compacta. Trocar a legenda de uma linha do editor HTML por textarea.

**Aceite proposto:** testar a 360px, 390px, 768px e desktop sem rolagem horizontal da página, ações inacessíveis ou prévia cortada. Requer confirmação visual.

Referências: `frontend/src/app/dashboard/generate/page.tsx:2214`; `frontend/src/app/dashboard/library/page.tsx:3070`; `frontend/src/components/DashboardHeader.js:58`.

## Prioridade 3 — fluxo e feedback da plataforma

### 8. Tornar o processamento visível e recuperável

**Evidência:** geração depende de uma requisição de até 120 segundos e notificações temporárias. Exportação aguarda recursos e processa slides sequencialmente; o download usa timeout padrão de 30 segundos. Cada exportação cria uma pasta nova. “Salvar na Biblioteca” da geração não tem bloqueio de envio em andamento.

**Alteração:** progresso persistente por etapa e slide, recuperação de operação após sair da tela, cache por versão do HTML e recursos, botão de salvar com estado ocupado e proteção contra duplicação. Para download, oferecer ZIP ordenado. O risco de timeout precisa ser medido com carrosséis reais.

Referências: `frontend/src/app/dashboard/generate/page.tsx:1555`, `:1598`; `frontend/src/app/dashboard/library/page.tsx:461`; `frontend/src/lib/api.js:6`; `backend/src/services/htmlExportService.js:169`.

### 9. Padronizar linguagem e deixar o próximo passo explícito

Usar “Criar”, “Revisão”, “Biblioteca” e “Calendário” no menu; trocar detalhes como “Satori/Puppeteer” por benefícios compreensíveis. Após salvar, oferecer “Abrir na Biblioteca”; na revisão, mostrar perfil, versão, pendências e agendamento. Diferenciar tag editorial “Pronto” de estado real de publicação.

Na escolha de modelos, priorizar finalidade — educativo, comparação, lista, prova — com exemplos reais maiores. Os SVGs atuais de 54×68 são úteis para identificação, mas insuficientes para avaliar tipografia e densidade antes de gerar.

Referências: `frontend/src/components/DashboardHeader.js:9`; `frontend/src/app/dashboard/generate/page.tsx:1867`; `frontend/src/app/dashboard/generate/components/ElevepicTemplatePicker.tsx:6`.

## Ordem sugerida

1. Navegação completa, preservação do rascunho e isolamento por perfil.
2. Versão consistente entre HTML, exportação e agendamento.
3. Renderização compartilhada e validação visual com textos longos.
4. Editor visual responsivo, progresso e simplificação da linguagem.

A primeira entrega deve provar o fluxo: gerar sete slides, revisar todos, alterar o segundo, desfazer, salvar, reabrir e exportar preservando conteúdo e ordem.
