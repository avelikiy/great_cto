// scripts/lib/ccr.mjs — Compressed Context with Retrieval (CCR).
//
// Phase 2 of the compression layer. Ports headroom's reversible-compression idea:
// when something is dropped/compressed out of context, the ORIGINAL is stored
// locally and can be pulled back on demand. This turns lossy filtering
// (memory-filter, importance-trim) into lossless-on-demand — so we can compress
// AGGRESSIVELY without the risk of having thrown away the one thing we needed.
//
// Store: <project>/.great_cto/ccr/<id>.json  (content-addressed → automatic dedup).
//
// CLI:
//   node scripts/lib/ccr.mjs store "<text>" [--source S]   → prints id
//   node scripts/lib/ccr.mjs recall <id>                    → prints original content
//   node scripts/lib/ccr.mjs list [--limit N]               → recent stubs

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function ccrRoot(opts = {}) {
  return opts.root || process.env.GREAT_CTO_CCR_ROOT || join(process.cwd(), '.great_cto', 'ccr');
}

/** Content-addressed id: first 12 hex of sha256 → identical content dedupes. */
export function hashId(content) {
  return createHash('sha256').update(String(content), 'utf8').digest('hex').slice(0, 12);
}

function preview(content, n = 80) {
  return String(content).replace(/\s+/g, ' ').trim().slice(0, n);
}

/**
 * Store original content. Idempotent (content-addressed). Returns
 * { id, path, deduped }. Never throws on FS issues — returns { id, error }.
 */
export function store(content, meta = {}, opts = {}) {
  const id = hashId(content);
  const root = ccrRoot(opts);
  const path = join(root, `${id}.json`);
  try {
    if (existsSync(path)) return { id, path, deduped: true };
    mkdirSync(root, { recursive: true });
    const record = {
      id,
      ts: new Date().toISOString(),
      source: meta.source || 'unknown',
      query: meta.query || null,
      preview: preview(content),
      bytes: Buffer.byteLength(String(content), 'utf8'),
      content: String(content),
    };
    writeFileSync(path, JSON.stringify(record));
    return { id, path, deduped: false };
  } catch (err) {
    return { id, error: String(err && err.message || err) };
  }
}

/** Retrieve a stored record by id (exact, then unique-prefix). Returns record or null. */
export function retrieve(id, opts = {}) {
  const root = ccrRoot(opts);
  const exact = join(root, `${id}.json`);
  try {
    if (existsSync(exact)) return JSON.parse(readFileSync(exact, 'utf8'));
    if (!existsSync(root)) return null;
    const matches = readdirSync(root).filter((f) => f.startsWith(id) && f.endsWith('.json'));
    if (matches.length === 1) return JSON.parse(readFileSync(join(root, matches[0]), 'utf8'));
    return null;
  } catch {
    return null;
  }
}

/** List recent stubs (no full content), newest first. */
export function list({ root, limit = 20 } = {}) {
  const dir = ccrRoot({ root });
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, limit);
  const out = [];
  for (const { f } of files) {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      out.push({ id: r.id, source: r.source, preview: r.preview, bytes: r.bytes, ts: r.ts });
    } catch { /* skip */ }
  }
  return out;
}

/** Keep only the newest `maxFiles` records (best-effort GC). Returns count removed. */
export function prune({ root, maxFiles = 500 } = {}) {
  const dir = ccrRoot({ root });
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  let removed = 0;
  for (const { f } of files.slice(maxFiles)) {
    try { rmSync(join(dir, f)); removed++; } catch { /* ignore */ }
  }
  return removed;
}

/**
 * Bulk-store dropped items (e.g. the entries memory-filter elided). Returns
 * compact stubs [{ id, preview }] the agent can show + recall. Best-effort.
 *
 * @param {Array<{full?: string, body?: string, heading?: string}>} items
 */
export function registerDrops(items, { source = 'memory-filter', query = null, root } = {}) {
  const stubs = [];
  for (const it of items || []) {
    const content = it.full ?? it.body ?? String(it);
    if (!content || !content.trim()) continue;
    const r = store(content, { source, query }, { root });
    stubs.push({ id: r.id, preview: it.heading ? preview(it.heading, 60) : preview(content, 60) });
  }
  prune({ root });
  return stubs;
}

/** Markdown footer the dropping component appends so the agent knows what it can recall. */
export function formatRecallFooter(stubs) {
  if (!stubs || stubs.length === 0) return '';
  const lines = stubs.map((s) => `  - \`${s.id}\` — ${s.preview}`);
  return `\n\n<!-- ccr: ${stubs.length} item(s) elided but recoverable. Run \`/ccr <id>\` (or node scripts/lib/ccr.mjs recall <id>):\n${lines.join('\n')}\n-->`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'store') {
    // Content from the first positional arg, or stdin (so you can pipe a big blob).
    // Parse flags first so a flag value (e.g. --source X) isn't mistaken for content.
    let content, source = 'cli';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--source') { source = rest[++i]; }
      else if (!rest[i].startsWith('--') && content === undefined) { content = rest[i]; }
    }
    if (content === undefined) {
      try { content = readFileSync(0, 'utf8'); } catch { content = ''; }
    }
    const r = store(content, { source });
    process.stdout.write(`${r.id}\n`);
  } else if (cmd === 'recall') {
    const id = rest[0];
    const rec = id ? retrieve(id) : null;
    if (!rec) { process.stderr.write(`CCR: no record for "${id}"\n`); process.exit(1); }
    process.stdout.write(rec.content + (rec.content.endsWith('\n') ? '' : '\n'));
  } else if (cmd === 'list') {
    const li = rest.indexOf('--limit');
    const limit = li >= 0 ? parseInt(rest[li + 1], 10) : 20;
    for (const s of list({ limit })) {
      process.stdout.write(`${s.id}  ${String(s.bytes).padStart(7)}b  ${s.source.padEnd(16)} ${s.preview}\n`);
    }
  } else {
    process.stderr.write('Usage: ccr.mjs <store "text" [--source S] | recall <id> | list [--limit N]>\n');
    process.exit(2);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
