# Fase 3 — preparação e roteiro de validação

Data: 2026-11-15. Projeto de teste: `C:\Projetos\fita-sem-etiqueta-teste`.

Preparação concluída. As três tarefas abaixo **não foram executadas**: são o teste manual do Contraponto pelo usuário. A Fase 3 só poderá ser encerrada após esse teste, a conferência e a aprovação do usuário. A pasta oficial não foi adicionada ao app.

## 1. Backup e proteção do original

- Backup completo: `C:\Projetos\backups\fita-sem-etiqueta-2026-11-15.zip`.
- Tamanho: **21.940.267 bytes** (20,92 MiB). Conteúdo original: 32.199.221 bytes em **578 arquivos**.
- SHA-256 do ZIP: `D1BDD505132A7D5C1C5C0FBF7588DA7CA047F06C48F97F39E953CBB0AE5325B4`.
- O ZIP inclui arquivos ocultos, `.git`, `.claude`, arquivos ignorados e o repositório privado aninhado `tools/blender/.git`.
- Extração temporária em uma pasta exclusiva de `C:\Projetos\backups`: **578 arquivos extraídos, 578 hashes SHA-256 idênticos ao original**, incluindo cenas, C#, modelos, PNG, shaders, documentação e os dois `.git`. A verificação excedeu a amostra mínima de 20 arquivos.
- Os arquivos da cópia também foram comparados por hash antes da remoção dos remotos. A extração temporária foi apagada após verificar seu caminho absoluto.
- Manifesto completo: [original-manifest.json](phase3-evidence/original-manifest.json). Resultado inicial: [preparation.json](phase3-evidence/preparation.json). O isolamento adicional do repositório aninhado e a conferência final do original constam de [final-integrity.json](phase3-evidence/final-integrity.json).
- Nenhum arquivo do original foi escrito. Comandos de status no original usaram `git --no-optional-locks`, evitando atualização do índice. Nenhum commit ou push foi feito em qualquer repositório.

O ZIP contém também a arte privada: deve permanecer local e não deve ser anexado ao repositório público do Contraponto.

## 2. Cópia e verificações iniciais

| Verificação | Resultado |
|---|---|
| Cópia integral antes de remover remotos | 578/578 arquivos com SHA-256 idêntico |
| `git remote remove origin` na cópia | Executado; `git remote -v` vazio |
| Repositório privado em `tools/blender` | `origin` removido apenas na cópia; `remote -v` vazio |
| Status Git original × cópia | Ambos limpos; repositórios aninhados também limpos |
| C# | `dotnet build` passou: **0 erros, 0 avisos** |
| Godot encontrado | `C:\Tools\Godot\4.7.2\Godot_v4.7.2-stable_mono_win64\Godot_v4.7.2-stable_mono_win64_console.exe` |
| Versão executada | `4.7.2.stable.mono.official.ed1daf0bf` |
| Importação | `--headless --import --path ...\game`: saída 0, sem erros |
| Cena principal | `--headless --fixed-fps 60 --quit-after 120`: saída 0, sem erros |
| Testes existentes | Não há suíte nem projeto de testes; `tests/` e xUnit são planos futuros. `test_room.tscn` é uma cena, não uma suíte |
| Depois de compilar/importar | Status Git da cópia e do repositório aninhado continuam limpos |

O jogo **carrega e executa a cena principal sem erro no modo headless**. Isso não comprova a aparência, a compilação gráfica de shaders, o áudio ou a interação com janela. Nenhuma janela do jogo foi aberta.

Build executado com `--source` apontando para os pacotes locais de `GodotSharp\Tools\nupkgs`; os pacotes existentes no cache NuGet foram reutilizados. Não foi necessário instalar nem baixar ferramentas. Logs iniciais: [build](phase3-evidence/baseline-build.log), [importação](phase3-evidence/baseline-import.log), [headless](phase3-evidence/baseline-headless.log), com arquivos `*.stderr.log` ao lado.

## 3. Levantamento para memória do projeto

Fonte de verdade consultada: `CONTEXT.md`, atualizado em 2026-11-14, e `docs/design/`. O contexto abaixo é documentação da Fase 3 no Contraponto; nenhum arquivo de instruções foi criado no jogo.

### Estrutura e responsabilidades

