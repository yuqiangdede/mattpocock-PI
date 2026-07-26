# 04. Data Storage (Schema v6)

## 0. Ownership decision

**Rust host-core owns SQLite exclusively (D002).**

- Node pi sidecar does not open the DB directly
- Electron main does not write DB files directly
- All persistent app data — sessions, settings, providers, scheduled tasks,
  artifacts, notifications, audit — goes through host RPC. (v1 violation
  fixed: scheduled tasks previously lived in an Electron-owned
  `scheduled-tasks.json`.)

## 1. Goals

Local-first, recoverable after restart, sensitive data isolated — plus, for v6:

1. **Lossless transcripts** — store the runtime message shape (content blocks),
   not the UI projection; UI shapes are derived at the RPC boundary.
2. **High performance** — O(1) appends, covering indexes for every hot query,
   integer times, single-writer WAL, no JSON scans on hot paths.
3. **Minimal** — one database file, 14 ordinary tables plus one FTS virtual
   table, no dead relations, every relation has a current or explicitly
   spec'd consumer.
4. **Extensible without migrations** where cheap (block vocabulary, kv
   namespaces, `config_json` columns), **with migrations** where structural
   (new entities), versioned by `PRAGMA user_version`.

## 2. File layout

```text
~/.pi-desktop/
 ├── pi.sqlite            # THE database (WAL: + -wal/-shm) — host-core only
 ├── pi.sqlite.v1.bak     # one-shot backup created by the v1→v2 migration
 ├── secrets/             # encrypted secret blobs + .machine-key (unchanged)
 ├── attachments/         # content-addressed blobs (sha256 name), refs from messages
 ├── plugins/             # code + data + registry.json (unchanged, spec 07-11)
 ├── logs/                # NDJSON app/host/agent logs (D082)
 ├── cache/               # disposable caches
 └── scratch/<sessionId>/ # per-session agent temp files (D114) — deleted with
                          # the session; startup sweep removes orphans/stale
```

Supersedes the v1 sketch of split `settings.sqlite` / `sessions.sqlite`: a
single file keeps cross-entity writes transactional (e.g. session + turn +
artifact in one commit) and halves fsync/fd overhead. The DB stores **no large
blobs**: attachments and tool outputs beyond the limits of
[16-tool-result-limits](16-tool-result-limits.md) live on disk, referenced by
path/hash.

## 3. Connection bootstrap

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;      -- durable enough under WAL; app-crash safe
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -16000;       -- 16 MB page cache
PRAGMA trusted_schema = ON;       -- required by the FTS triggers (§4.8); the DB
                                  -- is app-owned at a fixed path, never an
                                  -- untrusted input, so schema trust is safe
