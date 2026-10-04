import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "electron") {
    return {
      url: pathToFileURL(join(here, "updater-electron-stub.mjs")).href,
      shortCircuit: true,
    };
  }
  if (specifier === "electron-updater") {
    return {
      url: pathToFileURL(join(here, "updater-electron-updater-stub.mjs")).href,
      shortCircuit: true,
    };
  }
  // 此套测试验证继承的官方自动升级控制器；定制版默认手动策略由独立回归验证。
  if (specifier === "@pi-desktop/shared" && context.parentURL?.endsWith("/updater.ts")) {
    const shared = pathToFileURL(join(here, "../../../../packages/shared/dist/index.js")).href;
    return { url: "data:text/javascript," + encodeURIComponent('export * from ' + JSON.stringify(shared) + '; export const APP_MANUAL_UPDATES_ONLY = false;'), shortCircuit: true };
  }
  if (specifier === "./skill-market-catalog" && context.parentURL?.endsWith("/updater.ts")) {
    return { url: "data:text/javascript," + encodeURIComponent('export async function fetchVersionSource() { throw new Error("Network forbidden in updater fixture"); } export async function assertPublicUpdateUrl() { throw new Error("Network forbidden in updater fixture"); }'), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
