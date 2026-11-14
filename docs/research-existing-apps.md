# Pesquisa: apps que juntam Claude Code e Codex

Data: 2026-11-14 · Objetivo: base técnica para o planejamento do **Contraponto**.

---

## 1. Como eles usam o Claude com o plano pago

Todos rodam o **Claude Code oficial** instalado na máquina, com o login que o próprio usuário fez nele. Nenhum deles faz login por conta própria ou guarda o token.

| Caminho | O que é | Quem usa |
|---|---|---|
| **Claude Agent SDK** (TypeScript/Python) | Biblioteca oficial que roda o binário do Claude Code e entrega eventos estruturados: texto em streaming, ferramentas, permissões, sessões (retomar/bifurcar), hooks, MCP, subagentes. Carrega `CLAUDE.md`, skills e configurações de `.claude/` e `~/.claude/` como o Claude Code. | T3 Code, Harnss, Agor, Nimbalyst (ex-Crystal), VS Code |
| **CLI como processo** | O app executa a própria CLI (modo headless `claude -p --output-format stream-json` ou terminal) | Maestro, Emdash, Vibe Kanban. O Conductor embute a própria cópia das duas CLIs |
| **ACP** (Agent Client Protocol) | Protocolo padrão editor↔agente, com adaptadores `@agentclientprotocol/claude-agent-acp` e `@agentclientprotocol/codex-acp` | AionUi, Zed, Nimbalyst (Codex via ACP em alpha) |

**O que a Anthropic bloqueou (jan–abr/2026):** ferramentas que pegavam o token OAuth do plano e chamavam a API direto, sem passar pelo Claude Code (OpenClaw, OpenCode e similares). Desde 4/abr/2026 o plano não cobre mais esse tipo de acesso.

**Zona cinzenta, nas palavras das páginas oficiais (paráfrase):**
- A página do Agent SDK diz que, sem aprovação prévia, desenvolvedores terceiros não podem oferecer login do claude.ai nem os limites do plano em seus produtos, e recomenda API key.
- A página de compliance diz que isso não impede o usuário final de entrar com o próprio plano no binário oficial do Claude Code, sem modificação. Também diz que os limites dos planos Pro/Max/Ultra pressupõem uso individual comum do Claude Code e do Agent SDK.

**Leitura para o Contraponto:**
- Uso pessoal, com o seu login no Claude Code oficial: é o caso permitido.
- Se publicar no GitHub: cada pessoa instala e faz login no Claude Code oficial. O app nunca lê, guarda ou repassa credenciais.
- Marca: o produto mantém nome e visual próprios. Não pode se chamar "Claude Code" nem imitar a marca. No seletor, usar "Claude" dentro de um menu chamado "Agente" (regra de marca do Agent SDK).

---

## 2. Como eles usam o Codex

| Caminho | Prós | Contras | Quem usa |
|---|---|---|---|
| **`codex app-server`** (JSON-RPC via stdio) | Interface oficial para clientes ricos: streaming de texto, interromper e redirecionar turno, aprovações por comando e por arquivo, lista de modelos com esforços, limites de uso, login ChatGPT | Protocolo muda entre versões: gerar os tipos a partir da versão instalada | T3 Code, Harnss, Maestro, plugin oficial `codex-plugin-cc`, Agor (para bifurcar conversa) |
| **`@openai/codex-sdk`** (TypeScript) | Mais simples de usar | Segundo o Agor: o texto chega de uma vez (sem efeito de digitação), parar no meio pode perder trabalho, permissões básicas | Agor, Nimbalyst |
| **ACP** (`codex-acp`) | Interface única com outros agentes | Camada extra. A Vercel recomenda adaptador direto para Codex e Claude Code em vez de ACP | AionUi, Nimbalyst (alpha) |

Login: todos usam o login do próprio Codex CLI (conta ChatGPT). O uso conta nos limites do Codex.

