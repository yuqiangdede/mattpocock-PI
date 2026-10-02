import { mkdirSync, mkdtempSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Standalone bundle tests must not inherit the source checkout's node_modules. */
export function externalBundleFixture(prefix: string): string {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const scratch = join(dirname(repository), `.pi-test-external-${basename(repository)}`);
  mkdirSync(scratch, { recursive: true });
  return mkdtempSync(join(scratch, prefix));
}
