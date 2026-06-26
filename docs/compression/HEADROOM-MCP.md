# Optional headroom-ai MCP integration (great_cto-k9p)

great_cto's context compression is **native, deterministic, $0** by default
(`scripts/lib/compress/*` — log-template / json-minify / line-importance, + CCR content-addressed
lossless-on-demand). That covers logs, JSON, diffs, and large text. This doc specifies how to bolt
on the **headroom-ai MCP** for the few cases native compressors can't reach — **AST-aware code
compression, model-weight / tensor blobs, and very large semantic text** — as an **opt-in,
power-user add-on**. It is **never a default dependency**.

## Decision: when (not) to add it

| You have… | Use |
|---|---|
| Logs, JSON, diffs, prose, generated output | **native only** (default — already shipped) |
| Occasional large blobs | native + CCR (lossless retrieve on demand) — still no MCP |
| Routinely compressing **ASTs / parse trees / model artifacts / huge semantic corpora**, and you want model-grade semantic compression | **add headroom MCP** |

If you're unsure, you don't need it. Native + CCR is the right default for ~all great_cto work.

## How it plugs in (no code change to ship)

The extension point already exists in `scripts/lib/compress/index.mjs` — `compress(text, opts)`:

```js
// opts.headroom : (text, { type }) => { compressed, type? }   // injected ONLY when enabled
// opts.heavy    : boolean   // force the heavy path
// opts.heavyBytes : number  // size threshold (default 200_000)
compress(blob, { headroom: headroomCompress, heavy: true });
// → { compressed, type, before, after, ratio, via: 'headroom' | 'native' }
```

Routing rules (enforced + tested in `tests/lib/compress-headroom.test.mjs`):
1. headroom is consulted **only** when `opts.headroom` is a function **and** the blob is heavy
   (`opts.heavy === true` or `length ≥ heavyBytes`).
2. If headroom returns a **shorter** result → use it (`via: 'headroom'`).
3. If it throws, returns nothing, or returns something **not shorter** → silent **native fallback**
   (`via: 'native'`). headroom can never break or worsen compression.
4. No `opts.headroom` → native only. The MCP is never imported by the library.

## Enabling it in a project

1. **Install the MCP** (power user, their machine):
   ```bash
   claude mcp add headroom -- npx -y headroom-ai-mcp   # example; not bundled
   ```
2. **Opt in** in `.great_cto/PROJECT.md`:
   ```yaml
   headroom: true
   ```
3. **Wire the injector** at the call site (the only glue): when `PROJECT.md` has `headroom: true`
   and the MCP responds, pass a thin adapter as `opts.headroom` that forwards the blob to the MCP
   tool and maps `{ compressed, type }` back. When the flag is false or the MCP is absent, pass
   nothing — `compress()` stays native. Keep the adapter in the caller, **not** in
   `scripts/lib/compress/` (the library must stay dependency-free).

## Guarantees / non-goals

- **Never a default dep** — `package.json` does not list headroom; the library never imports it.
- **Fail-open** — any MCP error/timeout/garbage → native result, never a thrown error, never worse.
- **Opt-in + per-call** — controlled by the `headroom: true` flag and the per-call `heavy` gate, so
  cheap native compression stays the hot path and the MCP is only paid for heavy blobs.
- **Not for** logs/JSON/diffs/prose — native already wins there; routing those to an MCP wastes a
  round-trip.

> Status: spec + extension point shipped (dep-free). Installing/wiring the actual headroom MCP is
> the power-user's step; great_cto needs no change to support it.
