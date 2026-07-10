#!/usr/bin/env node
// scripts/bench-collect.mjs — one JSON row per benchmark product run.
//
// Implements step 2 of docs/plans/PLAN-2026-07-10-public-benchmark.md: after a
// pipeline run finishes (or fails), point this at the product dir and get a single
// machine-readable row with everything BENCH-2026-07-batch1.md needs:
//
//   wall time   — first→last verdict timestamp across .great_cto/verdicts/*.log
//   LLM cost    — sum of .great_cto/cost-history.log (fallback: cost=$ tags)
//   quality     — scripts/lib/product-score.mjs <dir> --json (0–100 + grade)
//   tests       — `npm test` exit code + parsed pass/fail counts (node --test / vitest / jest)
//   deploy      — preview URL (auto-detected or --url) + HTTP reachability probe
//   failure     — auto-detected class (spec-objection / cost-cap / gate-block) or --failure
//   commit/tag  — git HEAD sha + bench tag of the frozen product repo
//
// Verdict logs are heterogeneous (both `ts | agent | VERDICT | k=v` and
// space-separated lines exist in the wild) — parsing is timestamp-regex based,
// never format-based. Zero runtime deps, node: built-ins only.
//
// Usage:
//   node scripts/bench-collect.mjs <product-dir> [--slug s] [--archetype id]
//        [--url https://…] [--failure class] [--out results.jsonl]
//        [--no-tests] [--no-probe] [--pretty]
//
// Exit codes: 0 collected · 1 not a pipeline product (no .great_cto) · 2 usage.
// Screenshots are NOT captured here (needs a browser) — take them at publish time.

import { readFileSync, readdirSync, existsSync, appendFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import https from 'node:https';
import http from 'node:http';

const ISO_TS = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/;
const URL_RE = /https?:\/\/[^\s|)\]'"`>]+/g;
// Preview hosts the pipeline actually deploys to; anything else in a verdict line
// (docs links, npm URLs) is noise.
const PREVIEW_HOSTS = /(vercel\.app|pages\.dev|workers\.dev|netlify\.app|fly\.dev|onrender\.com)/;

// ─── pure helpers (unit-tested) ─────────────────────────────────────────────

/** Min/max ISO timestamp across raw verdict-log lines (any line format). */
export function wallTimeFromLines(lines) {
  let first = null, last = null;
  for (const line of lines) {
    const m = line.match(ISO_TS);
    if (!m) continue;
    if (!first || m[1] < first) first = m[1];
    if (!last || m[1] > last) last = m[1];
  }
  if (!first) return null;
  const seconds = Math.round((Date.parse(last) - Date.parse(first)) / 1000);
  return { first, last, seconds, human: fmtDuration(seconds) };
}

export function fmtDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Sum cost-history.log: lines of `<ts> <agent> <cost_usd>`. */
export function sumCostHistory(text) {
  let sum = 0, rows = 0;
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const cost = Number(parts[2]);
    if (parts.length >= 3 && Number.isFinite(cost)) { sum += cost; rows++; }
  }
  return { sum: round2(sum), rows };
}

/** Fallback: sum `cost=$X` tags from verdict lines (used only if no cost-history). */
export function sumCostTags(lines) {
  let sum = 0, rows = 0;
  for (const line of lines) {
    const m = line.match(/cost=\$([\d.eE+-]+)/);
    if (m && Number.isFinite(Number(m[1]))) { sum += Number(m[1]); rows++; }
  }
  return { sum: round2(sum), rows };
}

/**
 * Preview-URL pick across the given texts, in priority order (wave-0 lesson:
 * runbooks mention PLANNED vanity aliases like `ats-prod.vercel.app` — the
 * real deployment URL carries a hash segment like `ats-1gljywn1v-team`):
 *   1. hash-segmented deployment URLs (most-mentioned last one wins)
 *   2. any other preview-host URL
 * Pass texts verdicts-first — on a tie, later (docs) never beat earlier finds
 * of the same tier.
 */
