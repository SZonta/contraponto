# Fase 0 — Resultados dos testes técnicos

Data: 2026-11-14 · Scripts em `scripts/spikes/` (rodar com `npx tsx <arquivo>.ts` dentro dessa pasta).

## Resumo

| Teste | Resultado | Evidência |
|---|---|---|
| Login das CLIs | ✅ | Claude Code: conta claude.ai, plano **Pro**. Codex: conta ChatGPT, plano **Plus** (reaproveitou o login do app desktop) |
| Commits neutros | ✅ | Claude: `attribution` já estava vazio em `~/.claude/settings.json`. Codex 0.169.0 não adicionou trailer. Os dois geraram `chore: add hello.txt` |
| Claude pelo Agent SDK (`claude.ts`) | ✅ | Streaming de texto, `canUseTool` chamado para `Write` e `PowerShell`, resposta em português (carregou o `CLAUDE.md` global), lista de modelos e esforços, % de uso |
| Codex pelo app-server (`codex.ts`) | ✅ | `initialize` em 0,3 s, `model/list`, `account/rateLimits/read`, streaming, pedido de aprovação `item/commandExecution/requestApproval` aceito |
| Imagem do Codex (`codex-image.ts`) | ✅ | Item `imageGeneration` com `savedPath` em `~/.codex/generated_images/<thread>/`. O Codex copiou a textura para a pasta como `wood.png`. 54 s. O limite de 5h ficou em 9% antes e depois |
| Delegação Claude → Codex (`delegate.ts`) | ✅ | O Claude chamou `mcp__contraponto__delegate_to_codex`, o Codex criou `codex.txt` e o Claude leu o arquivo para confirmar. 14 s |
| Consumo SDK × CLI (`compare-usage.ts`) | ✅ | Mesmo prompt de ~25 mil tokens nos dois caminhos. A diferença de custo (US$ 0,20 × 0,11) veio só do cache, não do caminho |

## Descobertas e decisões

### Claude
- **% de uso resolvido.** Todo `rate_limit_event` traz `unifiedWindows` com `five_hour` e `seven_day` (`utilization` de 0 a 1 e `resetsAt` em segundos). Também existe o método experimental `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()`, que devolve o mesmo dado de 0 a 100. **Decisão:** usar o evento como fonte principal e o método como leitura inicial ao abrir o app, sempre isolado num único módulo, porque os dois podem mudar.
- **Decisão: Agent SDK.** Os dois caminhos usam o mesmo tamanho de prompt e emitem as mesmas mensagens `stream-json` (o mesmo coletor serviu para os dois), então o `claude -p` continua como plano B sem custo de adaptação.
- **O cache manda no consumo.** Cada sessão nova escreve ~25 mil tokens de cache (prompt do sistema + ferramentas + `CLAUDE.md`). **Decisão:** manter uma sessão viva por chat (entrada em streaming + `resume`) e não abrir um processo por mensagem.
- **O SDK traz o próprio Claude Code** (2.1.325). A versão fica fixada pelo `package.json`. A CLI instalada pelo WinGet (2.1.318) serve para login e testes manuais.
- **Ambiente limpo é obrigatório.** O app desktop do Claude injeta variáveis `CLAUDE_*` e `ANTHROPIC_*` (entre elas `ANTHROPIC_BASE_URL` e `CLAUDE_CODE_SIMPLE`). O Contraponto deve removê-las antes de abrir qualquer agente (`scripts/spikes/lib/env.ts`).
- **Ferramenta de delegação sempre carregada.** O Claude gastou um passo com `ToolSearch` para achar a ferramenta MCP. **Decisão:** registrar `delegate_to_codex` com `alwaysLoad: true`.
- **Modelos (plano Pro):** Opus 5.5 (padrão), Sonnet 5.5, Fable 5.2, Haiku 5.5 e versões anteriores. Esforços: low, medium, high, xhigh, max.

### Codex
- **Tipos oficiais:** `codex app-server generate-ts` gera 784 arquivos. O `thread/start` aceita `developerInstructions` (lugar para a tabela e o resumo cruzado) e `ephemeral`. O `turn/start` aceita `model`, `effort`, `localImage` e `parentTurnId` (para marcar trabalho delegado).
- **Limites:** `primary` = 5h (`windowDurationMins: 300`), `secondary` = semana (`10080`), `usedPercent` de 0 a 100, `resetsAt` em segundos. A notificação `account/rateLimits/updated` chega durante o turno.
- **Imagens:** o item `imageGeneration` traz `savedPath` e `revisedPrompt`. **Decisão:** o app mostra a miniatura a partir do `savedPath`, sem precisar vigiar pastas.
- **Arquivos alterados:** o Codex criou arquivos por comando de shell, então nenhum item `fileChange` apareceu. **Decisão confirmada:** a lista de arquivos alterados vem do diff dos checkpoints (repositório-sombra), não dos eventos.
- **Sandbox:** no modo `workspace-write`, a pasta `.git` fica protegida. Um `git commit` do Codex precisa de aprovação (card no chat).
- **Configuração do usuário:** o app-server carrega o `~/.codex/config.toml` do app desktop (hook `notify`, MCP `node_repl`, memórias, sandbox `elevated`) sem erro.
- **Modelos (plano Plus):** gpt-6.1-sol (padrão), gpt-6-astra, gpt-6.1-terra, gpt-6-sol, gpt-6-luna e a família 5.6. Esforços: low, medium, high, xhigh, max e ultra.
- **Python sem PIL:** o Codex tentou redimensionar com Python, falhou e usou `System.Drawing` do PowerShell.

### Histórico das sessões
- Nos testes, as sessões não foram gravadas (`persistSession: false` no Claude, `ephemeral: true` no Codex).
- **Pendência:** decidir se os chats do Contraponto devem aparecer no histórico do Claude Code e do app do Codex. Os dois guardam sessões nas pastas do usuário (`~/.claude/projects`, `~/.codex/sessions`).

## Impacto no plano

1. **Plano Pro do Claude:** a janela de 5h foi de 67% para 71% durante esta sessão de trabalho. Como o "Claude lidera" usa o Claude em toda mensagem do Automático, a troca por cota fica mais importante. **Sugestão:** permitir escolher um modelo mais leve (ex.: Sonnet 5.5) para o papel de líder.
2. Os riscos "% do Claude", "imagem gerada" e "consumo do Agent SDK" saíram da lista de riscos abertos.
3. A Fase 1 pode começar com os dois adaptadores apoiados nestes scripts.
