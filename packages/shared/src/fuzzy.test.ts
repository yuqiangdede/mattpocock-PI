import { describe, expect, it } from "vitest";
import { compareMatches, fuzzyMatchCommand, fuzzyMatchPath } from "./fuzzy.js";

describe("fuzzyMatchPath", () => {
  it("matches everything on an empty query", () => {
    expect(fuzzyMatchPath("", "src/a.ts")).toEqual({ score: 0, ranges: [] });
    expect(fuzzyMatchPath("", "src", "dir")).toEqual({ score: 10, ranges: [] });
  });

  it("ranks exact file name above prefix above substring above path", () => {
    const exact = fuzzyMatchPath("app.ts", "src/app.ts")!;
    const prefix = fuzzyMatchPath("app", "src/app.test.ts")!;
    const substr = fuzzyMatchPath("pp", "src/app.ts")!;
    const inPath = fuzzyMatchPath("src", "src/other.ts")!;
    expect(exact.score).toBeGreaterThan(prefix.score);
    expect(prefix.score).toBeGreaterThan(substr.score);
    expect(substr.score).toBeGreaterThan(inPath.score);
  });

  it("is case-insensitive and highlights the file-name hit", () => {
    const match = fuzzyMatchPath("APP", "src/App.tsx")!;
    expect(match.ranges).toEqual([[4, 7]]);
  });

  it("matches across separators when the query has a slash", () => {
    const match = fuzzyMatchPath("src/ap", "src/app.ts")!;
    expect(match.score).toBeGreaterThan(0);
    expect(match.ranges).toEqual([[0, 6]]);
  });

  it("falls back to a subsequence with merged ranges", () => {
    const match = fuzzyMatchPath("sapp", "src/app.ts")!;
    expect(match.score).toBe(10);
    expect(match.ranges).toEqual([
      [0, 1],
      [4, 7],
    ]);
  });

  it("returns null when characters are missing", () => {
    expect(fuzzyMatchPath("zzz", "src/app.ts")).toBeNull();
  });

  it("gives directories a bonus at equal quality", () => {
    const dir = fuzzyMatchPath("src", "src", "dir")!;
    const file = fuzzyMatchPath("src", "src")!;
    expect(dir.score).toBe(file.score + 10);
  });
});

describe("fuzzyMatchCommand", () => {
  it("ranks prefix over substring over subsequence", () => {
    const prefix = fuzzyMatchCommand("re", "review")!;
    const substr = fuzzyMatchCommand("vie", "review")!;
    const subseq = fuzzyMatchCommand("rw", "review")!;
    expect(prefix.score).toBeGreaterThan(substr.score);
    expect(substr.score).toBeGreaterThan(subseq.score);
    expect(fuzzyMatchCommand("xyz", "review")).toBeNull();
  });
});

describe("compareMatches", () => {
  it("sorts by score, then length, then lexical", () => {
    const entries = [
      { score: 50, text: "src/bb.ts" },
      { score: 80, text: "src/aa.ts" },
      { score: 50, text: "a.ts" },
      { score: 50, text: "src/ab.ts" },
    ];
    const sorted = [...entries].sort(compareMatches);
    expect(sorted.map((e) => e.text)).toEqual([
      "src/aa.ts",
      "a.ts",
      "src/ab.ts",
      "src/bb.ts",
    ]);
  });
});
