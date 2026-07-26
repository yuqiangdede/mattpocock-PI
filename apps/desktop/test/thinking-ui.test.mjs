import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composerSource = await readFile(
  new URL("../src/components/Composer.tsx", import.meta.url),
  "utf8",
);
const transcriptSource = await readFile(
  new URL("../src/components/ChatTranscript.tsx", import.meta.url),
  "utf8",
);
const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const mainSource = await readFile(
  new URL("../electron/main/index.ts", import.meta.url),
  "utf8",
);
// Provider thinking config lives in the provider settings components, not the
// settings page shell.
const settingsSource = (
  await Promise.all(
    [
      "../src/components/settings/ProvidersSection.tsx",
      "../src/components/settings/ProviderDialog.tsx",
      "../src/components/settings/provider-form.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  )
).join("\n");
const stylesSource = await readFile(
  new URL("../src/styles/globals.css", import.meta.url),
  "utf8",
);

test("composer exposes the runtime thinking level order and provider filtering", () => {
  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
    assert.match(composerSource, new RegExp(`"${level}"`));
  }
  assert.match(composerSource, /supportedThinkingLevels/);
  assert.match(composerSource, /supportsReasoning/);
  assert.match(composerSource, /thinkingLevelForProvider/);
  assert.match(composerSource, /thinkingLevel:\s*level/);
  assert.match(composerSource, /composer-thinking-levels/);
  assert.match(composerSource, /composer-thinking-section[\s\S]*providers/);
});

test("compatible providers can enable thinking from the model menu", () => {
  assert.match(composerSource, /canEnableThinkingOverride/);
  assert.match(composerSource, /supportsReasoning:\s*true/);
  assert.match(composerSource, /chat\.thinkingEnable/);
  assert.match(composerSource, /await refreshProviders\(\)/);
});

test("switching to a provider without reasoning resets the session level", () => {
  assert.match(
    composerSource,
    /if\s*\(!provider\?\.supportsReasoning\)\s*return\s*"off"/,
  );
  assert.match(composerSource, /thinkingLevel:\s*thinkingLevelForProvider\(/);
});

test("main resolves reasoning from each session's exact selected model", () => {
  assert.match(mainSource, /function enrichSession/);
  assert.match(mainSource, /modelId:\s*session\.modelId/);
  assert.match(mainSource, /sessions:\s*result\.sessions\.map/);
  assert.match(mainSource, /enrichProvider\(provider, modelId\)/);
  // Discovered models are stamped with reasoning capability per model id.
  assert.match(mainSource, /thinking\.supportsReasoning/);
  assert.match(mainSource, /capabilities\.add\("reasoning"\)/);
  assert.match(mainSource, /capabilities\.delete\("reasoning"\)/);
});

test("transcript keeps assistant thinking in a separate disclosure", () => {
  assert.match(transcriptSource, /className="thinking-disclosure-header"/);
  assert.match(transcriptSource, /aria-expanded=\{open\}/);
  assert.match(transcriptSource, /aria-hidden=\{!open\}/);
  assert.match(transcriptSource, /inert=\{!open\}/);
  assert.match(transcriptSource, /IconSparkles/);
  assert.match(transcriptSource, /message\.thinking/);
  assert.match(transcriptSource, /Markdown source=\{thinking\}/);
  assert.match(transcriptSource, /CopyButton text=\{message\.content\}/);
  assert.match(transcriptSource, /!thinkingText\(message\)/);
  assert.match(transcriptSource, /thinkingText\(lastVisibleMessage\)/);
  assert.match(stylesSource, /\.thinking-disclosure-body[\s\S]*border-left/);
  assert.match(stylesSource, /\.thinking-prose/);
});

test("thinking-only assistant streams open the transcript surface", () => {
  assert.match(appSource, /typeof m\.thinking === "string"/);
  assert.match(appSource, /hasContent \|\| hasThinking/);
});

test("settings exposes thinking mode presets and sparse levels", () => {
  assert.match(settingsSource, /thinkingMode/);
  assert.match(settingsSource, /thinkingModeToggle/);
  assert.match(settingsSource, /thinkingModeGraded/);
  assert.match(settingsSource, /supportedThinkingLevels/);
  assert.match(settingsSource, /\["off", "high"\]/);
  assert.match(settingsSource, /levelsForThinkingMode/);
});

test("main forwards provider supportedThinkingLevels into capability resolution", () => {
  assert.match(
    mainSource,
    /supportedThinkingLevels:\s*provider\.supportedThinkingLevels/,
  );
  assert.match(
    mainSource,
    /supportedThinkingLevels:\s*provider\?\.supportedThinkingLevels/,
  );
});