export function extractPreviewUrl(texts) {
  const DEPLOY_HASH = /-[a-z0-9]{8,}-[a-z0-9-]+\.(vercel\.app|pages\.dev|netlify\.app)/;
  let hashed = null, plain = null;
  for (const text of texts) {
    for (const raw of text.match(URL_RE) || []) {
      if (!PREVIEW_HOSTS.test(raw)) continue;
      const url = raw.replace(/[.,;]+$/, '').replace(/\/$/, '');
      if (DEPLOY_HASH.test(url)) hashed = hashed ?? url;
      else plain = plain ?? url;
    }
  }
  return hashed || plain;
}

// ─── LLM cost from session transcripts ──────────────────────────────────────
// On a subscription, agents log cost=$0 — the only ground truth is token usage
// in ~/.claude/projects/<flattened-dir>/**/*.jsonl. We sum usage per model and
// price it as the API-equivalent USD ("what this run would have cost at list
// price"). Pricing per MTok, cached 2026-07 (source: claude-api skill; cache
// read = 0.1× input, 5m cache write = 1.25× input).
export const PRICING_PER_MTOK = Object.freeze({
  'claude-opus-4-8':  { in: 5,  out: 25, cache_r: 0.5,  cache_w: 6.25 },
  'claude-opus-4-7':  { in: 5,  out: 25, cache_r: 0.5,  cache_w: 6.25 },
  'claude-sonnet-5':  { in: 3,  out: 15, cache_r: 0.3,  cache_w: 3.75 },
  'claude-sonnet-4-6':{ in: 3,  out: 15, cache_r: 0.3,  cache_w: 3.75 },
  'claude-haiku-4-5': { in: 1,  out: 5,  cache_r: 0.1,  cache_w: 1.25 },
  'claude-fable-5':   { in: 10, out: 50, cache_r: 1.0,  cache_w: 12.5 },
});

/** Fold one transcript line's usage into the per-model accumulator. */
export function accumulateUsage(acc, line) {
  let d;
  try { d = JSON.parse(line); } catch { return; }
  const m = d?.message;
  const u = m?.usage;
  if (!u || !m.model) return;
  const s = (acc[m.model] ||= { in: 0, out: 0, cache_r: 0, cache_w: 0, msgs: 0 });
  s.in += u.input_tokens || 0;
  s.out += u.output_tokens || 0;
  s.cache_r += u.cache_read_input_tokens || 0;
  s.cache_w += u.cache_creation_input_tokens || 0;
  s.msgs++;
}

/** Price a per-model usage accumulator → { usd, by_model, unpriced_models }. */
export function priceUsage(acc) {
  let usd = 0;
  const by_model = {}, unpriced = [];
  for (const [model, s] of Object.entries(acc)) {
    const base = model.replace(/-\d{8}$/, ''); // strip date-suffixed ids
    const p = PRICING_PER_MTOK[base];
    if (!p) { unpriced.push(model); continue; }
    const cost = (s.in * p.in + s.out * p.out + s.cache_r * p.cache_r + s.cache_w * p.cache_w) / 1e6;
    by_model[model] = { ...s, usd: round2(cost) };
    usd += cost;
  }
  return { usd: round2(usd), by_model, unpriced_models: unpriced };
}

/** Claude Code flattens a project path into its transcript dir name. */
export function transcriptDirFor(productDir) {
  return join(homedir(), '.claude', 'projects', productDir.replace(/[/.]/g, '-'));
}

function collectTranscriptCost(productDir) {
  const tdir = transcriptDirFor(productDir);
  if (!existsSync(tdir)) return null;
  const acc = {};
  let files = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      try {
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!name.endsWith('.jsonl')) continue;
        files++;
        for (const line of readFileSync(p, 'utf8').split('\n')) if (line) accumulateUsage(acc, line);
      } catch { /* unreadable — skip */ }
    }
  };
  walk(tdir);
  if (files === 0) return null;
  return { ...priceUsage(acc), transcript_files: files };
}

/**
 * Failure-class heuristic over verdict lines. Returns { class, evidence } or null.
 * Deliberately conservative: it reports signals, the human confirms the class
 * (plan: honest reporting — misclassified failures are worse than unclassified).
 */
