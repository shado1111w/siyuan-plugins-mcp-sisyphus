---
name: siyuan-mcp-tag-flashcard
description: MCP playbook for SiYuan tags and flashcards. Use for inline tags, tag discovery and rename, deck discovery, card creation, due/new review, and safe removal.
---

# Manage SiYuan Tags and Flashcards with MCP

Create tags by writing `#tag#` into Markdown. Create flashcards with the flashcard action so both riff registration and block metadata remain consistent.

```text
block(action="append", parentID="<doc-id>", dataType="markdown", data="#project# #project/phase1#")
```
```text
tag(action="list", keyword="project")
```
```text
tag(action="rename", oldLabel="old-tag", newLabel="new-tag")
```

## Flashcard workflow

Create or identify a heading block, discover the target deck, then register the block as a card:

```text
block(action="append", parentID="<doc-id>", dataType="markdown", data="## What is spaced repetition?\n\nReview just before forgetting.")
```
```text
flashcard(action="get_decks")
```
```text
flashcard(action="create_card", deckID="<deck-id>", blockIDs=["<heading-block-id>"])
```
```text
flashcard(action="list_cards", scope="deck", deckID="<deck-id>", filter="due")
```
```text
flashcard(action="review_card", deckID="<deck-id>", cardID="<card-id>", rating=3)
```

Ratings are 1 through 4, with larger values representing easier recall. Do not imitate flashcard creation with block attributes alone. Before removing a tag or card, show the exact label, deck, and block IDs and obtain approval. `tag list` shows hierarchical tags with parent-level `count=0` — only leaf tags carry document counts. This is expected; the parent exists as a grouping node.

Newly written tags and headings may need a short indexing delay before discovery actions show them.
