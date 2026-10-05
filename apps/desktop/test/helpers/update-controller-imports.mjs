export async function resolve(specifier, context, next) {
  if (specifier === "electron" || specifier === "electron-updater") {
    return next(new URL("./update-controller-fixture.mjs", import.meta.url).href, context);
  }
  if (specifier === "node:dns/promises" && context.parentURL?.endsWith("public-https-fetch.ts")) {
    return next(new URL("./update-controller-fixture.mjs", import.meta.url).href, context);
  }
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return next(specifier, context);
  try { return await next(specifier, context); }
  catch (error) {
    const target = specifier.endsWith(".js") ? specifier.slice(0, -3) + ".ts" : /\.[a-z]+$/i.test(specifier) ? null : specifier + ".ts";
    if (!target) throw error;
    return next(target, context);
  }
}
