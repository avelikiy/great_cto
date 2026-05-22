#!/usr/bin/env node
/**
 * generate-summary.mjs — Phase 1 of Token Economy initiative.
 *
 * Takes a great_cto artifact (ARCH-*.md / PLAN-*.md / QA-*.md / SEC-*.md /
 * RELEASE-*.md) and writes a paired `<artifact>.summary.md` (≤ 250 tokens,
 * structured) that downstream agents read instead of the full doc.
 *
 * Usage:
 *   node scripts/generate-summary.mjs <path-to-artifact.md>
 *   node scripts/generate-summary.mjs --all   (regenerate all stale summaries)
 *   node scripts/generate-summary.mjs --check (CI: fail if any summary stale)
 *
 * Behavior:
 *   - Idempotent: skips if `.summary.md` exists and is newer than source.
 *   - Uses Haiku via Anthropic API if ANTHROPIC_API_KEY present (~$0.0005/call).
 *   - Falls back to deterministic heuristic summary (first H2 + first 5 bullets)
 *     if no API key — zero cost, lower quality.
 *
 * Privacy: only sends the artifact contents to Haiku. No paths, no repo name,
 * no env. Caller is responsible for ensuring the artifact has no secrets
 * (great_cto artifacts never should — they're plan/arch docs).
 *
 * Exit codes: 0 ok / 1 generation failed / 2 --check found stale summaries.
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// Provider order: ANTHROPIC_API_KEY (Haiku) → OPENROUTER_API_KEY (configurable model)
// → heuristic.
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL = process.env.GREAT_CTO_SUMMARY_MODEL
  || process.env.GREAT_CTO_ROUTER_MODEL
  || "moonshotai/kimi-k2";
const TIMEOUT_MS = 20_000;
const MAX_INPUT_CHARS = 24_000;  // ~6k tokens — caps cost

const ARTIFACT_DIRS = [
  "docs/architecture",
  "docs/plans",
  "docs/qa",
  "docs/security",
  "docs/release",
  "docs/performance",
];

const ARTIFACT_PREFIXES = ["ARCH-", "PLAN-", "PHASE-", "QA-", "SEC-", "RELEASE-", "PERF-", "ADR-", "TM-"];

// ─── classification ───────────────────────────────────────────────────────────
function classify(path) {
  const name = basename(path);
  if (name.startsWith("ARCH-") || name.startsWith("PHASE-") || name.startsWith("ADR-")) return "architecture";
  if (name.startsWith("PLAN-")) return "plan";
  if (name.startsWith("QA-")) return "qa";
  if (name.startsWith("SEC-") || name.startsWith("TM-")) return "security";
  if (name.startsWith("RELEASE-")) return "release";
  if (name.startsWith("PERF-")) return "performance";
  return "generic";
}

// ─── prompts per artifact type ────────────────────────────────────────────────
const PROMPTS = {
  architecture: `Summarize this architecture document for a downstream engineering agent.
Output EXACTLY this markdown structure, no preamble, no closing remarks:

# <title from doc> · summary
- **Decision:** <one line — the chosen approach>
- **Stack:** <one line — main tech choices>
- **Risks:** <up to 3 bullets, each ≤ 12 words>
- **Open questions:** <up to 3 bullets, each ≤ 12 words; write "none" if none>
- **Full doc:** <will be filled by tooling — write the literal token __FULL_DOC__>

Total length ≤ 250 tokens. No code blocks. No examples. No tables.

Document:
`,

  plan: `Summarize this implementation plan for a downstream engineering agent.
Output EXACTLY this markdown structure, no preamble, no closing remarks:

# <title from doc> · summary
- **Goal:** <one line>
- **Phases:** <count> · <one line listing phase names>
- **Critical path:** <up to 3 bullets — tasks that block others>
- **Risks:** <up to 3 bullets>
- **Full doc:** __FULL_DOC__

Total length ≤ 250 tokens. No code blocks.

Document:
`,

  qa: `Summarize this QA report for a downstream agent.
Output EXACTLY this structure:

# <title> · summary
- **Verdict:** <PASS / FAIL / BLOCKED>
- **Coverage:** <one line>
- **Critical findings:** <up to 3 bullets — only P0/P1>
- **Action required:** <one line — what blocks ship; "none" if PASS>
- **Full doc:** __FULL_DOC__

Total length ≤ 250 tokens.

Document:
`,

  security: `Summarize this security/threat-model document for a downstream agent.
Output EXACTLY this structure:

# <title> · summary
- **Verdict:** <APPROVED / BLOCKED / CONDITIONAL>
- **Critical mitigations:** <up to 3 bullets>
- **Open threats:** <up to 3 bullets; "none" if APPROVED>
- **Compliance scope:** <one line>
- **Full doc:** __FULL_DOC__

Total length ≤ 250 tokens.

Document:
`,

  release: `Summarize this release document for a downstream agent.
Output EXACTLY this structure:

# <title> · summary
- **Version:** <semver>
- **Changes:** <up to 3 bullets — user-visible>
- **Migration:** <one line — required steps; "none" if backward compatible>
- **Rollback:** <one line — how to revert>
- **Full doc:** __FULL_DOC__

Total length ≤ 250 tokens.

Document:
`,

  performance: `Summarize this performance report for a downstream agent.
Output EXACTLY this structure:

# <title> · summary
- **Verdict:** <PASS / FAIL>
- **SLO compliance:** <one line>
- **Bottlenecks:** <up to 3 bullets>
- **Recommendations:** <up to 3 bullets>
- **Full doc:** __FULL_DOC__

Total length ≤ 250 tokens.

Document:
`,

  generic: `Summarize this document in ≤ 250 tokens for a downstream engineering agent.
Output EXACTLY:

# <title> · summary
- **Purpose:** <one line>
- **Key points:** <up to 4 bullets>
- **Full doc:** __FULL_DOC__

Document:
`,
};

// ─── LLM calls (Anthropic Haiku → OpenRouter → heuristic) ─────────────────────
async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text();
      process.stderr.write(`  ✗ Anthropic ${res.status}: ${body.slice(0, 200)}\n`);
      return null;
    }
    const body = await res.json();
    return body?.content?.find((c) => c.type === "text")?.text || null;
  } catch (e) {
    clearTimeout(timer);
    process.stderr.write(`  ✗ Anthropic error: ${e?.message ?? e}\n`);
    return null;
  }
}

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://greatcto.systems",
        "X-Title": "great_cto-summary",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_DEFAULT_MODEL,
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text();
      process.stderr.write(`  ✗ OpenRouter ${res.status}: ${body.slice(0, 200)}\n`);
      return null;
    }
    const body = await res.json();
    return body?.choices?.[0]?.message?.content || null;
  } catch (e) {
    clearTimeout(timer);
    process.stderr.write(`  ✗ OpenRouter error: ${e?.message ?? e}\n`);
    return null;
  }
}

async function callLlm(prompt) {
  // Prefer Anthropic Haiku if available (cleaner output for structured tasks);
  // fall back to OpenRouter (Kimi K2 by default — much cheaper, similar quality).
  let result = await callAnthropic(prompt);
  let provider = "anthropic-haiku";
  if (!result) {
    result = await callOpenRouter(prompt);
    provider = `openrouter:${OPENROUTER_DEFAULT_MODEL}`;
  }
  return result ? { text: result, provider } : null;
}

// ─── heuristic fallback (no API key) ──────────────────────────────────────────
function heuristicSummary(content, kind) {
  const lines = content.split(/\r?\n/);
  const title = lines.find((l) => /^#\s/.test(l))?.replace(/^#\s+/, "") || "Untitled";

  // Pull first 5 bullets after first H2 (or just first 5 bullets if no H2)
  let bullets = [];
  let pastH2 = false;
  for (const l of lines) {
    if (/^##\s/.test(l)) pastH2 = true;
    if (!pastH2) continue;
    const m = l.match(/^\s*[-*]\s+(.+)/);
    if (m) {
      bullets.push(m[1].slice(0, 100));
      if (bullets.length >= 5) break;
    }
  }
  if (bullets.length === 0) {
    // fallback to first non-empty paragraph
    const para = lines.find((l) => l.trim() && !/^#/.test(l));
    if (para) bullets = [para.slice(0, 100)];
  }

  const bulletBlock = bullets.length
    ? bullets.map((b) => `- ${b}`).join("\n")
    : "- (no structured content found — read full doc)";

  return `# ${title} · summary

_Generated heuristically (no ANTHROPIC_API_KEY). For higher quality summaries, set ANTHROPIC_API_KEY._

${bulletBlock}

- **Full doc:** __FULL_DOC__
`;
}

// ─── main per-file logic ──────────────────────────────────────────────────────
async function generateOne(artifactPath, opts = {}) {
  if (!existsSync(artifactPath)) {
    process.stderr.write(`✗ not found: ${artifactPath}\n`);
    return { ok: false, reason: "not-found" };
  }

  // Defense: never summarize a summary file (no .summary.summary.md cascade)
  if (artifactPath.endsWith(".summary.md")) {
    if (opts.verbose) process.stdout.write(`  · skip (is-summary): ${basename(artifactPath)}\n`);
    return { ok: true, reason: "is-summary" };
  }

  const summaryPath = artifactPath.replace(/\.md$/, ".summary.md");
  const srcStat = statSync(artifactPath);

  // Idempotency: skip if summary exists and is newer than source
  if (!opts.force && existsSync(summaryPath)) {
    const sumStat = statSync(summaryPath);
    if (sumStat.mtimeMs >= srcStat.mtimeMs) {
      if (opts.verbose) process.stdout.write(`  · skip (fresh): ${basename(artifactPath)}\n`);
      return { ok: true, reason: "fresh" };
    }
  }

  // --check mode: just report staleness, don't write
  if (opts.checkOnly) {
    return { ok: false, reason: "stale" };
  }

  const content = readFileSync(artifactPath, "utf-8");
  if (content.length > MAX_INPUT_CHARS) {
    process.stdout.write(`  · truncating ${basename(artifactPath)} (${content.length} → ${MAX_INPUT_CHARS} chars)\n`);
  }
  const truncated = content.slice(0, MAX_INPUT_CHARS);

  const kind = classify(artifactPath);
  const prompt = PROMPTS[kind] + truncated;

  const llm = await callLlm(prompt);
  let summary;
  let mode;
  if (llm) {
    summary = llm.text;
    mode = llm.provider;
  } else {
    summary = heuristicSummary(content, kind);
    mode = "heuristic";
  }

  // Replace __FULL_DOC__ placeholder with actual relative path
  const relPath = artifactPath.replace(/^.*?docs\//, "docs/");
  summary = summary.replace(/__FULL_DOC__/g, relPath);

  // Header comment for traceability
  const header = `<!-- auto-generated by scripts/generate-summary.mjs · mode=${mode} · src=${basename(artifactPath)} -->\n`;
  writeFileSync(summaryPath, header + summary.trim() + "\n", "utf-8");

  process.stdout.write(`  ✓ ${mode}: ${basename(summaryPath)}\n`);
  return { ok: true, mode };
}

// ─── batch mode ───────────────────────────────────────────────────────────────
function findAllArtifacts(root) {
  const results = [];
  for (const dir of ARTIFACT_DIRS) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    walk(full, results);
  }
  return results.filter((p) => {
    if (!p.endsWith(".md")) return false;
    if (p.endsWith(".summary.md")) return false;
    const name = basename(p);
    return ARTIFACT_PREFIXES.some((prefix) => name.startsWith(prefix));
  });
}

function walk(dir, acc) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`Usage:
  node scripts/generate-summary.mjs <artifact.md>       Generate one summary
  node scripts/generate-summary.mjs --all               Generate all missing/stale
  node scripts/generate-summary.mjs --check             CI: exit 2 if any stale
  node scripts/generate-summary.mjs --all --force       Regenerate everything
  node scripts/generate-summary.mjs --verbose <args>    Show skip messages
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const force = args.includes("--force");
  const verbose = args.includes("--verbose");
  const checkOnly = args.includes("--check");
  const all = args.includes("--all") || checkOnly;

  const root = process.cwd();

  let paths;
  if (all) {
    paths = findAllArtifacts(root);
    process.stdout.write(`Found ${paths.length} artifact(s) under docs/architecture, docs/plans, docs/qa, docs/security, docs/release, docs/performance\n`);
  } else {
    paths = args.filter((a) => !a.startsWith("--"));
  }

  let okCount = 0;
  let staleCount = 0;
  let failCount = 0;

  for (const p of paths) {
    const result = await generateOne(p, { force, verbose, checkOnly });
    if (result.ok) okCount++;
    else if (result.reason === "stale") {
      staleCount++;
      process.stdout.write(`  ⚠ stale: ${p}\n`);
    } else {
      failCount++;
    }
  }

  if (checkOnly && staleCount > 0) {
    process.stderr.write(`\n✗ ${staleCount} stale summary file(s). Run: node scripts/generate-summary.mjs --all\n`);
    process.exit(2);
  }

  if (failCount > 0) {
    process.stderr.write(`\n✗ ${failCount} failure(s).\n`);
    process.exit(1);
  }

  process.stdout.write(`\nDone. ${okCount} processed, ${staleCount} stale, ${failCount} failed.\n`);
}

// Only run if invoked directly (not imported)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    process.stderr.write(`✗ fatal: ${e?.message ?? e}\n`);
    process.exit(1);
  });
}

export { generateOne, classify, heuristicSummary };
