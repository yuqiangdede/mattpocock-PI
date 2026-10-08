# Agent defaults and Hikvision setup

## Changes

- The unsaved Agent permission default is Full Auto. Existing explicit global
  and session choices are retained; no settings migration is performed.
- Model setup offers **Hikvision (custom model)** with
  `http://lanz.hikvision.com/v3/openai/model/v1` and OpenAI Chat Completions.
- The user enters their own SK (API Key), chooses a discovered model, and saves.
  If discovery fails, they can add a model ID manually. No key is bundled.
- Onboarding asks the user to enter the SK directly. Editing retains the saved
  key when the key field is blank.

## Verification

The existing workspace toolchain is reused. Targeted checks cover the real
provider form in isolated Electron/Chromium with mocked external APIs, Host
permission inheritance, tool execution and explicit choice precedence.
`node scripts/e2e-agent-default-permissions.mjs` verifies the permission path
through a real isolated Host process; `PI_DESKTOP_HOST_BIN` selects its binary.
`node scripts/e2e-provider-api-style.mjs` verifies both discovered and manually
entered models in English and Simplified Chinese.

Real Hikvision connectivity and credentials are not part of the offline tests.
Full Auto affects permission prompts; agent clarification questions and Plan
tool restrictions remain separate.
