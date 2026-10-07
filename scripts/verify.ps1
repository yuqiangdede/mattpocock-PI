$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
pnpm test
if ($LASTEXITCODE) { exit $LASTEXITCODE }