| Caminho relativo à raiz da cópia | Papel |
|---|---|
| `game/project.godot` | Projeto Godot 4.7.2 .NET; Forward Plus, física Jolt, cena principal `levels/store/store.tscn` |
| `game/FitaSemEtiqueta.csproj`, `.sln` | C#, SDK `Godot.NET.Sdk/4.7.2`, `net10.0`, nullable ligado |
| `game/core/` | `Settings.cs`, único autoload existente; opções persistidas em `user://settings.cfg` |
| `game/player/` | Cena do jogador, controlador, corpo do Nondas, mão e dedos, scripts C# |
| `game/interaction/` | Interação, pegada/soltura, interfaces, `Pickable.cs` e planejamento do alcance |
| `game/props/` | `tape.tscn`, fita física reutilizável |
| `game/levels/store/` | Locadora principal e material de piso `floor.tres` |
| `game/levels/test_room/` | Sala de teste de física e interação |
| `game/assets/models/` | `nondas.glb`, `tape.glb` e respectivas configurações de importação |
| `game/assets/models/store/` | `store.gltf`, `store.bin` e 12 texturas PNG externas |
| `game/vfx/` | Cenas e scripts C# de VHS e poça; shaders `.gdshader` |
| `game/ui/` | Menu de pausa e seu C# |
| `game/localization/` | `ui.csv` com `pt`, `en`, `es`, traduções `.translation` e importação |
| `docs/design/` | História, stack/arquitetura e 19 entregas do MVP |
| `docs/research/`, `docs/credits.md` | Pesquisa e créditos de terceiros |
| `tools/blender/` | Scripts Python de corpo, fita e loja; repositório privado aninhado, ignorado pelo público |
| `.claude/agents/` | Instruções locais de `researcher`, `reviewer`, `artist` e `language` |
| `.git/` | Histórico/configuração do jogo; há outro `.git` em `tools/blender` |
| `game/.godot/` | Cache de importação e saída do build; criado na cópia, ignorado pelo Git |

`assets/textures/`, `audio/`, `fonts/` e `tests/` constam da arquitetura planejada, mas não existem no estado inicial. As tarefas B/C criarão `game/assets/textures/tapes/` para imagens independentes do cenário; as texturas exportadas junto do cenário continuam em `assets/models/store/`.

### Formatos e convenções confirmados

- **3D: glTF 2.0**. `.glb` para objetos pequenos/personagem; `.gltf` + `.bin` + PNG separados para a loja. Não há pipeline FBX adotado no projeto atual.
- Texturas existentes em **PNG**: 256×256 (cortina, paleta e ORM da paleta); 512×512 (teto, granilite, lambri, pinho e laminado); 512×1024 (galvanizado); 1024×1024 (impressos); 1024×768 (parede e seu ORM).
- Não existe resolução única obrigatória nem regra de que toda textura seja quadrada ou potência de dois. A resolução **512×256 das etiquetas deste roteiro é uma escolha deste teste**, alinhada à escala dos assets atuais.
- Arquivos/pastas/cenas/assets em inglês e `snake_case`; C# em `PascalCase`, namespaces sob `FitaSemEtiqueta`. Exemplos: `store_wall_paint_orm.png`, `test_room.tscn`, `PlayerBody.cs`.
- Para novas texturas 3D, o contexto exige no `.png.import`: `compress/mode=2`, `mipmaps/generate=true`, `detect_3d/compress_to=0`. Importar, ajustar o `.import` e reimportar, sem alterar os `.import` existentes.
- Texto de interface usa chaves de tradução; texto impresso na arte da etiqueta é parte do asset. Não acrescentar texto de UI fixo em C#.
- Props soltos usam `collision_layer = 4`, `collision_mask = 5` e `continuous_cd = true`; preservar a fita existente. A prévia da tarefa C congela a fita para exposição.
- Os scripts da arte privada não devem ser copiados para documentação ou commits no repositório público do Contraponto.

### Documentos de contexto e recomendação

- **`CLAUDE.md` existe e é versionado.** Manda ler `CONTEXT.md`, responder em português, manter código/nomes em inglês, fazer alterações pequenas, não instalar ferramentas sem autorização, manter identidade Git local e esperar aprovação antes de commits/push. O fluxo normal é uma entrega por sessão. Este teste não conclui a entrega 6 e não autoriza commits, push ou atualizações da fonte de verdade do jogo.
- **`CONTEXT.md` existe e é versionado.** Reúne visão, decisões, arquitetura, ferramentas, entregas aprovadas, pendências e próxima entrega. Registra que janela do jogo exige autorização específica; testes headless podem rodar sem janela. Há remoção dos arquivos de IA prevista para o release final.
- **`AGENTS.md` não existe.** As quatro instruções de agentes em `.claude/agents/` já existem e foram preservadas.
- **Recomendação para decisão posterior:** adotar `AGENTS.md` canônico com regras compartilhadas e manter `CLAUDE.md` curto apontando para ele (`@AGENTS.md`); manter o estado do jogo em `CONTEXT.md`. Como `CLAUDE.md` já é versionado, versionar ambos durante o desenvolvimento segue a pendência do PLAN e permite usar as mesmas regras fora do Contraponto. Preservar a política de limpeza no release final. O app já consegue compartilhar o `CLAUDE.md` atual entre as IAs, então isso não é requisito para este teste. **Nenhum dos dois arquivos foi criado ou alterado.**