export function detectFailure(lines) {
  const checks = [
    { class: 'spec-objection', re: /SPEC[-_]OBJECTION/i },
    { class: 'cost-cap', re: /COST[-_ ]?CAP|cost-guard.*(exceed|block)/i },
    { class: 'gate-block', re: /\bBLOCKED\b|GATE[-_ ]?(REJECT|BLOCK)/i },
    // wave-0 lesson: headless harness kills the session when background
    // subagents outlive the print-mode wait ceiling — a tooling failure,
    // not a pipeline one. Fed from .bench-run*.log, not verdicts.
    { class: 'harness-timeout', re: /Background tasks still running after \d+s; terminating/ },
  ];
  for (const c of checks) {
    const hit = lines.find(l => c.re.test(l));
    if (hit) return { class: c.class, evidence: hit.trim().slice(0, 200) };
  }
  return null;
}

/** Did the pipeline reach its terminal success? (security sign-off is the last gate) */
export function pipelineCompleted(verdictLines) {
  return verdictLines.some(l => /security-officer\s*\|?\s*(APPROVED|PASS)/.test(l));
}

/** Read launcher run logs (.bench-run*.log) for harness-level failure signals. */
function readRunLogLines(dir) {
  const lines = [];
  try {
    for (const f of readdirSync(dir).filter(f => /^\.bench-run.*\.log$/.test(f)).sort()) {
      lines.push(...readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean));
    }
  } catch { /* no run logs — fine */ }
  return lines;
}

/** Upsert a row into a JSONL file keyed by slug (re-collects replace, not append). */
export function upsertRow(existingText, row) {
  const rows = existingText.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean).filter(r => r.slug !== row.slug);
  rows.push(row);
  return rows.map(r => JSON.stringify(r)).join('\n') + '\n';
}

