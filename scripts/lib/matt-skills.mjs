import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Read the same source tree embedded by host-core, including companion files. */
export function readMattSkillBundle(root) {
  if (root instanceof URL) root = fileURLToPath(root);
  const read = (path) => {
    if (!lstatSync(path).isFile()) throw new Error(`Expected regular Matt skill file: ${path}`);
    return readFileSync(path, "utf8");
  };
  const walk = (directory, prefix = "") => readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .flatMap(entry => {
      const path = join(directory, entry.name), relative = prefix + entry.name;
      if (entry.isDirectory()) return walk(path, relative + "/");
      return [{ path: relative, content: read(path) }];
    });
  const packages = readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .flatMap(entry => {
      if (entry.isSymbolicLink()) throw new Error("Matt skill links are not supported");
      if (!entry.isDirectory()) return [];
      const files = walk(join(root, entry.name));
      if (!files.some(file => file.path === "SKILL.md")) throw new Error("Matt skill directory is missing SKILL.md");
      return [{ id: entry.name, files }];
    });
  return { revision: read(join(root, "REVISION")).trim(), packages };
}
