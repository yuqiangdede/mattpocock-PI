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
  assert.match(zhCatalog, /"more": "更多功能"/);
  assert.match(productSpec, /The Ask button inserts `ask-matt`/);
});


test("coding shortcuts keep navigation and engineering actions in separate ordered rows", () => {
  const rows = source.split('<div className="coding-shortcuts coding-shortcuts-primary">');
  assert.equal(rows.length, 2);
  const firstRow = rows[0].slice(rows[0].indexOf('<div className="coding-shortcuts">'));
  // Multiline navigation labels follow the same DOM order as the menu trigger.
  const positions = ["ask", "initialize", "formal", "more"].map(label => firstRow.indexOf('t("coding.' + label + '")'));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(rows[1], /filter\(\(\{ action \}\) => action !== "initialize"/);
  assert.deepEqual(pairs.slice(1, 8).map(([action]) => action), ["discovery", "spec", "tickets", "implement", "diagnose", "review", "retro"]);
  assert.match(rows[1], /\["implement", "diagnose"\]\.includes\(action\)/);
});

test("shortcut rows wrap independently and only priority actions use bold text", async () => {
  const css = await read("../src/styles/coding-workbench.css");
  assert.match(css, /\.coding-shortcuts[^}]*flex-wrap: wrap/);
  assert.match(css, /\.coding-shortcuts \+ \.coding-shortcuts \{ margin-top: 6px; \}/);
  assert.match(css, /\.coding-shortcuts \.btn \{ font-weight: 400; \}/);
  assert.match(css, /\.coding-shortcuts \.coding-shortcut-emphasized \{ font-weight: 700; \}/);
});
