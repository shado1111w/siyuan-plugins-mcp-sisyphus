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
