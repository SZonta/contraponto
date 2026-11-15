[CmdletBinding()]
param(
    [switch]$BaselineOnly,
    [switch]$CheckUndo,
    [string]$GodotPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($BaselineOnly -and $CheckUndo) { throw 'Choose either BaselineOnly or CheckUndo.' }
# Fixed destination: this script must never build or import the official game.
$copy = 'C:\Projetos\fita-sem-etiqueta-teste'
$game = Join-Path $copy 'game'
$evidence = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docs\phase3-evidence'))
$run = Join-Path $evidence ('check-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$results = New-Object System.Collections.Generic.List[object]
function Result([string]$Name, [bool]$Passed, [string]$Detail) {
    $word = if ($Passed) { 'passou' } else { 'falhou' }
    Write-Host ("{0}: {1} - {2}" -f $Name, $word, $Detail)
    $results.Add([pscustomobject]@{ Check = $Name; Result = $word; Detail = $Detail })
}
function Run-Process([string]$Name, [string]$Exe, [string[]]$Arguments, [int]$Timeout = 120) {
    $stdout = Join-Path $run ($Name + '.log')
    $stderr = Join-Path $run ($Name + '.stderr.log')
    # Use Process directly: Windows PowerShell 5.1 may lose ExitCode when
    # Start-Process is combined with redirected output and WaitForExit.
    $quoted = @($Arguments | ForEach-Object { '"' + $_ + '"' })
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Exe
    $info.Arguments = $quoted -join ' '
    $info.WorkingDirectory = $game
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    $process.Start() | Out-Null
    $outTask = $process.StandardOutput.ReadToEndAsync()
    $errTask = $process.StandardError.ReadToEndAsync()
    $done = $process.WaitForExit($Timeout * 1000)
    if (-not $done) { $process.Kill(); $process.WaitForExit() }
    [IO.File]::WriteAllText($stdout, $outTask.Result)
    [IO.File]::WriteAllText($stderr, $errTask.Result)
    $output = $outTask.Result + "`n" + $errTask.Result
    $ok = $done -and $process.ExitCode -eq 0 -and $output -notmatch '(?im)(SCRIPT ERROR:|ERROR:|Unhandled exception|Exception thrown|error (CS|MSB|NU|NETSDK)\d+)'
    $process.Dispose()
    if (-not $ok) { Write-Host $output }
    [pscustomobject]@{ Ok = $ok; Output = $output; TimedOut = -not $done }
}
function Read-Text([string]$Relative) {
    $path = Join-Path $game $Relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return '' }
    [IO.File]::ReadAllText($path)
}
function Valid-Png([string]$Relative) {
    $path = Join-Path $game $Relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 33) { return $false }
    $signature = [BitConverter]::ToString($bytes[0..7])
    $width = [int64]$bytes[16]*16777216 + [int64]$bytes[17]*65536 + [int64]$bytes[18]*256 + $bytes[19]
    $height = [int64]$bytes[20]*16777216 + [int64]$bytes[21]*65536 + [int64]$bytes[22]*256 + $bytes[23]
    return $signature -eq '89-50-4E-47-0D-0A-1A-0A' -and $width -eq 512 -and $height -eq 256
}
function Valid-Import([string]$Relative) {
    $text = Read-Text ($Relative + '.import')
    return $text -match '(?m)^compress/mode=2\s*$' -and $text -match '(?m)^mipmaps/generate=true\s*$' -and $text -match '(?m)^detect_3d/compress_to=0\s*$'
}
function Probe([string]$Task) {
    $probe = Join-Path $PSScriptRoot 'phase3-probe.gd'
    $outcome = Run-Process ('task-' + $Task) $GodotPath @('--headless', '--path', $game, '--fixed-fps', '60', '--script', $probe, '--', $Task) 45
    return $outcome.Ok -and $outcome.Output.Contains('PHASE3_' + $Task.ToUpperInvariant() + '_OK')
}
try {
    if (-not (Test-Path -LiteralPath (Join-Path $game 'project.godot'))) { throw 'Test copy not found.' }
    foreach ($path in @($copy) + @(Get-ChildItem -LiteralPath $copy -Directory -Force -Recurse | Select-Object -ExpandProperty FullName)) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point refused: $path" }
    }
    foreach ($repo in @($copy, (Join-Path $copy 'tools\blender'))) {
        $remotes = @(& git -C $repo remote -v)
        if ($LASTEXITCODE -ne 0 -or $remotes.Count -ne 0) { throw "Repository is not isolated: $repo" }
    }
    Result 'Isolamento da copia' $true 'Nenhum remoto nos dois repositorios.'
    $dotnet = (Get-Command dotnet -ErrorAction Stop).Source
    # Only local/cached NuGet packages, including the SDK bundled with Godot.
    $localPackages = 'C:\Tools\Godot\4.7.2\Godot_v4.7.2-stable_mono_win64\GodotSharp\Tools\nupkgs'
    if (-not (Test-Path -LiteralPath $localPackages)) {
        $localPackages = Join-Path $run 'empty-nuget-source'
        New-Item -ItemType Directory -Path $localPackages | Out-Null
    }
    $build = Run-Process 'build' $dotnet @('build', 'FitaSemEtiqueta.csproj', '--source', $localPackages) 120
    Result 'dotnet build' $build.Ok 'Veja build.log e build.stderr.log.'
    if (-not $GodotPath) {
        $candidates = @('C:\Tools\Godot\4.7.2\Godot_v4.7.2-stable_mono_win64\Godot_v4.7.2-stable_mono_win64_console.exe')
        $candidates += @(Get-Command '*godot*' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
        if (Test-Path -LiteralPath 'C:\Tools') {
            $candidates += @(Get-ChildItem -LiteralPath 'C:\Tools' -Filter '*godot*mono*console.exe' -File -Recurse | Select-Object -ExpandProperty FullName)
        }
        foreach ($candidate in $candidates | Select-Object -Unique) {
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $version = Run-Process 'godot-version' $candidate @('--version') 10
                if ($version.Ok -and $version.Output -match '4\.7\.2\.stable\.mono') { $GodotPath = $candidate; break }
            }
        }
    } else {
        $version = Run-Process 'godot-version' $GodotPath @('--version') 10
        if (-not $version.Ok -or $version.Output -notmatch '4\.7\.2\.stable\.mono') { throw 'GodotPath must be Godot 4.7.2 .NET.' }
    }
    $engineOk = $true
    if ($GodotPath) {
        $import = Run-Process 'import' $GodotPath @('--headless', '--import', '--path', $game) 120
        Result 'Godot importacao' $import.Ok 'Importacao sem janela.'
        $main = Run-Process 'main-scene' $GodotPath @('--headless', '--path', $game, '--fixed-fps', '60', '--quit-after', '120') 45
        Result 'Cena principal' $main.Ok '120 quadros sem janela; nao valida aparencia nem shaders.'
        $engineOk = $import.Ok -and $main.Ok
    } else {
        Write-Host 'Godot 4.7.2 .NET ausente: headless omitido; resultado limitado a arquivos e build.'
    }
    if (-not $BaselineOnly) {
        $state = Read-Text 'props\TapeState.cs'
        $a = $build.Ok -and $engineOk -and $state -match 'class\s+TapeState\s*:\s*Resource' -and $state -match '\[GlobalClass\]'
        $a = $a -and $state.Contains('IsRewound') -and $state.Contains('HasBeenWatched') -and $state.Contains('Rewind') -and $state.Contains('MarkWatched')
        if ($a -and $GodotPath) { $a = Probe 'a' }
        Result 'Tarefa A (Claude)' $a 'TapeState.cs, build e contrato de rebobinar/assistir.'
        $b = $build.Ok -and $engineOk -and (Valid-Png 'assets\textures\tapes\tape_label_drama.png') -and (Valid-Import 'assets\textures\tapes\tape_label_drama.png')
        if ($b -and $GodotPath) { $b = Probe 'b' }
        Result 'Tarefa B (Codex)' $b 'PNG 512x256, parametros de importacao e Texture2D.'
        $cFiles = @('props\TapePreview.cs', 'levels\tape_preview\tape_preview.tscn', 'assets\textures\tapes\tape_label_rewound.png')
        if ($CheckUndo) {
            $removed = $true
            foreach ($relative in $cFiles) {
                if (Test-Path -LiteralPath (Join-Path $game $relative)) { $removed = $false }
            }
            $hashPath = Join-Path $evidence 'last-successful-task-hashes.json'
            $preserved = Test-Path -LiteralPath $hashPath
            if ($preserved) {
                foreach ($entry in Get-Content -LiteralPath $hashPath -Raw | ConvertFrom-Json) {
                    $path = Join-Path $game $entry.Path
                    if (-not (Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $entry.Sha256) { $preserved = $false }
                }
            }
            Result 'Tarefa C (apos desfazer)' ($removed -and $a -and $b -and $preserved) 'Arquivos de C ausentes; A e B preservadas por hash; exige uma conferencia completa bem-sucedida antes.'
        } else {
            $previewCode = Read-Text 'props\TapePreview.cs'
            $previewScene = Read-Text 'levels\tape_preview\tape_preview.tscn'
            $c = $a -and $b -and $previewCode.Contains('TapeState') -and $previewCode.Contains('tape_label_rewound.png') -and $previewCode.Contains('tape_label_drama.png') -and $previewScene.Contains('TapePreview.cs')
            $c = $c -and (Valid-Png 'assets\textures\tapes\tape_label_rewound.png') -and (Valid-Import 'assets\textures\tapes\tape_label_rewound.png')
            if ($c -and $GodotPath) { $c = Probe 'c' }
            Result 'Tarefa C (Automatico)' $c 'Cena isolada, fita existente, TapeState e duas texturas ligadas em runtime.'
            if ($a -and $b -and $c) {
                @('props\TapeState.cs', 'assets\textures\tapes\tape_label_drama.png', 'assets\textures\tapes\tape_label_drama.png.import') | ForEach-Object {
                    [pscustomobject]@{ Path = $_; Sha256 = (Get-FileHash -LiteralPath (Join-Path $game $_) -Algorithm SHA256).Hash }
                } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'last-successful-task-hashes.json') -Encoding utf8
            }
        }
    }
} catch {
    Result 'Conferencia' $false $_.Exception.Message
    if (-not $BaselineOnly) {
        foreach ($task in @('Tarefa A (Claude)', 'Tarefa B (Codex)', 'Tarefa C (Automatico)')) {
            if (-not @($results | Where-Object Check -eq $task).Count) { Result $task $false 'Conferencia interrompida; veja o erro acima.' }
        }
    }
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $run 'results.json') -Encoding utf8
Write-Host "Logs: $run"
Write-Host 'Delegacao, resumo cruzado e qualidade visual devem ser conferidos no Contraponto.'
if (@($results | Where-Object Result -eq 'falhou').Count) { exit 1 }
exit 0
