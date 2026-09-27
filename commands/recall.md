---
description: "When you half-remember something, find what this project already knows — session history and the documents written about it by keyword; `ccr:<id>` brings back the full original of context compression elided."
argument-hint: "<keyword> | ccr:<id> | --id <id> | ccr — e.g. 'jwt', 'quota', 'ccr:a1b2c3d4e5f6'; bare `ccr` lists recoverable items"
user-invocable: true
allowed-tools: Bash, Read
model: haiku
---

<!-- great_cto-managed -->

You are the great_cto `/recall` command. Answer "what does this project already know about `$ARGUMENTS`?" from two places: what HAPPENED (session logs) and what is WRITTEN DOWN (the `docs/` tree). A concept the operator half-remembers is as likely to live in an ADR as in a session.

One more place, by id rather than keyword: context great_cto compressed out (see
**Mode: ccr** below). Keyword search stays the default.

## Step 0 — Dispatch

```bash
case "${ARGUMENTS:-}" in
  ccr:*)        MODE=ccr; ID="${ARGUMENTS#ccr:}"; ID="${ID%% *}" ;;   # /recall ccr:<id>
  --id\ *)      MODE=ccr; ID="${ARGUMENTS#--id }"; ID="${ID%% *}" ;;  # /recall --id <id>
  ccr|--id)     MODE=ccr; ID="" ;;                                    # list recoverable items
  *)            MODE=keyword ;;                                       # default: Steps 1–3
esac
```

`MODE=ccr` → skip to **Mode: ccr**. Otherwise continue with Step 1.

## Step 1 — Search session logs

```bash
QUERY="${ARGUMENTS:-}"
LOG_DIR=".great_cto/logs"

if [ -z "$QUERY" ]; then
  echo "Usage: /recall <keyword>"
  echo "Examples: /recall jwt  |  /recall quota  |  /recall board  |  /recall npm"
  exit 0
fi

# Search 1: match in concepts frontmatter field (highest precision)
echo "=== Concept matches ==="
grep -ril "concepts:.*${QUERY}" "$LOG_DIR"/session-*.md 2>/dev/null | sort -r | head -10

# Search 2: match in full log body (broader)
echo "=== Body matches ==="
grep -ril "${QUERY}" "$LOG_DIR"/session-*.md 2>/dev/null | sort -r | head -10
```

## Step 1b — Search the documentation

Sessions say what happened; `docs/` says what was decided and why. Ranked, not
grepped — an exact-substring match over a hundred and sixty documents returns
either nothing or everything, and neither is an answer.

Zero dependencies: the BM25 index is built in memory per call and runs in about
a tenth of a second over this repository's corpus.

```bash
QUERY="${ARGUMENTS:-}"
MS="${CLAUDE_PLUGIN_ROOT:-$(ls -d "$HOME"/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}"
MS="$(ls -d $MS/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')/scripts/lib/memory-search.mjs"
[ -f "$MS" ] || MS="scripts/lib/memory-search.mjs"

if [ -n "$QUERY" ] && command -v node >/dev/null 2>&1 && [ -f "$MS" ]; then
  echo "=== Documents ==="
  # Prints one of three things, and they are different answers: ranked hits,
  # "no matches in N documents" (the corpus was read and holds nothing), or
  # "nothing to search" (this project has no docs/ at all).
  # Each hit is `file:line  § section` — open the document at that line.
  # A line "not in any docs document: <terms>" names the words nothing written
  # down contains: that part of the question has no answer in this project.
  node "$MS" "$QUERY" --source docs --limit 6
fi
```

**State the gap as printed.** If the search prints `not in any docs document: …`,
say so in the answer, in those words — "nothing in this project's documents
mentions kubernetes" — and do NOT fill that part in from general knowledge. A
result that matched one of several query words is a partial match; present it as
one, not as the answer.

## Step 2 — Display results

For each unique matching file (deduplicate concept + body matches), show:
- Filename (date + slug)
- `concepts:` frontmatter field (if present)
- `## Done` section bullets (first 5)
- `## Decisions` section (first 3 bullets)

Format:
```
📁 session-2026-05-28-quota-warning-board-fix.md
   concepts: quota, oauth, board, side-panel, claudecode
   Done: SessionStart quota warning (quota-check.mjs, 0 deps)...
         Board side-panel HTML was absent — added 24-line block...
   Decisions: Board widget not worth it — Anthropic admin shows same data
```

If zero matches:
```
No sessions found for: "<query>"
Try broader terms — e.g. /recall auth instead of /recall jwt-refresh
Available concepts: <list top 20 concepts from all logs>
```

## Step 3 — Suggest related recalls

After results, offer 2–3 related searches:
```
Related: /recall <synonym1>  |  /recall <synonym2>
```

## Mode: ccr — retrieve compressed context by id

The retrieval half of **CCR (Compressed Context with Retrieval)**. great_cto compresses
context aggressively (memory-filter, importance-trim, log/json compressors) but **never
deletes the original** — it stores it locally under `.great_cto/ccr/`. When you realise
you need something that was filtered out, `/recall ccr:<id>` brings the full original
back. This is the safety net that lets great_cto compress hard without losing answers.
This was `/ccr` until 3.40.

### ccr — list recoverable items (no id)

```bash
node scripts/lib/ccr.mjs list --limit 20
```

Rows: `id  bytes  source  preview`. `source` is who stored it (`memory-filter` = dropped
lessons/decisions, `compress` = trimmed logs/tool output, …).

### ccr — recall the original (id given)

```bash
node scripts/lib/ccr.mjs recall "$ID"
```

- Prints the **full uncompressed original** — feed it back into your reasoning.
- Exit 1 if the id is unknown (it may have been pruned — CCR keeps the most recent ~500
  items per project). Try `/recall ccr` (list) to see what's still available.

### Where ids come from

Compression components append a footer when they drop something:

```
<!-- ccr: 2 item(s) elided but recoverable. Run `/recall ccr:<id>`:
  - `a1b2c3d4e5f6` — ## Lesson: rate-limit Stripe webhooks
  - `0f9e8d7c6b5a` — ## Decision: pin model versions in ADR-LLM
-->
```

If an elided item looks relevant to the task, recall it instead of guessing.

- Project-local (`.great_cto/ccr/`); content-addressed (identical content → one id, auto-dedup).
- Keyword search (the default) finds session history by concept; `ccr:<id>` retrieves one
  specific compressed-out artifact by id.

## Notes
- Session search is grep-based; document search is BM25-ranked. Both are zero-dep
  and work offline, without any server
- Documents are ranked, sessions are newest-first — on purpose. You want the most
  RELEVANT document and the most RECENT session
- `--source docs` excludes `.summary.md` machine summaries and `docs/<lang>/`
  translations, the same corpus rule the board's Docs screen uses
- Concept tags are 2–5 lowercased keywords added by /save
- If no `concepts:` field exists in old logs, body-search still works
- Results are sorted newest-first (most recent sessions first)
