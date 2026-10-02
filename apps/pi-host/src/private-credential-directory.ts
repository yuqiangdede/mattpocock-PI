import { execFile } from "node:child_process";
import { lstat, mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const WINDOWS_PRIVATE_DIRECTORY = `
$ErrorActionPreference = 'Stop'
$path = $env:PI_PRIVATE_CREDENTIAL_DIRECTORY
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$security = New-Object System.Security.AccessControl.DirectorySecurity
$security.SetOwner($user)
$security.SetAccessRuleProtection($true,$false)
foreach ($sid in @($user.Value,'S-1-5-18','S-1-5-32-544')) {
  $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $security.AddAccessRule($rule)
}
[System.IO.Directory]::CreateDirectory($path,$security) | Out-Null
[System.IO.Directory]::SetAccessControl($path,$security)
`;

/** Keep credential storage private on both Unix modes and Windows ACLs. */
export async function ensurePrivateCredentialDirectory(path: string): Promise<void> {
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing?.isSymbolicLink()) throw new Error("Credential directory cannot be a symbolic link");
  if (process.platform !== "win32") { await mkdir(path, {recursive:true,mode:0o700}); return; }
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PRIVATE_DIRECTORY], {windowsHide:true,env:{...process.env,PI_PRIVATE_CREDENTIAL_DIRECTORY:path},timeout:15000});
}
