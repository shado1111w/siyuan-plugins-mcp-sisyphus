#!/usr/bin/env bash
# SiYuan Sisyphus Agent Evaluation - parallel execution
# Usage: bash eval-prompts/run-eval.sh [--scenario s01] [--timeout 120] [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/.."

RD="eval-prompts/results"
LOGDIR="$RD/logs"
TIMEOUT=120
DRY=false
ONLY=""
PREFIX=""
PARALLEL=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario) ONLY="$2"; shift 2;;
    --prefix) PREFIX="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --dry-run) DRY=true; shift;;
    --parallel) PARALLEL="$2"; shift 2;;
    *) echo "Unknown: $1"; exit 1;;
  esac
done
mkdir -p "$RD" "$LOGDIR"

# System prompt for the agent
SYS="You are a SiYuan note agent using siyuan-sisyphus CLI.
CLI: node cli/dist/cli.cjs (run from project root)
Flags: --url http://127.0.0.1:6807 --token zrk1rs7459ml0ecm --json
Notebook: e2e-test (id: 20260927122753-tmll6on)
Skills: cli/dist/skills/siyuan-sisyphus/<scenario-name>/SKILL.md - e.g. cli/dist/skills/siyuan-sisyphus/siyuan-sisyphus/SKILL.md (top-level router), cli/dist/skills/siyuan-sisyphus/siyuan-sisyphus-create-edit/SKILL.md (write ops). Read the top-level SKILL.md first to pick the right scenario skill.
Use list or help tool action to discover commands.
fs tool accepts /Notebook/Doc paths. document tool uses notebook-local hpaths.
After completing the task, reply with a JSON block on its own line:
{status:done|in_progress|failed, commands_used:string, output_summary:string, next_step:string|null}"

run_scenario() {
  local id="$1" prompt="$2"
  local outfile="$RD/$id.json" rawfile="$LOGDIR/$id.log"
  echo "START [$id] $(date +%H:%M:%S) $prompt"
  if $DRY; then echo "  [dry-run]"; return; fi
  local full="$SYS

TASK: $prompt

Execute the appropriate CLI commands to complete this task."
  local t0=$(date +%s)
  perl -e 'alarm(shift); exec @ARGV' "$TIMEOUT" codex exec "$full" --skip-git-repo-check -c 'model_provider="cpa"' -m devin/gpt-5-6-terra --dangerously-bypass-approvals-and-sandbox -o "$outfile" >"$rawfile" 2>&1 &
  local pid=$!
  wait $pid || true
  local t1=$(date +%s)
  local ms=$(( (t1 - t0) * 1000 ))
  if [[ -f "$outfile" ]] && grep -q done "$outfile" 2>/dev/null; then
    echo "PASS  [$id] $(date +%H:%M:%S) ${ms}ms"
    return 0
  else
    echo "FAIL  [$id] $(date +%H:%M:%S) ${ms}ms"
    tail -3 "$rawfile" 2>/dev/null | sed "s/^/    /" || true
    return 1
  fi
}

# Read all scenarios into an array
declare -a IDS CATS PROMPTS
i=0
while IFS="|" read -r id cat prompt; do
  [[ -n "$ONLY" && "$id" != "$ONLY" ]] && continue
  [[ -n "$PREFIX" && "$id" != "$PREFIX"* ]] && continue
  IDS[$i]="$id"; CATS[$i]="$cat"; PROMPTS[$i]="$prompt"
  i=$((i+1))
