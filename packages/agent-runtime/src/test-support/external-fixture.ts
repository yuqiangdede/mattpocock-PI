import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 项目内夹具通过子进程解析守卫隔离父目录依赖，保持打包安装的验证条件。 */
export function externalBundleFixture(prefix: string): string {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const scratch = join(repository, "cache", "bundle-fixtures");
  mkdirSync(scratch, { recursive: true });
  const fixture = mkdtempSync(join(scratch, prefix));
  writeFileSync(join(fixture, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(fixture, "isolation.cjs"), `
const Module = require("node:module");
const path = require("node:path");
const root = __dirname;
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  const filename = resolveFilename.call(this, request, ...args);
  if (!Module.isBuiltin(request) && path.isAbsolute(filename)) {
    const relative = path.relative(root, filename);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      const error = new Error("Fixture cannot inherit parent dependencies: " + request);
      error.code = "MODULE_NOT_FOUND";
      throw error;
    }
  }
  return filename;
};
`);
  return fixture;
}

export const bundleIsolationArgs = (fixture: string): string[] => ["--require", join(fixture, "isolation.cjs")];
