$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
pnpm dev
if ($LASTEXITCODE) { exit $LASTEXITCODE }
