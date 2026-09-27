# document read / append / prepend eval — r01-r16

Date: 2026-09-27
Profile: local (SiYuan Docker 127.0.0.1:6807)
Notebook: e2e-test (20260927122753-tmll6on)
Method: direct CLI verification against live SiYuan (no sub-agent)

## document read --scope (r01-r08)

| Case | Scenario | Result |
|------|----------|--------|
| r01 | --scope outline, headingCount | PASS (4 headings) |
| r02 | --scope section --anchor Body | PASS (subtree only, no Intro/Tail) |
| r03 | --scope keyword alpha\|omega | PASS (OR merge, no beta) |
| r04 | --scope keyword beta +context±1 +ids | PASS (blockRefs 2,3,4) |
| r05 | outline ids -> --scope range | PASS (Body..Tail span) |
| r06 | --scope section without --anchor | PASS (validation_error naming anchor) |
| r07 | --scope section bad anchor | PASS (suggests --scope outline) |
| r08 | --scope range endId<startId | PASS (clear order error) |

## document append / prepend (r09-r16)

| Case | Scenario | Result |
|------|----------|--------|
| r09 | append --id -> last block | PASS |
| r10 | append --notebook --hpath (no lookup) | PASS |
| r11 | prepend --id -> first block | PASS |
| r12 | prepend --hpath -> before previous head | PASS |
| r13 | append id+hpath together | PASS (validation_error "not both") |
| r14 | append no locator | PASS (validation_error "locate the target") |
| r15 | append to missing hpath | PASS (not_found naming hpath) |
| r16 | e2e create/append/outline/section/prepend/full | PASS |

## Result: 16/16 PASS

Notes:
- document read scope=section correctly nests subheadings (Body -> Body.Sub) and stops at the next same-or-higher level heading.
- keyword scope merges non-contiguous matched blocks and expands with contextBefore/contextAfter cleanly.
- --hpath and --hPath are both accepted (CLI flag normalization).
- append/prepend resolve the doc by id OR notebook+hpath in one call; no separate lookup needed.