PRAGMA auto_vacuum = INCREMENTAL; -- set at creation, before any table
```

- Schema version lives in `PRAGMA user_version` (v6 = `6`). The v1 `meta`
  table is gone.
- host-core is the **single writer**; statements use `prepare_cached`; every
  multi-row write runs in one transaction.
- Boot sweep: `UPDATE turns SET status='aborted', ended_at=:now WHERE
  status='running'` (crash recovery), then `PRAGMA incremental_vacuum` and
  audit retention pruning (§9).

## 4. Schema

### 4.1 kv — namespaced configuration

Replaces v1 `settings` + `meta`, and hosts plugin settings (spec 07-11 §5).

```sql
CREATE TABLE kv (
  ns         TEXT NOT NULL,
  key        TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (ns, key)
) WITHOUT ROWID;
```

| ns | contents |
|---|---|
| `app` | the settings blob (`settings.get/set`), `currentProjectId` |
| `ui` | non-critical UI state the renderer asks the host to keep |
| `cache` | model-refresh stamps, recent model refs (spec 13 §3) |
| `plugin:<id>` | per-plugin settings; uninstall = `DELETE WHERE ns = ?` |

New config domains (e.g. MCP servers) start as a namespace; they graduate to
tables only when they need relations or indexes.

#### Renderer sidebar preferences (D093)

Sidebar organization is non-authoritative presentation state stored
best-effort under renderer localStorage key
`pi.desktop.sidebarPreferences`:

```ts
type SidebarPreferences = {
  sessionMeta: Record<string, {
    pinned?: boolean;
    archived?: boolean;
    order?: number; // compatibility/future manual order
  }>;
  projectMeta: Record<string, {
    pinned?: boolean;
    archived?: boolean;
    collapsed?: boolean;
    order?: number; // compatibility/future manual order
  }>;
  projectSort: "recent" | "created" | "oldest" | "name" | "manual";
  sessionView: {
    sort: "recent" | "created" | "oldest" | "name" | "manual";
    archived: boolean;
  };
  openProjectPaths: string[];
};
```

- Project keys and retained paths use normalized full paths; session keys use
  durable session ids. Duplicate/slash-variant paths are discarded on load.
- `manual`/`order` are compatibility fields. This baseline exposes no
  drag/manual-reorder interaction; values without a usable order fall back to
  a stable recent ordering.
- Missing, malformed, or unwritable preferences fall back to empty metadata,
  `recent`, archived hidden, and the host-selected project. Preference failure
  never blocks a host operation.
- The record never contains transcript content, tool arguments, provider
  configuration, or secrets. Clearing it changes presentation only.
- `openProjectPaths` retains sidebar tabs. The selected workspace remains
  host-owned `kv(app, currentProjectId)` and is restored through
  `workspace.get`; the renderer does not persist a competing active path.

### 4.2 projects — places work happens

Replaces the v1 `workspace` singleton. Feeds the Projects index page (D066),
sidebar group-by-project (benchmark §3.8), and future per-project defaults.

```sql
CREATE TABLE projects (
  id             INTEGER PRIMARY KEY,
  path           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  pinned         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL
);
```

- Rows are auto-upserted by path whenever a workspace is opened, a session is
  created with a project path, or an import references one.
- Project paths are trimmed, separators are normalized to `/`, and trailing
  separators are removed before the unique-path upsert. Imports therefore
  materialize one durable logical project directory per distinct path.
- `projects.list` is the Projects index source of truth. Renderer preferences
  may hide an archived project from the default sidebar, but cannot remove or
  hide its durable Projects-index row.
- A project row is a logical index entry. Import never creates an operating
  system directory: historical paths may be missing, remote, or read-only.
- The *current* visible workspace is `kv(app, currentProjectId)` — no singleton
  table, no partial-unique flag. Retained tabs do not add more current-project
  fields.

### 4.3 providers

Same role as v1; `headers_json` + `compatibility_json` collapse into one
extensible `config_json` (shape per [12-provider-config-schema](12-provider-config-schema.md)).

```sql
CREATE TABLE providers (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  vendor_key       TEXT NOT NULL DEFAULT 'custom',
  type             TEXT NOT NULL DEFAULT 'openai_compatible',
  protocol         TEXT NOT NULL DEFAULT 'openai_compatible',
  api_style        TEXT,
  auth_kind        TEXT NOT NULL DEFAULT 'api_key_and_base_url',
  base_url         TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  secret_ref       TEXT,
  default_model_id TEXT,
  config_json      TEXT NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
```

### 4.4 models — catalog cache

Implements [13-model-catalog-and-selection](13-model-catalog-and-selection.md)
(v1's dead `provider_models` never did).

```sql
CREATE TABLE models (
  provider_id       TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id          TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'user',  -- bundled | discovered | user
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  context_window    INTEGER,
  max_output_tokens INTEGER,
  deprecated        INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (provider_id, model_id)
) WITHOUT ROWID;
```

Refresh (spec 13 §6/§9) upserts `discovered` rows and **never overwrites
`source='user'`** rows. Recent-model MRU stays in `kv(cache)` — it is a
bounded display list, not relational data.

### 4.5 sessions

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  provider_id TEXT,                            -- loose ref, see below
  model_id    TEXT,
  mode        TEXT NOT NULL DEFAULT 'agent',   -- chat | agent
  thinking_level TEXT NOT NULL DEFAULT 'off'
                CHECK (thinking_level IN ('off', 'minimal', 'low', 'medium',
                                          'high', 'xhigh', 'max')),
  permission_mode TEXT NOT NULL DEFAULT 'inherit' -- D115: inherit follows settings
                CHECK (permission_mode IN ('inherit', 'ask', 'accept-edits', 'auto')),
  source      TEXT,                            -- import origin: claude-code | codex | opencode | pi
  pinned      INTEGER NOT NULL DEFAULT 0,
  last_seq    INTEGER NOT NULL DEFAULT 0,      -- message ordinal allocator
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX idx_sessions_project ON sessions(project_id) WHERE project_id IS NOT NULL;
```

- `provider_id`/`model_id` are **loose references** (no FK), like on `turns`:
  selection is `(providerId, modelId)` per spec 13 with custom ids always
  allowed, and built-in runtimes (e.g. `pi`) never exist in `providers`.
- `thinking_level` is the durable session selector. New and v2-migrated
  sessions default to `off`; capability resolution may clamp the effective
  request without rewriting the stored preference.

- `project_id` normalizes v1's free-text `project_path` (grouping, badges,
  hover-`+` new-session-in-project all become indexed lookups).
