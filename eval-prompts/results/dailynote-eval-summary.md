# dailynote tool eval — d01-d20

Date: 2026-09-27
Profile: local (SiYuan Docker 127.0.0.1:6807)
Notebook: e2e-test (20260927122753-tmll6on)
Method: direct CLI calls against live SiYuan (no sub-agent, no codex exec)

| Case | Scenario | Result |
|------|----------|--------|
| d01 | create+append+get today | PASS |
| d02 | create --date + append + read | PASS |
| d03 | two headings + list write | PASS |
| d04 | task list -[ ]/-[x] status | PASS |
| d05 | prepend ordering | PASS |
| d06 | list --from --to range | PASS |
| d07 | list no filter includes today | PASS |
| d08 | get missing -> create -> get | PASS |
| d09 | prepend/append mixed order | PASS |
| d10 | create+delete -> existed=false | PASS |
| d11 | create 3 dates -> list range all 5 | PASS |
| d12 | append blockquote + code block | PASS |
| d13 | append markdown table | PASS |
| d14 | inline #tag# | PASS |
| d15 | create future date + list | PASS |
| d16 | append block ref ((id "text")) | PASS |
| d17 | create + multi-level standup | PASS |
| d18 | delete missing date -> success:false+warning | PASS |
| d19 | para+task+quote 3 block types | PASS |
| d20 | 3 days -> list range all | PASS |

20/20 PASS

Notes:
- `create` returns `created:false` when note already exists (idempotent); `created:true` only when actually new.
- `list` has a short blocktree index delay (~1-2s) after `create` before the new date appears.
- `append`/`prepend` on today's note go through native daily-note API (no `id` in response); other dates return the doc `id`.
- `delete` on a non-existent date returns success:false with a clear warning, exit 0 (graceful, not a crash).
