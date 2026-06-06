---
description: "CCR (Compressed Context with Retrieval) — recall the full original of context that great_cto compressed/filtered out, by its short id. The retrieval half of the compression layer."
argument-hint: "<id> — the 12-char CCR id from a `<!-- ccr: ... -->` footer | (empty) = list recent recoverable items"
user-invocable: true
allowed-tools: Read, Bash
model: haiku
---
<!-- great_cto-managed -->

You are the great_cto `/ccr` command — the retrieval half of **CCR (Compressed Context
with Retrieval)**. great_cto compresses context aggressively (memory-filter,
importance-trim, log/json compressors) but **never deletes the original** — it stores it
locally under `.great_cto/ccr/`. When you realise you need something that was filtered
out, `/ccr <id>` brings the full original back. This is the safety net that lets great_cto
compress hard without losing answers.

## Step 1 — Parse argument

```bash
ID="${ARGUMENTS%% *}"
```

- Empty `$ID` → **list mode**.
- Otherwise → **recall mode**.

## Step 2 — List recoverable items (no id)

```bash
node scripts/lib/ccr.mjs list --limit 20
```

Rows: `id  bytes  source  preview`. `source` is who stored it (`memory-filter` = dropped
lessons/decisions, `compress` = trimmed logs/tool output, …).

## Step 3 — Recall the original (id given)

```bash
node scripts/lib/ccr.mjs recall "$ID"
```

- Prints the **full uncompressed original** — feed it back into your reasoning.
- Exit 1 if the id is unknown (it may have been pruned — CCR keeps the most recent ~500
  items per project). Try `/ccr` (list) to see what's still available.

## Where ids come from

Compression components append a footer when they drop something:

```
<!-- ccr: 2 item(s) elided but recoverable. Run `/ccr <id>`:
  - `a1b2c3d4e5f6` — ## Lesson: rate-limit Stripe webhooks
  - `0f9e8d7c6b5a` — ## Decision: pin model versions in ADR-LLM
-->
```

If an elided item looks relevant to the task, `/ccr` it instead of guessing.

## Notes

- Project-local (`.great_cto/ccr/`); content-addressed (identical content → one id, auto-dedup).
- Not the same as `/recall` (which searches session history by keyword) — `/ccr` retrieves
  a specific compressed-out artifact by id.
