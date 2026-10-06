import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { qualifiedSkillId, parseQualifiedSkillId, resolveShortcutBinding, assertQualifiedSkillMentions, createDefaultShortcutConfiguration, validateShortcutConfiguration, findSkillMentions } = await import("@pi-desktop/shared");
const { qualifiedSkillCommands, loadQualifiedSkill } = await import("../electron/main/extensions/qualified-skill-runtime.ts");
const builtin = { skillId: "review", source: "builtin" };
const global = { skillId: "review", source: "user", sourceId: "global" };
const project = { skillId: "review", source: "user", sourceId: "project" };
const plugin = { skillId: "sample/review", source: "plugin", sourceId: "sample" };
const catalog = () => qualifiedSkillCommands([{ id: "review", name: "Builtin" }], [{ id: "review", name: "User", level: "global" }], [{ id: "sample/review", name: "Plugin", pluginId: "sample" }]);
const userRecord = level => ({ id: "review", name: "User", level, path: "fixture/SKILL.md" });

test("portable codec round-trips every supported source and rejects paths and malformed aliases", () => {
  for (const binding of [builtin, global, project, plugin]) assert.deepEqual(parseQualifiedSkillId(qualifiedSkillId(binding)), binding);
  assert.equal(parseQualifiedSkillId("review"), null);
  for (const binding of [{ skillId: "../../secret", source: "builtin" }, { ...global, sourceId: "C:/user" }, { ...plugin, sourceId: "other" }, { skillId: "review", source: "arbitrary" }]) assert.throws(() => qualifiedSkillId(binding));
  for (const alias of ["ext-skill/user/global/%2e%2e", "ext-skill/user/global/review/extra", "ext-skill/user/global/%72eview", "ext-skill/builtin/global/review"]) assert.throws(() => parseQualifiedSkillId(alias));
  const config = createDefaultShortcutConfiguration(); config.buttons[0].binding = plugin; validateShortcutConfiguration(config);
});
test("same raw id retains both sources; unsourced binding refuses ambiguity and repeated source refuses alias", () => {
  const commands = catalog();
  assert.equal(commands.length, 3);
  assert.throws(() => resolveShortcutBinding({ skillId: "review" }, commands), /歧义/);
  assert.equal(resolveShortcutBinding(global, commands).skillId, qualifiedSkillId(global));
  assert.equal(qualifiedSkillCommands([], [userRecord("global"), userRecord("global")], []).length, 0);
});
test("Skill execution actually loads the chosen body and never falls back to another source", async () => {
  const reads = [];
  const dependencies = {
    catalog: async () => catalog(),
    builtin: id => ({ id, name: "Builtin", body: "BUILTIN BODY", location: "builtin.md" }),
    plugin: id => ({ id, name: "Plugin", body: "PLUGIN BODY", location: "plugin.md" }),
    readUser: async (id, level, root) => { reads.push({ id, level, root }); return { skill: userRecord(level), body: "USER BODY" }; },
  };
  assert.equal((await loadQualifiedSkill(qualifiedSkillId(builtin), "project", dependencies)).body, "BUILTIN BODY");
  assert.equal((await loadQualifiedSkill(qualifiedSkillId(global), "project", dependencies)).body, "USER BODY");
  assert.equal((await loadQualifiedSkill(qualifiedSkillId(plugin), "project", dependencies)).body, "PLUGIN BODY");
  assert.deepEqual(reads, [{ id: "review", level: "global", root: "project" }]);
  assert.equal(await loadQualifiedSkill("review", "project", dependencies), null);
  await assert.rejects(loadQualifiedSkill(qualifiedSkillId(global), "project", { ...dependencies, readUser: async () => ({ skill: userRecord("project"), body: "WRONG PROJECT BODY" }) }), /来源/);
});
test("global binding is unavailable after project shadowing; project binding reads project body", async () => {
  const dependencies = {
    catalog: async () => qualifiedSkillCommands([], [userRecord("project")], []),
    builtin: () => { throw new Error("must never fall back"); }, plugin: () => { throw new Error("must never fall back"); },
    readUser: async (id, level, root) => { assert.equal(level, "project"); assert.equal(root, "active-project"); return { skill: userRecord("project"), body: "PROJECT BODY" }; },
  };
  await assert.rejects(loadQualifiedSkill(qualifiedSkillId(global), "active-project", dependencies), /不可用/);
  assert.equal((await loadQualifiedSkill(qualifiedSkillId(project), "active-project", dependencies)).body, "PROJECT BODY");
});
test("disabled plugin and source changes during RPC fail closed without exposing body", async () => {
  let checks = 0;
  await assert.rejects(loadQualifiedSkill(qualifiedSkillId(global), null, {
    catalog: async () => ++checks === 1 ? catalog() : [], builtin: () => null, plugin: () => { throw new Error("never"); },
    readUser: async () => ({ skill: userRecord("global"), body: "STALE BODY" }),
  }), /不可用/);
  await assert.rejects(loadQualifiedSkill(qualifiedSkillId(plugin), null, { catalog: async () => [], builtin: () => null, plugin: () => { throw new Error("never"); }, readUser: async () => { throw new Error("never"); } }), /不可用/);
});
test("send-time qualified validation detects disappeared aliases and mentions carry exact tool id", () => {
  const id = qualifiedSkillId(global), commands = catalog();
  assertQualifiedSkillMentions(`/${id} request`, commands);
  const mentions = findSkillMentions(`/${id} request`, new Map(commands.map(command => [command.name, command.skillId])));
  assert.equal(mentions[0].id, id);
  assert.throws(() => assertQualifiedSkillMentions(`request /${id}`, []), /不可用/);
  assert.doesNotThrow(() => assertQualifiedSkillMentions("/review request", []));
});
test("reserved aliases cannot collide with actual skill identities", () => {
  const alias = qualifiedSkillId(global);
  assert.equal(qualifiedSkillCommands([], [userRecord("global")], [{ id: alias, pluginId: "ext-skill", name: "Collision" }]).length, 0);
});
