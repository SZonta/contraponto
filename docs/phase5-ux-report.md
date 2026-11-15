# Fase 5 — Revisão de UX

Data: 2026-11-15. Status: concluída no escopo solicitado.

## Resumo

A revisão mantém a barra lateral, o cabeçalho, o chat, o composer e as telas existentes. A prioridade passou a ser identificar a IA ativa, mostrar o trabalho atual, tornar as aprovações visíveis e indicar a próxima ação. Os controles secundários continuam disponíveis, com menos competição pelo espaço da tela.

- Linha de base: **64 testes**, typecheck passando. Resultado final: **103 testes**, typecheck e build de produção passando.
- **48 capturas antes e 73 depois**, cobrindo os mesmos 24 estados em dois tamanhos e cenários adicionais de recuperação/acessibilidade. Há ainda **1 mockup de proposta não aplicada**.
- A janela mínima de **900×600** deixou de apresentar rolagem horizontal nos estados conferidos. No Automático, os dois pares modelo/esforço ficam em **Opções do turno**, sem perder suas seleções.
- Foram usados **1 turno curto de Claude/Haiku com esforço baixo e 4 turnos de Codex no app**, incluindo a delegação real. Consultas de modelos/cotas não enviaram prompts.
- Não houve alteração em agentes, fila, roteamento, checkpoints, agendador, preload ou contratos compartilhados. Não houve dependência nova, commit ou push no repositório. O jogo oficial não foi acessado.

## Origem e privacidade das capturas

Todos os PNGs de antes/depois são capturas reais do renderer do Electron, por DevTools Protocol. As dimensões da janela foram controladas pelo BrowserWindow da instância de desenvolvimento e conferidas com o tamanho do conteúdo. Não houve montagem, ocultação por CSS ou edição de pixels nesses prints.

O banco, os arquivos e os scripts de teste ficam em `.phase5-tests/`, ignorada pelo Git. Os estados estáticos usam mensagens/arquivos de exemplo inseridos no banco isolado: permitem comparar exatamente a apresentação das mesmas mensagens, ferramentas, diffs, imagens, erros e avisos sem consumir cota. Os estados de execução, aprovação, ferramenta, conclusão e Desfazer vieram de turnos reais. Os testes de leitura do histórico também usaram eventos sintéticos de apresentação, sem invocar agentes.

Não foi usado o histórico pessoal. As capturas passaram por bloqueio de caminhos de perfil e revisão das imagens; os PNGs não contêm EXIF. Caminhos de dados do usuário são referidos na documentação como **%APPDATA%**. O app continua delegando autenticação às CLIs oficiais e não ganhou qualquer tratamento de credenciais.

Tamanhos: janela normal **1280×820**, conteúdo capturado **1264×781**; janela mínima **900×600**, conteúdo **884×561**. A moldura do Windows não faz parte do PNG. Dimensões e SHA-256 de todas as imagens constam do [manifesto](images/ux/capture-manifest.json).

## Problemas por gravidade

