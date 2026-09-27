---
name: siyuan-sisyphus-timeline
description: CLI-only playbook for SiYuan document timelines with siyuan-sisyphus. Use to list or create named snapshot nodes, compare document versions, remove node tags, and safely roll back a document or one changed block.
---

# Manage SiYuan Document Timelines with the CLI

Resolve and read the document first. Use document-scoped nodes for one document and global nodes only when the same named snapshot should be discoverable across documents.

## Create and compare nodes

List existing nodes before creating a new one:

```bash
siyuan-sisyphus timeline list-nodes --scope 'document' --document-id '<doc-id>' --page '1' --page-size '50' --json
```
```bash
siyuan-sisyphus timeline create-node --name 'Before revision' --scope 'document' --document-id '<doc-id>' --json
```

Keep the returned `tag` as the stable identifier. After content changes, compare the same document with that tag:

```bash
siyuan-sisyphus timeline compare-node --document-id '<doc-id>' --tag '<timeline-tag>' --page '1' --page-size '20' --no-include-unchanged --json
```

`compare_node` creates an untagged current-state workspace snapshot before calculating the document diff. Paginate changed blocks with `page` and `pageSize`; request unchanged blocks only when they are required for context.

## Delete or roll back

`delete_node`, `rollback_document`, and `rollback_block` are DISABLED BY DEFAULT. Inspect `siyuan-sisyphus help timeline rollback-document` first; if the runtime reports `action_disabled`, ask the user to enable that action under Settings -> Plugins -> SiYuan MCP sisyphus -> timeline before attempting. Do not silently retry.

`delete_node` removes the protective tag but retains the underlying snapshot. `rollback_document` restores only the selected document file, not the whole workspace. `rollback_block` accepts only a fresh opaque `changeKey` from `compare_node`; it recalculates the diff and rejects stale or unsafe changes.

Before any delete or rollback, show the exact document, node name/tag, and consequence, then obtain explicit approval. These actions require `rwd` permission and may be disabled by default. Never bypass an unavailable dangerous action; inspect `siyuan-sisyphus help timeline rollback-document` and ask the user to enable it when appropriate.

After approval, use the narrowest operation that satisfies the request:

```bash
siyuan-sisyphus timeline rollback-block --document-id '<doc-id>' --tag '<timeline-tag>' --change-key '<fresh-change-key>' --json
```
```bash
siyuan-sisyphus timeline rollback-document --document-id '<doc-id>' --tag '<timeline-tag>' --json
```
```bash
siyuan-sisyphus timeline delete-node --tag '<timeline-tag>' --document-id '<doc-id>' --json
```

After rollback, read the document again. After node creation or deletion, list nodes again. For a reversible rollback test, create a named protection node for the current state, roll back to the target, verify it, then restore from the protection node and verify again; obtain approval for both rollback operations.
