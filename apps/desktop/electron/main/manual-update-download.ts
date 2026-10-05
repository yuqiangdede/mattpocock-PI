import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { APP_REPOSITORY } from "@pi-desktop/shared";

export type ManualUpdateArtifact = { name: string; url: string; sha256: string; size: number };

/** Release metadata is untrusted; only the selected fork artifact is admitted. */
export function selectManualUpdateArtifact(
  release: unknown, version: string, distribution: "portable" | "zip",
): ManualUpdateArtifact {
  if (!release || typeof release !== "object" || !("assets" in release) || !Array.isArray(release.assets)) throw new Error("Missing update artifacts");
  const cleanVersion = version.replace(/^v/, "");
  const name = distribution === "portable"
    ? `PI-Desktop-Portable-${cleanVersion}.exe`
    : `PI-Desktop-Portable-${cleanVersion}.zip`;
  const asset = release.assets.find((item: unknown) => item && typeof item === "object" && "name" in item && item.name === name);
  if (!asset || typeof asset.browser_download_url !== "string" || typeof asset.digest !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size)
    || asset.size <= 0 || asset.size > 2 * 1024 ** 3) throw new Error("No matching checksum-verified update artifact");
  const url = new URL(asset.browser_download_url);
  if (url.origin !== "https://github.com" || !url.pathname.startsWith(`/${APP_REPOSITORY}/releases/download/`)
    || decodeURIComponent(url.pathname.split("/").at(-1) ?? "") !== name || url.search || url.hash) throw new Error("Invalid update artifact URL");
  return { name, url: url.href, sha256: asset.digest.slice(7), size: asset.size };
}

/** Redirects retain the existing public-network guard; only verified files surface. */
export async function downloadManualUpdate(options: {
  artifact: ManualUpdateArtifact;
  directory: string;
  fetch: (url: string, init: { redirect: "manual"; signal: AbortSignal }) => Promise<Response>;
  assertPublicUrl: (url: string) => Promise<void>;
  progress: (percent: number) => void;
  signal: AbortSignal;
}): Promise<string> {
  let url = options.artifact.url;
  let response: Response | undefined;
  for (let hop = 0; hop <= 5; hop++) {
    options.signal.throwIfAborted();
    await options.assertPublicUrl(url);
    const next = await options.fetch(url, { redirect: "manual", signal: options.signal });
    if (next.status >= 300 && next.status < 400) {
      await next.body?.cancel();
      const location = next.headers.get("location");
      if (!location) throw new Error("Update redirect missing location");
      url = new URL(location, url).href;
    } else { response = next; break; }
  }
  if (!response?.ok || !response.body) throw new Error("Update download failed");
  await mkdir(options.directory, { recursive: true });
  const partial = join(options.directory, `download-${randomUUID()}.partial`);
  const destination = join(options.directory, `${randomUUID()}-${options.artifact.name}`);
  const file = await open(partial, "wx");
  let complete = false;
  try {
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let received = 0;
    let lastPercent = -1;
    try {
      while (true) {
        options.signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > options.artifact.size) throw new Error("Update size mismatch");
        hash.update(value);
        await file.writeFile(value);
        const percent = Math.floor(received * 100 / options.artifact.size);
        if (percent !== lastPercent) { lastPercent = percent; options.progress(percent); }
      }
    } finally { await reader.cancel(); }
    if (received !== options.artifact.size || hash.digest("hex") !== options.artifact.sha256) throw new Error("Update checksum mismatch");
    await file.sync();
    await file.close();
    await rename(partial, destination);
    complete = true;
    return destination;
  } finally {
    await file.close();
    if (!complete) await unlink(partial);
  }
}