| Gravidade | Tela | Problema observado | O que foi feito |
|---|---|---|---|
| Alta | Cabeçalho / 900×600 | Cotas consumiam a largura e escondiam identidade do chat; havia rolagem horizontal. | Dois cartões compactos mantêm as quatro cotas visíveis; renovação em detalhes acessíveis; nome curto do projeto e layout sem transbordamento. Testado também com 100%. |
| Alta | Chat em andamento / Automático | “Trabalhando” não esclarecia a IA ativa nem a atividade. | Faixa fixa com agente, atividade e próxima ação, derivada dos eventos existentes. Considera menção, troca por cota, fila, ferramentas e delegação. |
| Alta | Aprovações | Pedido ficava no fim do histórico e desaparecia ao abrir outra conversa. | Faixa de atenção, Ver pedido, aviso global para outra conversa e sinal Precisa de você na barra lateral. A navegação até o pedido foi testada com aprovação real. |
| Alta | Histórico em streaming | Cada atualização puxava o usuário ao fim da conversa. | Acompanhamento só enquanto a leitura está no final; posição preservada ao subir; botão Ir para a resposta. |
| Alta | Composer | Rascunho/anexos podiam acompanhar a conversa errada; anexo assíncrono podia substituir texto recém-digitado. | Rascunho por chat e atualizações funcionais. Troca de conversa e digitação durante anexo foram verificadas. |
| Alta | Composer / opções em janela baixa | Opções abertas reduziam o histórico para cerca de 80 px em 900×600. | Em conteúdo de até 700 px de altura, as opções abrem sobre a área de escrita, com rolagem própria. O histórico permanece com 224 px nos três modos, sem redução nem cobertura pelo painel. Escape devolve o foco; clique ou foco fora fecha o painel. |
| Alta | Modais e imagens | Foco escapava para o fundo; imagem era acionável só por mouse. | Dialog compartilhado, fundo inert, ciclo Tab/Shift+Tab, Escape, retorno de foco; miniatura virou botão. |
| Alta | Formulários / 900×600 | Cancelar e Salvar ficavam abaixo da área visível. | Cabeçalho e rodapé fixos no modal, com apenas o conteúdo rolável. |
| Alta | Carregamento e falhas | Espera sem explicação, rejeições sem tratamento e ausência de recuperação. | Estados de carregamento, erros locais/globais e Tentar novamente. Falha real de leitura no banco descartável foi provocada e recuperada. |
| Média | Composer | Seis seletores no Automático competiam com a mensagem e o envio. | Agente, mensagem, anexos e Enviar ficam à mão; modelos/esforços/permissão em Opções do turno. Os dois pares continuam disponíveis e persistem. |
| Média | Evidência / Automático | Os dois prints after-composer-auto mostravam Codex porque o script alterava o banco sem atualizar a seleção exibida. | Recapturados pelo seletor real, com Automático, opções abertas e os quatro campos conferidos. Os dois before já estavam corretos e foram preservados; manifesto atualizado. |
| Média | Permissões | Texto genérico podia sugerir aprovação mesmo no modo Liberar tudo. | Texto acompanha a permissão real; Sem pedir aprovação fica destacado no resumo. Nenhuma ação foi executada nesse modo durante o teste. |
| Média | Textos e controles | Placeholder longo, falta de rótulos e códigos de esforço em inglês. | Rótulos associados, ajuda curta separada do campo e esforço em português, mantendo os valores do protocolo. |
| Média | Menções | Sem ajuda ao digitar @ ou indicação clara de quem responderia. | Sugestões com setas/Tab/Enter e indicação da menção; as regras do roteador permaneceram intactas. |
| Média | Ferramentas e arquivos | Nome técnico e cor não deixavam claro quem fez o quê. | Agente escrito, atividade em linguagem direta, estado textual e detalhes/diff expansíveis. |
| Média | Erro / fim de turno | Resultado sem ação seguinte; turnos sem arquivos podiam terminar sem indicação visível. | Mensagem de orientação, conclusão/interrupção/erro explícitos e estado Desfazendo para evitar cliques duplicados. |
| Média | Barra lateral | Renomear/apagar só apareciam no hover; ações tinham nomes insuficientes. | Ações visíveis também com foco, nomes acessíveis, seleção semântica e bloqueio de apagar chat em execução. Renomear seleciona o nome; Escape cancela. |
| Média | Exclusão | Confirmação nativa destoava da interface e interrompia a navegação. | Confirmação dentro do app, com foco controlado, ação destrutiva explícita e descrição dos dados preservados. APIs de exclusão não mudaram. |
| Média | Agendamentos | Introdução longa, estado vazio fraco e validação pouco orientadora. | Texto curto, ação inicial clara, explicação sob demanda e erros de cron/fuso/data em português junto ao rodapé. |
| Média | Contraste / foco | Placeholder e bordas pouco definidos; vários controles retiravam o outline. | Neutros ajustados, borda de controle com contraste, anel de foco e alvos de interação maiores. Respeita movimento reduzido. |
| Média | Imagens | Arquivo ausente produzia falha sem recuperação. | Aviso de imagem indisponível e retry; arquivo local de exemplo foi temporariamente movido/restaurado para testar. |
| Baixa | Iconografia | Emojis do Windows têm pesos visuais diferentes entre ações. | Mantidos nesta fase; padronizar ícones vetoriais pode ser uma revisão posterior. O ícone original do app foi preservado. |
| Baixa | Barras de rolagem | Contraste visual forte das barras nativas no tema escuro. | Comportamento do sistema preservado; personalização não foi priorizada sobre navegação e legibilidade. |

