export async function resolve(specifier, context, next) {
  if (specifier === "@pi-desktop/agent-runtime") return { url: "data:text/javascript,export function completeOneShot(){throw new Error('Real providers forbidden in this test')}", shortCircuit: true };
  if (specifier === "@pi-desktop/shared") return next(new URL("../../../../packages/shared/src/index.ts", import.meta.url).href, context);
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return next(specifier, context);
  try { return await next(specifier, context); } catch (error) {
    const target = specifier.endsWith(".js") ? specifier.slice(0, -3) + ".ts" : /\.[a-z]+$/i.test(specifier) ? null : specifier + ".ts";
    if (!target) throw error;
    return next(target, context);
  }
}
