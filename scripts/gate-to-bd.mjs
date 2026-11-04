#!/usr/bin/env node
// gate-to-bd — turn the failures in CTRF reports into Beads bugs, one per failure,
// never two for the same one.
//
//   node scripts/gate-to-bd.mjs [--dry-run] [--parent <id>] [--commit <sha>] <report.ctrf.json>...
//
// Each failed test gets a fingerprint: its file, its name and the first line of
// its message with run-specific noise (numbers, temp paths, ports) taken out. The
// fingerprint is a label (`fp-<10 hex>`) on the bug, so the next run finds it:
//   - an open bug with that label exists → a comment with this run is added;
//   - none → `bd create -t bug` with the test, the message, the report and commit.
// Priority follows the layer the strategy names (docs/testing/BOARD-TEST-STRATEGY.md §5):
// security and gate-decision tests P0, browser E2E P1, everything else P2.
//
// Filing that fails is reported and exits 2: a gate whose bugs silently went
// nowhere would be the "skipped looks like passed" defect in another form.
// `GATE_BD` names the bd executable (tests point it at a fake).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SECURITY = /gate-tokens|host-allowlist|api-sweep|router-key|knowledge\.test|security|gates?\//i;

/** The message with what differs between runs of the same failure taken out. */
export function normalise(message = '') {
  return String(message).split('\n').find((l) => l.trim()) ?.trim()
    .replace(/\/(?:private\/)?(?:var|tmp)\/[^\s'"`)]+/g, '<tmp>')
    .replace(/\/Users\/[^\s'"`)]+/g, '<path>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\d+(\.\d+)?/g, 'N') ?? '';
}

export function fingerprint(test) {
  const file = test.filePath ? path.basename(test.filePath) : '';
  const key = [file, test.suite || '', test.name, normalise(test.message)].join('\u0000');
  return 'fp-' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);
}

export function priorityOf(test) {
  const where = `${test.filePath || ''} ${test.suite || ''} ${test.name}`;
  if (SECURITY.test(where)) return 0;
  if (/tests\/e2e\/|\.e2e\.test\./.test(where)) return 1;
  return 2;
}

/** Every failed test across the reports, with the report it came from. */
export function failuresOf(reports) {
  const out = [];
  for (const { file, doc } of reports) {
    for (const t of doc?.results?.tests || []) {
      if (t.status === 'failed') out.push({ ...t, report: file, tool: doc.results.tool?.name });
    }
  }
  return out;
}

function defaultBd(args) {
  const r = spawnSync(process.env.GATE_BD || 'bd', args, { encoding: 'utf8', timeout: 30000 });
  return { status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || String(r.error || '') };
}

/**
 * File or update one bug per failure. Returns what it did, per failure:
 * `{ fp, action: 'created'|'commented'|'would-create'|'would-comment'|'error', id?, why? }`.
 */
export function fileFailures(reports, { bd = defaultBd, dryRun = false, parent, commit, when = new Date().toISOString() } = {}) {
  const seen = new Set();
  const results = [];
  for (const f of failuresOf(reports)) {
    const fp = fingerprint(f);
    if (seen.has(fp)) continue; // the same failure twice in one run is one bug
    seen.add(fp);
    const found = bd(['list', '--label', fp, '--status', 'open', '--json', '--brief']);
    if (found.status !== 0) { results.push({ fp, action: 'error', why: `bd list: ${found.stderr.trim() || found.status}` }); continue; }
    let open = [];
    try { open = JSON.parse(found.stdout || '[]'); } catch { results.push({ fp, action: 'error', why: 'bd list returned no JSON' }); continue; }
    const where = `${f.tool || 'gate'} · ${f.filePath ? path.basename(f.filePath) : 'unknown file'}`;
    const run = `Failed again ${when}${commit ? ` at ${commit}` : ''} (${f.report}).`;
    if (open.length) {
      const id = open[0].id;
      if (dryRun) { results.push({ fp, action: 'would-comment', id }); continue; }
      const c = bd(['comments', 'add', id, `${run}\n\n${f.message || ''}`.trim()]);
      results.push(c.status === 0 ? { fp, action: 'commented', id } : { fp, action: 'error', id, why: `bd comments add: ${c.stderr.trim()}` });
      continue;
    }
    const title = `Gate failure: ${f.name}`.slice(0, 180);
    const description = [
      `Test: ${f.suite ? `${f.suite} > ` : ''}${f.name}`,
      `Where: ${where}`,
      `First seen: ${when}${commit ? ` at ${commit}` : ''}`,
      `Report: ${f.report}`,
      '',
      'Message:',
      f.message || '(none)',
      '',
      'Fix flow: name the cause (false test / broken gate / regression / flaky), reproduce as a failing test, fix, review, close with the gate run.',
    ].join('\n');
    const priority = priorityOf(f);
    if (dryRun) { results.push({ fp, action: 'would-create', priority, title }); continue; }
    const args = ['create', title, '-t', 'bug', '-p', String(priority), '-l', `gate-failure,${fp}`, '-d', description, '--silent'];
    if (parent) args.push('--parent', parent);
    const c = bd(args);
    results.push(c.status === 0 ? { fp, action: 'created', id: c.stdout.trim(), priority } : { fp, action: 'error', why: `bd create: ${c.stderr.trim()}` });
  }
  return results;
}

function main(argv) {
  const opts = { dryRun: false };
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--parent') opts.parent = argv[++i];
    else if (a === '--commit') opts.commit = argv[++i];
    else files.push(a);
  }
  if (!files.length) { console.error('usage: gate-to-bd.mjs [--dry-run] [--parent <id>] [--commit <sha>] <report.ctrf.json>...'); return 64; }
  const reports = [];
  for (const file of files) {
    try { reports.push({ file, doc: JSON.parse(fs.readFileSync(file, 'utf8')) }); }
    catch (e) { console.error(`gate-to-bd: cannot read ${file}: ${e.message}`); return 2; }
  }
  const results = fileFailures(reports, opts);
  for (const r of results) console.log(`${r.action.padEnd(13)} ${r.fp} ${r.id || ''} ${r.title || r.why || ''}`.trimEnd());
  const errors = results.filter((r) => r.action === 'error').length;
  console.log(`gate-to-bd: ${results.length} distinct failure(s), ${errors} not filed`);
  return errors ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2));