### Métodos do app-server que o Contraponto deve usar
- **Início:** `codex app-server` (stdio, um JSON por linha) → `initialize` com `clientInfo` → notificação `initialized`.
- **Conversas:** `thread/start` (`model`, `cwd`, `approvalPolicy`, `sandbox`), `thread/resume`, `thread/fork`, `thread/list`, `thread/read`, `thread/name/set`, `thread/archive`.
- **Turnos:** `turn/start` (`input`, `model`, `effort`, `cwd`, `sandboxPolicy`), `turn/steer` (redireciona o turno em andamento), `turn/interrupt`.
- **Streaming:** `item/agentMessage/delta`, `item/reasoning/*`, `item/commandExecution/outputDelta`, `turn/diff/updated`, `turn/plan/updated`, `thread/tokenUsage/updated`. O evento `item/completed` é o autoritativo.
- **Tipos de item:** `agentMessage`, `reasoning`, `plan`, `commandExecution`, `fileChange` (caminho, tipo, diff), `mcpToolCall`, `webSearch`, `imageView`.
- **Aprovações (servidor → app):** `item/commandExecution/requestApproval` e `item/fileChange/requestApproval`, com decisões `accept`, `acceptForSession`, `decline`, `cancel`.
- **Modelos e esforço:** `model/list` → `supportedReasoningEfforts`, `defaultReasoningEffort`, `inputModalities`.
- **Conta:** `account/read`, `account/login/start` (`type: "chatgpt"`), `account/logout`.
- **Limites:** `account/rateLimits/read` + notificação `account/rateLimits/updated`. Pelos relatos da comunidade, `primary` = janela de 5h e `secondary` = semanal, cada uma com `usedPercent` e `resetsAt`.
- **Imagem de entrada:** `{ "type": "localImage", "path": "..." }` no `input` do `turn/start`.
- **Tipos TypeScript:** `codex app-server generate-ts --out ./schemas` (gera os tipos da versão instalada).
- **Experimental:** transporte WebSocket e métodos marcados com `experimentalApi`. Evitar no início.

---

## 3. Os apps

| App | Plataformas | Licença | Claude via | Codex via | O que aproveitar |
|---|---|---|---|---|---|
| **Harnss** | Windows (x64/ARM64), Mac, Linux | MIT | Agent SDK | app-server | **Arquitetura mais próxima do Contraponto.** Electron 40 + TypeScript + Vite. Chat com cards de ferramenta e diffs por palavra, painel de mudanças por turno, progresso de subagentes, 3 níveis de permissão (Perguntar / Aceitar edições / Liberar tudo), terminal PTY, navegador embutido, git com mensagem de commit gerada pela IA, busca nas sessões. Em desenvolvimento inicial, com reescrita grande anunciada. |
| **T3 Code** | Desktop, web, mobile | MIT | Agent SDK | app-server | Servidor Node (WebSocket) + interface React. Pelo FAQ (segundo resumo de terceiros), o uso via Agent SDK gasta a janela de 5h mais rápido que o Claude Code direto. |
| **AionUi** | Windows 10+, Mac, Linux | Apache-2.0 | ACP | ACP | Electron + backend local (AionCore), dados em SQLite. **Modo Equipe:** um Líder divide a tarefa e delega aos colegas por um servidor MCP próprio; colegas rodam em paralelo, com caixa de mensagens e quadro de tarefas compartilhado. **Agendamento:** cron com fuso, intervalo fixo ou uma vez; cada tarefa escolhe modelo, pasta e esforço; continua a conversa ou abre uma nova; detecta disparo perdido quando o PC acorda; mantém o PC acordado durante a tarefa. ~29 mil estrelas. |
| **Maestro** | Windows, Mac, Linux | AGPL-3.0 | CLI | CLI / app-server | Electron + TypeScript. **Group Chat:** você escolhe o moderador (Claude Code, Codex ou OpenCode); ele responde o que é simples, delega o complexo por @menção, cobra respostas incompletas e junta tudo numa resposta. Os participantes não veem tudo automaticamente: o moderador repassa o que cada um precisa. A opção "só agentes livres" (ligada por padrão) evita duas IAs editando ao mesmo tempo; agente ocupado por mais de 15 min é pulado. |
| **Tutti** | Windows x64, Mac | Apache-2.0 | não documentado | não documentado (o repositório tem código do protocolo do Codex) | Electron + serviços em Go. "Big @" referencia conversas, arquivos, apps e tarefas de outros agentes; "+" anexa arquivos e saídas de apps; Central de Controle com conversas, aprovações pendentes e tarefas em andamento; apps embutidos (canvas de imagem, UI/UX, documentos, slides); quebra objetivos em tarefas por agente. |
| **Nimbalyst** (ex-Crystal) | Windows, Mac, Linux + iOS | MIT | SDK | SDK (ACP em alpha) | Electron + React + node-pty. Sessões em worktrees, kanban, editores WYSIWYG, app iOS. |
| **Agor** | Web (multiplayer) | open-source | Agent SDK | Codex SDK + app-server | Canvas 2D com sessões em branches isoladas. Publica a comparação Claude × Codex usada na seção 2. Desliga os subagentes nativos do Codex nos processos que ele abre. |
| **Emdash** | Windows, Mac, Linux | open-source (YC W26) | CLI | CLI | 34 agentes de CLI, cada tarefa num worktree, revisão de diffs lado a lado, PRs e CI, automações, navegador embutido, integração com Linear/Jira/GitHub, sessões tmux, SSH. |
| **Vibe Kanban** | Windows, Mac, Linux | open-source | CLI | CLI | Backend Rust + React. Fixa a versão de cada CLI (ex.: Claude Code 2.1.119, Codex 0.124.0) e só atualiza de propósito. Aprovações só no Codex. |
| **Conductor** | Mac | não informado | cópia própria do Claude Code | cópia própria do Codex | Usa o login já salvo no Mac (Pro/Max ou API key). Cada workspace tem branch, worktree e uma pasta `.context` para passar contexto entre agentes. |
| **VS Code** (janela Agents) | Windows, Mac, Linux | — | Claude Agent SDK (integração oficial) | extensão oficial do Codex | Claude e Codex no VS Code desde a v1.109 (jan/2026); agentes rodam num processo separado (Agent Host) desde a v1.129 (jul/2026). |