- Import binds every non-empty normalized `projectPath` to `project_id`;
  path-less imports remain `NULL`. Re-importing a deterministic session id
  creates neither another session nor another project row.
- The schema `pinned` column is retained for project-index ordering and
  migration compatibility. D093 sidebar pin/archive/collapse state is the
  renderer preference overlay and does not require a schema migration. No
  `status` column: live running/waiting state is runtime truth, not durable
  truth; badge data comes from the latest `turns` row (§4.6) plus in-memory
  state.
- `source` + deterministic imported ids keep re-imports idempotent and let the
  UI badge imported sessions.
- `project_id` is also the tool-root authority for that session. Switching the
  visible workspace cannot redirect an in-flight or later tool call belonging
  to a different session.

### 4.6 turns — one row per agent run

The persistence half of [10-session-state-machine](10-session-state-machine.md)
(`turn_runs` in the old logical model), and the rollup point for usage/cost.

```sql
CREATE TABLE turns (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'running', -- running | completed | aborted | error
  provider_id   TEXT,                            -- snapshot at run time, no FK
  model_id      TEXT,                            -- snapshot at run time
  error_code    TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  usage_json    TEXT,                            -- full provider usage (cached breakdown, …)
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER
);
CREATE INDEX idx_turns_session ON turns(session_id, started_at DESC);
```

Serves: mid-session model switches ("next turn only", spec 13 §4), the
per-message cost chip's session rollup (benchmark §3.2), failed/aborted badges
(§3.8), and retry lineage.

### 4.7 messages — canonical transcript

One ordered stream per session. Tool calls are rows in the stream (as today),
but content is the **canonical block array**, not a UI projection.

```sql
CREATE TABLE messages (
  mid          INTEGER PRIMARY KEY,             -- stable rowid: FTS anchor, VACUUM-safe
  id           TEXT NOT NULL UNIQUE,            -- caller-facing uuid (optimistic UI)
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id      TEXT REFERENCES turns(id) ON DELETE SET NULL,
  seq          INTEGER NOT NULL,                -- per-session ordinal
  role         TEXT NOT NULL,                   -- user | assistant | tool | system
  tool_name    TEXT,                            -- promoted for tool rows (filters, audit joins)
  is_error     INTEGER NOT NULL DEFAULT 0,
  text         TEXT,                            -- extracted plain text (search/preview); NULL for tool rows
  content_json TEXT NOT NULL,                   -- block array, see below
  meta_json    TEXT,                            -- usage / model / stopReason / durationMs
  created_at   INTEGER NOT NULL,
  UNIQUE (session_id, seq)
);
```

**Block vocabulary** (open set — new types need no migration):

```ts
type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown;
      status: "ok" | "error" | "denied"; result?: unknown;
      completedAt?: string; durationMs?: number }
  | { type: "attachment"; kind: "image" | "file"; name: string;
      ref: string /* attachments/<sha256> or absolute path */ };
```

- Tool results are stored **post-truncation** (16-tool-result-limits); full
  raw output is not a DB concern.
