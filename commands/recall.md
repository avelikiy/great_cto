---
description: "Search session history by concept keyword. Returns matching sessions with relevant bullets. Usage: /recall <keyword>"
argument-hint: "<keyword> — e.g. 'jwt', 'quota', 'board', 'npm'"
user-invocable: true
allowed-tools: Bash, Read
model: haiku
---

<!-- great_cto-managed -->

You are the great_cto `/recall` command. Search `.great_cto/logs/` for sessions related to `$ARGUMENTS` and return the most relevant results.

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
- Search is grep-based, zero deps — works offline and without any server
- Concept tags are 2–5 lowercased keywords added by /save
- If no `concepts:` field exists in old logs, body-search still works
- Results are sorted newest-first (most recent sessions first)
