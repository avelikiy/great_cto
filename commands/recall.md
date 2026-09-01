---
description: "Search what this project knows about a concept — session history, and the documents written about it. Usage: /recall <keyword>"
argument-hint: "<keyword> — e.g. 'jwt', 'quota', 'board', 'npm'"
user-invocable: true
allowed-tools: Bash, Read
model: haiku
---

<!-- great_cto-managed -->

You are the great_cto `/recall` command. Answer "what does this project already know about `$ARGUMENTS`?" from two places: what HAPPENED (session logs) and what is WRITTEN DOWN (the `docs/` tree). A concept the operator half-remembers is as likely to live in an ADR as in a session.

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
MS="$HOME/.claude/plugins/cache/local/great_cto"
MS="$(ls -d $MS/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')/scripts/lib/memory-search.mjs"
[ -f "$MS" ] || MS="scripts/lib/memory-search.mjs"

if [ -n "$QUERY" ] && command -v node >/dev/null 2>&1 && [ -f "$MS" ]; then
  echo "=== Documents ==="
  # Prints one of three things, and they are different answers: ranked hits,
  # "no matches in N documents" (the corpus was read and holds nothing), or
  # "nothing to search" (this project has no docs/ at all).
  node "$MS" "$QUERY" --source docs --limit 6
fi
```

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
