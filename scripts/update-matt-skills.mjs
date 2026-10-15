import { mkdir, mkdtemp, rename, writeFile, rmdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchEngineeringSkillBundle } from "../apps/desktop/electron/main/engineering-skill-update.ts";
import { readMattSkillBundle } from "./lib/matt-skills.mjs";

/** Stage the complete snapshot before replacing source; retain the previous tree. */
export async function updateMattSkills(directory, request = requestMattSkills) {
  const lock = join(dirname(directory), ".matt-update-lock");
  await mkdir(lock);
  try { return await replaceMattSkills(directory, request); }
  finally { await rmdir(lock); }
}

async function replaceMattSkills(directory, request) {
  const before = readMattSkillBundle(directory);
  const bundle = await fetchEngineeringSkillBundle(request);
  for (const pkg of bundle.packages) {
    const document = pkg.files.find(file => file.path === "SKILL.md")?.content ?? "";
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(document);
    const name = front?.[1].match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];
    if (name !== pkg.id || !front?.[2].trim() || Buffer.byteLength(document) > 128 * 1024 || pkg.files.length > 256) throw new Error(`Invalid Matt skill document: ${pkg.id}`);
  }
  const license = await request(`https://raw.githubusercontent.com/mattpocock/skills/${bundle.revision}/LICENSE`, "text");
  if (typeof license !== "string" || !license.includes("MIT License")) throw new Error("Missing upstream MIT license");
  const scratch = await mkdtemp(join(dirname(directory), ".matt-update-"));
  const staged = join(scratch, "next"), backup = join(scratch, "previous");
  await mkdir(staged);
  for (const pkg of bundle.packages) for (const file of pkg.files) {
    const target = join(staged, pkg.id, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, { flag: "wx" });
  }
  await writeFile(join(staged, "REVISION"), bundle.revision + "\n");
  await writeFile(join(staged, "LICENSE"), license);
  readMattSkillBundle(staged);
  if (!isDeepStrictEqual(readMattSkillBundle(directory), before)) throw new Error("Matt skill source changed during download; retry after reviewing local edits");
  await rename(directory, backup);
  try { await rename(staged, directory); }
  catch (error) { await rename(backup, directory); throw error; }
  return { revision: bundle.revision, packages: bundle.packages.length, backup };
}

async function requestMattSkills(url, kind) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["api.github.com", "raw.githubusercontent.com"].includes(parsed.hostname)) throw new Error("Unexpected Matt skills URL");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "PI-Desktop-Matt-Skills", Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Matt skills download failed: HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 4 * 1024 * 1024) throw new Error("Matt skills response too large");
    chunks.push(chunk);
  }
  const content = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  return kind === "json" ? JSON.parse(content) : content;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(import.meta.dirname, "../apps/desktop/resources/skills/matt");
  const result = await updateMattSkills(directory);
  console.log(`Updated ${result.packages} Matt skills to ${result.revision}. Previous source retained at ${result.backup}`);
}
