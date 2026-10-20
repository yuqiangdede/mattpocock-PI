import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, vi } from "vitest";
import { bundleAgentRuntime, renameBundleDirectory } from "./bundle.mjs";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: actual.default ?? actual, rename: vi.fn(actual.rename) };
});

test.skipIf(process.platform !== "win32")("bundle installation survives a transient Windows rename denial", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "pi-bundle-rename-"));
  const output = join(root, "dist-bundle");
  const rename = fs.rename;
  let denied = false;
  await fs.mkdir(output);
  await fs.writeFile(join(output, "previous.txt"), "previous bundle");
  const { rename: mockedRename } = await import("node:fs/promises");
  vi.mocked(mockedRename).mockImplementation(async (source, destination) => {
    if (!denied && source.includes(".dist-bundle-stage-") && destination === output) {
      denied = true;
      throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
    }
    return rename(source, destination);
  });
  try {
    await bundleAgentRuntime(output);
    assert.equal(denied, true);
    assert.equal(JSON.parse(await fs.readFile(join(output, "package.json"), "utf8")).type, "module");
    assert.ok((await fs.stat(join(output, "sidecar.js"))).size > 1000);
    assert.deepEqual(await fs.readdir(root), ["dist-bundle"]);
  } finally {
    vi.mocked(mockedRename).mockReset();
    await fs.rm(root, { recursive: true, force: true });
  }
});

for (const code of ["EPERM", "EBUSY", "EACCES"]) {
  test(`bundle installation preserves previous output after persistent ${code}`, async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "pi-bundle-rollback-"));
    const output = join(root, "dist-bundle");
    const rename = fs.rename;
    const failure = Object.assign(new Error(code), { code });
    let attempts = 0;
    await fs.mkdir(output);
    await fs.writeFile(join(output, "previous.txt"), "previous bundle");
    const { rename: mockedRename } = await import("node:fs/promises");
    vi.mocked(mockedRename).mockImplementation(async (source, destination) => {
      if (source.includes(".dist-bundle-stage-") && destination === output) {
        attempts += 1;
        throw failure;
      }
      return rename(source, destination);
    });
    try {
      await assert.rejects(bundleAgentRuntime(output), (error) => error === failure);
      assert.equal(attempts, process.platform === "win32" && code !== "EACCES" ? 6 : 1);
      assert.equal(await fs.readFile(join(output, "previous.txt"), "utf8"), "previous bundle");
      assert.deepEqual(await fs.readdir(root), ["dist-bundle"]);
    } finally {
      vi.mocked(mockedRename).mockReset();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}

for (const code of ["EPERM", "EBUSY"]) {
  test(`Windows rename recovers after transient ${code} on every test platform`, async () => {
    const failure = Object.assign(new Error(code), { code });
    const renameDirectory = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);
    await renameBundleDirectory("stage", "output", { platform: "win32", renameDirectory, wait });
    assert.deepEqual(renameDirectory.mock.calls, [["stage", "output"], ["stage", "output"]]);
    assert.deepEqual(wait.mock.calls, [[100]]);
  });

  test(`Windows rename exhausts its bounded ${code} retry budget`, async () => {
    const failure = Object.assign(new Error(code), { code });
    const renameDirectory = vi.fn().mockRejectedValue(failure);
    const wait = vi.fn().mockResolvedValue(undefined);
    await assert.rejects(
      renameBundleDirectory("stage", "output", { platform: "win32", renameDirectory, wait }),
      (error) => error === failure,
    );
    assert.equal(renameDirectory.mock.calls.length, 6);
    assert.deepEqual(wait.mock.calls, [[100], [200], [300], [400], [500]]);
  });
}

for (const [platform, code] of [["linux", "EPERM"], ["darwin", "EBUSY"], ["win32", "EACCES"], ["win32", "ENOENT"]]) {
  test(`${platform} rename fails immediately for ${code}`, async () => {
    const failure = Object.assign(new Error(code), { code });
    const renameDirectory = vi.fn().mockRejectedValue(failure);
    const wait = vi.fn().mockResolvedValue(undefined);
    await assert.rejects(
      renameBundleDirectory("stage", "output", { platform, renameDirectory, wait }),
      (error) => error === failure,
    );
    assert.equal(renameDirectory.mock.calls.length, 1);
    assert.equal(wait.mock.calls.length, 0);
  });
}
