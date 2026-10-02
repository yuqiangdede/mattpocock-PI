import { symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Junctions exercise real directory-link containment without admin privileges. */
export async function directoryLink(target, path) {
  if (process.platform === "win32") await symlink(resolve(dirname(path), target), path, "junction");
  else await symlink(target, path, "dir");
}