**Outros, com menos relevância:**
- **Agentbox** (Mac; Linux pelo navegador): dezenas de agentes Claude Code e Codex em worktrees, respondidos como e-mail.
- **Crest** (OneWave): Claude Code e Codex lado a lado em abas.
- **CloudCLI / claudecodeui** (AGPL-3.0): interface web e mobile para Claude Code, Codex, Cursor CLI e OpenCode.
- **Superset, Paseo, AgentsRoom** (este com Windows): gerenciadores de agentes em paralelo.
- **Claude Squad:** gerenciador de agentes no terminal.

---

## 4. % de uso (janela de 5h e semanal)

- **Codex:** `account/rateLimits/read` + `account/rateLimits/updated` no app-server (oficial). Alternativa passiva: o Codex grava os percentuais nos logs de sessão (relato do projeto TokenWatch).
- **Claude, opção A:** evento `rate_limit_event` do Agent SDK. Traz status (`allowed` / `allowed_warning` / `rejected`), horário de reset e tipo de janela (`five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `overage`). O percentual (`utilization`) só vem garantido perto do limite. Versões novas trazem `unifiedWindows` com o percentual de cada janela, ainda sem documentação oficial.
- **Claude, opção B:** JSON da status line (`rate_limits.five_hour.used_percentage`, `resets_at`, o mesmo para `seven_day`). É documentado, mas pertence ao modo interativo.
- **Evitar:** monitores que leem o token OAuth salvo pelo Claude Code e chamam uma API não documentada (Claude Usage Tray, Claudometer e outros). É o tipo de uso de credencial que a política proíbe.
- **Referência visual (Windows, as duas IAs):** Tally, CodexBar for Windows (tokenwatcher), MyAgents, TokenCheckerWin.

---

## 5. Delegação Claude → Codex (base para o "Claude lidera")

- **`codex-plugin-cc` (oficial da OpenAI):** plugin do Claude Code. `/codex:rescue` passa uma tarefa ao Codex (aceita `--model` e `--effort`), `/codex:review` e `/codex:adversarial-review` fazem revisão, `/codex:transfer` transforma a sessão do Claude numa conversa do Codex. Roda via app-server com o login do Codex CLI. Alerta deles: o "review gate" (hook de parada) pode gastar o limite rápido.
- **AionUi:** o Líder delega por um servidor MCP próprio do app.
- **Maestro:** o moderador delega por @menção.
- **MCPs da comunidade:** codex-as-mcp (2 ferramentas; Codex ≥ 0.46.0), claude-codex-bridge (inicia, redireciona, para e retoma sessões do Codex), codex-mcp (fluxo de tarefa com até 3 rodadas de retrabalho).

**Modelo proposto para o Contraponto:** o app expõe ao Claude uma ferramenta MCP `delegate_to_codex(task, files, expected_output)`. O app executa o Codex pelo app-server, mostra o progresso do Codex no chat e devolve o resultado ao Claude. É a ideia do AionUi, com o Codex visível na conversa como no Maestro.

---

## 6. Padrões para copiar

1. **Claude pelo Agent SDK em TypeScript** (T3 Code, Harnss, Agor, VS Code).
2. **Codex pelo app-server**, com tipos gerados da versão instalada (T3 Code, Harnss, plugin oficial).
3. **Electron + React + TypeScript** (Harnss, AionUi, Maestro e Nimbalyst usam Electron).
4. **Versões das CLIs fixadas**, atualizadas só depois de testar (Vibe Kanban).
5. **Permissões em 3 níveis**, com pedidos de aprovação em cards no chat (Harnss).
6. **Agendamento** no modelo do AionUi.
7. **Repasse controlado** do que cada IA precisa ver (moderador do Maestro).
8. **Alternativa a avaliar:** camada única da Vercel (`@ai-sdk/harness-claude-code` + `@ai-sdk/harness-codex`, classe `HarnessAgent`). Esconde as diferenças entre as duas IAs, mas é nova e pode não expor limites e aprovações.

---

## 7. O que nenhum deles tem (espaço do Contraponto)

- Automático guiado por uma **tabela editável "tipo de tarefa → Claude/Codex"**.
- **Barras de 5h/semanal das duas IAs dentro do app**, com troca automática por cota (com liga/desliga).
- **Geração de imagem do Codex pelo plano** (gpt-image-2) dentro do fluxo. O Tutti tem um canvas próprio; o AionUi usa o Gemini.
- **Blender com preview renderizado** a cada passo.
- **Linha do tempo compartilhada** com resumo cruzado entre as duas IAs, e commits neutros.

---

## 8. Riscos para validar no teste (Fase 0)

1. Ler o % de uso do Claude dentro do app (evento do Agent SDK × status line).
2. Medir o consumo: relato do T3 Code de que o Agent SDK gasta a janela de 5h mais rápido.
3. Descobrir como o app-server devolve a imagem gerada (a documentação não lista um item de imagem gerada; no CLI, o padrão é a pasta `generated_images` dentro de `CODEX_HOME`).
4. Codex nativo no Windows com o app-server (sandbox).
5. Reconfirmar as regras de cobrança do uso via Agent SDK na semana da implementação.

---

## 9. Decisões e ajustes do usuário (2026-11-14)

- **Nome:** Contraponto.
- **Automático:** o Claude lidera, monta o plano e delega as partes criativas ao Codex.
- **Menções:** `@Claude` / `@Codex` na mensagem decide quem responde, ignorando o seletor naquela mensagem.
- **Primeiro projeto:** `fita-sem-etiqueta` (`C:\Projetos\fita-sem-etiqueta`). Antes: backup e teste numa cópia; só depois o uso oficial.
- **Imagens:** o Codex gera direto no app. Sem etapa manual com o ChatGPT.
- **Commits neutros:** mensagem de boas práticas, sem assinatura ou coautoria de IA. Quem fez o quê fica só na linha do tempo do app. Desligar a atribuição automática de commits nas duas CLIs.
- **Tabela "quem faz o quê":** cada tipo de tarefa com um select Claude/Codex. Sem 👍/👎.
- **Troca por cota:** com interruptor liga/desliga nas configurações.
- **Memória:** sem botão "Lembrar disso". Só grava quando o usuário pedir.
- **Pré-requisitos:** liberado instalar as CLIs do Claude Code e do Codex. Blender 5.2.4 em `C:\Tools\Blender\5.2.4\blender-5.2.4-windows-x64\blender.exe`.

---

## 10. Fontes

**Regras e SDK do Claude**
- [Claude Code — Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Claude Agent SDK — Overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Claude Code — Status line](https://code.claude.com/docs/en/statusline)
- [The Register — bloqueio de ferramentas de terceiros](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access)
- [Anthropic blocks third-party Claude access (abr/2026)](https://codex.danielvaughan.com/2026/04/09/anthropic-blocks-third-party-claude-access-codex-workflows/)
- [Startup Fortune — cobrança do Agent SDK](https://startupfortune.com/anthropic-quietly-separates-claude-agent-sdk-usage-from-subscription-limits/)
- [rate_limit_event com unifiedWindows](https://claudeissues.com/issue/91857-agent-sdk-rate-limit-event-already-carries-per-bucket-unifiedwindows-utilization) · [utilization só perto do limite](https://claudeissues.com/issue/41185-rate-limit-event-include-utilization-in-allowed-status)

**Codex**
- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex — geração de imagem](https://learn.chatgpt.com/docs/image-generation?surface=app) · [preços e limites](https://learn.chatgpt.com/docs/pricing)
- [Limites do Codex via app-server](https://ianlpaterson.com/blog/tracking-claude-codex-gemini-quotas-from-one-script/)
- [codex-plugin-cc (OpenAI)](https://cdn.jsdelivr.net/gh/openai/codex-plugin-cc@main/README.md)

**Apps**
- [Harnss](https://github.com/OpenSource03/harnss)
- [T3 Code — arquitetura](https://www.mintlify.com/pingdotgg/t3code) · [guia](https://www.developersdigest.tech/blog/t3-code-open-source-gui-claude-code-codex-opencode-2026)
- [AionUi](https://github.com/iOfficeAI/AionUi)
- [Maestro — Group Chat](https://docs.runmaestro.ai/group-chat)
- [Tutti — README](https://raw.githubusercontent.com/tutti-os/tutti/master/README.md)
- [Nimbalyst](https://nimbalyst-website.pages.dev/blog/open-sourcing-nimbalyst/) · [Crystal](https://github.com/stravu/crystal)
- [Agor — comparação de SDKs](https://agor.live/guide/sdk-comparison)
- [Emdash — docs](https://emdash.com/docs)
- [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) · [release notes](https://www.vibekanban.com/release-notes)
- [Conductor](https://www.conductor.build/llms-full.txt)
- [VS Code — agentes de terceiros](https://code.visualstudio.com/docs/agents/agent-types/third-party-agents) · [VS Code Wrapped 2026](https://code.visualstudio.com/blogs/2026/10/28/vscode-wrapped)
- [Agentbox](https://github.com/savannahfeder/agentbox) · [CloudCLI](https://github.com/siteboon/claudecodeui) · [Crest (OneWave)](https://www.onewave-ai.com/blog/claude-code-vs-codex)

**Pontes e camadas**
- [Vercel AI SDK — harness layer](https://vercel.com/changelog/use-acp-compatible-harnesses-with-the-ai-sdk-harness-layer) · [ACP harness](https://ai-sdk.dev/providers/ai-sdk-harnesses/acp)
- [Claude Code ↔ Codex via MCP](https://codex.danielvaughan.com/2026/03/26/claude-code-codex-bidirectional-mcp/) · [codex-as-mcp](https://lobehub.com/mcp/kky42-codex-as-mcp)

**Monitores de uso**
- [Tally](https://github.com/EcomCJ/Tally) · [Claude Usage Tray](https://github.com/ksmaster03/claude-usage-tray)
