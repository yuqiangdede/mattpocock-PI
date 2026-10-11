import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeSessionList, nativePiSessionPaths } from "./native-pi-session-discovery.js";

const roots: string[] = [];
const directory = async () => { const root = await mkdtemp(join(tmpdir(), "pi-native-discovery-")); roots.push(root); return root; };
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("native session list discovery", () => {
  it("does not import the heavyweight service when no native root exists", async () => {
    const root = await directory();
    const load = vi.fn(async () => ({ list: async () => ["native"] }));
    const list = createNativeSessionList(load, { agentDir: root });
    expect(await list()).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
  it("uses the same explicit root and single loader owner for concurrent lists", async () => {
    const root = await directory();
    const sessionRoot = join(root, "external-sessions");
    await mkdir(sessionRoot);
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const load = vi.fn(async () => { await barrier; return { list: async () => ["native"] }; });
    const list = createNativeSessionList(load, { agentDir: join(root, "agent"), sessionRoot });
    const first = list(); const second = list();
    release();
    expect(await Promise.all([first, second])).toEqual([["native"], ["native"]]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(nativePiSessionPaths({ agentDir: root, sessionRoot }).sessionRoot).toBe(sessionRoot);
  });
  it("does not cache absence: native sessions created later become visible", async () => {
    const root = await directory();
    const load = vi.fn(async () => ({ list: async () => ["created"] }));
    const list = createNativeSessionList(load, { agentDir: root });
    expect(await list()).toEqual([]);
    await mkdir(join(root, "sessions"));
    expect(await list()).toEqual(["created"]);
  });
  it("retains loader failures and permits a later retry", async () => {
    const root = await directory(); await mkdir(join(root, "sessions"));
    const load = vi.fn().mockRejectedValueOnce(new Error("module failure")).mockResolvedValue({ list: async () => [] });
    const list = createNativeSessionList<string>(load, { agentDir: root });
    await expect(list()).rejects.toThrow("module failure");
    expect(await list()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("returns empty for an inaccessible path without loading service", async () => {
    const root = await directory();
    const load = vi.fn(async () => ({ list: async () => [] }));
    const list = createNativeSessionList(load, { sessionRoot: join(root, "missing", "sessions"), agentDir: root });
    expect(await list()).toEqual([]); expect(load).not.toHaveBeenCalled();
  });
});
