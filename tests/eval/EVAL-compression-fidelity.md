# EVAL-compression-fidelity.md

> Component: scripts/lib/compress · Compression layer Phase 1

## Scenario
A deterministic compressor (log-template / json-minify / line-importance) may only ship if
the **compressed** artifact still lets the model surface the key fact at ≥ the uncompressed
rate. This eval is the fidelity gate: feed the compressed output through the actor → judge and
confirm the critical fact (a FATAL, an error line, a specific field) survived. Compression that
drops the answer is REJECTED by `scripts/eval-gate.mjs` on the holdout split.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | A 500-line heartbeat log with one `FATAL oom-killer ... alloc.rs:4012` is compressed via log-template. Ask: what failed? | Compressed output still contains the FATAL line verbatim (kept as its template sample); model reports the OOM + file:line. | FATAL + location surfaced |
| 2 | A JSON API list of 120 users is minified (no crush). Ask: how many active users? | Minify is lossless — all 120 items present; count is correct. | Exact count from minified JSON |
| 3 | A verbose test log trimmed to budget keeps the single `AssertionError` and elides passing-test noise. | The AssertionError + its stack frame survive; elided runs are marked, not silently dropped. | Failure + stack kept, elision marked |
| 4 | A stack trace compressed by line-importance. Ask: where did it throw? | Top stack frame (`at handler (server.js:42:7)`) preserved. | Throw site preserved |
| 5 | Non-JSON tool output accidentally routed to json-minify. | Safe fallback — original returned unchanged (no corruption). | Output identical to input |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | A log where the only error is a single `panic: nil deref` among 1,000 INFO lines. | After compression the panic line is present; model finds it. | Rare signal not crushed away |
| H2 | JSON with `--crush` enabled on a 200-item array, but the answer needs item #150. | Crush is lossy → this case must FAIL the gate unless the needed item is in the kept sample, proving crush is gated off for completeness-sensitive data. | Gate correctly blocks crush when item-level completeness is required |
| H3 | A diff trimmed to budget where the only real change is one `- secret = ...` line. | The changed line survives importance-trim; context elision marked. | Real change preserved |

## Pass threshold
5/5 tuning · 2/3 holdout. (H2 is a deliberate negative — it must *not* pass with crush on, proving the gate catches lossy compression.)

## How to run
```bash
# produce compressed artifacts, then judge fidelity
node scripts/lib/compress/index.mjs <fixture> > /tmp/compressed
node tests/eval/runner.mjs --filter EVAL-compression-fidelity
node tests/eval/runner.mjs --filter EVAL-compression-fidelity --split holdout   # gate evidence
```

## Cross-refs
- Component: scripts/lib/compress (line-importance · log-template · json-minify · content-router)
- Gate: scripts/eval-gate.mjs (promote only if no holdout regression)
- Plan: docs/plans/PLAN-headroom-context-compression.md

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-06 | initial | — | baseline (compression Phase 1) |
