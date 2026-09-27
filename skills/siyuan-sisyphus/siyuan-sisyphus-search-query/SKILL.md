---
name: siyuan-sisyphus-search-query
description: CLI-only playbook for finding and querying SiYuan content with siyuan-sisyphus. Use for fulltext, semantic search, read-only SQL, backlinks, references, assets, dynamic query blocks, and safe find-replace.
---

# Search and Query SiYuan with the CLI

Search to identify candidates, read the target by ID or path, and only then edit. Use explicit pagination for repeatable results.

```bash
siyuan-sisyphus search fulltext --query 'keyword' --page '1' --page-size '20' --json
```
```bash
siyuan-sisyphus search semantic --query 'concept or meaning' --type-shortcodes-json '["h","p"]' --page '1' --page-size '20' --json
```
```bash
siyuan-sisyphus search fulltext --query 'keyword' --parent-id '<doc-id>' --type-shortcodes-json '["h","p"]' --json
```
```bash
siyuan-sisyphus search query-sql --stmt 'SELECT id, hpath, content FROM blocks WHERE type = '"'"'p'"'"' ORDER BY updated DESC LIMIT 10' --json
```
```bash
siyuan-sisyphus search get-backlinks --id '<block-or-doc-id>' --ref-tree-id '<doc-id>' --mode 'both' --json
```
```bash
siyuan-sisyphus search search-refs --id '<block-id>' --before-len '512' --json
```

`search get_backlinks` and `block docs_info` depend on SiYuan's reference index, which is eventually consistent. A newly created block reference `((id 'title'))` may not appear in backlink results or `refCount` for several seconds. Retry with a short delay before concluding a reference is missing.

For block attribute searchability: `name` and `alias` are indexed for fulltext search, but `bookmark` and custom attributes are not. Use `block get_attrs` to verify attribute values, and `search query_sql` on the `attributes` table for custom-attribute queries.

```bash
siyuan-sisyphus search search-assets --query 'diagram' --exts-json '["png","jpg","webp"]' --json
```


Search results mix `NodeDocument`, `NodeHeading`, `NodeParagraph`, and other node types in the `data[]` array. Check `type` before using `id` — a `NodeDocument` id is a doc root, not a content block, and cannot be used with block-level actions like `block update` or `block replace`.

SQL must be read-only and must include `LIMIT`. Useful tables include `blocks`, `blocks_fts`, `attributes`, `refs`, `spans`, and `assets`.

## Find and replace

This action mutates content. First search, read each target, show the exact old/new text and IDs, and obtain explicit approval.

```bash
siyuan-sisyphus search find-replace --k 'old text' --r 'new text' --ids-json '["<doc-id>"]' --json
```

Read the changed blocks again. Recent writes can take time to enter the search index; verify a fresh mutation by ID or path rather than assuming an empty search means failure. Use `siyuan-sisyphus help search query-sql` for live SQL action constraints.