### Estado e próximo passo

Pesquisa e planejamento aprovados. Entregas 1–5 concluídas: projeto/controlador, filtro VHS/menu, física/interação, corpo/mão do Nondas e locadora Astro Vídeo. Há cinco fitas de teste na loja; ainda não há rotina completa de fitas.

Próxima entrega: **6, “As fitas”** — retirar devoluções, rebobinar, assistir na TV de teste e guardar por gênero; introduzir a primeira fita adulterada. Guardar na estante precisa animar o percurso inverso da pegada. `TvScreen` já existe para integração futura. A produção do vídeo (`SubViewport` ou pré-renderização) e os defeitos de fita dependem de decisão posterior do usuário; o roteiro não escolhe essas soluções. Rua e fachada vêm na entrega 8; diálogo e idiomas, na 7; estado narrativo e troca de fases, na 9.

## 4. Roteiro exato das três tarefas

Execute **A → B → C no mesmo chat da cópia**, aguardando o fim de cada turno. São incrementos pequenos para a entrega 6, sem substituir a loja ou implementar a entrega inteira. Não use `@menções`, pois elas sobrepõem o seletor.

### A — somente Claude; seletor **Claude**

Copie a mensagem inteira:

```text
Estamos testando o Contraponto SOMENTE em C:\Projetos\fita-sem-etiqueta-teste. Nunca escreva em C:\Projetos\fita-sem-etiqueta nem em outra pasta de projeto. Leia CLAUDE.md e CONTEXT.md da cópia. Não faça commit/push, não instale/baixe nada e não crie nem altere CLAUDE.md, AGENTS.md ou CONTEXT.md. Não abra janela do jogo. Não delegue esta tarefa.

Faça um primeiro recorte pequeno da entrega 6, “As fitas”: crie somente game/props/TapeState.cs, em namespace FitaSemEtiqueta.Props. Deve ser uma classe pública partial TapeState : Resource, com [GlobalClass], e propriedades booleanas públicas [Export] IsRewound e HasBeenWatched, inicialmente false. Rewind() marca IsRewound=true. MarkWatched() retorna bool: se ainda não rebobinou, retorna false e mantém HasBeenWatched=false; se já rebobinou, marca HasBeenWatched=true e retorna true. Não acrescente dependências, autoloads, UI ou alterações na fita/cenas existentes. Arquivos .uid gerados pelo Godot são permitidos.

Compile game/FitaSemEtiqueta.csproj com dotnet build usando somente pacotes locais/cache (a fonte local do Godot está em C:\Tools\Godot\4.7.2\Godot_v4.7.2-stable_mono_win64\GodotSharp\Tools\nupkgs). Resuma o arquivo criado e o comportamento; isso deve ficar disponível para a próxima IA pelo resumo cruzado.
```

**Passou:** arquivo correto; `[GlobalClass]`; build sem erros; o Godot instancia o Resource com os dois estados falsos, rejeita assistir antes de rebobinar e aceita assistir depois. A sonda do script confere essas transições.

### B — somente Codex; seletor **Codex**

Copie a mensagem inteira:

```text
Estamos testando o Contraponto SOMENTE em C:\Projetos\fita-sem-etiqueta-teste. Nunca escreva em C:\Projetos\fita-sem-etiqueta nem em outra pasta de projeto. Antes de ler qualquer arquivo ou usar ferramenta, cite na sua primeira resposta o que o Claude acabou de entregar, usando apenas o contexto compartilhado pelo Contraponto. Se esse contexto não chegou, diga isso claramente; não tente esconder a falha lendo o arquivo primeiro. Depois leia CLAUDE.md e CONTEXT.md da cópia.

Não faça commit/push, não instale/baixe nada e não crie nem altere CLAUDE.md, AGENTS.md ou CONTEXT.md. Não abra janela do jogo. Não altere C# nem delegue.

Para preparar as etiquetas da entrega 6, gere uma imagem original de etiqueta de VHS de locadora de bairro, anos 1990: papel creme levemente gasto, moldura azul, espaço para número manuscrito e a palavra DRAMA bem legível, sem marcas de filmes. Use a geração de imagem do Codex. Salve a arte final em PNG RGB ou RGBA, exatamente 512x256, em game/assets/textures/tapes/tape_label_drama.png. Crie a pasta se necessário; redimensione com ferramenta já instalada se a geração vier em outro tamanho. Não basta renomear uma extensão.

Importe somente a cópia com o Godot 4.7.2 .NET em modo headless. No tape_label_drama.png.import configure compress/mode=2, mipmaps/generate=true e detect_3d/compress_to=0; reimporte e preserve esses valores. Não modifique modelos nem cenas existentes. Mostre a imagem e informe caminho e dimensões finais. Se a geração de imagens não estiver disponível, informe a falha em vez de apresentar um placeholder como resultado final.
```

