<#
.SYNOPSIS
  Publica uma release no GitHub: testes, exportação do cliente, zips e `gh release create`.
.DESCRIPTION
  O atualizador do cliente lê a última release do GitHub e baixa Guacamole-cliente-windows.zip,
  então esse nome precisa ser mantido. A versão vem de client/project.godot (config/version): mude-a,
  faça commit e push antes de rodar. O script não faz commit nem push; recusa se algo estiver pendente.
.EXAMPLE
  scripts/release.ps1 -Version 0.2.0 -Notes "Chat de voz e mesa em arquivo."
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = "",
  [switch]$SkipTests,
  [switch]$Draft
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Versão no formato 1.2.3, sem 'v'." }
$tag = "v$Version"

$declared = (Select-String -Path client/project.godot -Pattern '^config/version="(.+)"').Matches.Groups[1].Value
if ($declared -ne $Version) {
  throw "client/project.godot diz $declared. Ajuste config/version para $Version, faça commit e push."
}

if (git status --porcelain) { throw "Há mudanças sem commit. Faça commit antes de publicar." }
git fetch origin main --quiet
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) {
  throw "HEAD não é o mesmo que origin/main. Faça push (ou git pull) antes de publicar."
}
if (git tag --list $tag) { throw "A tag $tag já existe." }
if (-not (Test-Path client/addons/guacamole_voice/bin/guacamole_voice.dll)) {
  throw "Falta a DLL de voz. Veja voice/ (cargo build --release, com CMAKE_POLICY_VERSION_MINIMUM=3.5)."
}

if (-not $SkipTests) {
  deno task check
  if ($LASTEXITCODE -ne 0) { throw "deno task check falhou." }
  deno test -A
  if ($LASTEXITCODE -ne 0) { throw "Os testes do Deno falharam." }
}

$out = Join-Path $root "dist/release"
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$out/cliente" | Out-Null

godot --headless --path client --export-release "Windows Desktop" "$out/cliente/Guacamole.exe"
if (-not (Test-Path "$out/cliente/Guacamole.exe")) { throw "A exportação do cliente falhou." }
Compress-Archive -Path "$out/cliente/*" -DestinationPath "$out/Guacamole-cliente-windows.zip" -Force

# Servidor: o código-fonte que o Deno roda, sem testes.
$srv = "$out/servidor"
New-Item -ItemType Directory -Force "$srv/server", "$srv/core" | Out-Null
Get-ChildItem server -Filter *.ts | Where-Object { $_.Name -notlike "*_test.ts" } | Copy-Item -Destination "$srv/server"
Get-ChildItem core -Recurse -File | Where-Object { $_.Name -notlike "*_test.ts" } | ForEach-Object {
  $target = Join-Path $srv ($_.FullName.Substring($root.Length + 1))
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  Copy-Item $_.FullName $target
}
Copy-Item deno.json $srv
Set-Content "$srv/iniciar-servidor.cmd" "@echo off`r`ndeno task start`r`npause`r`n" -Encoding ascii
Set-Content "$srv/LEIAME.txt" "Servidor do Guacamole. Instale o Deno (https://deno.com) e execute iniciar-servidor.cmd. Porta 8000; libere-a no firewall para os amigos." -Encoding utf8
Compress-Archive -Path "$srv/*" -DestinationPath "$out/Guacamole-servidor.zip" -Force

$ghArgs = @("release", "create", $tag, "$out/Guacamole-cliente-windows.zip", "$out/Guacamole-servidor.zip",
  "--target", (git rev-parse HEAD), "--title", "Guacamole $Version")
if ($Notes) { $ghArgs += @("--notes", $Notes) } else { $ghArgs += "--generate-notes" }
if ($Draft) { $ghArgs += "--draft" }
gh @ghArgs
if ($LASTEXITCODE -ne 0) { throw "gh release create falhou." }
Write-Host "Release $tag publicada."