- Assistant thinking is stored only in `thinking` blocks. The derived `text`
  column contains final answer text, so transcript search and answer previews
  do not expose or mix reasoning.
- `meta_json` on assistant rows carries per-response usage/model for the cost
  chip; `turns` holds the summable rollup — no `json_each` at query time.
- Ordering: `seq` is allocated O(1) inside the insert transaction via
  `UPDATE sessions SET last_seq = last_seq + 1 … RETURNING last_seq`
  (replaces v1's racy `MAX(sort_index)+1` scan). `UNIQUE(session_id, seq)`
  doubles as the covering index for transcript load
  (`WHERE session_id = ? ORDER BY seq`).
- `mid` (explicit INTEGER PRIMARY KEY) pins rowids across `VACUUM`, which the
  FTS external-content mapping depends on; `id` stays the wire-format uuid.

### 4.8 messages_fts — full-text search

Global search across transcripts (WorkBuddy-benchmark search, command
palette). Trigram tokenizer covers CJK and substring matches; queries shorter
than 3 chars fall back to `LIKE` on `messages.text`.

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
  text,
  content='messages', content_rowid='mid',
  tokenize='trigram'
);
CREATE TRIGGER messages_ai AFTER INSERT ON messages WHEN new.text IS NOT NULL
  BEGIN INSERT INTO messages_fts(rowid, text) VALUES (new.mid, new.text); END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages WHEN old.text IS NOT NULL
  BEGIN INSERT INTO messages_fts(messages_fts, rowid, text)
        VALUES ('delete', old.mid, old.text); END;
CREATE TRIGGER messages_au AFTER UPDATE OF text ON messages
  BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text)
      SELECT 'delete', old.mid, old.text WHERE old.text IS NOT NULL;
    INSERT INTO messages_fts(rowid, text)
      SELECT new.mid, new.text WHERE new.text IS NOT NULL;
  END;
```

Session titles are searched with a plain scan (sessions number in the
hundreds; no second FTS table). Index maintenance uses triggers rather than
application code so that **cascade deletes** (session → messages) clean the
index too; this is why `trusted_schema = ON` is part of the bootstrap. DDL
validated end-to-end (insert/update/delete/cascade + CJK trigram match) with
`sqlite3` 3.43+.

### 4.9 message_revisions — regenerate history

Archives discarded regenerate branches so users can page previous variants
without stacking them in the live transcript (D105/D109). One row is one
linear branch rooted at a user turn.

```sql
CREATE TABLE message_revisions (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  root_user_id    TEXT NOT NULL,            -- wire id of the root user message
  revision_index  INTEGER NOT NULL,         -- 1-based per (session, root)
  is_active       INTEGER NOT NULL DEFAULT 0,
  messages_json   TEXT NOT NULL,            -- UiMessage[] for this branch
  created_at      INTEGER NOT NULL,
  UNIQUE (session_id, root_user_id, revision_index)
);
CREATE INDEX idx_message_revisions_root
  ON message_revisions(session_id, root_user_id, revision_index);
