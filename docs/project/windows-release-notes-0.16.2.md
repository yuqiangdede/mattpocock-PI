# mattpocock-PI 0.16.2

Stable release of the stage-one Skill Launcher for Windows x64.

- Six independent Coding Actions: discuss requirements, create specification, technical design, create tickets, implement and code review. Selecting an Action prepares an editable native Skill draft; only manual Send executes it.
- Keep Ask next step, Diagnose bug and grouped More skills available. Settings show effective localized descriptions and default/custom/marker-only prompts, with explicit Save and Restore default.
- Edit labels, Skill references, order and enabled state. Import/export Actions JSON; safely migrate old prompts and preserve damaged configuration before explicit recovery.
- Native Workflow launcher, Composer navigation and work-panel entry points are withdrawn. Historical runs, confirmations, artifacts and Host APIs remain intact.
- Development Navigator, enforced stage order and automatic advancement remain outside stage one.

## Downloads

- `PI-Desktop-Setup-0.16.2.exe`: Windows installer.
- `PI-Desktop-Portable-0.16.2.zip`: extract and launch `PI-Desktop.exe`.
- `PI-Desktop-Portable-0.16.2.exe`: Portable launcher.

Verify downloads against `SHA256SUMS.txt`. Portable/ZIP updates are manual; preserve the existing application data directory.

## Qualification scope

Windows x64 only, unsigned. Validation uses isolated data and deterministic local model fixtures. Clean-VM installation/upgrade/uninstallation, real updater installation, real external models, Authenticode, macOS/Linux and remote pi-host are not qualified by this release. Stable is the release channel, not a claim that these omitted checks passed.