done << 'SCENARIOS'
s01|browse|List all notebooks in the SiYuan workspace.
s02|browse|Read the document at workspace path /e2e-test/e2e-test-doc.
s03|browse|Show the document tree of the e2e-test notebook max depth 4.
s04|browse|Find a block containing evaluation using search then get its kramdown content.
s05|search|Search for Section within the /e2e-test subtree.
s06|search|Fulltext search for a keyword and show the first 5 results.
s07|search|Query the blocks table using SQL to find blocks containing test.
s08|create|Create a document called Standup-0927 under /e2e-test/ with sections for Timeline and Actions.
s09|create|Create a document Week39-Checklist under /e2e-test/ with 3 task list items.
s10|create|Create today daily note in the e2e-test notebook.
s11|edit|Append a Journal section with notes to an existing document /e2e-test/e2e-test-doc.
s12|edit|Find a block containing Original paragraph and update its content to Updated content.
s13|edit|Replace the word draft with final inside a block that contains it.
s14|edit|Set a custom attribute custom-source=eval on a specific block ID.
s15|edit|Set the icon of a document to emoji.
s16|edit|Rename a document to Renamed-Doc.
s17|edit|Delete a specific document.
s18|browse|Look up metadata for a document.
s19|file|List all assets referenced by a document.
s20|system|Check notebook permissions for all notebooks.
u01|create|Create today daily note then write three sections about today completed blockers and tomorrow first task. Each section should be a separate block.
u02|create|Create a child document with a heading and 3 task list items.
u03|create|Create a document with heading list task blockquote and code block.
u04|create|Set icon on a document then add tags to a paragraph.
u05|search|Search for a keyword open first result and read it.
u06|edit|Find a document containing specific text replace it.
u07|create|Create a document containing a block reference to another doc.
u08|create|Extract a paragraph to new document and leave a reference.
u09|create|Append a block reference to another doc.
u10|create|Append a query embed block to a doc.
u11|edit|Move a doc under another doc then move it back.
u12|edit|Rename a document then verify with lookup.
u13|browse|Get outline of a document with headings.
u14|search|Check backlinks for a referenced document.
u15|edit|Set a bookmark attribute on a block.
u16|create|Create a document with a markdown table.
u17|create|Create a flashcard for a block.
u18|file|Export a document as Markdown.
u19|browse|List recent docs then append text to one.
u20|search|List all tags then find docs with specific tag.
c01|create|Open today daily note (create if missing). Append a line "Topic of today: ". Then create a NEW document titled "Topic-BrowserAssistant-Complex" as a block ref target (use ((id "title")) form referencing the new doc). Inside that new doc, write three level-3 sections: Background, Conclusion, To-Verify. Go back to daily note and confirm the topic line is a real block reference (not plain text). Check the new doc for a backlink to today daily note.
c02|create|Pick an existing short document A. Create doc B with three consecutive sub-blocks: (1) a block reference ((id "title")) to A, (2) an embed block {{select * from blocks where id=...}} to A, (3) a regular document link to A. Label each block clearly. Then modify the source paragraph in A by a few chars. Verify B embed updates, ref anchor still works, and the doc link still resolves.
c03|edit|In a long-ish document, create a level-2 heading "Detachable Section" with two paragraphs under it. Use document heading_to_doc (or equivalent) to convert the heading into a child document. Verify the child doc contains the paragraphs. Then use document doc_to_heading to convert it back. Check that the original document structure and any references are intact.
c04|create|Create document "Layout Experiment" containing a super block with data-sb-layout="col" (use {{{col}}}). Put "Argument" in left column and "Evidence" in right column. Then verify the rendering layout via block dom inspection. Do not modify UI directly via browser.
c05|create|Tag three different documents with hierarchical tags: write #project/test# in doc A, #project/review# in doc B, #daily/test# in doc C. Then use tag list to verify all tags registered. From search query results, verify clicking into a tagged doc leads to the doc.
c06|edit|In a document, pick one paragraph and do: set bookmark attribute (name="complex-test-anchor"), set block name (name="decision-basis"), and add alias (alias="acceptance-criteria") via block set-attrs. Then search for "complex-test-anchor", "decision-basis", "acceptance-criteria" and verify at least one search hits the block.
c07|create|Create doc "Week Task DB". Insert a database block (av) with columns: TaskName, Status, Priority, LinkedNote. Add 3 rows. Set one row LinkedNote to today daily-note id. Then in today daily note embed this av block ({{select id from blocks where id=...}}). Verify the daily note shows the embedded db. Update one row status to "Done" and verify it shows in the embedded view.
c08|create|Ensure at least 2 blocks have inline tag #agent-check#. Create doc "Query Console" with a query embed block {{select * from blocks where tag like "%agent-check%"}}. Verify both source blocks appear. Then modify one source block by a few chars; verify the embed shows updated content after refetch.
c09|create|Create doc "Daily Fixed List" with 3 long-term tasks (task list items). In today daily note under heading "Fixed Focus", insert an embed block pointing to the task list block in Fixed List doc. Toggle one task checkbox in the embedded view; verify source doc shows it checked. Document the behavior.
c10|create|In a doc create a flashcard via flashcard create-card for a heading block (e.g., "## Q: spaced repetition?" with answer paragraph). List flashcards to find the created card. Note its deck-id and card-id for later review.
c11|create|In an inbox notebook (or default notebook), create quick note "Raw idea from browser assistant". Move it into a "Inbox" or "Unsorted" parent document in a real notebook. In the moved doc, prepend "Source: inbox" and a block ref to today daily note. Confirm original location is empty.
c12|edit|Open 4 different docs in sequence (use document get-doc or fs read). Use block recent_updated to verify all 4 appear. Then use document list_tree to show structure. Append a one-line summary to today daily note.
c13|browse|Pick a doc with >=2 outgoing refs (use search refs). Get its backlink count via search get_backlinks. Open relation info via block breadcrumb for context. Write the titles of source and target docs into a "Inspection Log" doc.
c14|edit|Add custom attribute review=2026-W39 to paragraphs in two different docs via block set-attrs. Use search query_sql: SELECT * FROM attributes WHERE name="review" AND value="2026-W39". Verify both blocks surface. Then change one to review="done" and re-run query — should return 1 less.
c15|edit|Under notebook e2e-test create three nested docs: ProjectAlpha / Requirements / AcceptanceCriteria. In ProjectAlpha write a MOC using ((id "title")) refs to Requirements and AcceptanceCriteria. Then use document move to lift AcceptanceCriteria to be a sibling of Requirements. Re-check MOC refs still resolve.
c16|file|Open a doc with heading, list, block-ref, table. Run file export-md. Compare markdown structure: are block refs preserved as ((id "title"))? Is the table still a table? Are headings correct level? Write observations to a "Export Notes" section at end of the doc.
c17|create|Take a rich-text-like content block with link/bold/list and create a doc via fs write. Then clean: split into separate blocks via block insert, remove empty lines, preserve external links as markdown links, prepend tag #clipped# to the first block. Then copy the first paragraph as a block ref into today daily note under "Reading" section.
c18|browse|Pick a doc with 3-level heading structure. Use block breadcrumb to show the ancestry path of the deepest heading. Verify the parent chain matches the document outline via document get_outline. Then append a "Focus-time addition" paragraph under that heading and re-check outline.
c19|edit|Read the same document twice via document get_doc (two separate reads). Modify paragraph 1 in the first read then modify the last paragraph via block update with the doc id. Re-read once to verify both edits persisted without conflict.
c20|edit|End-to-end: 1) today daily note add 3 task items; 2) extract task #1 into a new doc (keep ((id "title")) ref in place); 3) in new doc write "Process Log" and add tag #in-progress#; 4) embed the new doc back into daily note under that task; 5) toggle the daily note task checkbox; 6) verify backlinks between task doc and daily note both ways; 7) rename tag to #archived# and move task doc under an "Archive" folder doc (create if missing).
d01|dailynote|Create today daily note in the e2e-test notebook using dailynote tool. Then append a markdown bullet list with 3 items: Morning standup done, Reviewed 2 PRs, Plan tomorrow tasks. Verify the note exists via dailynote get.
d02|dailynote|Create a daily note for yesterday (2026-09-26) in the e2e-test notebook using dailynote create --date. Append a markdown paragraph "Yesterday review: completed weekly report". Then read the note via dailynote read --date 2026-09-26 to confirm content.
d03|dailynote|Create a daily note for a specific date 2026-09-20 in the e2e-test notebook. Write two sections: ## What went well and ## What to improve, each with one bullet underneath. Verify via dailynote read.
d04|dailynote|Use dailynote append to add "- [ ] Task: deploy hotfix" to today daily note. Then use dailynote append again to add "- [x] Task: morning emails". Read the note and confirm both tasks appear with correct checkbox state.
d05|dailynote|Use dailynote prepend to insert a markdown heading "## Top Priority" at the beginning of today daily note. Then verify via dailynote read that this heading appears before any previously appended content.
d06|dailynote|List all daily notes in the e2e-test notebook for September 2026 using dailynote list --from 2026-09-01 --to 2026-09-30. Report the count and each note hPath.
d07|dailynote|List daily notes in the e2e-test notebook with no date filter via dailynote list. Verify today note is included in the results.
d08|dailynote|Use dailynote get --date 2026-08-15 on the e2e-test notebook. Expect existed=false (assuming no note for that date). Then create it and call dailynote get again — expect existed=true with a valid id.
d09|dailynote|Create daily note for 2026-09-22, append "- First entry". Then append "- Second entry". Then prepend "## Header added later". Read the note and verify order: heading first, then First entry, then Second entry.
d10|dailynote|Create daily note for 2026-09-23 in e2e-test notebook. Then use dailynote delete --date 2026-09-23 to remove it. Verify via dailynote get that existed=false afterwards.
d11|dailynote|Create daily notes for 2026-09-18, 2026-09-19, and 2026-09-21 (three separate create calls). Then run dailynote list --from 2026-09-18 --to 2026-09-21 and confirm all three dates appear.
d12|dailynote|Append a markdown blockquote "> Reminder: drink more water" to today daily note. Then append a code block \\`\\`\\`js console.log(1)\\`\\`\\`. Read the note and verify both blocks render correctly as blockquote and code.
d13|dailynote|Use dailynote append to add a markdown table with 2 columns (Item, Status) and 2 rows to today daily note. Verify via dailynote read that the table structure is preserved.
d14|dailynote|Append a paragraph containing an inline tag #health# to today daily note. Then search for tag "health" via tag list to confirm it was registered.
d15|dailynote|Create a daily note for tomorrow (calculate the date). Append a task "- [ ] Tomorrow: write test plan". Then use dailynote list to confirm tomorrow note appears in results.
d16|dailynote|Use dailynote append to write a paragraph with a block reference to an existing document in today daily note. Format: ((id "title")). Verify via dailynote read that the reference syntax is stored.
d17|dailynote|Create daily note for 2026-09-24 with content "## Standup\n- Item A\n- Item B". Then read it via dailynote read and confirm the heading and both list items exist in the document DOM.
d18|dailynote|Delete the daily note for 2026-09-24 if it exists (call dailynote delete). If it does not exist, the tool should report success=false with a warning — verify that behavior is correct.
d19|dailynote|Use dailynote append to add 3 different blocks to today daily note in sequence: a paragraph, a task list item, and a blockquote. Then read the note and count total top-level blocks.
d20|dailynote|Create a weekly review workflow: use dailynote create for each of the past 3 days (2026-09-25, 2026-09-26, today), append a summary line to each, then use dailynote list to confirm all three are present in the range.
SCENARIOS