```

- Live transcript remains the active branch only (`messages`).
- Switching a pager entry replaces the active tail and flips `is_active`.
- `messages_json` is opaque to SQL queries; host code owns encode/decode.
- Cascade on `session_id` keeps history from outliving its session.
- `root_user_id` is the stable regenerate-family key. Live rewritten user
  prompts may carry a new message `id`, but `meta_json.revisionRootId` keeps
  pointing at the original family so later regenerates append to one set.
- Root user `meta_json` also stores `revisionCount` / `activeRevision` for the
  transcript pager; those fields are presentation metadata, not a second source
  of truth for branch payloads.

### 4.10 artifacts — files a session produced

Backs the Artifacts surface (benchmark §3.7). v1 planned to derive this from
`audit_log`, but audit payloads never recorded file paths; an explicit
projection is precise, indexed, and survives audit pruning.

```sql
CREATE TABLE artifacts (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,               -- absolute, workspace-resolved
  op         TEXT NOT NULL,               -- write | edit | delete
  turn_id    TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, path)
) WITHOUT ROWID;
CREATE INDEX idx_artifacts_time ON artifacts(updated_at DESC);
```

Upserted by host-core in the same transaction as the `tool_execute` audit row
whenever Write/Edit (or a plugin tool declaring file effects) succeeds —
repeat edits update `op`/`updated_at`, keeping one row per file per session.
Writes into the session scratch directory (D114) are excluded: artifacts list
workspace deliverables only.

### 4.11 scheduled_tasks + task_runs — automations

Moves scheduled tasks out of Electron's `scheduled-tasks.json` (D002 fix) and
adds the run-history the Automations page needs (定时任务 / 运行记录 tabs).

```sql
CREATE TABLE scheduled_tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  cadence     TEXT NOT NULL DEFAULT 'manual',  -- manual | hourly | daily | weekly
  enabled     INTEGER NOT NULL DEFAULT 1,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  config_json TEXT NOT NULL DEFAULT '{}',      -- future: cron expr, model override, notify policy
  last_run_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE task_runs (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL, -- the run's transcript
  status     TEXT NOT NULL DEFAULT 'running',  -- running | completed | aborted | error
  error_code TEXT,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);