## Ajustes conferidos antes do commit

As capturas `after-composer-auto.png` e `after-composer-auto-small.png` foram corrigidas. Também foram refeitos os pares depois de Claude e Codex, com as opções abertas. A captura agora muda o modo pela interface e confere a seleção e os pares renderizados antes de salvar. Os dois `before-composer-auto` mostram Automático, Claude e Codex corretamente; seus hashes foram conferidos e os arquivos originais permaneceram intactos.

Na janela nativa de **900×600**, com conteúdo de **884×561**, o histórico mede **224 px** em Claude, Codex e Automático, tanto com as opções fechadas quanto abertas. O painel começa abaixo do histórico e fica sobre a área de escrita, com altura limitada e rolagem interna. Os dois pares de modelo/esforço ficam visíveis no Automático; permissões continuam acessíveis por rolagem e teclado. Na janela normal, as opções continuam no fluxo da tela.

| Modo em 900×600 | Histórico: fechado → aberto | Captura com histórico e opções |
|---|---|---|
| Claude | 224 → 224 px | [Ver PNG](images/ux/after-options-history-claude-small.png) |
| Codex | 224 → 224 px | [Ver PNG](images/ux/after-options-history-codex-small.png) |
| Automático | 224 → 224 px | [Ver PNG](images/ux/after-options-history-auto-small.png) |

![Automático com histórico preservado e ambos os pares visíveis](images/ux/after-options-history-auto-small.png)

Foram conferidos Escape com retorno de foco, fechamento por clique/foco fora, acesso por teclado às permissões e ausência de rolagem horizontal. Dimensões, modo e pares visíveis constam também no [manifesto](images/ux/capture-manifest.json). **Nenhum turno adicional de Claude ou Codex foi enviado** para estes ajustes; foram usados somente os dados isolados em `.phase5-tests/`.

## Comparações principais na janela mínima

| Estado | Antes | Depois |
|---|---|---|
| Automático com os dois pares de seletores | <a href="images/ux/before-composer-auto-small.png"><img src="images/ux/before-composer-auto-small.png" alt="Antes: Automático com os dois pares de seletores" width="400"></a> | <a href="images/ux/after-composer-auto-small.png"><img src="images/ux/after-composer-auto-small.png" alt="Depois: Automático com os dois pares de seletores" width="400"></a> |
| Aprovação pendente | <a href="images/ux/before-approval-small.png"><img src="images/ux/before-approval-small.png" alt="Antes: Aprovação pendente" width="400"></a> | <a href="images/ux/after-approval-small.png"><img src="images/ux/after-approval-small.png" alt="Depois: Aprovação pendente" width="400"></a> |
| Configurações com ações acessíveis | <a href="images/ux/before-settings-small.png"><img src="images/ux/before-settings-small.png" alt="Antes: Configurações com ações acessíveis" width="400"></a> | <a href="images/ux/after-settings-small.png"><img src="images/ux/after-settings-small.png" alt="Depois: Configurações com ações acessíveis" width="400"></a> |

<details>
<summary>Ver todas as 24 comparações — janela normal 1280×820</summary>

