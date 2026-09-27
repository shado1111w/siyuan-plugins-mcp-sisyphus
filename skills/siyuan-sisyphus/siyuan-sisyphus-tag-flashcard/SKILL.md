---
name: siyuan-sisyphus-tag-flashcard
description: CLI-only playbook for SiYuan tags and flashcards with siyuan-sisyphus. Use for inline tags, tag discovery and rename, deck discovery, card creation, due/new review, and safe removal.
---

# Manage SiYuan Tags and Flashcards with the CLI

Create tags by writing `#tag#` into Markdown. Create flashcards with the flashcard action so both riff registration and block metadata remain consistent.

```bash
siyuan-sisyphus block append --parent-id '<doc-id>' --data-type 'markdown' --data '#project# #project/phase1#' --json
```
```bash
siyuan-sisyphus tag list --keyword 'project' --json
```
```bash
siyuan-sisyphus tag rename --old-label 'old-tag' --new-label 'new-tag' --json
```

## Flashcard workflow

Create or identify a heading block, discover the target deck, then register the block as a card:

```bash
siyuan-sisyphus block append --parent-id '<doc-id>' --data-type 'markdown' --data '## What is spaced repetition?

Review just before forgetting.' --json
```
```bash
siyuan-sisyphus flashcard get-decks --json
```
```bash
siyuan-sisyphus flashcard create-card --deck-id '<deck-id>' --block-ids-json '["<heading-block-id>"]' --json
```
```bash
siyuan-sisyphus flashcard list-cards --scope 'deck' --deck-id '<deck-id>' --filter 'due' --json
```
```bash
siyuan-sisyphus flashcard review-card --deck-id '<deck-id>' --card-id '<card-id>' --rating '3' --json
```

Ratings are 1 through 4, with larger values representing easier recall. Do not imitate flashcard creation with block attributes alone. Before removing a tag or card, show the exact label, deck, and block IDs and obtain approval. `tag list` shows hierarchical tags with parent-level `count=0` — only leaf tags carry document counts. This is expected; the parent exists as a grouping node.

Newly written tags and headings may need a short indexing delay before discovery actions show them.
