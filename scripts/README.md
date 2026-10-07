# PowerShell development wrappers

Use PowerShell 7 with the Node/pnpm and Rust toolchains required by the root
README and package manifests. Initialize dependencies through the existing
repository setup; these wrappers do not install or upgrade tools.

- `pwsh -File scripts/start.ps1` runs the root `pnpm dev` script.
- `pwsh -File scripts/verify.ps1` runs the root `pnpm test` script, including
  JavaScript builds, package tests and Host tests.

Both wrappers resolve the repository root from their own location, preserve the
external command exit code and work independently of the caller's directory.