| Estado | Antes | Depois |
|---|---|---|
| App sem pastas | <a href="images/ux/before-no-project.png"><img src="images/ux/before-no-project.png" alt="Antes: App sem pastas" width="400"></a> | <a href="images/ux/after-no-project.png"><img src="images/ux/after-no-project.png" alt="Depois: App sem pastas" width="400"></a> |
| Chat vazio | <a href="images/ux/before-empty-chat.png"><img src="images/ux/before-empty-chat.png" alt="Antes: Chat vazio" width="400"></a> | <a href="images/ux/after-empty-chat.png"><img src="images/ux/after-empty-chat.png" alt="Depois: Chat vazio" width="400"></a> |
| Composer: Claude | <a href="images/ux/before-composer-claude.png"><img src="images/ux/before-composer-claude.png" alt="Antes: Composer: Claude" width="400"></a> | <a href="images/ux/after-composer-claude.png"><img src="images/ux/after-composer-claude.png" alt="Depois: Composer: Claude" width="400"></a> |
| Composer: Codex | <a href="images/ux/before-composer-codex.png"><img src="images/ux/before-composer-codex.png" alt="Antes: Composer: Codex" width="400"></a> | <a href="images/ux/after-composer-codex.png"><img src="images/ux/after-composer-codex.png" alt="Depois: Composer: Codex" width="400"></a> |
| Composer: Automático e dois pares | <a href="images/ux/before-composer-auto.png"><img src="images/ux/before-composer-auto.png" alt="Antes: Composer: Automático e dois pares" width="400"></a> | <a href="images/ux/after-composer-auto.png"><img src="images/ux/after-composer-auto.png" alt="Depois: Composer: Automático e dois pares" width="400"></a> |
| Anexos e @menção | <a href="images/ux/before-attachments-mentions.png"><img src="images/ux/before-attachments-mentions.png" alt="Antes: Anexos e @menção" width="400"></a> | <a href="images/ux/after-attachments-mentions.png"><img src="images/ux/after-attachments-mentions.png" alt="Depois: Anexos e @menção" width="400"></a> |
| Mensagens das duas IAs | <a href="images/ux/before-messages.png"><img src="images/ux/before-messages.png" alt="Antes: Mensagens das duas IAs" width="400"></a> | <a href="images/ux/after-messages.png"><img src="images/ux/after-messages.png" alt="Depois: Mensagens das duas IAs" width="400"></a> |
| Ferramentas e alterações | <a href="images/ux/before-tools-files.png"><img src="images/ux/before-tools-files.png" alt="Antes: Ferramentas e alterações" width="400"></a> | <a href="images/ux/after-tools-files.png"><img src="images/ux/after-tools-files.png" alt="Depois: Ferramentas e alterações" width="400"></a> |
| Detalhes de ferramenta | <a href="images/ux/before-tool-details.png"><img src="images/ux/before-tool-details.png" alt="Antes: Detalhes de ferramenta" width="400"></a> | <a href="images/ux/after-tool-details.png"><img src="images/ux/after-tool-details.png" alt="Depois: Detalhes de ferramenta" width="400"></a> |
| Imagem no chat | <a href="images/ux/before-images.png"><img src="images/ux/before-images.png" alt="Antes: Imagem no chat" width="400"></a> | <a href="images/ux/after-images.png"><img src="images/ux/after-images.png" alt="Depois: Imagem no chat" width="400"></a> |
| Erro e aviso | <a href="images/ux/before-error-notice.png"><img src="images/ux/before-error-notice.png" alt="Antes: Erro e aviso" width="400"></a> | <a href="images/ux/after-error-notice.png"><img src="images/ux/after-error-notice.png" alt="Depois: Erro e aviso" width="400"></a> |
| Fim de turno e Desfazer | <a href="images/ux/before-turn-end.png"><img src="images/ux/before-turn-end.png" alt="Antes: Fim de turno e Desfazer" width="400"></a> | <a href="images/ux/after-turn-end.png"><img src="images/ux/after-turn-end.png" alt="Depois: Fim de turno e Desfazer" width="400"></a> |
| Turno em andamento | <a href="images/ux/before-running.png"><img src="images/ux/before-running.png" alt="Antes: Turno em andamento" width="400"></a> | <a href="images/ux/after-running.png"><img src="images/ux/after-running.png" alt="Depois: Turno em andamento" width="400"></a> |
| Aprovação pendente | <a href="images/ux/before-approval.png"><img src="images/ux/before-approval.png" alt="Antes: Aprovação pendente" width="400"></a> | <a href="images/ux/after-approval.png"><img src="images/ux/after-approval.png" alt="Depois: Aprovação pendente" width="400"></a> |
| Ferramenta em execução | <a href="images/ux/before-tool-running.png"><img src="images/ux/before-tool-running.png" alt="Antes: Ferramenta em execução" width="400"></a> | <a href="images/ux/after-tool-running.png"><img src="images/ux/after-tool-running.png" alt="Depois: Ferramenta em execução" width="400"></a> |
| Conclusão do turno real | <a href="images/ux/before-live-completed.png"><img src="images/ux/before-live-completed.png" alt="Antes: Conclusão do turno real" width="400"></a> | <a href="images/ux/after-live-completed.png"><img src="images/ux/after-live-completed.png" alt="Depois: Conclusão do turno real" width="400"></a> |
| Configurações | <a href="images/ux/before-settings.png"><img src="images/ux/before-settings.png" alt="Antes: Configurações" width="400"></a> | <a href="images/ux/after-settings.png"><img src="images/ux/after-settings.png" alt="Depois: Configurações" width="400"></a> |
| Tabela e troca por cota | <a href="images/ux/before-settings-quota.png"><img src="images/ux/before-settings-quota.png" alt="Antes: Tabela e troca por cota" width="400"></a> | <a href="images/ux/after-settings-quota.png"><img src="images/ux/after-settings-quota.png" alt="Depois: Tabela e troca por cota" width="400"></a> |
| Agendamentos vazios | <a href="images/ux/before-schedules-empty.png"><img src="images/ux/before-schedules-empty.png" alt="Antes: Agendamentos vazios" width="400"></a> | <a href="images/ux/after-schedules-empty.png"><img src="images/ux/after-schedules-empty.png" alt="Depois: Agendamentos vazios" width="400"></a> |
| Lista de agendamentos | <a href="images/ux/before-schedules-list.png"><img src="images/ux/before-schedules-list.png" alt="Antes: Lista de agendamentos" width="400"></a> | <a href="images/ux/after-schedules-list.png"><img src="images/ux/after-schedules-list.png" alt="Depois: Lista de agendamentos" width="400"></a> |
| Criar agendamento | <a href="images/ux/before-schedule-create.png"><img src="images/ux/before-schedule-create.png" alt="Antes: Criar agendamento" width="400"></a> | <a href="images/ux/after-schedule-create.png"><img src="images/ux/after-schedule-create.png" alt="Depois: Criar agendamento" width="400"></a> |
| Editar agendamento | <a href="images/ux/before-schedule-edit.png"><img src="images/ux/before-schedule-edit.png" alt="Antes: Editar agendamento" width="400"></a> | <a href="images/ux/after-schedule-edit.png"><img src="images/ux/after-schedule-edit.png" alt="Depois: Editar agendamento" width="400"></a> |
| Visualizador de imagens | <a href="images/ux/before-image-viewer.png"><img src="images/ux/before-image-viewer.png" alt="Antes: Visualizador de imagens" width="400"></a> | <a href="images/ux/after-image-viewer.png"><img src="images/ux/after-image-viewer.png" alt="Depois: Visualizador de imagens" width="400"></a> |
| Foco por teclado | <a href="images/ux/before-keyboard-focus.png"><img src="images/ux/before-keyboard-focus.png" alt="Antes: Foco por teclado" width="400"></a> | <a href="images/ux/after-keyboard-focus.png"><img src="images/ux/after-keyboard-focus.png" alt="Depois: Foco por teclado" width="400"></a> |

