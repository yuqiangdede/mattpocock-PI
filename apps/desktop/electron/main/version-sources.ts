import { UPSTREAM_BASELINE } from "../../../../packages/shared/src/upstream";
import type { VersionSourceId, VersionSourceState } from "../../../../packages/shared/src/version-sources";
import type { UpdateChannel } from "@pi-desktop/shared";
import { APP_REPOSITORY, UPSTREAM_REPOSITORY } from "../../../../packages/shared/src/protocol";

export const VERSION_REPOSITORIES = {
  "pi-desktop": UPSTREAM_REPOSITORY,
  "mattpocock-skills": "mattpocock/skills",
  "mattpocock-pi": APP_REPOSITORY,
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 数字版本与预发布标识分别比较，避免把旧版误报为可更新版本。
export function compareReleaseVersions(left: string, right: string): number | null {
  const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(value);
  const a = parse(left), b = parse(right);
  if (!a || !b) return null;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff) return Math.sign(diff);
  }
  if (!a[4] || !b[4]) return a[4] === b[4] ? 0 : a[4] ? -1 : 1;
  const ap = a[4].split("."), bp = b[4].split(".");
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i], y = bp[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return Math.sign(Number(x) - Number(y));
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function createVersionSourceChecker({ request, appVersion, upstreamVersion = UPSTREAM_BASELINE.version, skillVersion, getChannel }: {
  request: (url: string, kind: "json") => Promise<unknown>;
  appVersion: string;
  upstreamVersion?: string;
  skillVersion: () => Promise<string | null>;
  getChannel?: () => UpdateChannel;
}) {
  const cache = new Map<VersionSourceId, VersionSourceState>();
  const pending = new Map<VersionSourceId, Promise<VersionSourceState>>();
  const initial = (id: VersionSourceId): VersionSourceState => ({
    id, currentVersion: id === "mattpocock-skills" ? null : id === "pi-desktop" ? upstreamVersion : appVersion,
    latestVersion: null, status: "idle", checkedAt: null,
    url: `https://github.com/${VERSION_REPOSITORIES[id]}${id === "mattpocock-skills" ? "" : "/releases"}`,
  });
  return {
    async list(): Promise<VersionSourceState[]> {
      const rows = (["mattpocock-skills", "mattpocock-pi"] as const).map((id) => ({ ...(cache.get(id) ?? initial(id)) }));
      // 当前技能版本只读取 Host 清单，不联网也不安装。
      const skills = rows.find((row) => row.id === "mattpocock-skills")!;
      try { skills.currentVersion = await skillVersion(); } catch { skills.currentVersion = null; }
      if (skills.latestVersion && skills.status !== "error") skills.status = skills.currentVersion === skills.latestVersion ? "current" : "different";
      return rows;
    },
    check(id: VersionSourceId): Promise<VersionSourceState> {
      if (!Object.hasOwn(VERSION_REPOSITORIES, id)) return Promise.reject(new Error("Invalid version source"));
      const existing = pending.get(id);
      if (existing) return existing;
      const operation = (async () => {
        const row = initial(id);
        try {
          if (id === "mattpocock-skills") {
            row.currentVersion = await skillVersion();
            const commit = await request(`https://api.github.com/repos/${VERSION_REPOSITORIES[id]}/commits/main`, "json");
            if (!record(commit) || typeof commit.sha !== "string" || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("Invalid skill revision response");
            row.latestVersion = commit.sha;
            row.status = row.currentVersion === commit.sha ? "current" : "different";
          } else {
            const releases = await request(`https://api.github.com/repos/${VERSION_REPOSITORIES[id]}/releases?per_page=100`, "json");
            if (!Array.isArray(releases)) throw new Error("Invalid release response");
            // Select by semantic version rather than API response order.
            const published = releases.filter((release) => record(release) && release.draft === false);
            const channel = getChannel?.() ?? (appVersion.includes("-") ? "prerelease" : "stable");
            const latest = published.filter((release) => typeof release.tag_name === "string"
              && compareReleaseVersions(release.tag_name, appVersion) !== null
              && (release.prerelease === false || (id === "mattpocock-pi" && channel === "prerelease")))
              .sort((a, b) => compareReleaseVersions(String(b.tag_name), String(a.tag_name)) ?? 0)[0];
            if (!latest) row.status = "no-release";
            else {
              if (typeof latest.tag_name !== "string") throw new Error("Invalid release tag");
              row.latestVersion = latest.tag_name;
              const comparison = compareReleaseVersions(latest.tag_name, row.currentVersion!);
              row.status = comparison === null ? "different" : comparison > 0 ? "available" : "current";
            }
          }
        } catch (error) {
          row.status = "error";
          row.error = error instanceof Error ? error.message : String(error);
        }
        row.checkedAt = new Date().toISOString();
        cache.set(id, row);
        return row;
      })().finally(() => pending.delete(id));
      pending.set(id, operation);
      return operation;
    },
  };
}