/** Parse pass/fail counts from a test-runner's output (node --test / vitest / jest). */
export function parseTestCounts(output) {
  let m;
  if ((m = output.match(/^# pass (\d+)$/m))) {
    const fail = output.match(/^# fail (\d+)$/m);
    return { passed: Number(m[1]), failed: fail ? Number(fail[1]) : 0 };
  }
  if ((m = output.match(/Tests[:\s]+(?:(\d+) failed[,\s|]+)?(\d+) passed/i))) {
    return { passed: Number(m[2]), failed: m[1] ? Number(m[1]) : 0 };
  }
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

// ─── I/O collectors ─────────────────────────────────────────────────────────

function readVerdictLines(dir) {
  const vdir = join(dir, '.great_cto', 'verdicts');
  if (!existsSync(vdir)) return [];
  const lines = [];
  for (const f of readdirSync(vdir).filter(f => f.endsWith('.log')).sort()) {
    try { lines.push(...readFileSync(join(vdir, f), 'utf8').split('\n').filter(Boolean)); }
    catch { /* unreadable log — skip, wall time degrades gracefully */ }
  }
  return lines;
}

function readDeployDocs(dir) {
  const texts = [];
  for (const sub of ['docs/deploy', 'docs/infra']) {
    const d = join(dir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter(f => f.endsWith('.md'))) {
      try { texts.push(readFileSync(join(d, f), 'utf8')); } catch { /* skip */ }
    }
  }
  return texts;
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 10_000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

function runScore(dir, archetype) {
  const scoreScript = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'product-score.mjs');
  const args = [scoreScript, dir, '--json'];
  if (archetype) args.push('--archetype', archetype);
  const r = spawnSync('node', args, { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const { total, grade, archetype: a } = JSON.parse(r.stdout);
    return { total, grade, archetype: a };
  } catch { return null; }
}

function runTests(dir) {
  if (!existsSync(join(dir, 'package.json'))) return { ran: false, reason: 'no package.json' };
  const timeout = Number(process.env.BENCH_TEST_TIMEOUT_MS) || 300_000;
  const r = spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8', timeout });
  const output = `${r.stdout || ''}\n${r.stderr || ''}`;
  return {
    ran: true,
    exit: r.status,
    timed_out: r.signal === 'SIGTERM' || null,
    counts: parseTestCounts(output),
  };
}

function countE2eSpecs(dir) {
  let n = 0;
  for (const sub of ['e2e', 'tests/e2e', 'playwright']) {
    const d = join(dir, sub);
    if (!existsSync(d)) continue;
    try { n += readdirSync(d).filter(f => /\.(spec|test)\.(ts|mjs|js)$/.test(f)).length; }
    catch { /* skip */ }
  }
  return n;
}

function probeUrl(url) {
  return new Promise((resolvePromise) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolvePromise({ status: res.statusCode, reachable: res.statusCode >= 200 && res.statusCode < 400 });
      res.resume();
    });
    req.on('timeout', () => { req.destroy(); resolvePromise({ status: null, reachable: false }); });
    req.on('error', () => resolvePromise({ status: null, reachable: false }));
    req.end();
  });
}

// ─── main ───────────────────────────────────────────────────────────────────

function arg(argv, flag) { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : null; }

async function main(argv) {
  const dir = argv.find(a => !a.startsWith('--') && a !== arg(argv, '--slug') && a !== arg(argv, '--archetype')
    && a !== arg(argv, '--url') && a !== arg(argv, '--failure') && a !== arg(argv, '--out'));
  if (!dir || !existsSync(dir)) {
    console.error('Usage: bench-collect.mjs <product-dir> [--slug s] [--archetype id] [--url u] [--failure class] [--out f.jsonl] [--no-tests] [--no-probe] [--pretty]');
    process.exit(2);
  }
  const abs = resolve(dir);
  if (!existsSync(join(abs, '.great_cto'))) {
    console.error(`${abs}: no .great_cto/ — not a pipeline product dir.`);
    process.exit(1);
  }

  const verdictLines = readVerdictLines(abs);
  const runLogLines = readRunLogLines(abs);

  // Cost: logged (cost-history / cost=$ tags) + token-equivalent from transcripts.
  // On subscription runs the logged number is $0 — token_equiv_usd is the real column.
  const costHistPath = join(abs, '.great_cto', 'cost-history.log');
  const costHist = existsSync(costHistPath) ? sumCostHistory(readFileSync(costHistPath, 'utf8')) : null;
  const logged = costHist && costHist.rows > 0
    ? { usd: costHist.sum, source: 'cost-history', rows: costHist.rows }
    : { ...(({ sum, rows }) => ({ usd: sum, rows }))(sumCostTags(verdictLines)), source: 'cost-tags' };
  const transcript = collectTranscriptCost(abs);
  const cost = {
    logged_usd: logged.usd,
    logged_source: logged.source,
    token_equiv_usd: transcript?.usd ?? null,
    by_model: transcript?.by_model ?? null,
    unpriced_models: transcript?.unpriced_models?.length ? transcript.unpriced_models : undefined,
    transcript_files: transcript?.transcript_files ?? 0,
  };

  // URL: verdicts first (docs mention planned vanity aliases — wave-0 lesson).
  const url = arg(argv, '--url') || extractPreviewUrl([verdictLines.join('\n'), ...readDeployDocs(abs)]);
  const deploy = { url: url || null, status: null, reachable: null };
  if (url && !argv.includes('--no-probe')) Object.assign(deploy, await probeUrl(url));

  const failureOverride = arg(argv, '--failure');
  const row = {
    slug: arg(argv, '--slug') || basename(abs),
    dir: abs,
    collected_at: new Date().toISOString(),
    commit: git(abs, 'rev-parse', '--short', 'HEAD'),
    tag: git(abs, 'tag', '--list', 'bench-*') || null,
    wall: wallTimeFromLines(verdictLines),
    cost,
    score: runScore(abs, arg(argv, '--archetype')),
    tests: argv.includes('--no-tests') ? { ran: false, reason: '--no-tests' } : runTests(abs),
    e2e_specs: countE2eSpecs(abs),
    deploy,
    // failure = terminal outcome; incidents = mid-run interruptions the run
    // recovered from (wave-0: harness-timeout on run 1, resumed, completed).
    failure: failureOverride
      ? { class: failureOverride, evidence: 'manual' }
      : detectFailure(verdictLines)
        || (pipelineCompleted(verdictLines) ? null : detectFailure(runLogLines)),
    incidents: (() => { const i = detectFailure(runLogLines); return i ? [i] : []; })(),
    verdict_lines: verdictLines.length,
  };

  const json = JSON.stringify(row, null, argv.includes('--pretty') ? 2 : 0);
  const out = arg(argv, '--out');
  if (out) {
    const existing = existsSync(out) ? readFileSync(out, 'utf8') : '';
    writeFileSync(out, upsertRow(existing, row));
    console.log(`upserted slug=${row.slug} → ${out}`);
  }
  if (!out || argv.includes('--pretty')) console.log(json);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main(process.argv.slice(2));