</details>

<details>
<summary>Ver todas as 24 comparações — janela mínima 900×600</summary>

| Estado | Antes | Depois |
|---|---|---|
| App sem pastas | <a href="images/ux/before-no-project-small.png"><img src="images/ux/before-no-project-small.png" alt="Antes: App sem pastas" width="400"></a> | <a href="images/ux/after-no-project-small.png"><img src="images/ux/after-no-project-small.png" alt="Depois: App sem pastas" width="400"></a> |
| Chat vazio | <a href="images/ux/before-empty-chat-small.png"><img src="images/ux/before-empty-chat-small.png" alt="Antes: Chat vazio" width="400"></a> | <a href="images/ux/after-empty-chat-small.png"><img src="images/ux/after-empty-chat-small.png" alt="Depois: Chat vazio" width="400"></a> |
| Composer: Claude | <a href="images/ux/before-composer-claude-small.png"><img src="images/ux/before-composer-claude-small.png" alt="Antes: Composer: Claude" width="400"></a> | <a href="images/ux/after-composer-claude-small.png"><img src="images/ux/after-composer-claude-small.png" alt="Depois: Composer: Claude" width="400"></a> |
| Composer: Codex | <a href="images/ux/before-composer-codex-small.png"><img src="images/ux/before-composer-codex-small.png" alt="Antes: Composer: Codex" width="400"></a> | <a href="images/ux/after-composer-codex-small.png"><img src="images/ux/after-composer-codex-small.png" alt="Depois: Composer: Codex" width="400"></a> |
| Composer: Automático e dois pares | <a href="images/ux/before-composer-auto-small.png"><img src="images/ux/before-composer-auto-small.png" alt="Antes: Composer: Automático e dois pares" width="400"></a> | <a href="images/ux/after-composer-auto-small.png"><img src="images/ux/after-composer-auto-small.png" alt="Depois: Composer: Automático e dois pares" width="400"></a> |
| Anexos e @menção | <a href="images/ux/before-attachments-mentions-small.png"><img src="images/ux/before-attachments-mentions-small.png" alt="Antes: Anexos e @menção" width="400"></a> | <a href="images/ux/after-attachments-mentions-small.png"><img src="images/ux/after-attachments-mentions-small.png" alt="Depois: Anexos e @menção" width="400"></a> |
| Mensagens das duas IAs | <a href="images/ux/before-messages-small.png"><img src="images/ux/before-messages-small.png" alt="Antes: Mensagens das duas IAs" width="400"></a> | <a href="images/ux/after-messages-small.png"><img src="images/ux/after-messages-small.png" alt="Depois: Mensagens das duas IAs" width="400"></a> |
| Ferramentas e alterações | <a href="images/ux/before-tools-files-small.png"><img src="images/ux/before-tools-files-small.png" alt="Antes: Ferramentas e alterações" width="400"></a> | <a href="images/ux/after-tools-files-small.png"><img src="images/ux/after-tools-files-small.png" alt="Depois: Ferramentas e alterações" width="400"></a> |
| Detalhes de ferramenta | <a href="images/ux/before-tool-details-small.png"><img src="images/ux/before-tool-details-small.png" alt="Antes: Detalhes de ferramenta" width="400"></a> | <a href="images/ux/after-tool-details-small.png"><img src="images/ux/after-tool-details-small.png" alt="Depois: Detalhes de ferramenta" width="400"></a> |
| Imagem no chat | <a href="images/ux/before-images-small.png"><img src="images/ux/before-images-small.png" alt="Antes: Imagem no chat" width="400"></a> | <a href="images/ux/after-images-small.png"><img src="images/ux/after-images-small.png" alt="Depois: Imagem no chat" width="400"></a> |
| Erro e aviso | <a href="images/ux/before-error-notice-small.png"><img src="images/ux/before-error-notice-small.png" alt="Antes: Erro e aviso" width="400"></a> | <a href="images/ux/after-error-notice-small.png"><img src="images/ux/after-error-notice-small.png" alt="Depois: Erro e aviso" width="400"></a> |
| Fim de turno e Desfazer | <a href="images/ux/before-turn-end-small.png"><img src="images/ux/before-turn-end-small.png" alt="Antes: Fim de turno e Desfazer" width="400"></a> | <a href="images/ux/after-turn-end-small.png"><img src="images/ux/after-turn-end-small.png" alt="Depois: Fim de turno e Desfazer" width="400"></a> |
| Turno em andamento | <a href="images/ux/before-running-small.png"><img src="images/ux/before-running-small.png" alt="Antes: Turno em andamento" width="400"></a> | <a href="images/ux/after-running-small.png"><img src="images/ux/after-running-small.png" alt="Depois: Turno em andamento" width="400"></a> |
| Aprovação pendente | <a href="images/ux/before-approval-small.png"><img src="images/ux/before-approval-small.png" alt="Antes: Aprovação pendente" width="400"></a> | <a href="images/ux/after-approval-small.png"><img src="images/ux/after-approval-small.png" alt="Depois: Aprovação pendente" width="400"></a> |
| Ferramenta em execução | <a href="images/ux/before-tool-running-small.png"><img src="images/ux/before-tool-running-small.png" alt="Antes: Ferramenta em execução" width="400"></a> | <a href="images/ux/after-tool-running-small.png"><img src="images/ux/after-tool-running-small.png" alt="Depois: Ferramenta em execução" width="400"></a> |
| Conclusão do turno real | <a href="images/ux/before-live-completed-small.png"><img src="images/ux/before-live-completed-small.png" alt="Antes: Conclusão do turno real" width="400"></a> | <a href="images/ux/after-live-completed-small.png"><img src="images/ux/after-live-completed-small.png" alt="Depois: Conclusão do turno real" width="400"></a> |
| Configurações | <a href="images/ux/before-settings-small.png"><img src="images/ux/before-settings-small.png" alt="Antes: Configurações" width="400"></a> | <a href="images/ux/after-settings-small.png"><img src="images/ux/after-settings-small.png" alt="Depois: Configurações" width="400"></a> |
| Tabela e troca por cota | <a href="images/ux/before-settings-quota-small.png"><img src="images/ux/before-settings-quota-small.png" alt="Antes: Tabela e troca por cota" width="400"></a> | <a href="images/ux/after-settings-quota-small.png"><img src="images/ux/after-settings-quota-small.png" alt="Depois: Tabela e troca por cota" width="400"></a> |
| Agendamentos vazios | <a href="images/ux/before-schedules-empty-small.png"><img src="images/ux/before-schedules-empty-small.png" alt="Antes: Agendamentos vazios" width="400"></a> | <a href="images/ux/after-schedules-empty-small.png"><img src="images/ux/after-schedules-empty-small.png" alt="Depois: Agendamentos vazios" width="400"></a> |
| Lista de agendamentos | <a href="images/ux/before-schedules-list-small.png"><img src="images/ux/before-schedules-list-small.png" alt="Antes: Lista de agendamentos" width="400"></a> | <a href="images/ux/after-schedules-list-small.png"><img src="images/ux/after-schedules-list-small.png" alt="Depois: Lista de agendamentos" width="400"></a> |
| Criar agendamento | <a href="images/ux/before-schedule-create-small.png"><img src="images/ux/before-schedule-create-small.png" alt="Antes: Criar agendamento" width="400"></a> | <a href="images/ux/after-schedule-create-small.png"><img src="images/ux/after-schedule-create-small.png" alt="Depois: Criar agendamento" width="400"></a> |
| Editar agendamento | <a href="images/ux/before-schedule-edit-small.png"><img src="images/ux/before-schedule-edit-small.png" alt="Antes: Editar agendamento" width="400"></a> | <a href="images/ux/after-schedule-edit-small.png"><img src="images/ux/after-schedule-edit-small.png" alt="Depois: Editar agendamento" width="400"></a> |
| Visualizador de imagens | <a href="images/ux/before-image-viewer-small.png"><img src="images/ux/before-image-viewer-small.png" alt="Antes: Visualizador de imagens" width="400"></a> | <a href="images/ux/after-image-viewer-small.png"><img src="images/ux/after-image-viewer-small.png" alt="Depois: Visualizador de imagens" width="400"></a> |
| Foco por teclado | <a href="images/ux/before-keyboard-focus-small.png"><img src="images/ux/before-keyboard-focus-small.png" alt="Antes: Foco por teclado" width="400"></a> | <a href="images/ux/after-keyboard-focus-small.png"><img src="images/ux/after-keyboard-focus-small.png" alt="Depois: Foco por teclado" width="400"></a> |

