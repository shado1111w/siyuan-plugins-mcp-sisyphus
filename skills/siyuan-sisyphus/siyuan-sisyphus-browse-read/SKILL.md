---
name: siyuan-sisyphus-browse-read
description: CLI-only playbook for browsing and reading SiYuan notes with siyuan-sisyphus. Use for notebooks, document trees, human-readable paths, IDs, storage paths, block content, and read-only discovery.
---

# Browse and Read SiYuan with the CLI

Start with `fs` and human-readable paths. Drop to document or block actions only when IDs, storage paths, metadata, or block structure are required.

## Discovery workflow

```bash
siyuan-sisyphus notebook list --json
```
```bash
siyuan-sisyphus fs ls --path '/' --json
```
```bash
siyuan-sisyphus fs tree --path '/Notebook/Folder' --max-depth '4' --json
```
```bash
siyuan-sisyphus fs read --path '/Notebook/Folder/Doc' --block-start '0' --block-limit '50' --token-budget '2000' --json
```

Use search-assisted discovery when the path is unknown:

```bash
siyuan-sisyphus fs search --path '/Notebook' --query 'keyword' --page '1' --page-size '20' --json
```

`fs search` runs a regex-capable Markdown-line scan inside a human-readable path scope. Use it when you already know which notebook/folder/doc to grep, or when you need regex over the rendered Markdown view.

```bash
siyuan-sisyphus search fulltext --query 'keyword' --page '1' --page-size '20' --json
```

`search fulltext` uses the kernel's block-level index. Use it when you don't know which document holds the text, need block-granular hits, or want `parentId`/`typeShortcodes`/`hasTags` filtering.

## Low-level reads

```bash
siyuan-sisyphus document lookup --id '<doc-id>' --include-json '["id","path","hpath","docInfo"]' --json
```
```bash
siyuan-sisyphus document get-doc --id '<doc-id>' --mode 'markdown' --json
```
```bash
siyuan-sisyphus block get-kramdown --id '<block-id>' --json
```
```bash
siyuan-sisyphus document read --id '<doc-id>' --scope 'section' --anchor '<heading-title>' --json
```

Prefer `document read` over `document get_doc` + manual block stitching when you need only part of a document: `--scope outline` returns headings only, `--scope section --anchor <heading-id-or-title>` returns one heading subtree, `--scope range --start-id/--end-id` returns a block-id span, and `--scope keyword --pattern a|b [--context-before N --context-after N]` returns matched blocks with surrounding context. `get_doc` remains the right choice for full-text windowed pagination. `fs.read` stays the human-readable-path convenience layer.

`document lookup` returns `{humanPath, idPath}` — there is no top-level `id` field. To get a document/block ID, strip the `.sy` suffix from `idPath.path` (e.g., `/20260712123000-abc123.sy` -> `20260712123000-abc123`).

If the Markdown contains an `assets/...` image and the task depends on its visual content, a vision-capable client should read one relevant image directly:

```bash
siyuan-sisyphus file read-image --id '<doc-id>' --path 'assets/question.png' --json
```

Provide either the document ID or its human-readable `documentPath`, never both. The server authorizes that document and verifies its direct image reference before returning an image content block. MCP clients receive the image directly; CLI default output shows metadata, while explicit `--json` retains the non-text block for scripts. Do not inline every image during ordinary document reads. Stored OCR is only a fallback when direct vision is unavailable.

## Path semantics

| Value | Example | Typical use |
| --- | --- | --- |
| Workspace path | `/Notebook/Folder/Doc` | `fs` actions |
| Notebook-local hpath | `/Folder/Doc` | document create or lookup with notebook |
| Storage path | `/20260712123000-abc123.sy` | low-level rename, remove, or move |

Never derive a storage path from a title. Resolve the document first and reuse the returned path. For `fs.read` and Markdown `document.get_doc`, treat `hasNextWindow=true` as incomplete data and continue with the returned `nextWindow`. For list and search results, continue with explicit `page` and `pageSize` values.

Discovery identifies candidates; it does not authorize a write. Before changing one result, reread it by stable ID or resolved path and record the exact target. If a read is incomplete, continue the bounded window or page sequence instead of deciding from a truncated response.
