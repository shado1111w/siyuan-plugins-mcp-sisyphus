---
name: siyuan-sisyphus-database
description: CLI-only playbook for SiYuan attribute views with siyuan-sisyphus. Use to inspect database metadata, render views, add columns or rows, update cells, and keep AV, view, row, column, and block IDs distinct.
---

# Operate SiYuan Databases with the CLI

Never guess attribute-view identifiers. Inspect the AV and its views before changing rows or cells.

`av` actions operate on existing database blocks, and the CLI can now create one too. Use `av create_table` with the host `blockID` and an ordered `columns` list to materialize a NodeAttributeView block and add its non-primary-key columns in one flow. To insert-or-update a row by its primary-key text without first rendering the view, use `av upsert_row` — it creates a detached row when the key is absent and applies any `cells` after the row resolves; keep `add_rows` + `set_cells` for bound-row control when you already hold row IDs. To read one record as a column-name map without rendering the whole view, use `av get_row`; to write several cells on a known row in one call, use `av update_row` with `rowID` + `cells[]` (columnID or columnName). To read rows matching a condition without mutating the saved view, prefer `av query` — it takes human `filters[]` (Status=done, Priority>2, Name~report, !Due for empty) and `sorts[]` (Created:desc) evaluated in process. Never call `av set_filters` just to read; that rewrites the stored view.

```bash
siyuan-sisyphus av get --av-id '<av-id>' --json
```
```bash
siyuan-sisyphus av render --av-id '<av-id>' --page '1' --page-size '50' --json
```
```bash
siyuan-sisyphus av search --keyword 'project' --json
```
```bash
siyuan-sisyphus av query --av-id '<av-id>' --filters-json '["Status=done"]' --sorts-json '["Created:desc"]' --json
```

Keep these identifiers distinct: AV ID identifies the database; view ID identifies a table/board view; row ID identifies a key value; column ID identifies a key; block ID identifies note content.

## Mutations

```bash
siyuan-sisyphus av add-column --av-id '<av-id>' --key-name 'Status' --key-type 'select' --json
```
```bash
siyuan-sisyphus av add-rows --av-id '<av-id>' --view-id '<view-id>' --block-ids-json '["<block-id>"]' --json
```
```bash
siyuan-sisyphus av upsert-row --av-id '<av-id>' --primary-key '<primary-key-text>' --cells-json '[{"columnName":"Status","option":"done"}]' --json
```
```bash
siyuan-sisyphus av get-row --av-id '<av-id>' --row-id '<row-id>' --json
```
```bash
siyuan-sisyphus av update-row --av-id '<av-id>' --row-id '<row-id>' --cells-json '[{"columnName":"Status","option":"done"}]' --json
```
```bash
siyuan-sisyphus av set-cells --av-id '<av-id>' --cells-json '[{"rowID":"<row-id>","columnName":"Status","option":"done"}]' --json
```
```bash
siyuan-sisyphus av create-table --block-id '<host-document-or-block-id>' --columns-json '[{"name":"Task","type":"text"},{"name":"Status","type":"select","options":["todo","done"]}]' --json
```

Cells accept `columnName` in place of `columnID`, and you can omit `valueType` — it is inferred from the column schema, so you only pass the matching value field (`option` for a select column, `options` for multi-select, `checked` for checkbox, `text` for text). Render the current view first to learn row and column IDs; do not put a date-shaped string into a number/date/select column. Re-render after mutation. Read `siyuan-sisyphus help av set-cells` for the current cell schema.

Treat a successful mutation response as provisional until the same view and affected rows/cells are read back. Keep the render and readback paginated, continue while more data is advertised, and compare the intended cell values by stable row and column IDs. A raw MCP or CLI success message does not establish that strict-write coordination or complete readback occurred.
