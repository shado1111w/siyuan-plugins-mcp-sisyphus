# Plan: Schema-Aware Query & Ergonomic Filters

Reference CLIs: [4ier/notion-cli](https://github.com/4ier/notion-cli), [Yakitrak/notesmd-cli](https://github.com/Yakitrak/notesmd-cli). This plan closes the read-side gaps those tools expose in sisyphus, ordered by dependency and user value.

## Goals

- Read a database record set without mutating the stored view (filters/sorts are currently persisted view config).
- Let agents pass human filters and omit `valueType` where the column schema already knows it.
- Accept SiYuan URLs / `siyuan://` refs anywhere an ID is expected.
- Frontmatter-style attribute writes without hand-built attrs JSON.

Non-goals: external editors, comments, sharing, form/dashboard views (kernel does not expose them).

---

## Phase 1 — `av query` (read-only filtered/sorted rows)

Highest value; the database read path has no clean query entry today.

### Behavior

```
siyuan-sisyphus av query --av-id <avID> \
  --filter 'Status=done' --filter 'Done=true' \
  --sort 'Task:asc' --sort 'Created:desc' \
  --page 1 --page-size 50
```

- Returns the same normalized `table.columns` / `table.rows` shape as `av render`, plus `appliedFilters`/`appliedSorts` echo so the caller sees what ran.
- **Never writes** to the view. Filters are evaluated in-process after fetching rows (kernel `renderAttributeView` has no ad-hoc filter parameter), so this is a read+filter, not a persisted view change.

### Implementation notes

- Reuse `avApi.renderAttributeView` with `pageSize=-1` to pull the row set, then apply predicate evaluation + stable sort in the handler. Persisted view filters/sorts still apply upstream; document this as "base view filters always apply, `--filter` narrows further".
- Filter grammar (v1, intentionally small):
  - `Col=value` equality on the column's display value (block content, text, number, checkbox, select option).
  - `Col!=value`, `Col~substr` (contains), `Col!~substr`.
  - `Col>num`/`Col<num`/`Col>=`/`Col<=` for number/date columns.
  - Bare `Col` = is-not-empty; `!Col` = is-empty.
- `--sort 'Col:asc|desc'` on any column; multiple sorts applied in order. Fall back to string compare for mixed types.
- New files: `src/tools/av/query-filter.ts` (parser+evaluator, pure & unit-testable), handler in `handlers.ts`.

### Schema

```ts
AvQuerySchema = {
  action: 'query', avID, blockID?,
  filters?: string[],       // each parsed by the grammar above
  sorts?: string[],         // 'Name:asc' / 'Name:desc'
  page?, pageSize?,         // same pagination contract as render
  query?: string,           // optional free-text row narrowing (kernel 'query' param)
}
```

Safety tier: `read()`. Registration set: config list, ACTION_TIERS `basic`, i18n, api-audit contract → `/api/av/renderAttributeView`, help hint, skill.

---

## Phase 1.5 — Ergonomic block actions (low agent-comprehension surface)

Selected by one test: can a natural-language instruction map to these flags in one step, without the agent knowing SiYuan block internals (IAL, `((ref))`, transactions)? Both reference CLIs keep the block surface thin for exactly this reason — only the operations below clear that bar; the rest of the kernel's block API stays unexposed on purpose.

### `block update_task_marker` — check / uncheck a todo

```
block update_task_marker --id <taskBlock> --checked true
block update_task_marker --ids <b1,b2,b3> --checked false   # batch
```

- Maps to `/api/block/updateTaskListItemMarker` + `batchUpdateTaskListItemMarker`.
- Replaces the current workaround (`block update` rewriting the whole `[ ]`/`[x]` line), which forces the agent to round-trip and re-author task markdown. One flag, one intent.

### `block move_outline_heading` — relocate a heading with its subtree

```
block move_outline_heading --id <headingBlock> --parent-id <docID> --previous-id <siblingHeading>
```

- Maps to `/api/block/moveOutlineHeading`. Moving a heading carries its child blocks, unlike `block move` which relocates a single block and orphans its children. This is the "restructure a document section" primitive.

### `block get_refs` — who references this block

```
block get_refs --id <blockID>
```

- Maps to `/api/block/getRefIDs`. Block-level backlink list; the "which blocks reference this" read needed for reference audits and dead-link checks.

### `block get_ref_text` — what a reference displays

```
block get_ref_text --id <blockID>
```

- Maps to `/api/block/getRefText`. Returns the anchor text a `((id))` reference renders, so an agent can verify a ref resolves to readable text before inserting it.

### `block text` — plain text of one block

```
block text --id <blockID>
```

- Maps to `/api/block/getDOMText`. Strips markup to plain text — cheaper than parsing kramdown when only the content is needed (search snippets, dedup checks, LLM context).

### Deliberately excluded

These kernel endpoints exist but fail the comprehension bar — the agent would have to understand SiYuan ref/IAL semantics to call them correctly, so they are not exposed:

- `swapBlockRef`, `getBlockDefIDsByRefText`, `checkBlockRef`, `checkBlockFold`, `checkBlocksExist`, `getBlockIndex`, `getBlocksIndexes`, `getBlockTreeInfos`, `setBlockReminder`.
- `getBlockSiblingID`, `getHeadingChildrenIDs`, `appendHeadingChildren` are also deferred — `get_children` + `document read --scope section` already cover the same intent without a new surface.

All five new actions register `basic` tier / `read()` for the two getters and `text`, `advanced` / `mutation('manifest')` for `update_task_marker` (row-state write) and `move_outline_heading` (structure write → `mutation('structure')`). i18n, api-audit contracts, help hints, and skill notes follow the standard checklist.

---

## Phase 2 — Schema-aware cell writes (omit `valueType`)

Applies to `av update_row`, `av upsert_row`, and `av set_cells` cell items.

### Behavior

```
av update_row --row-id <r> --cells-json '[{"columnName":"Done","checked":true},{"columnName":"Points","number":8}]'
```

- When a cell omits `valueType`, resolve the column from the AV's `keyValues`/keys and use its declared `type`. The typed payload field (`text`/`number`/`checked`/`option`/`options`/`date`/…) still drives the value.
- Kernel type → our valueType map: `block`→PK (reject for cell write), `text`→text, `number`→number, `date`→date, `select`→select, `mSelect`→multi_select, `checkbox`→checkbox, `url`/`email`/`phone`→same, `mAsset`→mAsset, `relation`→reject (still routes to set_relation).
- Ambiguity stays strict: if the caller supplies both `valueType` and a mismatched typed field, keep today's validation error. Only infer when `valueType` is absent and exactly one typed field is present.

### Implementation notes

- `AvSetCellValueFieldsBaseSchema`: make `valueType` optional, add a refinement that either `valueType` is present OR exactly one typed field is set (so we know the intended shape).
- In `buildStrongCellValue` callers, pre-resolve `columnID`→column definition (we already load `avData`), infer `valueType` from `key.type`, then reuse the existing builder.
- Column-name resolution already exists in `resolveUpsertColumnId`; lift it into a shared helper so `set_cells` also gains `columnName` support.

Tier unchanged (manifest/state as today). Registration: no new action — this is a schema widener on existing actions, so only schema/handler/help/skill updates.

---

## Phase 3 — URL / ref normalization on ID inputs

### Behavior

Anywhere an `id`/`blockID`/`avID`/`rowID` argument is accepted, also accept:

- `siyuan://blocks/<id>` and `siyuan://plugins/...` refs
- `http(s)://host/...` SiYuan web/desktop links that carry `?id=<id>` or a trailing `<id>` path segment
- bare `((<id>))` block-ref syntax

Resolution is a pure `extractSiYuanId(raw)` helper returning the bare 20-char-ish ID or the original string untouched when nothing matches (fail-open so plain IDs keep working).

### Implementation notes

- Single helper in `src/shared/` (e.g. `normalize-id.ts`), applied at argument ingress — either a zod `.transform()` on the id fields of the schemas we own, or a normalize step inside `createZodActionVariant` for keys matching /^(id|blockID|avID|rowID|parentID|previousID|nextID|toID|fromIDs?)$/i. Prefer the schema-level transform on the high-traffic document/block/av schemas first; avoid touching relation/set_cells rowID semantics (validated separately).
- Risk: over-eager extraction on strings that legitimately contain `(` or URLs. Constrain regexes to known prefixes (`siyuan://`, `((…))`, `?id=` query) and 14-alnum ID shape; leave everything else untouched.

---

## Phase 4 — `document set_attr` key/value shorthand

### Behavior

```
document set_attr --id <doc> --key custom-status --value done
```

- Adds optional `key`/`value` on `DocumentSetAttrSchema` as an alternative to the `attrs` map. Exactly one of `attrs` or `key+value`.
- `--key` accepts SiYuan custom attribute names (`custom-*`) and the built-ins `icon`/`cover`/`title-img`/`tags` the action already documents; non-custom keys pass through unchanged so the kernel validates them.
- `value` is a string; for `attrs`-equivalent typing, `null`/`true`/`false`/numbers coerce, and `--value ''` clears. Document the coercion rules in the hint.

Tier unchanged. Schema/handlers/hint only.

---

## Ordering rationale

1. **`av query` first** — it is the missing read primitive and standalone. Ship it and its filter grammar alone so the evaluator is exercised by real workloads before schema inference leans on the same column metadata.
2. **Block ergonomics (Phase 1.5) next** — five independent, high-frequency actions that clear the natural-language bar; ship together since they share only the standard registration path.
3. **Schema-aware writes** — depends on the column-resolution helper `av query` formalizes, and it widens an existing contract rather than adding a surface.
4. **ID normalization** — cross-cutting; lands once the new actions exist so their tests cover the normalization path too.
5. **`set_attr` shorthand last** — smallest surface; cheap once the rest is stable.

---

## Skill coverage & skill tests

Every phase ships its agent-facing guidance and a measurable way to prove the guidance works. Skill changes are not incidental docs — they are part of the feature contract.

### How each phase updates skills

| Phase | Skill file touched | What the guidance must convey |
|---|---|---|
| 1 `av query` | `skills/source/scenarios.mjs` → `siyuan-sisyphus-database` / `siyuan-mcp-database` | Prefer `av query` for "show me tasks where…" / "list rows sorted by…" — do not `set_filters` to read (it mutates the view). Show the `--filter`/`--sort` grammar and when to fall back to `render` |
| 1.5 block ergonomics | `siyuan-sisyphus-create-edit` (write paths) + `siyuan-sisyphus-browse-read` (read paths) | `update_task_marker` for todo check/uncheck (never rewrite the block); `move_outline_heading` for section moves; `text` for plain-text reads; `get_refs` for "who links here" |
| 2 schema-aware writes | `siyuan-sisyphus-database` | `valueType` is now optional — describe when it can be omitted and when to be explicit |
| 3 ID normalization | `siyuan-sisyphus` (top-level) | Acceptable ID forms: bare ID, `siyuan://blocks/…`, `((id))`, SiYuan web link — agent may paste any |
| 4 set_attr shorthand | `siyuan-sisyphus-create-edit` | `--key/--value` for single attrs; keep `attrs` JSON for multi-key |

After each edit: `npm run skills:generate` and commit the regenerated SKILL.md files.

### Skill tests — the `tests/eval/skill-execution.test.ts` suite

The project already has an eval harness (`eval-prompts/`, `tests/eval/skill-execution.test.ts`, results under `eval-prompts/results/`). New actions must be exercised the same way a real agent would, not only by unit mocks.

For each phase, add scenario prompts to `eval-prompts/run-eval.sh` `SCENARIOS` and run them against the live `local` profile:

- **Phase 1** — prompts like "列出 e2e-test 库里状态为 done 的任务行" and "按创建时间倒序显示这个数据库的前 5 行" — verify the agent picks `av query`, uses the filter grammar correctly, and does **not** call `set_filters`.
- **Phase 1.5** — prompts like "把这条待办标为完成"、"把第二节整节挪到文档末尾"、"列出引用了块 X 的块" — verify single-call intent mapping.
- **Phase 2** — prompts like "把这条记录的 Done 勾上、Priority 设为 3" **without** mentioning valueType — verify schema inference and no type errors.
- **Phase 3** — paste a `siyuan://` URL or `((id))` ref as the target — verify the agent doesn't hand-mangle it.
- **Phase 4** — "给这篇文档加自定义属性 status=done" — verify the shorthand path.

Each scenario asserts the tool/action chosen and the round-trip readback, mirroring the existing r01–r16/d01–d20 conventions. Skill tests run per-phase alongside the unit tests; a phase is not "done" until its skill scenarios pass live.

### Unit-test map

| Phase | Files | Focus |
|---|---|---|
| 1 | `tests/unit/tools/av.test.ts` + new `query-filter.test.ts` | parser/evaluator correctness, zero write transaction, pagination echo |
| 1.5 | `tests/unit/tools/block.test.ts` | task-marker single+batch, non-task rejection, heading subtree carry, read shapes |
| 2 | `tests/unit/tools/av.test.ts` | column-type × typed-field matrix, mismatch rejection, inference |
| 3 | `tests/unit/shared/normalize-id.test.ts` | URL/ref/passthrough table |
| 4 | `tests/unit/tools/document.test.ts` | exclusivity, custom-* passthrough, clear semantics |

## Registration checklist (per new action)

`config.ts` ACTION list + ACTION_TIERS + default-enabled → `types.ts` zod schema → `write-safety-policy.ts` tier → tool `index.ts` variant → `handlers.ts` handler + map → i18n en/zh (`*_action_X` + `desc_*`) → `scripts/api-audit.mjs` contracts + `EXPECTED.actions` → `api-audit.test.ts` count → `action-contract.test.ts` case → help snapshot regen → `skills/source/scenarios.mjs` + `npm run skills:generate` → unit tests + live CLI verification.

## Test plan

- `av query`: parser unit tests for every operator (incl. malformed input → validation_error), evaluator tests against fixture keyValues, handler test asserting zero write transactions, plus a live `av query` on the e2e notebook.
- Block ergonomics: single + batch `update_task_marker` (checked/unchecked, non-task block rejection), `move_outline_heading` subtree carry-over, and read-shape tests for `get_refs`/`get_ref_text`/`text`; live CLI check on the e2e notebook.
- Schema-aware writes: matrix of (column type × provided field) incl. mismatch rejection and missing-type+single-field inference.
- ID normalization: table-driven tests for `siyuan://`, `((…))`, web URLs, and pass-through non-IDs.
- `set_attr` shorthand: key+value vs attrs exclusivity, custom-* passthrough, clear semantics.
- Update help snapshots, api-audit counts, and skill regeneration for every phase.

---

## Phase 5 — Gap-closing actions vs Notion / Obsidian / Feishu CLIs

Reference surface gap audit: `4ier/notion-cli`, `Yakitrak/notesmd-cli`, `larksuite/lark-cli`. Ordered by agent value; each is an independent action or flag, no ordering dependency between them except where noted.

### Phase 5.1 — `block`/`document` append from file (`--file`)

```sh
block append --parent-id <doc> --file notes.md
document append --id <doc> --file notes.md          # or --notebook + --hpath
document create --path /Nb/Doc --file notes.md      # body from file, not inline
```

- Read a local UTF-8 Markdown file and use it as the `data` payload, so agents never have to inline large content into a single `--data` flag (avoids shell-escaping bugs and arg-length limits).
- Mirrors `notion block append --file`. Accepts `--file -` for stdin so an agent pipeline can stream content in without a temp file.
- Conflicts: `--file` and `data`/`markdown` are mutually exclusive; error if both are given.
- Registration: schema widener on existing actions (`block append/insert/prepend/update`, `document append/prepend/create`). Handler-side file read via the CLI's existing fs access; MCP transport keeps inline `data` only (flag is CLI-surface sugar resolved before the kernel call).
- Tests: file read + relative/absolute path resolution, `--file -` stdin, mutual-exclusion error, binary/UTF-16 rejection; live `--file` on the e2e notebook.

### Phase 5.2 — `system api` raw-kernel escape hatch

```sh
system api POST /api/block/getBlockKramdown '{"id":"<id>"}'
system api GET  /api/system/getConf
```

- Forwards an arbitrary method + kernel path + JSON body straight through the configured profile, returning the raw kernel response. Covers the long tail of kernel endpoints that have no aggregate action yet — the single biggest structural gap vs `notion api` and `lark-cli api`.
- Guard rails: a `--write`/`--confirm` flag is required for non-GET methods, since the escape hatch bypasses per-action safety tiers; GET endpoints stay read-only by default. The hint names it a last resort and points back to `help <tool>` for the typed surface.
- Registration: new action `api` on `system`. `config.ts` ACTIONS + ACTION_TIERS `dangerous` (write path) → `types.ts` schema (`action`, `method`, `path`, `body?`) → `write-safety-policy.ts` `mutation('system')` for non-GET, `read()` for GET → `system/index.ts` variant → handler forwarding through `client.request` → i18n + api-audit contract (generic, no fixed endpoint) → `action-contract.test.ts` case → help snapshot → `siyuan-sisyphus-system-cli` skill → unit test (method gating, `--confirm` requirement, path passthrough, error surfacing) + live GET/POST on `local`.
- Tests: GET allowed without confirm, non-GET rejected without `--write`, 404/error body surfaced verbatim, `--write` flows through.

### Phase 5.2a — `system api` parameter discovery (required for a usable escape hatch)

A bare `method/path/body` passthrough is not enough: without per-endpoint parameter documentation the agent still has to guess each kernel signature, which defeats the point of the escape hatch. The kernel has no OpenAPI/self-description, so the parameter catalog is generated from the SiYuan kernel Go source that already ships in the workspace.

**Discovery surface:**

```sh
system api --list                            # every known kernel endpoint + method + one-line summary
system api --list --match block              # filtered to /api/block/* endpoints
system api --describe /api/block/getBlockKramdown   # method, required vs optional params, types, defaults
system api POST /api/block/getBlockKramdown --describe   # same describe, then the call
```

- `--list` returns the catalog index (path, method, handler name, one-line summary). `--describe` returns that endpoint’s full parameter table: name, Go type, required/optional, the default the kernel applies, and any enum/validation the handler enforces.

**Catalog generation (`scripts/gen-api-catalog.mjs`, run at build like `api:audit`):**

- Parse `kernel/api/router.go` for every `ginServer.Handle("<METHOD>", "<path>", ...<handler>)` triple -> path, method, handler symbol.
- For each handler, locate its body in `kernel/api/*.go` and statically extract the parameter names it consumes:
  - `util.ParseJsonArg[T]("name", arg, ret, required, rejectEmpty)` -> name + required flag.
  - `util.BindJsonArg("name", &dst, required, rejectEmpty)` -> name + required.
  - `util.ParseJsonArgs(arg, ret, BindJsonArg...)` groups -> same.
  - Direct `arg["key"]` / `arg["key"].(type)` map reads -> name (required-ness inferred from the surrounding `if !ok` / default assignment, best-effort).
- Emit `cli/dist/api-catalog.json` (and a checked-in `api-catalog.json` for MCP) mapping path -> { method, handler, params: [{ name, type, required, default? }] }. ~582 endpoints from `api:audit` are the coverage floor; endpoints with no extractable params get a `params: []` + a `note: "inspect kernel source"` marker rather than being dropped.

**Runtime behavior:**

- `system api <path>` with an unknown/misspelled path does a fuzzy `--list` match and suggests the closest endpoints instead of a bare 404.
- When a call fails, the error response includes the described params for that endpoint so the agent can self-correct in one turn.
- The param extraction is best-effort static analysis; handlers that compute params dynamically fall back to a `dynamic: true` note naming the source file+line for manual inspection.

**Tests:**

- Generator: router triples parsed, `ParseJsonArg`/`BindJsonArg`/direct-read extraction, required-flag correctness, ~582-endpoint coverage vs api:audit.
- Handler: `--list`/`--match`/`--describe` output shape, fuzzy suggestion on bad path, describe-then-call, error embeds the param table.
- Eval prompt: "\u8c03\u7528\u5185\u6838\u63a5\u53e3\u83b7\u53d6\u67d0\u5757\u7684 kramdown" - agent should discover getBlockKramdown via --describe, pass the right `id` param, and succeed in one shot.


### Phase 5.3 — `av query --filter-json` nested conditions

```sh
av query --av-id <avID> --filter-json '{"or":[{"Status":"done"},{"Priority":">2"}]}'
```

- Extends `av query` with a `--filter-json` structured filter for nested `and`/`or`/operator objects — the case the linear `Col=val` grammar cannot express (mixed or-groups, per-branch operators).
- Reuses `query-filter.ts`: add a JSON node → predicate compiler alongside the existing string parser. Leaf node shape `{ "<Col>": "<value>" }` uses the same operator grammar (`=`, `!=`, `~`, `>`, `!`); `{ and: [...] }` / `{ or: [...] }` recurse. `--filter`/`--filters` and `--filter-json` merge with an implicit top-level `and`.
- Registration: schema widener on `av query` (`filterJson?: unknown`). No new action. Help hint + `siyuan-sisyphus-database` skill example.
- Tests: nested or/and compile, leaf-operator reuse, depth/size cap (reject pathological nesting), merge with `--filter`, malformed JSON → validation_error; live query against e2e AV.

### Phase 5.4 — `document get_attr` + frontmatter on `export_md`

```sh
document get_attr --id <doc>                      # all attrs as JSON
document get_attr --id <doc> --key custom-status  # single value
file export_md --id <doc> --with-frontmatter      # YAML block prepended
```

- `document get_attr` reads a document's full attribute set (icon, cover, `custom-*`) as JSON — the read half `set_attr` never had. `--key` narrows to one value.
- `file export_md --with-frontmatter` prepends a `---`/`key: value`/`---` YAML block built from those attrs so exported Markdown round-trips into Obsidian/notesmd-style frontmatter workflows. Off by default so existing exports are unchanged.
- Registration: `get_attr` is a new action on `document` (`read()` tier, full checklist). `--with-frontmatter` is a flag on `file export_md`/`export_markdown_snapshot`. Skill: `siyuan-sisyphus-file-export`.
- Tests: full + single-key read, frontmatter emit/shape/escaping (quote strings containing `:`/`#`), `custom-*` pass-through, flag-off regression; live export on `local`.

### Phase 5.5 — `document find_replace` scoped find-and-replace

```sh
document find_replace --id <doc> --old "draft" --new "final"            # all occurrences in one doc
document find_replace --id <doc> --old "draft" --new "final" --limit 1  # first only
```

- Scopes the existing workspace `search find_replace` to a single document or block subtree, so an agent doesn't have to match the whole notebook to fix one line.
- Implementation: enumerate the target's blocks (existing `get_child_blocks`/`read` machinery), find textual matches in editable block content, and rewrite each hit with `block update` — reusing `find_replace`'s provenance/confirm flow but pre-filtered to one document.
- Registration: new action on `document`, `advanced` / `mutation('content')`, full checklist. Skill: `siyuan-sisyphus-create-edit`.
- Tests: match scoping (a hit in another doc is untouched), `--limit`, code-block vs prose behavior, no-match no-op, confirm-flow; live on e2e doc.

### Phase 5.6 — `system whoami` identity

```sh
system whoami   # { user, account?, workspace, profile }
```

- Returns the current identity: configured profile name, SiYuan account/user if the kernel reports one, and the active workspace — so a multi-profile agent can tell which vault it's writing to before mutating.
- Registration: new action on `system`, `read()` tier. Cheap; combines `system conf`/`workspace_info` fields already reachable.
- Tests: shape stability, profile echo, offline/degraded handling.

### Phase 5.7 — `document archive` soft-archive

```sh
document archive --id <doc>             # tag custom-archived + optional move
document archive --id <doc> --to /Archive   # also relocate under an archive path
```

- Marks a document archived without deleting: sets `custom-archived=true` (visible to queries/filters) and optionally moves it under a caller-chosen archive path/notebook. Reversible via `set_attr --key custom-archived --value ''`.
- Mirrors `notion page archive` (soft-delete that keeps the record). Unlike `remove`, nothing is destroyed.
- Registration: new action on `document`, `basic` / `mutation('content')` (+ `structure` if `--to` moves). Skill: `siyuan-sisyphus-create-edit`.
- Tests: attr set + readback, optional move under path, idempotent re-archive, clear round-trip.

### Phase 5.8 — `dailynote create --template` + `--print-path`

```sh
dailynote create --notebook <nb> --template <name>     # render a template into today's note
fs read --path /Nb/2026/09/27 --print-path             # underlying .sy disk path
```

- `dailynote create --template` renders a workspace template (same Sprig path as `document create --template`) when materializing the daily note — saves a separate render+append round-trip.
- `--print-path` on `fs`/`document` read returns the real `.sy` path on disk so an agent can hand the file to an external editor/diff tool (`notesmd open`/`--editor` analog).
- Registration: flag additions on existing actions; `--print-path` is read-tier metadata. Skill: create-edit / file-export.
- Tests: template render into daily note, path resolution for notebook+path, flag-off regression.

### Not-feasible items (kernel gaps, recorded so they aren't re-litigated)

- **Comments** — kernel exposes no comment API; `notion comment`/`lark doc comment` have no counterpart.
- **Watch / event subscription** — kernel is pull-only; `block recent_updated` is the documented polling proxy.
- **Property typing on `set_attr`** — SiYuan document attrs are strings; richer types live in AV columns, which Phase 2 already makes schema-aware.
- **`document graph` / mermaid export** — `get_backlinks` + `list_invalid_refs` already return the adjacency data; a graph serializer is optional polish, deferred.

### Registration checklist delta for Phase 5

New actions this phase (`system api`, `system whoami`, `document get_attr`, `document find_replace`, `document archive`) follow the full checklist in "Registration checklist (per new action)". Flag/schema widenings (`--file`, `--filter-json`, `--with-frontmatter`, `--template`, `--print-path`, `columnName` already done) touch only `types.ts` + handler + help/skill — no new ACTIONS entry.

### Phase 5 unit-test map

| Phase | Files | Focus |
|---|---|---|
| 5.1 | `tests/unit/tools/block.test.ts` + `document.test.ts` | file read, stdin, exclusivity |
| 5.2 | `tests/unit/tools/system.test.ts` | method gating, confirm, passthrough, errors |
| 5.3 | `tests/unit/tools/av.test.ts` + `query-filter.test.ts` | nested compile, merge, caps |
| 5.4 | `tests/unit/tools/document.test.ts` + `file.test.ts` | attr read, frontmatter emit/escape |
| 5.5 | `tests/unit/tools/document.test.ts` | doc scoping, limit, confirm |
| 5.6 | `tests/unit/tools/system.test.ts` | shape, profile echo |
| 5.7 | `tests/unit/tools/document.test.ts` | attr + optional move, idempotent |
| 5.8 | `tests/unit/tools/dailynote.test.ts` + `fs.test.ts` | template render, path resolution |

### Phase 5 skill / eval coverage

- `siyuan-sisyphus-system-cli` gains `system api` escape-hatch guidance (when to use it, confirm requirement) and `whoami`.
- `siyuan-sisyphus-database` gains the `--filter-json` example beside the linear grammar.
- `siyuan-sisyphus-create-edit` gains `document get_attr`/`find_replace`/`archive`, `dailynote --template`, and `--file` examples.
- `siyuan-sisyphus-file-export` gains `--with-frontmatter` and `--print-path`.
- New eval prompts (mirroring r01–r16/d01–d20): `sys-api01` raw endpoint call, `fj01` nested av filter, `fa01` frontmatter export, `fr01` scoped find-replace — each asserting the chosen action plus readback.