**Passou:** PNG real de 512×256 no caminho combinado; parâmetros de importação corretos; Godot carrega como `Texture2D`; build continua passando. **Conferência humana adicional:** a primeira resposta cita o estado de rebobinagem entregue pelo Claude antes de qualquer ferramenta/leitura; a arte corresponde ao pedido e aparece no chat. O script não comprova a origem por geração de imagem nem a qualidade visual.

### C — mista; seletor **Automático**

Antes: em Configurações, confirme **Código e lógica de jogo → Claude** e **Texturas e imagens → Codex**. Desligue temporariamente **troca por cota** para que a medição não pule a delegação; se alguma IA estiver sem cota, registre como bloqueio do teste e retome quando houver cota. Restaure a configuração de cota após o teste.

Copie a mensagem inteira, sem `@Claude` nem `@Codex`:

```text
Estamos testando o Contraponto SOMENTE em C:\Projetos\fita-sem-etiqueta-teste. Nunca escreva em C:\Projetos\fita-sem-etiqueta nem em outra pasta de projeto. Leia CLAUDE.md e CONTEXT.md da cópia. Não faça commit/push, não instale/baixe nada e não crie nem altere CLAUDE.md, AGENTS.md ou CONTEXT.md. Não abra janela do jogo. Use o trabalho dos turnos anteriores e cite o que o Codex entregou.

Claude: lidere este recorte pequeno da entrega 6 e escreva o C#. Delegue obrigatoriamente ao Codex, pela ferramenta delegate_to_codex do Contraponto, a geração de game/assets/textures/tapes/tape_label_rewound.png: etiqueta original de VHS, papel creme e moldura verde, palavra REBOBINADA legível, PNG RGB/RGBA exatamente 512x256, visual compatível com tape_label_drama.png. Inclua no briefing as restrições de pasta, nenhuma instalação, nenhum commit e nenhum ajuste nos contextos. O Codex deve gerar a imagem e configurar seu .png.import com compress/mode=2, mipmaps/generate=true e detect_3d/compress_to=0; importar/reimportar sem janela. Não faça você mesmo esse asset nem use placeholder se a delegação falhar.

Crie game/props/TapePreview.cs (namespace FitaSemEtiqueta.Props) e game/levels/tape_preview/tape_preview.tscn. A cena isolada deve ter raiz Node3D com TapePreview.cs, câmera ativa e luz; mostrar uma instância de res://props/tape.tscn chamada Tape, congelada (Freeze=true), e ao lado dois Sprite3D visíveis, filhos diretos da raiz, chamados DramaLabel e RewoundLabel. No C#, carregue por caminho res:// as duas texturas dos turnos B/C e atribua-as aos respectivos sprites, em posições/tamanhos visíveis pela câmera. Não escreva texto de interface fixo no código.

TapePreview deve expor [Export] public TapeState State { get; set; } = new(); e no _Ready chamar State.Rewind() e State.MarkWatched(), aproveitando o Resource da tarefa A. Preserve o script, a geometria e a colisão da fita original. Não altere project.godot, a loja, a sala de teste nem assets existentes; esta é uma prévia independente, não a implementação completa das fitas.

Compile com os pacotes locais/cache, importe e execute a prévia apenas em headless com tempo limite. Ao final, liste quais arquivos cada IA fez e como código e texturas foram ligados.
```

**Passou:** `TapePreview.cs`, `tape_preview.tscn` e o PNG de 512×256 existem; build e cena principal passam; a prévia abre no headless com o script correto, câmera ativa, fita existente congelada, duas texturas ligadas e `State` rebobinado/assistido. A sonda confere esses objetos em execução. **Conferência humana adicional:** o chat mostra o Claude liderando, chamada real a `delegate_to_codex`, bloco aninhado do Codex, a imagem gerada e o resumo integrado; confira a composição visual pelo editor se desejar. Asserções headless não provam a delegação nem o enquadramento visual.

