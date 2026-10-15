import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { builtinSkills, loadBuiltinSkillBody } = await import("../electron/main/builtin-skills.ts");
const { executeCodingAction } = await import("../src/features/coding/execute-coding-action.ts");
const { DOCUMENT_SHORTCUTS, documentPromptKey } = await import("../src/features/coding/document-shortcuts.ts");
const { en } = await import("../../../packages/i18n/src/locales/en/index.ts");
const { zhCN } = await import("../../../packages/i18n/src/locales/zh-CN/index.ts");
const { createComposerCommandService } = await import("../electron/main/ipc/composer-ipc.ts");
const { findSkillMentions } = await import("@pi-desktop/shared");

test("shipped document catalog prepares editable drafts and loads complete Skill resources", async () => {
  const skills = builtinSkills({ workspacePath: null });
  const service = createComposerCommandService({
    plugins: { listLoaded: () => [], getSkills: () => [], getCommands: () => [] },
    agentExtensions: { allCommands: () => [] }, activeUserSkills: async () => [],
    pluginActiveInProject: () => false, loadComposerTemplatesCached: async () => [],
  });
  const catalog = await service.buildComposerCommands(null);
  for (const doc of DOCUMENT_SHORTCUTS) {
    const id = doc.skillId;
    assert.ok(skills.find(skill => skill.id === id)?.description);
    for (const locale of [en, zhCN]) {
      assert.equal(documentPromptKey(id), `coding.prompts.${doc.promptKey}`);
      const prompt = locale.coding.prompts[doc.promptKey];
      assert.ok(prompt);
      let draft = "Existing request";
      await executeCodingAction("document", {
        sessionId: "session", projectPath: "project",
        configuration: { schemaVersion: 1, actions: [{ id: "document", label: locale.codingActions[doc.labelKey], skillId: id }] },
        catalog: async () => catalog, isCurrent: () => true, defaultPrompt: () => prompt,
        readLiveDraft: () => draft, applyDraft: text => { draft = text; },
      });
      assert.equal(draft, `/skill:${id} ${prompt}\n\nExisting request`);
      const mentions = findSkillMentions(draft, new Map(catalog.filter(command => command.kind === "skill").map(command => [command.name, command.skillId])));
      assert.equal(mentions[0]?.id, id, "manual Send resolves the bundled skill through native mention parsing");
    }
    const loaded = loadBuiltinSkillBody(id);
    assert.ok(loaded?.body);
    assert.ok(!loaded.body.startsWith("---"));
    assert.ok(existsSync(join(dirname(loaded.location), "agents/openai.yaml")));
    for (const [, reference] of loaded.body.matchAll(/\]\(((?:references|scripts)\/[^)#]+)(?:#[^)]*)?\)/g)) {
      assert.ok(existsSync(join(dirname(loaded.location), reference)), `missing ${id}/${reference}`);
    }
  }
  const converter = loadBuiltinSkillBody("pi-desktop:markdown-to-docx");
  assert.ok(converter?.body);
  assert.ok(readFileSync(join(dirname(converter.location), "scripts/convert.py"), "utf8").includes("pandoc"));
  for (const locale of [en, zhCN]) assert.ok(locale.coding.prompts.mergeConvert.includes("pi-desktop:markdown-to-docx"));
  assert.equal(loadBuiltinSkillBody("pi-desktop/../../unknown"), null);
  assert.equal(documentPromptKey("custom"), undefined);
});

test("packaging recursively includes document skill resources", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(manifest.build.extraResources.some(entry => entry.from === "resources/skills" && entry.to === "skills" && !entry.filter));
});

test("packaged resource resolver needs no user import or source-machine directory", async t => {
  const resources = await mkdtemp(join(tmpdir(), "pi-document-resources-"));
  const previous = Object.getOwnPropertyDescriptor(process, "resourcesPath");
  t.after(async () => {
    if (previous) Object.defineProperty(process, "resourcesPath", previous);
    else delete process.resourcesPath;
    await rm(resources, { recursive: true, force: true });
  });
  await cp(new URL("../resources/skills/", import.meta.url), join(resources, "skills"), { recursive: true });
  Object.defineProperty(process, "resourcesPath", { configurable: true, value: resources });
  for (const name of ["requirements-spec", "overall-design", "outline-design", "api-integration-docs", "database-design-doc", "component-doc-merge", "markdown-to-docx"]) {
    const id = `pi-desktop:${name}`;
    assert.ok(builtinSkills({}).some(skill => skill.id === id));
    const loaded = loadBuiltinSkillBody(id);
    assert.equal(loaded.location, join(resources, "skills", name, "SKILL.md"));
    assert.ok(loaded.body.length > 100);
  }
});
