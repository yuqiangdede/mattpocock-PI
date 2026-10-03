export type VersionSourceId = "pi-desktop" | "mattpocock-skills" | "mattpocock-pi";

export type VersionSourceState = {
  id: VersionSourceId;
  currentVersion: string | null;
  latestVersion: string | null;
  status: "idle" | "current" | "available" | "different" | "no-release" | "error";
  url: string;
  checkedAt: string | null;
  error?: string;
};
