# PLAN: v2.5.8 — CI hardening + plugin cache hygiene

**Status:** in progress · **Date:** 2026-05-09 · **Estimated:** ~1h LLM-time

## Problem

Three operational warts visible to anyone browsing the GitHub repo:

1. **Plugin CI red on every release** — 7 consecutive ✗ failure badges. The
   `tests/structural/validate.py` regex doesn't parse the long bash one-liner
   the SessionStart hook ships in `.claude-plugin/plugin.json`.
2. **UI e2e (Playwright) red on every push** — `cache-dependency-path:
   tests/ui/package.json` references a non-existent file; cache resolution
   fails → workflow aborts.
3. **User disks accumulate stale plugin caches** — `~/.claude/plugins/cache/
   local/great_cto/` grows to 7+ versions (1.0.x → 2.5.x). SessionStart
   syncs only the latest but never cleans up.

These don't break functionality but **erode trust** (red badges) and **leak
disk** (~10 MB per stale version × 7 = ~70 MB per user).

## Scope

Three fixes, ~1h LLM-time. No public API changes, no version semantics
beyond patch.

## Fixes

### 1. `tests/structural/validate.py` — robust bash parser

The validator extracts `for CMD in start audit ...` from the SessionStart
command and verifies every command file in `commands/` is in the loop.
Current regex: simple line-by-line that fails on multi-line bash.

**Fix:** parse the JSON properly, extract the `command` field as a single
string, then regex against that. Also handle the `for AGENT in ...` loop
the same way. Use `re.search` with `\s+` instead of literal spaces.

Also: skip retired commands listed in the deprecation block (we already
have one for `triage / gates / dora / ... / capture / revisit / board-report`).

### 2. `.github/workflows/ui-e2e.yml` — cache path

Either:
- (a) delete the workflow if there's no real `tests/ui/` directory yet, or
- (b) point cache to `package-lock.json` if e2e tests do exist somewhere

**Audit:** check if `tests/ui/package.json` was ever created. If never,
delete the workflow (cleaner than keeping a broken one).

### 3. Plugin cache cleanup — `--keep 3` policy

Append to the SessionStart bash one-liner in `.claude-plugin/plugin.json`:

```bash
# Cleanup: keep only the 3 most recent versions (rollback-safe)
ls -d "$HOME"/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null \
  | sort -V | head -n -3 | xargs -I{} rm -rf {} 2>/dev/null || true
```

`sort -V` for semver-aware ordering; `head -n -3` for "everything except
the last 3"; `|| true` so cleanup failure never breaks SessionStart.

Run **before** the version-detect step so the new version detect picks the
freshest. Run **after** the new version sync so we never delete the active.

Actually safer: run **after** sync at the very end of the bash. Worst case
we delete a cache that was about to be activated (impossible — sync uses
the highest version which we just kept).

## Acceptance

- [ ] `python3 tests/structural/validate.py` exits 0 on current `.claude-plugin/plugin.json`
- [ ] Plugin CI workflow run shows ✓ on next push
- [ ] UI e2e workflow either deleted or fixed (no more cache resolution error)
- [ ] After SessionStart on a user with 7 cached versions, only 3 remain
- [ ] 55/55 pipeline tests still pass
- [ ] Ship as v2.5.8 to npm + JSR + GitHub Release
