import type { PublicHttpsClient } from "./public-https-fetch";
import type { HostProcess } from "./host-process";

type BundleFile = { path: string; content: string };
export type EngineeringSkillBundle = { revision: string; packages: Array<{ id: string; files: BundleFile[] }> };
const REPOSITORY = "https://api.github.com/repos/mattpocock/skills";
const REQUIRED = ["grill-with-docs", "to-spec", "to-tickets", "implement", "code-review", "retro"];
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

export async function fetchEngineeringSkillRevision(request: PublicHttpsClient["request"]): Promise<string> {
  const commit = await request(`${REPOSITORY}/commits/main`, "json");
  if (!record(commit) || typeof commit.sha !== "string" || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("Invalid engineering skills revision");
  return commit.sha;
}

/** Fetch one immutable upstream revision. Nothing is installed on partial failure. */
export async function fetchEngineeringSkillBundle(request: PublicHttpsClient["request"]): Promise<EngineeringSkillBundle> {
  const commit = { sha: await fetchEngineeringSkillRevision(request) };
  const tree = await request(`${REPOSITORY}/git/trees/${commit.sha}?recursive=1`, "json");
  if (!record(tree) || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 4096) throw new Error("Incomplete engineering skills tree");
  const entries: Array<{ source: string; id: string; path: string; size: number }> = [];
  for (const entry of tree.tree) {
    if (!record(entry) || typeof entry.path !== "string" || entry.type !== "blob") continue;
    const match = /^skills\/[^/]+\/([a-z0-9][a-z0-9-]*)\/(.+)$/.exec(entry.path);
    if (!match) continue;
    const path = match[2]!;
    if (!/^100(644|755)$/.test(String(entry.mode)) || path.split("/").some((part) => !part || part === "." || part === "..") || /[\\:\x00-\x1f]/.test(path) || typeof entry.size !== "number" || entry.size < 0 || entry.size > 2 * 1024 * 1024) throw new Error("Invalid engineering skills resource");
    if (!/\.(md|txt|json|ya?ml|[cm]?js|tsx?|py|sh|ps1|toml|css)$/i.test(path)) throw new Error("Unsupported engineering skills resource format");
    entries.push({ source: entry.path, id: match[1]!, path, size: entry.size });
  }
  const ids = new Set(entries.filter((entry) => entry.path === "SKILL.md").map((entry) => entry.id));
  if (ids.size > 128 || REQUIRED.some((id) => !ids.has(id)) || entries.length > 1024 || entries.reduce((sum, entry) => sum + entry.size, 0) > 16 * 1024 * 1024) throw new Error("Incomplete or oversized engineering skills bundle");
  const packages = new Map<string, BundleFile[]>();
  for (let offset = 0; offset < entries.length; offset += 4) {
    await Promise.all(entries.slice(offset, offset + 4).filter((entry) => ids.has(entry.id)).map(async (entry) => {
      const content = await request(`https://raw.githubusercontent.com/mattpocock/skills/${commit.sha}/${entry.source}`, "text");
      if (typeof content !== "string" || Buffer.byteLength(content) > 2 * 1024 * 1024 || content.includes("\u0000") || content.includes("\ufffd")) throw new Error("Invalid engineering skills document encoding");
      const files = packages.get(entry.id) ?? [];
      files.push({ path: entry.path.replaceAll("GLOSSARY", "CONTEXT"), content: content.replaceAll("GLOSSARY", "CONTEXT") });
      packages.set(entry.id, files);
    }));
  }
  return { revision: commit.sha, packages: [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([id, files]) => ({ id, files: files.sort((a, b) => a.path.localeCompare(b.path)) })) };
}

/** One user update owns its source snapshot and Host generation until settlement. */
export function createEngineeringSkillUpdater({ getHost, fetchBundle, notify }: {
  getHost: () => Pick<HostProcess, "call" | "generation"> | null;
  fetchBundle: () => Promise<EngineeringSkillBundle>;
  notify: () => void;
}) {
  let pending: Promise<{ revision: string; updated: string[]; preserved: string[] }> | null = null;
  return () => {
    if (pending) return pending;
    const owner = getHost();
    if (!owner) return Promise.reject(new Error("host unavailable"));
    const generation = owner.generation;
    const assertOwner = () => {
      if (getHost() !== owner || owner.generation !== generation) throw new Error("host changed during skill update");
    };
    pending = (async () => {
      await owner.call("updates.assertIdle");
      assertOwner();
      const bundle = await fetchBundle();
      assertOwner();
      const result = await owner.call<{ revision: string; updated: string[]; preserved: string[] }>("skills.updateBundled", bundle);
      assertOwner();
      notify();
      return result;
    })().finally(() => { pending = null; });
    return pending;
  };
}
