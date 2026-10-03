import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [source, zhCatalog, productSpec] = await Promise.all([
  read("../src/features/coding/CodingWorkbench.tsx"),
  read("../../../packages/i18n/src/locales/zh-CN/index.ts"),
  read("../../../docs/spec/01-product/coding-workbench-free-tasks.md"),
]);

const pairs = [...source.matchAll(/\{ action: "([^"]+)", skill: "([^"]+)" \}/g)]
  .map((match) => [match[1], match[2]]);

test("coding workbench keeps the eight primary skill shortcuts", () => {
  assert.deepEqual(pairs.slice(0, 8).map(([, skill]) => skill), [
    "setup-matt-pocock-skills",
    "grill-with-docs",
    "to-spec",
    "to-tickets",
    "implement",
    "diagnosing-bugs",
    "code-review",
    "retro",
  ]);
});

test("coding workbench exposes ask-matt and the remaining Matt skills", () => {
  assert.match(source, /onSelect\("ask-matt"\)/);
  assert.match(source, /menuClassName="context-menu coding-more-menu"/);
  for (const skill of [
    "grill-me",
    "grilling",
    "handoff",
    "prototype",
    "improve-codebase-architecture",
    "codebase-design",
    "domain-modeling",
    "tdd",
    "wayfinder",
    "triage",
    "research",
    "resolving-merge-conflicts",
    "teach",
    "to-questionnaire",
    "wait-what",
    "wizard",
    "writing-for-agents",
  ]) {
    assert.ok(pairs.some(([, candidate]) => candidate === skill), `missing ${skill}`);
  }
  assert.match(zhCatalog, /"initialize": "初始化"/);
  assert.match(zhCatalog, /"ask": "询问"/);
  assert.match(zhCatalog, /"more": "更多"/);
  assert.match(productSpec, /The Ask button inserts `ask-matt`/);
});