CREATE INDEX idx_task_runs ON task_runs(task_id, started_at DESC);
```

A run that spawns a session gets its transcript for free via `session_id`.
Finer schedules (cron) land in `config_json` without a migration.

### 4.12 secrets_meta

Registry of which secrets exist (blob files are sha256-named and otherwise
unenumerable). `owner_kind/owner_id` generalizes v1's provider-only column for
future plugin/MCP secrets.

```sql
CREATE TABLE secrets_meta (
  secret_ref TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL DEFAULT 'provider',
  owner_id   TEXT,
  kind       TEXT NOT NULL DEFAULT 'api_key',
  backend    TEXT NOT NULL,                -- safe_storage | file_fallback
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
```

Secret *values* never enter the DB (D028/D031): OS safeStorage primary,
AES-GCM file fallback under `secrets/`.

### 4.13 audit_log

Append-only; now indexed and prunable. Integer autoincrement PK replaces v1's
random uuids (cheaper inserts, natural order).

```sql
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  ts           INTEGER NOT NULL,
  kind         TEXT NOT NULL,              -- tool_execute | tool_denied | …
  session_id   TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_session ON audit_log(session_id, ts)
  WHERE session_id IS NOT NULL;
```

### 4.14 notifications — durable local inbox (D117)

One row records one terminal agent-turn outcome that was not already visible in
the focused current chat. It stores structured source data only; renderer and
Electron derive localized title/body strings at the presentation boundary.

```sql
CREATE TABLE notifications (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL
                  CHECK (kind IN ('task.completed', 'task.failed')),
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  session_title TEXT NOT NULL,              -- snapshot at terminal transition
  turn_id       TEXT NOT NULL UNIQUE,       -- exactly one inbox row per turn
  error_code    TEXT,                       -- populated for task.failed when known
  created_at    INTEGER NOT NULL,
  read_at       INTEGER
);
CREATE INDEX idx_notifications_created
  ON notifications(created_at DESC);
CREATE INDEX idx_notifications_unread
  ON notifications(created_at DESC) WHERE read_at IS NULL;
```

- `session.endTurn` always updates the turn and, when `createNotification` is
  true, inserts `task.completed` for `completed` or `task.failed` for `error`
  in the **same transaction**. Electron passes false only when the main window
  is visible/focused and that exact session is the current chat. `aborted`
  never inserts a row.
- Repeating a terminal update cannot duplicate a notification because
  `turn_id` is unique. The RPC result includes the record only when this call
  inserted it; otherwise the `notification` field is omitted.
- `session_title` is the stable session-name snapshot at notification creation,
  not a localized notification title/body. An empty title remains valid and
  receives a localized “Untitled task” fallback only at presentation time.
- No title/body prose is stored. Permission requests, scheduled reminders,
  plugin notices, and aborted turns are not notification sources.
- After an insert, the same transaction prunes all but the newest 200 rows by
  `(created_at DESC, id DESC)`. This is a global cap; session deletion also
  cascades its rows.
- Mark-read updates are idempotent (`read_at` changes only from null), mark all
  read is one indexed update, and clear deletes notification rows only. None of
  these operations changes sessions, turns, or transcripts.

### Dropped from v1

| v1 table | v2 home |
|---|---|
| `meta` | `PRAGMA user_version` |
| `settings` | `kv(ns='app')` |
| `workspace` (singleton) | `projects` + `kv(app, currentProjectId)` |
| `plugins` (dead code) | `plugins/registry.json` stays authoritative (spec 07-11); plugin *settings* → `kv(ns='plugin:<id>')` |
| `provider_models` (dead code) | `models` |

## 5. Write paths (consistency)

Persistence points follow [10-session-state-machine](10-session-state-machine.md) §4;
streaming deltas never touch the DB.

| event | transaction |
|---|---|
| prompt accepted | insert user message (seq via `last_seq` RETURNING) + insert `turns(running)` + touch `sessions.updated_at` |
| assistant/tool message end | insert message row (+ meta) + touch session |
| tool succeeded (Write/Edit) | upsert `artifacts` + `audit_log` row, same tx as result persistence |
| turn terminal via `session.endTurn` | update `turns` status/usage/ended_at; for completed/error insert one notification and prune to 200 in the same tx; aborted inserts none |
| compaction / edit (`session.replaceMessages`) | single tx: delete stream, bulk insert, reset `last_seq` |
| import | one tx per session; `seq` = enumeration order; `source` set; projects upserted |

Rules: user message durable before the turn starts; assistant/tool rows
durable at their end events; a crash mid-turn loses at most the in-flight
turn's tail and the boot sweep marks that turn `aborted`.

## 6. Performance notes

- Single writer + WAL: readers never block; no lock contention by design.
- All timestamps INTEGER Unix ms — smaller rows, integer compares, index-friendly.
- Hot queries and their indexes:
  - transcript load → `UNIQUE(session_id, seq)` range scan
  - session list → `idx_sessions_updated`
  - group-by-project → `idx_sessions_project`
  - badges/cost rollup → `idx_turns_session` (latest turn per session)
  - artifacts by session → PK; global recent artifacts → `idx_artifacts_time`
  - run history → `idx_task_runs`
  - audit forensics/pruning → `idx_audit_session` / `idx_audit_ts`
  - notification inbox → `idx_notifications_created`; unread filter/count →
    `idx_notifications_unread`
- O(1) `seq` allocation; no `MAX()+1` scans anywhere.
- `prepare_cached` on all statements; batch inserts inside one tx (import,
  replace).
- JSON columns are read blind on hot paths (shipped to the renderer as-is);
  anything filtered or summed is a promoted column by rule.

## 7. Migration

- `PRAGMA user_version` + an ordered list of Rust migration fns; each runs in
  one transaction; destructive steps copy `pi.sqlite` → `pi.sqlite.v<n>.bak`
  first (wal-checkpointed).
- **v1 → v2** (one-shot, detected by `user_version < 2` on a legacy file named
  `settings.sqlite`):
  1. checkpoint + backup copy
  2. create v2 schema; carry data: providers (merge `headers_json` +
     `compatibility_json` → `config_json`), `provider_models` → `models
     (source='user')`, sessions (RFC3339 → ms; `project_path` → upserted
     `projects.id`; `source` derived from `import-<src>-` id prefix),
     messages (v1 columns → block array + extracted `text`; `sort_index` →
     `seq`; set `last_seq`), secrets_meta (+`owner_kind='provider'`),
     audit_log (ts → ms), workspace row → `projects` + `kv currentProjectId`,
     settings `app` → `kv(app, settings)`
  3. drop v1 tables, `user_version = 2`, `VACUUM` (activates
     `auto_vacuum=INCREMENTAL`), rename file to `pi.sqlite`
  4. Electron side: once host exposes `scheduled.*`, main imports
     `scheduled-tasks.json` via RPC and renames it `.imported.bak`
- **v2 → v3** (additive, one transaction): add
  `sessions.thinking_level TEXT NOT NULL DEFAULT 'off'` with the canonical
  seven-value check constraint, then set `user_version = 3`. Existing
  transcripts and session bindings are unchanged.
- **v3 → v4** (additive, one transaction): create `message_revisions` plus
  `idx_message_revisions_root`, then set `user_version = 4`. Existing
  transcripts are unchanged; regenerate history starts empty.
- **v4 → v5** (additive, one transaction): add `sessions.permission_mode
  TEXT NOT NULL DEFAULT 'inherit'` with the four-value check constraint
  (D115), then set `user_version = 5`. Existing sessions inherit the global
  default, matching prior behavior (`ask`).
- **v5 → v6** (additive, one transaction): create `notifications`,
  `idx_notifications_created`, and `idx_notifications_unread`, then set
  `user_version = 6`. Existing notification history starts empty; sessions,
  turns, and transcripts are unchanged.
- Fresh installs run the full v6 DDL directly.

## 8. Retention & maintenance

- audit_log: prune rows older than 90 days (configurable) at boot;
  `incremental_vacuum` afterwards.
- task_runs: keep last 100 per task (prune with the same boot pass).
- notifications: enforce the newest-200 global cap after every insert and at
  boot as a defensive repair; rows otherwise survive restart until cleared,
  pruned, or cascade-deleted with their session.
- logs rotate at the file layer (D082); sessions are never auto-deleted.
- Attachment GC (later): sweep `attachments/` for hashes unreferenced by any
  `content_json`.

## 9. Extensibility playbook

| need | mechanism | migration? |
|---|---|---|
| new message content kind (citations, diffs, voice) | new block `type` in `content_json` | no |
| new per-response metadata | `meta_json` key | no |
| new config domain (MCP servers, memories) | `kv` namespace | no |
| new provider/task knob | `config_json` key | no |
| new model capability | value in `capabilities_json` | no |
| new queryable/filterable field | promoted column | yes (additive) |
| new entity with relations (knowledge base, connectors) | new table | yes |

Rule of thumb: JSON for payloads the host merely stores and ships; columns for
anything the host filters, joins, sums, or indexes.

## 10. Secrets rules (unchanged)

1. The renderer never persists secrets
2. OS safeStorage primary; explicit encrypted-file fallback with risk warning
3. Secret values never in SQLite; only `secrets_meta` bookkeeping
4. Exported sessions exclude secrets by default

## 11. Acceptance

1. Sessions and transcripts survive restart byte-identically (blocks, usage,
   tool results) — no UI-projection loss
2. Transcript load for a 5k-message session is a single index range scan
3. Kill -9 during a running turn: boot marks the turn `aborted`, transcript
   intact up to the last completed message
4. v1 file migrates losslessly with a `.bak` left behind; re-running is a no-op
5. Scheduled tasks CRUD + run history round-trip through host RPC only
6. FTS finds CJK and ASCII substrings across sessions; deleting a session
   removes its index entries
7. Plugin uninstall clears `kv(plugin:<id>)` in one statement
8. Resetting sidebar preferences changes no `projects`, `sessions`, or
   transcript row; retained paths and organization choices survive a normal
   renderer restart when preferences are available
9. A tool call for session A resolves A's persisted project root even after
   the visible workspace switches to project B
10. A session's thinking level survives restart; a v2 database opens at v3
    with every existing session set to `off`
11. Assistant thinking blocks round-trip independently from final answer text;
    the derived search text excludes thinking content
12. Regenerated assistant variants survive restart under `message_revisions`;
    the live root user turn reloads with `revisionCount` / `activeRevision` and
    the pager can restore any archived branch
13. A v3 database opens at v4 with an empty `message_revisions` table and no
    transcript loss
14. A v5 database opens at v6 with an empty notification inbox and no session,
    turn, or transcript loss
15. Completed and failed turns atomically create one durable notification;
    repeated terminal updates do not duplicate it, aborted turns create none,
    and the newest-200 cap survives restart
16. Notification list/unread, mark-read, mark-all-read, clear, and session
    cascade deletion use the documented indexes/transactions without changing
    turn or transcript data