echo "=== SiYuan Sisyphus Agent Evaluation ==="
echo "Total scenarios: ${#IDS[@]}, Parallel: $PARALLEL, Timeout: ${TIMEOUT}s"
echo "Results: $RD, Logs: $LOGDIR"
echo ""

passed=0; failed=0; running=0
declare -a PIDS

for i in "${!IDS[@]}"; do
  # Wait if we have enough parallel jobs
  while [[ $running -ge $PARALLEL ]]; do
    for j in "${!PIDS[@]}"; do
      if ! kill -0 "${PIDS[$j]}" 2>/dev/null; then
        wait "${PIDS[$j]}" || true
        unset "PIDS[$j]"
        running=$((running-1))
      fi
    done
    [[ $running -ge $PARALLEL ]] && sleep 0.5
  done

  run_scenario "${IDS[$i]}" "${PROMPTS[$i]}" &
  PIDS+=($!)
  running=$((running+1))
done

# Wait for all remaining jobs
for pid in "${PIDS[@]}"; do
  wait "$pid" || true
done

# Count results
for i in "${!IDS[@]}"; do
  f="$RD/${IDS[$i]}.json"
  if [[ -f "$f" ]] && grep -q done "$f" 2>/dev/null; then
    passed=$((passed+1))
  else
    failed=$((failed+1))
  fi
done

echo ""
echo "=== SUMMARY ==="
echo "Passed: $passed / ${#IDS[@]}"
echo "Failed: $failed / ${#IDS[@]}"
echo "Results in: $RD"
echo "Logs in: $LOGDIR"
