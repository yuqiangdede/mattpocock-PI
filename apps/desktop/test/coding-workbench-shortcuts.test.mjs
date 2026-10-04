import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [source, zhCatalog, productSpec] = await Promise.all([
  read("../src/features/coding/CodingWorkbench.tsx"),
  read("../../../packages/i18n/src/locales/zh-CN/index.ts"),
  read("../../../docs/spec/01-product/coding-workbench-free-tasks.md"),
]);

const catalogSource = await read("../../../packages/shared/src/engineering-shortcuts.ts");
const pairs = [...catalogSource.matchAll(/\{ action: "([^"]+)", skill: "([^"]+)" \}/g)]
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
  assert.match(source, /selectShortcut\("ask", "ask-matt"\)/);
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
  assert.match(zhCatalog, /"ask": "咨询下一步"/);
  assert.match(zhCatalog, /"more": "更多"/);
  assert.match(productSpec, /The Ask button inserts `ask-matt`/);
});


test("common actions precede auxiliary navigation and low-frequency menus", () => {
  const primary = source.indexOf('coding-shortcuts coding-shortcuts-primary');
  const secondary = source.indexOf('coding-shortcuts coding-shortcuts-secondary');
  assert.ok(primary < secondary);
  const primaryRow = source.slice(primary, secondary);
  assert.ok(primaryRow.includes('selectShortcut("ask", "ask-matt")'));
  assert.match(primaryRow, /action !== "retro"/);
  assert.deepEqual(pairs.slice(1, 7).filter(([action]) => !["spec", "tickets"].includes(action)).map(([action]) => action), ["discovery", "implement", "diagnose", "review"]);
  assert.ok(source.indexOf('t("coding.formal")', secondary) < source.indexOf('label={t("coding.more")}', secondary));
  const groups = [...source.matchAll(/label: "([^"]+)", actions: \[([^\]]+)\]/g)];
  assert.equal(groups.length, 4);
  const actions = groups.flatMap(group => [...group[2].matchAll(/"([^"]+)"/g)].map(match => match[1]));
  assert.equal(new Set(actions).size, 19);
  assert.deepEqual(new Set(actions), new Set(["initialize", "retro", ...pairs.slice(8, 25).map(([action]) => action)]));
  assert.match(source, /role="group" aria-label=/);
});

test("shortcut rows wrap independently and use consistent regular text", async () => {
  const css = await read("../src/styles/coding-workbench.css");
  assert.match(css, /\.coding-shortcuts[^}]*flex-wrap: wrap/);
  assert.match(css, /\.coding-shortcuts \+ \.coding-shortcuts \{ margin-top: 6px; \}/);
  assert.match(css, /\.coding-shortcuts \.btn \{ font-weight: 400; \}/);
  assert.ok(!css.includes("font-weight: 700"));
  assert.ok(!source.includes("coding-shortcut-emphasized"));
});
