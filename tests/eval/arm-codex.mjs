// The Codex arm of the eval runner.
//
// Why a second arm at all
// -----------------------
// The runner calls an API — Anthropic or OpenRouter — which measures a MODEL.
// Comparing Claude Code against Codex is a different question: the two harnesses
// budget context, batch tool calls and count tokens differently, so routing both
// through one API shim measures the shim rather than either of them.
//
// Method borrowed (not code — that repository ships no licence) from
// phuryn/experiments' five-models-three-harnesses: each model in its own native
// CLI, one task battery, deterministic grading wherever the task admits it.
//
// The parser is separate from the call so the wire format can be tested without
// spending a turn — the shape below is taken from a real run of
// `codex exec --json`.

// The parser and the runner live in scripts/lib/codex-exec.mjs now, because
// Codex became a participant in the pipeline (second opinion) and a library
// under tests/ is not a library. Re-exported so this arm's callers and its
// own test do not move.
export { parseCodexStream, runCodexArm } from '../../scripts/lib/codex-exec.mjs';
