---
name: siyuan-mcp-markup-guide
description: MCP SiYuan markup guide for rich Markdown written through block and document actions. Use for headings, lists, tasks, tables, code, math, diagrams, tags, callouts, super blocks, embeds, and block references.
---

# SiYuan Markup Guide with MCP

Pass rich content as Markdown to block or document write actions. Keep each write bounded and read the result after insertion.

```text
block(action="append", parentID="<doc-id>", dataType="markdown", data="## Heading\n\nParagraph with **bold** text.")
```

## Common markup

```markdown
# Heading

**bold**, *italic*, ~~deleted~~, ==highlight==, `inline code`, #tag#

- Item
  - Nested item
- [ ] Task

| Name | Status |
| --- | --- |
| Draft | Done |

> **Note**
>
> Keep evidence with the decision.
```

Use an attribute view for real database behavior rather than a Markdown table.

## Math and diagrams

```markdown
Inline: $e^{i\pi}+1=0$

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$
```

````markdown
```mermaid
flowchart TD
  A[Start] --> B[Done]
```
````

## SiYuan-specific forms

- Block reference: `((<block-id> "Optional label"))`
- Embed query: `{{SELECT id, content FROM blocks WHERE content LIKE '%TODO%' LIMIT 20}}`
- Horizontal (side-by-side) super block: wrap sibling blocks in `{{{col` and `}}}`. SiYuan stores this as `data-sb-layout="col"` = `flex-direction: row` = side-by-side columns.
- Vertical (stacked) super block: wrap sibling blocks in `{{{row` and `}}}`. `row` maps to `data-sb-layout="row"` = `flex-direction: column` = stacked rows.
- IAL attributes: `{: custom-key="value"}`; use dedicated attribute actions for programmatic metadata.

Do not invent unsupported Markdown extensions. For detailed layout rules or unfamiliar write fields, inspect `siyuan://help/action/block/append` before writing.
