# Full 60-Scenario Evaluation Report

Date: 2026-09-27
Branch: test/comprehensive-coverage
SiYuan: v3.8.5 (docker, 127.0.0.1:6807)

## Summary

| Series | Count | Pass | Fail | Skip | Notes |
|--------|-------|------|------|------|-------|
| s01-s20 | 20 | 19 | 0 | 1 | s20: no direct permission_report action |
| u01-u20 | 20 | 20 | 0 | 0 | All pass |
| c01-c20 | 20 | 18 | 1 | 1 | c03: heading_to_doc fails; c07: AV create not supported |
| **Total** | **60** | **57** | **1** | **2** | |

## Issues Found

### Bugs

1. **c03: heading_to_doc fails on fs-write-created headings**
   - SiYuan heading2Doc API requires blocks in blocktrees index
   - fs write/block append headings may not be registered
   - Status: Documented in skill

### Feature Gaps

1. **c07: Cannot create AV/database blocks** - av only operates on existing
2. **s20: No permission_report action** - use notebook list + system conf

### Accuracy Notes (Documented)

- get_backlinks/docs_info: eventually-consistent reference index
- bookmark attr not in fulltext index
- Parent tags count=0 (leaf carries count)
- block update needs full list prefix for task items
- query_embed cannot insert inside NodeList
- siyuan:// links create mentions not backlinks