</details>

## Verificação e acessibilidade

| Verificação | Resultado |
|---|---|
| `npm.cmd test` | **103 passaram**, em 16 arquivos; antes eram 64 em 14 arquivos. |
| `npm.cmd run typecheck` | Passou. Testes de renderer que usam Node são checados na configuração de testes/Node, sem habilitar APIs Node no código do renderer. |
| `npm.cmd run build` | Concluiu sem erro. |
| Janela mínima | Sem rolagem horizontal nos estados comparados; dimensão nativa conferida, inclusive com cotas de 100%. Opções abertas preservam 224 px de histórico nos três modos, sem sobrepor a leitura. |
| Teclado | Rótulos dos seletores na árvore de acessibilidade; foco visível; Tab/Shift+Tab, Escape, skip link, imagem, zoom e setas verificados. |
| Composer | Modelos das duas IAs, esforço e permissão persistem; menção por teclado, anexar/remover, rascunhos separados e anexo assíncrono conferidos. |
| Aprovações | Permitir uma vez e navegação de outra conversa até o pedido conferidos em turno real; opções Permitir nesta sessão e Negar preservadas. |
| Automático | Um Haiku/low delegou ao Codex e integrou a resposta. A troca por cota do banco isolado foi restaurada depois. |
| Desfazer | Removeu somente o arquivo do último turno real; o arquivo do turno anterior permaneceu idêntico. |
| Recuperação | Erro real de leitura SQLite, imagem ausente e retries conferidos, com restauração dos arquivos/tabelas de teste. |
| Agendamentos | Criar, editar, pausar e apagar pela API normal/interface, com confirmação e preservação dos chats; nenhum disparo de teste ficou ativo. |
| Navegação / exclusão | Criar, renomear, cancelar renomeação e apagar um chat descartável, preservando arquivos do projeto. |

