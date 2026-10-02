import { execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { expect } from "vitest";

/** Verify the native permission model, including Windows ACLs. */
export async function expectOwnerPrivateFile(path: string): Promise<void> {
  const info = await stat(path);
  expect(info.isFile()).toBe(true);
  if (process.platform !== "win32") { expect(info.mode & 0o077).toBe(0); return; }
  const script = "$ErrorActionPreference = 'Stop'; $acl = [System.IO.File]::GetAccessControl($env:PI_TEST_PRIVATE_FILE); $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed = @($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 0 -and ($_.FileSystemRights -band 1) -ne 0 -and ($_.PropagationFlags -band 2) -eq 0 } | ForEach-Object { $_.IdentityReference.Value }); @{ user = $user; allowed = $allowed } | ConvertTo-Json -Compress";
  const result = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, env: { ...process.env, PI_TEST_PRIVATE_FILE: path } })) as { user: string; allowed: string[] };
  expect(result.allowed).toContain(result.user);
  expect(result.allowed.filter((sid) => ![result.user, "S-1-5-18", "S-1-5-32-544"].includes(sid))).toEqual([]);
}
