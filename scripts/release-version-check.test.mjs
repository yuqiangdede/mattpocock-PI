import assert from "node:assert/strict";
import test from "node:test";
import { resolveReleaseDocumentCheck } from "./release-version-check.mjs";

test("defaults a prerelease to its stable documentation without changing version surfaces", () => {
  assert.deepEqual(resolveReleaseDocumentCheck("0.16.0-beta.1"), {
    documentVersion: "0.16.0",
    surfaceVersion: "0.16.0-beta.1",
    isPrereleasePreview: true,
  });
});

test("checks a stable release against one aligned version", () => {
  assert.deepEqual(resolveReleaseDocumentCheck("0.15.2", "0.15.2"), {
    documentVersion: "0.15.2",
    surfaceVersion: "0.15.2",
    isPrereleasePreview: false,
  });
});

test("checks a prerelease preview against its stable documentation version", () => {
  assert.deepEqual(resolveReleaseDocumentCheck("0.15.2-beta.2", "0.15.2"), {
    documentVersion: "0.15.2",
    surfaceVersion: "0.15.2-beta.2",
    isPrereleasePreview: true,
  });
});

test("does not hide a mismatched requested version", () => {
  assert.deepEqual(resolveReleaseDocumentCheck("0.15.2-beta.2", "0.15.1"), {
    documentVersion: "0.15.1",
    surfaceVersion: "0.15.1",
    isPrereleasePreview: false,
  });
});
