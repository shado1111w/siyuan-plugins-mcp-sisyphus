---
name: siyuan-sisyphus-create-edit
description: CLI-only playbook for creating and editing SiYuan documents and blocks with siyuan-sisyphus. Use for path-based document creation, block append/insert/update, metadata, daily notes, and verified edits.
---

# Create and Edit SiYuan Content with the CLI

Read the target first, choose the highest-level action that preserves intent, perform one bounded change, then read it again.

## Protected writes and readback

For a mutation covered by strict safe writes, call the same action and business arguments with `validateOnly=true`, use the returned precondition field, and submit the server-issued `requestId`. Never invent or recycle a hash credential. After the write, reread the exact stable ID or resolved path with enough bounded fields to prove the intended change and continue until the response is complete.

If the connection fails after execution may have started, or the result says `outcome_unknown` or `readback_mismatch`, do not retry with a new request ID. Inspect the target and resolve the outcome first. A CLI command, raw MCP payload, or Agent-generated call is not by itself evidence that this coordinator path or its guarantees applied; use the current safety response and runtime help.

## Create documents

Use a workspace path for convenient path-based creation:

```bash
siyuan-sisyphus fs write --path '/Notebook/Project/Notes' --markdown 'Initial content paragraph.

## Section

More content.' --json
```

Use a notebook ID plus notebook-local hpath when low-level control is needed:

```bash
siyuan-sisyphus document create --notebook '<notebook-id>' --path '/Project/Notes' --markdown '# Notes' --json
```

Do not include the notebook name in the low-level hpath.

The document title comes from the path or `title`, not from markdown. Do not start markdown with `# Title`; the leading H1 is stripped only when it exactly matches the document title. For `block append/insert/update --data`, no stripping occurs, so a leading `# Title` would persist as an H1 block.

## Edit blocks

```bash
siyuan-sisyphus block append --parent-id '<doc-id>' --data-type 'markdown' --data '## New section

Paragraph.' --json
```
```bash
siyuan-sisyphus block insert --previous-id '<block-id>' --data-type 'markdown' --data 'Inserted paragraph.' --json
```
```bash
siyuan-sisyphus block update --id '<block-id>' --data-type 'markdown' --data 'Replacement block content.' --json
```

To add content to the start or end of a whole document without first resolving a block parentID, use `document append` / `document prepend` with either `id` or `notebook + hpath`. For inserting relative to an existing block keep using `block insert/append/prepend`.

```bash
siyuan-sisyphus document append --notebook '<notebook-id>' --hpath '/Folder/Doc' --data-type 'markdown' --data 'Appended at document end.' --json
```

To instantiate a recurring skeleton (daily standup, weekly review, meeting notes) stored as a SiYuan workspace template, use `document create --template <name-or-path>`. It renders Sprig placeholders such as `{{now}}` through the kernel before writing, so the result is finished content, not a raw template. Discover templates with `file list_templates`. Do not also pass `markdown` — the template supplies the body. To clone an existing document's body into a new path without saving it as a template first, use `document create --copy-from <source-doc-id>`. It reads the source document's editable Markdown and writes it to the new document; combine with a fresh path or parentPath + title.

To check or uncheck a task (todo) block, prefer `block update_task_marker` with `id` (or `ids[]` for a batch) and `checked` — it flips the marker in place without rewriting the block, so you never need the full `- [x] ` markdown prefix.

```bash
siyuan-sisyphus block update-task-marker --id '<task-block-id>' --checked --json
```

When editing a task-list item text via `block update`, provide the complete list prefix (`- [x] ` or `- [ ] `) in the markdown data. A bare text replacement causes the block to be re-parsed as a paragraph and rejected by the list's parent.

Use block `update` only when replacing the whole block is intended. Prefer a scoped replacement for a small textual change:

```bash
siyuan-sisyphus block replace --id '<block-id>' --edit-json '{"old":"draft","new":"final"}' --json
```

## Metadata and daily notes

Use the `dailynote` tool for any operation that targets a daily note — it is the daily-note manager, not a general document editor. Prefer it over `document create_daily_note` / `block add_to_daily_note` whenever a date is involved: it resolves the note through the notebook `dailyNoteSavePath` template, so `create`/`get`/`read`/`append`/`prepend`/`delete` all accept `date=YYYY-MM-DD` and work for past or future days, not only today. For non-daily documents (meeting notes, project pages, MOCs) keep using `fs write` / `document create` / `block` — `dailynote` will not place content under an arbitrary hpath.

Efficiency: one dated call beats a resolve-then-write sequence. `dailynote append --date 2026-09-25 --data ...` finds-or-creates that day's note and writes in a single step — do not `get` then `create` then `append` unless you genuinely need to branch on existence. For `date` values other than today, `append` and `prepend` create the note first if it does not exist; no separate `create` call is needed. When the notebook `dailyNoteSavePath` contains unsupported template expressions, only today's note can be resolved — fall back to `document create_daily_note` for that case.

Behavior to rely on: `create` is idempotent — `created:true` only when a new file was written, `created:false` when it already existed (treat both as success). `append`/`prepend` on today's note go through the native daily-note API and may omit the `id` field; other dates return the document `id`. `dailynote list` enumerates existing notes under the configured prefix and filters by `from`/`to`, but the blocktree index lags writes by a second or two — if a just-created date does not appear, allow a brief delay and retry rather than recreating. `delete` is safe to call on a missing date: it returns `success:false` with an `existed:false` flag and a warning instead of failing.

{{call dn_create}}
{{call dn_append}}
{{call dn_read}}
{{call dn_list}}

## Structural constraints

`query_embed` blocks and other structural block types cannot be inserted inside a `NodeList` or `NodeListItem`. Insert them as top-level siblings in the document body — for example, after the parent list block rather than after an individual list item.

```bash
siyuan-sisyphus block set-attrs --id '<block-id>' --attrs-json '{"custom-source":"agent"}' --json
```
```bash
siyuan-sisyphus document create-daily-note --notebook '<notebook-id>' --json
```

## Heading/document conversion

`document heading_to_doc` and `document doc_to_heading` operate on SiYuan's internal blocktree index. Heading blocks created through `fs write` or `block append` may not be registered in blocktrees immediately, causing `heading2Doc` to return "block not found". If conversion fails, verify the heading exists via `block get_kramdown`, allow a brief indexing delay, and retry. Document-level operations such as `document move` and `document rename` are not affected.

Before rename, move, delete, or broad replacement, resolve the exact target, show the affected scope, and obtain approval. After every mutation, read by stable ID when possible. Use `siyuan-sisyphus help block append` when any parameter is uncertain.
