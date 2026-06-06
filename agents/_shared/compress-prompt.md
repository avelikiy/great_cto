# Compress-before-reasoning — shared agent contract

> Used by `scripts/lib/compress/` (Phase 1) + `scripts/lib/ccr.mjs` (Phase 2) of the
> context-compression initiative. Lets agents read large logs / tool-outputs / test
> results at a fraction of the tokens — **without** losing the answer (CCR is the safety net).

## When to use

Before you reason on any **large** blob (> ~2k tokens): CI/runtime logs, `kubectl logs`,
test output, a big JSON tool result, a long diff. Don't paste the raw blob into your context —
compress it first, reason on the compressed view, and recall the original only if needed.

## The pattern (deterministic, $0 — no LLM call)

```bash
# Locate the scripts (plugin install path or local dev)
PD=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); [ -z "$PD" ] && PD=.
_COMPRESS="$PD/scripts/lib/compress/index.mjs"; [ -f "$_COMPRESS" ] || _COMPRESS="scripts/lib/compress/index.mjs"
_CCR="$PD/scripts/lib/ccr.mjs"; [ -f "$_CCR" ] || _CCR="scripts/lib/ccr.mjs"

# 1. Store the raw original (recoverable) and 2. reason on the compressed view.
RAW="$(kubectl logs deploy/api --since=1h)"            # or test output / tool result
CCR_ID=$(printf '%s' "$RAW" | node "$_CCR" store --source l3-log)
printf '%s' "$RAW" | node "$_COMPRESS" --budget 12000 --stats   # type auto-detected
# stderr prints: # compress: type=log 240000→3100 chars (99% saved)
```

- **Auto-routing** — `index.mjs` detects type (json/log/diff/text) and applies the right
  compressor: log-template (collapse repeats, keep FATAL/ERROR verbatim), json-minify,
  importance-trim (keep severity + stack, elide boilerplate to `--budget`).
- **`--budget N`** — target char cap for trimmable content. Omit for lossless minify/collapse only.
- **`--crush`** — (JSON only) sample long homogeneous arrays. Lossy — only when item-level
  completeness is not needed.

## Recovering the original (lossless-on-demand)

If the compressed view elided something you need (you'll see `… N lines elided …` markers, or a
`<!-- ccr: … -->` footer from memory-filter), pull the full original back:

```bash
node "$_CCR" recall "$CCR_ID"     # or, interactively: /ccr <id>
```

This is the discipline that lets us compress **aggressively**: nothing is ever lost, only moved
out of the hot context until asked for.

## Rules

- Never reason on a > 2k-token raw blob directly — compress first.
- Always `ccr store` the raw before compressing a log/tool-output you might need verbatim
  (errors, audit evidence). Re-queryable sources (live Loki) don't strictly need it.
- The compressors are deterministic and `$0` — no LLM, no cost, safe to pipe everything through.
- Compression must never be trusted blind — any new compressor ships only after passing
  `tests/eval/EVAL-compression-fidelity.md` on the holdout split (`scripts/eval-gate.mjs`).
