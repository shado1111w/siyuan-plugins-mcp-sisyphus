---
name: siyuan-mcp-database
description: MCP playbook for SiYuan attribute views. Use to inspect database metadata, render views, add columns or rows, update cells, and keep AV, view, row, column, and block IDs distinct.
---

# Operate SiYuan Databases with MCP

Never guess attribute-view identifiers. Inspect the AV and its views before changing rows or cells.

`av` actions operate on existing database blocks, and the CLI can now create one too. Use `av create_table` with the host `blockID` and an ordered `columns` list to materialize a NodeAttributeView block and add its non-primary-key columns in one flow. To insert-or-update a row by its primary-key text without first rendering the view, use `av upsert_row` — it creates a detached row when the key is absent and applies any `cells` after the row resolves; keep `add_rows` + `set_cells` for bound-row control when you already hold row IDs. To read one record as a column-name map without rendering the whole view, use `av get_row`; to write several cells on a known row in one call, use `av update_row` with `rowID` + `cells[]` (columnID or columnName). To read rows matching a condition without mutating the saved view, prefer `av query` — it takes human `filters[]` (Status=done, Priority>2, Name~report, !Due for empty) and `sorts[]` (Created:desc) evaluated in process. Never call `av set_filters` just to read; that rewrites the stored view.

```text
av(action="get", avID="<av-id>")
```
```text
av(action="render", avID="<av-id>", page=1, pageSize=50)
```
```text
av(action="search", keyword="project")
```
```text
av(action="query", avID="<av-id>", filters=["Status=done"], sorts=["Created:desc"])
```

Keep these identifiers distinct: AV ID identifies the database; view ID identifies a table/board view; row ID identifies a key value; column ID identifies a key; block ID identifies note content.

## Mutations

```text
av(action="add_column", avID="<av-id>", keyName="Status", keyType="select")
```
```text
av(action="add_rows", avID="<av-id>", viewID="<view-id>", blockIDs=["<block-id>"])
```
```text
av(action="upsert_row", avID="<av-id>", primaryKey="<primary-key-text>", cells=[{"columnName":"Status","option":"done"}])
```
```text
av(action="get_row", avID="<av-id>", rowID="<row-id>")
```
```text
av(action="update_row", avID="<av-id>", rowID="<row-id>", cells=[{"columnName":"Status","option":"done"}])
```
```text
av(action="set_cells", avID="<av-id>", cells=[{"rowID":"<row-id>","columnName":"Status","option":"done"}])
```
```text
av(action="create_table", blockID="<host-document-or-block-id>", columns=[{"name":"Task","type":"text"},{"name":"Status","type":"select","options":["todo","done"]}])
```

Cells accept `columnName` in place of `columnID`, and you can omit `valueType` — it is inferred from the column schema, so you only pass the matching value field (`option` for a select column, `options` for multi-select, `checked` for checkbox, `text` for text). Render the current view first to learn row and column IDs; do not put a date-shaped string into a number/date/select column. Re-render after mutation. Read `siyuan://help/action/av/set_cells` for the current cell schema.

Treat a successful mutation response as provisional until the same view and affected rows/cells are read back. Keep the render and readback paginated, continue while more data is advertised, and compare the intended cell values by stable row and column IDs. A raw MCP or CLI success message does not establish that strict-write coordination or complete readback occurred.
