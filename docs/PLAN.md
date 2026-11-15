# Contraponto — Plano

Data: 2026-11-14 · Base: [research-existing-apps.md](research-existing-apps.md)

App desktop para Windows, de uso pessoal (talvez publicado no GitHub), que junta Claude Code e Codex num chat único. O Claude planeja e cuida do código. O Codex cuida da parte criativa (3D, imagens, texturas, design). As duas IAs enxergam o que a outra fez.

---

## 1. Decisões fechadas

| Tema | Decisão |
|---|---|
| Nome | Contraponto |
| Seletor | Menu "Agente": Claude / Codex / Automático |
| Automático | O Claude lidera: monta o plano e delega ao Codex as subtarefas que a tabela "quem faz o quê" atribui a ele |
| Menções | `@Claude` / `@Codex` na mensagem força a IA e ignora o seletor só naquela mensagem |
| Tabela "quem faz o quê" | Uma linha por tipo de tarefa, com um select Claude/Codex. Editável nas configurações |
| Troca por cota | Só no Automático, com liga/desliga e limiar (padrão 90% da janela de 5h ou da semanal) |
| Imagens | O Codex gera direto no app (gpt-image-2, pelo plano). Sem etapa manual |
| Commits | Neutros, no padrão do fita-sem-etiqueta: autor `SZonta`, título em inglês no imperativo, corpo com tópicos `- `, sem assinatura nem coautoria de IA. Quem fez o quê fica só na linha do tempo do app |
| Memória | Só grava quando você pedir. Sem botão "Lembrar disso" |
| Primeiro projeto | `C:\Projetos\fita-sem-etiqueta`, depois de backup e de um teste numa cópia |
| Stack | Electron + React + TypeScript |
| Claude | Claude Agent SDK, usando o login do Claude Code oficial instalado. O app nunca lê, guarda ou repassa credenciais |
| Codex | `codex app-server` (JSON-RPC via stdio), usando o login do Codex CLI |
| Interface | Português (pt-BR). Código, nomes de arquivo, branches, comentários e commits em inglês |
| UX design do Contraponto | Fica com o Codex: propostas de layout, fluxos, visual e ícone saem dele; o Claude implementa e integra (decidido em 2026-11-15) |

**Ambiente verificado em 2026-11-14:** Node 26.13.0, Git 2.56, winget e Blender 5.2.4 (`C:\Tools\Blender\5.2.4\blender-5.2.4-windows-x64\blender.exe`). Claude Code 2.1.318 (WinGet) logado no plano **Pro**; o Agent SDK traz o próprio Claude Code 2.1.325. Codex CLI 0.169.0 logado no ChatGPT **Plus**. O git ainda não tem nome e e-mail globais configurados.

---

## 2. Arquitetura

