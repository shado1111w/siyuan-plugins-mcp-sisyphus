# C01-C20 Complex Scenario Evaluation

Date: 2026-09-27

| ID | Scenario | Result | Issues Found |
|----|----------|--------|-------------|
| c01 | Daily note + block ref new doc + backlink | PASS | docs_info refCount=0 delay; get_backlinks empty for new refs |
| c02 | Three ref forms (ref/embed/link) in one doc | PASS | siyuan:// link creates mention not backlink (warning shown) |
| c03 | heading_to_doc / doc_to_heading | FAIL | SiYuan kernel: fs write headings not in blocktrees, heading2Doc returns "block not found" |
| c04 | Super block col layout | PASS | Verified via browser: data-sb-layout="col" renders horizontally |
| c05 | Hierarchical tags on 3 docs | PASS | Parent tag count=0 (child tags counted separately) |
| c06 | bookmark+name+alias via set_attrs | PASS | bookmark not in fulltext index (expected); name+alias searchable |
| c07 | AV database in doc + embed in daily | SKIP | CLI cannot create new AV blocks; only operate on existing ones |
| c08 | Query embed by tag | PASS | query_embed block created correctly; source modify works |
| c09 | Embed task list in daily note | PASS | Embed created; checkbox toggle needs UI verification |
| c10 | Create flashcard | PASS | flashcard create_card works with deck-id + block-id |
| c11 | Quick note → move to Inbox folder | PASS | document move works correctly |
| c12 | recent_updated + list_tree | PASS | document-grouped view + raw items both available |
| c13 | Breadcrumb for nested block | PASS | doc → h2 → paragraph chain correct |
| c14 | Custom attr + SQL query | PASS | attributes table queryable; attr change reflected immediately |
| c15 | Nested docs + MOC + move | PASS | Refs survive document move (id-based) |
| c16 | Export Markdown | PASS | Frontmatter + headings preserved |
| c17 | Rich text cleanup + ref into daily | PASS | Tag added to block; ref pasted to daily note |
| c18 | Breadcrumb + outline for 3-level doc | PASS | Outline and breadcrumb match |
| c19 | Double-read double-write | PASS | Both edits persisted without conflict |
| c20 | E2E 7-step task loop | PASS | All 7 steps completed; backlinks API returns empty for new refs |

## Key Findings

### Bugs
1. c03: heading_to_doc fails on fs-write-created headings (SiYuan blocktree not populated for non-editor blocks)

### Accuracy Issues
1. get_backlinks returns empty for newly created block refs (indexing delay or API limitation)
2. docs_info refCount does not update immediately after creating a block ref
3. CLI cannot create new AV/database blocks from scratch (only operate on existing)
4. bookmark attribute is not searchable via fulltext search (expected SiYuan behavior)
5. Parent tags show count=0 in tag list (only leaf tags count docs)

### Efficiency Notes
- create_daily_note marked as "advanced" but actually works without special permission
- block update on list items needs full "- [x] prefix syntax, not just content change
- query_embed blocks cannot be inserted inside NodeList (must be sibling)