## 5. Como executar no Contraponto

1. Abra um **PowerShell normal do Windows** (fora do terminal do painel do Claude Desktop). Rode:

   ```powershell
   Set-Location C:\Projetos\contraponto
   npm.cmd run dev
   ```

2. Na barra lateral, clique em **+ Adicionar pasta**, selecione **C:\Projetos\fita-sem-etiqueta-teste** (raiz com `CLAUDE.md`, não apenas `game/`) e crie um chat. Confirme a pasta exibida antes de enviar cada mensagem. Não selecione o jogo oficial.
3. Use as três mensagens acima em ordem no mesmo chat, mudando o seletor. Nível **Perguntar** é suficiente; aprove apenas acessos à cópia necessários ao pedido. Não precisa liberar acesso total ao PC.
4. Depois de C, confira a troca de contexto entre IAs e o bloco de delegação. Antes de enviar outro turno, execute a conferência completa abaixo.
5. Com a conferência completa passando, clique em **Desfazer turno** no último turno C. Não desfaça um turno antigo nem envie outro pedido antes disso. O último turno deve ficar marcado como desfeito. O app usa commits internos no repositório-sombra para checkpoints; isso não é commit no Git do jogo, no Git da arte ou no Git do Contraponto.
6. Execute `-CheckUndo`: os três arquivos principais de C devem sumir, A/B permanecer idênticos por hash e o jogo continuar compilando/abrindo no headless. Diretórios vazios e caches ignorados podem permanecer. O script não clica no botão nem altera o histórico do chat.
7. Preserve os logs. Depois do desfazer, C aparecerá como ausente na conferência normal; use `-CheckUndo` para esse estado. Não é necessário executar as tarefas novamente para provar o desfazer. Caso queira manter C, poderá pedir sua recriação depois de registrar o resultado.

O status Git da cópia passa a ter os novos arquivos depois dos turnos; isso é esperado. Para conferir o Git do jogo e o da arte durante o teste, compare seus HEADs/configurações, pois checkpoints ficam fora deles. A aprovação para uso na pasta oficial continua pendente e deve ser uma decisão explícita posterior.

## 6. Script de conferência

Arquivo principal: [scripts/phase3-check.ps1](../scripts/phase3-check.ps1). Sondas de runtime: [scripts/phase3-probe.gd](../scripts/phase3-probe.gd). Execute a partir de um PowerShell normal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Projetos\contraponto\scripts\phase3-check.ps1
```

Depois de usar **Desfazer turno** em C:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Projetos\contraponto\scripts\phase3-check.ps1 -CheckUndo
```

O script tem destino fixo na cópia, recusa diretórios com reparse points, verifica ausência de remotos nos dois repositórios, compila C#, importa e abre a cena principal. Confere PNG/dimensões/importação e executa as sondas de A/B/C quando há Godot 4.7.2 .NET. Usa processos sem janela e tempos limites; código de saída **0 = todas as verificações solicitadas passaram**, **1 = houve falha**. Imprime `passou` ou `falhou` para cada tarefa e guarda logs e `results.json` em `docs/phase3-evidence/check-*`. Não instala ferramentas nem busca pacotes em fontes externas.

Sem Godot compatível, informa que o headless foi omitido e limita o resultado a arquivos/configuração/build; esse resultado não comprova que a cena abre. Nesta máquina o Godot compatível foi encontrado e utilizado.

`-BaselineOnly` verifica o estado inicial sem exigir as tarefas. Foi executado com sucesso, e a sonda GDScript passou em `--check-only`. A execução normal também foi validada no **Windows PowerShell 5.1**, após corrigir a captura do código de saída dos processos: isolamento, build, importação e cena principal passaram; somente A/B/C imprimiram `falhou`, pois seus arquivos ainda não existem. Evidência: [results.json](phase3-evidence/check-20261115-132445-f64c76/results.json). Isso confirma a detecção de tarefas ausentes; os ramos de aprovação dos novos arquivos só poderão passar após os turnos reais do usuário. Um log anterior preserva a falha de compatibilidade já corrigida, sem representar uma falha do jogo.

## 7. Encerramento pendente

Não houve alteração no jogo original, criação de `CLAUDE.md`/`AGENTS.md`, execução das tarefas A/B/C, instalação de ferramenta, commit ou push. A preparação está pronta; os resultados do teste real do Contraponto, da delegação, do contexto cruzado e do botão Desfazer precisam ser registrados após o usuário executar o roteiro. Não tratar a Fase 3 como totalmente aprovada antes disso.