Os pares críticos de cores foram medidos segundo o critério [WCAG 2.2 — Contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum): 4,5:1 para texto pequeno. Bordas/foco foram checados com limite de 3:1. Os testes usam o valor sem arredondar; a tabela abaixo arredonda apenas a apresentação.

| Par | Contraste |
|---|---:|
| Texto / painel | 12,89:1 |
| Texto secundário / painel | 6,90:1 |
| Claude coral / superfície elevada | 4,51:1 |
| Codex verde / painel | 6,61:1 |
| Texto escuro / botão verde | 7,17:1 |
| Borda de controle / painel | 3,67:1 |
| Foco verde / superfície elevada | 5,87:1 |

A identidade permanece: fundo **#1c1b19**, Claude **#d97757**, Codex **#6fb59a** e o ícone de `build/icon.svg`. Apenas o neutro secundário e a borda de controle foram clareados para legibilidade. Isso não é uma certificação formal de conformidade WCAG de todo conteúdo que as IAs possam gerar.

Foco por teclado na versão final:

![Foco visível após navegação por teclado](images/ux/after-keyboard-verified-small.png)

Capturas adicionais de estados novos, sem equivalentes tratados na interface anterior: [pedido em outra conversa](images/ux/after-approval-other-chat-small.png), [confirmação de excluir chat](images/ux/after-delete-confirm-small.png), [confirmação de excluir agendamento](images/ux/after-delete-schedule-confirm-small.png), [falha de leitura](images/ux/after-load-error-small.png), [retry recuperado](images/ux/after-recovered-small.png), [imagem ausente](images/ux/after-image-error-small.png), [Desfazer real](images/ux/after-undo-small.png), [leitura do histórico](images/ux/after-reading-history-small.png) e [permissão liberada](images/ux/after-permission-full-small.png).

