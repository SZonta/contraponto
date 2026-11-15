# One-time preparation. Never writes to the source game.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = 'C:\Projetos\fita-sem-etiqueta'
$copy = 'C:\Projetos\fita-sem-etiqueta-teste'
$backupRoot = 'C:\Projetos\backups'
$archive = Join-Path $backupRoot 'fita-sem-etiqueta-2026-11-15.zip'
$evidenceRoot = Join-Path $PSScriptRoot '..\docs\phase3-evidence'
$extraction = Join-Path $backupRoot ('phase3-verify-' + [guid]::NewGuid().ToString('N'))

function Get-Manifest([string]$Root) {
    @(Get-ChildItem -LiteralPath $Root -File -Force -Recurse | Sort-Object FullName | ForEach-Object {
        [pscustomobject]@{
            Path = $_.FullName.Substring($Root.Length + 1).Replace('\', '/')
            Bytes = $_.Length
            Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
}
function Assert-Same($Expected, $Actual, [string]$Label) {
    $delta = @(Compare-Object $Expected $Actual -Property Path, Bytes, Sha256)
    if ($delta.Count -ne 0) { throw "$Label differs: $($delta | ConvertTo-Json -Compress)" }
}
function Read-Status([string]$Root) {
    $result = @(& git --no-optional-locks -C $Root status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw "Cannot read Git status: $Root" }
    $result -join "`n"
}
if ((Test-Path -LiteralPath $copy) -or (Test-Path -LiteralPath $archive)) {
    throw 'Destination or backup already exists; refusing to overwrite.'
}
if (@(Get-ChildItem -LiteralPath $source -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) {
    throw 'Source contains reparse points; inspect before copying.'
}
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
$before = Get-Manifest $source
$originalStatus = Read-Status $source
$before | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'original-manifest.json') -Encoding utf8
[IO.Compression.ZipFile]::CreateFromDirectory($source, $archive, [IO.Compression.CompressionLevel]::Optimal, $true)
try {
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $extraction)
    $restored = Join-Path $extraction 'fita-sem-etiqueta'
    Assert-Same $before (Get-Manifest $restored) 'Extracted backup'
    New-Item -ItemType Directory -Path $copy | Out-Null
    foreach ($dir in Get-ChildItem -LiteralPath $restored -Directory -Force -Recurse) {
        [IO.Directory]::CreateDirectory((Join-Path $copy $dir.FullName.Substring($restored.Length + 1))) | Out-Null
    }
    foreach ($file in Get-ChildItem -LiteralPath $restored -File -Force -Recurse) {
        [IO.File]::Copy($file.FullName, (Join-Path $copy $file.FullName.Substring($restored.Length + 1)), $false)
    }
    Assert-Same $before (Get-Manifest $copy) 'Test copy before removing origin'
} finally {
    # Resolve and constrain the deletion to this newly allocated verification directory.
    $absolute = [IO.Path]::GetFullPath($extraction)
    if ($absolute.StartsWith($backupRoot + '\phase3-verify-', [StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $absolute)) {
        Remove-Item -LiteralPath $absolute -Recurse -Force
    }
}
& git -C $copy remote remove origin
if ($LASTEXITCODE -ne 0) { throw 'Could not remove origin from test copy.' }
# The art generators are a private nested repository and must also be isolated.
$nested = Join-Path $copy 'tools\blender'
$nestedOriginalStatus = Read-Status (Join-Path $source 'tools\blender')
& git -C $nested remote remove origin
if ($LASTEXITCODE -ne 0) { throw 'Could not remove nested origin from test copy.' }
$nestedRemotes = @(& git -C $nested remote -v)
if ($LASTEXITCODE -ne 0 -or $nestedRemotes.Count) { throw 'Nested test repository still has a remote.' }
if ((Read-Status $nested) -cne $nestedOriginalStatus) { throw 'Nested Git status changed.' }
$remotes = @(& git -C $copy remote -v)
if ($LASTEXITCODE -ne 0 -or $remotes.Count) { throw 'Test copy still has a remote.' }
$copyStatus = Read-Status $copy
if ($copyStatus -cne $originalStatus) { throw 'Git status differs between source and copy.' }
Assert-Same $before (Get-Manifest $source) 'Original after preparation'
$result = [ordered]@{
    Date = '2026-11-15'; Source = $source; Copy = $copy; Archive = $archive
    ArchiveBytes = (Get-Item -LiteralPath $archive).Length
    ArchiveSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    OriginalFiles = $before.Count; ExtractedFiles = $before.Count; CopyFiles = $before.Count
    MatchingSha256 = $before.Count; GitStatusOriginal = $originalStatus; GitStatusCopy = $copyStatus
    CopyRemotes = $remotes; NestedCopyRemotes = $nestedRemotes; OriginalUnchanged = $true
    TemporaryExtractionDeleted = -not (Test-Path -LiteralPath $extraction)
}
$result | ConvertTo-Json -Depth 5 | Tee-Object -FilePath (Join-Path $evidenceRoot 'preparation.json')