```
┌──────────────────────────── Contraponto (Electron) ─────────────────────────────┐
│ Renderer (React)                                                                │
│   Sidebar (pastas, chats, agendamentos) · Chat · Composer · Barras de uso       │
│   Configurações (tabela, troca por cota, memória, Blender, CLIs)                │
│                              ▲ IPC tipado ▼                                     │
│ Main (Node)                                                                     │
│   Orchestrator ── MentionParser · RoutingTable · QuotaSwitch · ProjectLock      │
│      ├─ ClaudeAdapter ── Claude Agent SDK ─────────► Claude Code (seu login)    │
│      │     └─ MCP in-process: delegate_to_codex ──┐                             │
│      └─ CodexAdapter ── JSON-RPC (stdio) ─────────┴─► codex app-server (login)  │
│   Timeline · CrossSummary · Checkpoints (repo-sombra) · UsageService            │
│   Scheduler · Storage (SQLite) · Attachments · FileWatcher (imagens, previews)  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Módulos do processo principal (`src/main/`)

| Módulo | Responsabilidade |
|---|---|
| `agents/types.ts` | Formato único de eventos (`AgentEvent`): `message.delta`, `message.completed`, `reasoning`, `tool.started`, `tool.completed`, `file.changed`, `approval.requested`, `approval.resolved`, `image.generated`, `usage.updated`, `turn.completed`, `error` |
| `agents/claude/` | `ClaudeAdapter`: `query()` do Agent SDK com entrada em streaming (necessária para imagens), `cwd`, modelo, esforço, modo de permissão, `canUseTool` (aprovações), `resume` (retomar sessão), `mcpServers` (inclui o `delegate_to_codex`), carregamento do `CLAUDE.md`. Lê os eventos `rate_limit_event`. Abre o processo com ambiente limpo (sem as variáveis `CLAUDE_*`/`ANTHROPIC_*` do host) e mantém uma sessão viva por chat para aproveitar o cache |
| `agents/codex/` | `CodexAdapter`: um processo `codex app-server` sempre vivo; `initialize`, `thread/start`, `thread/resume`, `turn/start` (com `localImage`), `turn/interrupt`, `model/list`, `account/rateLimits/read` e `account/rateLimits/updated`. Responde aos pedidos de aprovação do servidor. Tipos gerados com `codex app-server generate-ts` |
| `orchestrator/` | Decide quem responde: @menção → seletor → Automático. Aplica a troca por cota. Monta as instruções extras do Claude no Automático (tabela + regras de delegação) |
| `mcp/` | Servidor MCP in-process com a ferramenta `delegate_to_codex(task, files, expected_output)`. Roda um turno do Codex na mesma pasta, transmite o progresso para a UI como bloco aninhado e devolve ao Claude o resumo, os arquivos alterados e as imagens geradas |
| `timeline/` | Uma entrada por turno: IA, resumo do pedido, resumo da resposta (tirado da mensagem final, sem chamada extra de IA), arquivos alterados, imagens, checkpoint |
| `timeline/cross-summary` | Antes de cada turno da IA X, monta o bloco "desde a sua última vez neste projeto" com o que a outra IA (e você) mudou. Vai no começo da mensagem enviada à IA |
| `checkpoints/` | Repositório-sombra por projeto, fora da pasta do projeto (`%APPDATA%\Contraponto\shadow\<id>.git`, work-tree = pasta do projeto). Snapshot antes e depois de cada turno. "Desfazer turno" restaura os arquivos. Respeita o `.gitignore` e tem limite de tamanho por arquivo. O git do projeto não é tocado |
| `usage/` | Barras de 5h e semanal das duas IAs, com contagem regressiva. Guarda o último valor conhecido |
| `lock/` | Uma IA escrevendo por pasta de cada vez (fila) |
| `scheduler/` | Tarefas agendadas: cron com fuso, intervalo fixo ou uma vez. Por tarefa: IA, modelo, esforço, pasta, continuar o chat ou abrir um novo. Detecta disparo perdido quando o PC acorda (`powerMonitor`) e mantém o PC acordado durante a execução (`powerSaveBlocker`) |
| `storage/` | SQLite no diretório de dados do app, com migrações |
| `attachments/` | Arquivos anexados ficam no diretório de dados do app (não sujam o projeto). Imagem: bloco de imagem no Claude e `localImage` no Codex. Outros arquivos: o caminho vai na mensagem e a IA lê com as ferramentas dela |
| `watcher/` | Detecta os previews do Blender e mostra no chat (as imagens do Codex chegam pelo `savedPath` do item `imageGeneration`) |

### Modelo de dados (SQLite)

- `projects` (id, path, name)
- `chats` (id, project_id, title, mode, claude_session_id, codex_thread_id, claude_model, claude_effort, codex_model, codex_effort, permission_level)
- `messages` (id, chat_id, author, kind, payload_json, created_at)
- `timeline_entries` (id, project_id, chat_id, agent, prompt_summary, result_summary, files_json, images_json, checkpoint_before, checkpoint_after, created_at)
- `routing_rules` (id, task_type, agent, position)
- `schedules` (id, project_id, chat_id, trigger, timezone, agent, model, effort, prompt, continue_chat, last_run_at, next_run_at)
- `usage_snapshots` (agent, window, used_percent, resets_at, observed_at)
- `settings` (key, value_json)

### Interface

- **Barra superior:** pasta do projeto + barras de uso (Claude e Codex, 5h e semanal, com "reseta em 2h14").
- **Barra lateral:** projetos, chats (criar, renomear, apagar) e agendamentos.
- **Chat:** mensagens com identificação da IA, streaming, cards de ferramenta, diffs, cards de aprovação ("Permitir" / "Permitir nesta sessão" / "Negar"), imagens em miniatura, bloco do Codex aninhado quando o Claude delega, "Desfazer turno".
- **Composer:** texto com autocompletar de @menção, anexos (arrastar, colar), menu "Agente", modelo e esforço de cada IA (listas lidas das CLIs), nível de permissão.
- **Configurações:** tabela "quem faz o quê", troca por cota (liga/desliga + limiar), memória global, caminho do Blender, versões das CLIs.

### Permissões (mapeamento a confirmar na Fase 0)

| Nível | Claude (Agent SDK) | Codex (app-server) |
|---|---|---|
| Perguntar (padrão) | `permissionMode: default` + `canUseTool` | `approvalPolicy: untrusted`, sandbox `workspace-write` |
| Aceitar edições | `acceptEdits` | `approvalPolicy: on-request`, sandbox `workspace-write` |
| Liberar tudo | `bypassPermissions` | `approvalPolicy: never`, sandbox `danger-full-access` |

"Acesso total ao PC" é um interruptor separado, por chat: libera pastas fora do projeto.

### Tabela "quem faz o quê" (padrão inicial, editável)

| Tipo de tarefa | IA |
|---|---|
| Planejamento e arquitetura | Claude |
| Código e lógica de jogo | Claude |
| Bugs e testes | Claude |
| Automações e scripts | Claude |
| Modelagem 3D (Blender) | Codex |
| Texturas e imagens | Codex |
| Design de interface e visual | Codex |
| Outros | o Claude decide |

---

## 3. Fluxos principais

### Um turno de qualquer IA
1. Pega a trava da pasta (ou entra na fila).
2. Snapshot "antes" no repositório-sombra.
3. Monta o resumo cruzado e coloca no começo da mensagem.
4. Executa a IA e converte os eventos para `AgentEvent`. Pedidos de aprovação viram cards.
5. Snapshot "depois" e entrada na linha do tempo.
6. Libera a trava.

### Automático
1. Você envia a mensagem com o menu em Automático e sem @menção.
2. Com a troca por cota ligada: se o Claude passou do limiar, a mensagem vai direto ao Codex, com aviso.
3. O Claude recebe a mensagem, o resumo cruzado, a tabela e a ferramenta `delegate_to_codex`.
4. Para cada subtarefa que a tabela dá ao Codex, o Claude chama `delegate_to_codex` com um briefing completo.
5. O app roda o turno do Codex, mostra o progresso aninhado e devolve ao Claude o resumo, os arquivos e as imagens.
6. Se o Codex passou do limiar, a ferramenta responde "Codex sem cota" e o Claude faz a subtarefa ele mesmo.
7. O Claude integra e termina. A linha do tempo registra o trabalho das duas.

### Imagem gerada pelo Codex
O Codex gera a imagem → o item `imageGeneration` traz o `savedPath` → o app mostra a miniatura no chat → o Codex copia o arquivo para o caminho de assets combinado na tarefa (ex.: `assets/textures/`). Imagens gastam o limite do Codex de 3 a 5 vezes mais rápido, e o app mostra isso no card.

### Blender
O `AGENTS.md` do projeto ensina o caminho do Blender e o padrão de uso: `blender.exe -b <arquivo.blend> --python <script.py>`. Cada passo renderiza um PNG de preview numa pasta ignorada pelo git. A IA vê o PNG e corrige. O app mostra os previews no chat. A exportação segue o formato da engine do jogo (glTF ou FBX, definido na Fase 3).

---

## 4. Fases

Tempo = sessões de trabalho comigo programando e você testando no fim de cada fase. Total estimado: ~29h, ~35h com folga.

### Fase 0 — Preparação e testes técnicos (~3h) ✅ concluída em 2026-11-14
Objetivo: eliminar os riscos antes de escrever o app. Resultados e decisões em [spikes.md](spikes.md).

1. Criar `C:\Projetos\contraponto` com `git init` e mover esta sessão para lá → verificar: `git status` mostra o repositório com `docs/`.
2. Instalar a CLI do Claude Code (instalador nativo oficial) e a do Codex (`npm i -g @openai/codex`) → verificar: `claude --version` e `codex --version` respondem.
3. Você faz o login nas duas (`claude` e `codex login`) → verificar: um prompt curto responde em cada CLI.
4. Desligar a atribuição automática de commits nas duas CLIs → verificar: commit de teste sem trailer de coautoria.
5. Teste do Claude (`scripts/spikes/claude.ts`): streaming, aprovação via `canUseTool`, `rate_limit_event`, leitura do `CLAUDE.md`, opções de modelo e esforço → verificar: texto chega em partes e o status de limite aparece no console.
6. Teste do Codex (`scripts/spikes/codex.ts`): app-server, thread, turn, deltas, aprovação, `model/list`, `account/rateLimits/read` → verificar: modelos com esforços e os % de 5h e semanal aparecem no console.
7. Teste de imagem: pedir uma textura ao Codex pelo app-server → verificar: descobrir o caminho do arquivo e o evento que avisa.
8. Teste de delegação: o Claude com `delegate_to_codex` chamando o teste do Codex → verificar: o Claude recebe o resultado do Codex e responde com base nele.
9. Medir consumo: a mesma tarefa pelo Agent SDK e pelo `claude -p` → verificar: decisão registrada (SDK ou CLI headless; o adaptador aceita os dois).

Saída: `docs/spikes.md` com resultados e decisões ajustadas.

### Fase 1 — App base (~8h) ✅ concluída em 2026-11-15
Verificado no app rodando, via DevTools: turno completo com Claude e com Codex (streaming, aprovações, arquivo criado), barras de uso das duas IAs, imagem anexada e descrita pelo Claude, e as duas sessões retomadas depois de reiniciar o app. Notas:
- O Codex é aberto pelo `codex.exe` nativo da instalação npm; o `codex.js` não roda pelo Node do Electron.
- Abrir o app pelo terminal do painel do Claude Desktop falha no Codex: aquele terminal não enxerga `%APPDATA%\npm`. Fora dele funciona.
- Os chats agora gravam sessões reais: aparecem no histórico do Claude Code e do app do Codex (pendência da seção 6).

1. Estrutura Electron + React + TypeScript (electron-vite), lint, formatação, Vitest → verificar: `npm run dev` abre a janela e `npm test` passa.
2. Armazenamento SQLite com migrações → verificar: testes de criar, ler, atualizar e apagar.
3. `ClaudeAdapter` e `CodexAdapter` emitindo `AgentEvent` → verificar: testes com processos simulados.
4. Sidebar, chat com streaming, cards de ferramenta e diff, composer com anexos → verificar: conversa completa com cada IA, com imagem anexada.
5. Seletor de pasta, menu "Agente" (Claude/Codex), modelo, esforço e nível de permissão → verificar: trocar o modelo muda a execução e o card de aprovação funciona nas duas IAs.
6. Barras de uso com contagem regressiva → verificar: os valores batem com o `/status` do Codex e o `/usage` do Claude.
7. Retomar sessões → verificar: fechar o app, reabrir e continuar a conversa com o contexto.

### Fase 2 — As duas juntas (~8h) ✅ concluída em 2026-11-15
Verificado no app: no Automático, o Claude escreveu `notas.txt` e delegou a textura ao Codex, que gerou e salvou `assets/madeira.png`; o Codex, sem ler arquivos, resumiu o que o Claude fez; desfazer restaurou o último turno e recusou um turno antigo. Fila por pasta, troca por cota e @menções cobertas por testes (37 no total). Mudança em relação ao item 3: a memória é compartilhada **sem criar arquivos no projeto**. O Codex lê o `CLAUDE.md` pela opção `project_doc_fallback_filenames`; o Claude recebe o `AGENTS.md` nas instruções quando o projeto só tem esse; as regras globais (`~/.claude/CLAUDE.md`) vão para o Codex como instruções de desenvolvedor, só dentro do Contraponto.

1. Linha do tempo → verificar: cada turno gera uma entrada com arquivos e resumo.
2. Resumo cruzado → verificar: o Codex cita o que o Claude fez sem você explicar, e vice-versa.
3. Memória: `AGENTS.md` canônico, `CLAUDE.md` com `@AGENTS.md`, regras globais copiadas para `~/.codex/AGENTS.md` → verificar: as duas IAs respondem em português seguindo suas regras.
4. Trava por pasta → verificar: um segundo pedido espera o primeiro terminar.
5. Checkpoints no repositório-sombra e "Desfazer turno" → verificar: desfazer restaura os arquivos e o git do projeto não muda.
6. Automático com `delegate_to_codex`, bloco aninhado e a tabela → verificar: um pedido misto é dividido conforme a tabela.
7. @menções → verificar: `@Codex` força o Codex mesmo com o menu em Automático.
8. Troca por cota com liga/desliga e limiar → verificar: com limite simulado, o Automático avisa e passa o trabalho à outra IA.

### Fase 3 — Teste no fita-sem-etiqueta → uso oficial (~2h + seu teste)
Preparação concluída em 2026-11-15; teste manual das três tarefas e aprovação para uso oficial pendentes. Levantamento, verificações, mensagens exatas e comandos em [phase3-report.md](phase3-report.md). Nenhum arquivo de instruções foi criado no jogo; essa decisão continua com o usuário.

1. Identificar a engine, as pastas e as regras do jogo → verificar: levantamento em `docs/phase3-report.md`, sem criar `AGENTS.md` ou `CLAUDE.md` durante a preparação.
2. Backup em zip fora da pasta do jogo → verificar: extrair o zip e abrir o jogo.
3. Cópia de teste em `C:\Projetos\fita-sem-etiqueta-teste` → verificar: o jogo abre a partir da cópia.
4. Três tarefas reais na cópia: uma só do Claude, uma só do Codex e uma mista no Automático → verificar: a segunda IA cita o que a primeira fez, o jogo abre e "Desfazer turno" funciona.
5. Você aprova → apontar o Contraponto para a pasta oficial do jogo.

### Fase 4 — Criativo e rotina (~8h)
1. Imagens do Codex no chat: miniatura, abrir e salvar no caminho de assets → verificar: uma textura pedida aparece no chat e na pasta do jogo.
2. Blender: instruções no `AGENTS.md` e script de preview e exportação → verificar: um modelo criado com 3 ou mais previews e importável na engine.
3. Agendamento, app na bandeja e "Iniciar com o Windows" → verificar: uma tarefa agendada roda com a janela fechada.
4. Instalador `.exe` (electron-builder) e README para o GitHub → verificar: instalar numa pasta limpa e abrir.

---

## 5. Riscos e plano B

| Risco | Plano B |
|---|---|
| ~~O Agent SDK só garante o % de uso perto do limite~~ Resolvido na Fase 0 | `unifiedWindows` em todo `rate_limit_event` + método experimental de uso, os dois isolados em `usage/` |
| ~~O Agent SDK gastar a janela de 5h mais rápido~~ Não confirmado: mesmo tamanho de prompt; o custo depende do cache | Sessão viva por chat; `claude -p` continua como plano B |
| ~~Como a imagem gerada volta~~ Resolvido: item `imageGeneration` com `savedPath` | — |
| Plano Pro do Claude com janela de 5h curta | Troca por cota; opção de modelo mais leve para o papel de líder no Automático |
| Sandbox do Codex no Windows instável | Usar "Perguntar" para comandos do Codex |
| Protocolo das CLIs mudar numa atualização | Versões fixadas, tipos gerados da versão instalada, atualização manual depois de testar |
| Regras da Anthropic mudarem | O app nunca toca em credenciais; rever as regras antes de publicar no GitHub |
| Repositório-sombra crescer com assets do jogo | Limite de tamanho por arquivo e respeito ao `.gitignore` |
| Duas IAs editando o mesmo arquivo | Trava por pasta |

---

## 6. Pendências (decidir quando chegar a hora)

- Formato de exportação 3D confirmado na cópia (Fase 3, 2026-11-15): Godot 4.7.2 .NET/C#, glTF 2.0; `.glb` para objetos/personagem e `.gltf` + `.bin` + PNG para a loja. Levantamento em [phase3-report.md](phase3-report.md).
- Versionar ou não o `AGENTS.md` e o `CLAUDE.md` no repositório do jogo (Fase 3): decisão do usuário pendente. O jogo já versiona `CLAUDE.md` e `CONTEXT.md`; não possui `AGENTS.md`. Recomendação: `AGENTS.md` canônico e `CLAUDE.md` com referência, ambos versionados durante o desenvolvimento. Nenhum deles foi criado/alterado nesta fase.
- Limiar da troca por cota (padrão proposto: 90%).

### Funcionalidades pedidas para depois
- ✅ **Visualizador de imagens:** clicar numa imagem do chat abre em tela cheia, com zoom e arrastar para ver detalhes (pedido e feito em 2026-11-15).
- **Ícone do app:** definir o ícone do Contraponto (janela, barra de tarefas e instalador). Criação com o Codex, como parte do UX design; precisa estar pronto antes do instalador da Fase 4 (pedido em 2026-11-15).
- ✅ **Modelo e esforço do Codex no Automático:** no modo Automático, o composer mostra os seletores do Claude e do Codex (pedido e feito em 2026-11-15).
- ✅ **Subagentes com o modelo e o esforço escolhidos:** os subagentes do Claude recebem o modelo e o esforço do chat (`CLAUDE_CODE_SUBAGENT_MODEL` forçado e `CLAUDE_CODE_EFFORT_LEVEL`); os do Codex já herdam por padrão (pedido e feito em 2026-11-15).

---

## 7. Convenções do repositório

- Código, nomes de arquivos, branches, comentários e commits em inglês.
- Commits no padrão do fita-sem-etiqueta: título em inglês no imperativo (ex.: "Add ..."), linha em branco, tópicos `- ` com quebra em ~72 colunas, sem assinatura nem coautoria de IA.
- Uma branch por fase (ex.: `feat/phase-1-app-base`), com merge na `main` ao fim de cada fase verificada.
- Testes com Vitest para orquestrador, menções, troca por cota, resumo cruzado e checkpoints. Checklist manual no fim de cada fase.
- Estrutura de pastas:

```
contraponto/
  docs/            PLAN.md, research-existing-apps.md, spikes.md
  scripts/spikes/  testes técnicos da Fase 0
  src/main/        agents/, orchestrator/, mcp/, timeline/, checkpoints/,
                   usage/, lock/, scheduler/, storage/, attachments/, watcher/, ipc/
  src/preload/
  src/renderer/    components/ (chat, sidebar, composer, usage, settings)
```