## Proposta estrutural não aplicada

**Modo Foco opcional:** recolher a navegação e separar uma área Agora, com a decisão pendente e a tarefa atual da equipe. Essa mudança altera a organização da tela; ficou apenas no mockup. Exigiria avaliar descoberta da navegação, espaço para cotas e comportamento em telas pequenas antes de integrar.

O desenho abaixo é um **mockup vetorial**, não uma captura nem uma funcionalidade entregue. Fonte editável: [proposal-focus-mode.svg](images/ux/proposal-focus-mode.svg).

![Proposta de Modo Foco, não aplicada](images/ux/proposal-focus-mode.png)

## Limites e o que não foi verificado

- Não foi gerado um novo instalador NSIS. A revisão está no código e no build; o instalador da Fase 4 permanece anterior à revisão. O README explica desenvolvimento e empacotamento.
- O seletor nativo de pastas/arquivos, a bandeja, o login das CLIs e o disparo real com Windows suspenso/inicialização do Windows não foram reexecutados nesta fase. Seus handlers e a lógica principal permaneceram sem alterações; os testes existentes continuaram passando.
- Não houve teste com NVDA/JAWS, escalas de Windows 125/150%, alto contraste do sistema ou múltiplos monitores. Foram verificados teclado, árvore de acessibilidade, pares de contraste e movimento reduzido em desenvolvimento.
- Falha real dos provedores, perda de rede e esgotamento de cotas não foram provocados. Os estados locais de erro/recuperação foram reproduzidos sem afetar serviços ou credenciais.
- Rascunhos são mantidos por conversa durante a sessão do renderer. Persistência após sair/recarregar o app não foi implementada.
- A Fase 3 e a aprovação para usar o jogo oficial continuam pendentes. Os testes desta fase usaram somente a pasta descartável.

A seção da Fase 5 foi adicionada ao PLAN, e os prints principais do README foram atualizados com dados de exemplo da revisão. Nenhuma mudança estrutural proposta foi aplicada e nenhuma dependência foi adicionada.
