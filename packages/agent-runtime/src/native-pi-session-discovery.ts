import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type NativePiSessionPaths = { agentDir: string; sessionRoot: string };

/** The service and discovery guard share one default/root resolution rule. */
export function nativePiSessionPaths(options: Partial<NativePiSessionPaths> = {}): NativePiSessionPaths {
  const agentDir = resolve(options.agentDir ?? join(homedir(), ".pi", "agent"));
  return { agentDir, sessionRoot: resolve(options.sessionRoot ?? join(agentDir, "sessions")) };
}

/** Avoid importing the full Pi SDK just to discover that no sessions exist. */
export function createNativeSessionList<T>(
  load: () => Promise<{ list(): Promise<T[]> }>,
  options: Partial<NativePiSessionPaths> = {},
): () => Promise<T[]> {
  const { sessionRoot } = nativePiSessionPaths(options);
  let service: Promise<{ list(): Promise<T[]> }> | undefined;
  return async () => {
    // Match NativePiSessionService.list's existing unavailable-root result.
    // Recheck on every call: a native CLI may create or remove this root later.
    try { await realpath(sessionRoot); } catch { return []; }
    service ??= load().catch(error => {
      service = undefined;
      throw error;
    });
    return (await service).list();
  };
}
