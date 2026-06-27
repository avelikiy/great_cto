// scripts/lib/acceptance-verify.mjs — execute frozen ACCEPTANCE criteria (DEEPEN W2).
//
// Why it exists: impl-brief.mjs / check-frozen-gates.mjs prove acceptance criteria
// EXIST and are tamper-proof — but whether each is SATISFIED is pure agent
// self-report. This closes the last inch: each `## ACCEPTANCE` checklist item may
// carry a `verify: <shell command>` directive; this runs them and fails if any
// command fails (and, with --require-verify, if any item has no directive at all).
//
// ACCEPTANCE item format (in an IMPL-BRIEF or docs/gates/*.md):
//   - [ ] Every TEST-SPEC row passes — verify: node --test tests/foo.test.mjs
//   - [ ] Lint is clean — verify: npm run -s lint
//   - [ ] Design reviewed by a human            (no verify: → manual, unverifiable)
//
// Usage:
//   node scripts/lib/acceptance-verify.mjs docs/impl-briefs/IMPL-BRIEF-x.md
//   node scripts/lib/acceptance-verify.mjs <file> --require-verify   # also fail on missing directives
//
// Exit 0 = all verify commands passed (and, if --require-verify, all items had one).
// Exit 1 = a verify command failed / a directive was missing under --require-verify.
// Exit 2 = bad input.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Parse the `## ACCEPTANCE` section into items. Each checklist bullet (`- [ ]` /
 * `- [x]`) starts an item; following non-bullet, non-heading lines are folded in
 * (criteria often wrap). A `verify:` marker anywhere in the item text captures the
 * rest of that text as the command.
 * @returns {Array<{text:string, checked:boolean, verify:string|null}>}
 */
export function parseAcceptance(md) {
  const lines = String(md).split('\n');
  let inSection = false;
  const items = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const joined = cur.raw.join(' ').replace(/\s+/g, ' ').trim();
    const m = joined.match(/verify:\s*(.+?)\s*$/i);
    items.push({
      text: joined.replace(/\s*(?:—|--|-)?\s*verify:.*$/i, '').trim(),
      checked: cur.checked,
      verify: m ? m[1].trim() : null,
    });
    cur = null;
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.*\S)\s*$/);
    if (heading) {
      flush();
      inSection = /^acceptance\b/i.test(heading[1].trim());
      continue;
    }
    if (!inSection) continue;
    const bullet = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (bullet) {
      flush();
      cur = { checked: bullet[1].toLowerCase() === 'x', raw: [bullet[2]] };
    } else if (cur && line.trim() && !line.trim().startsWith('>')) {
      cur.raw.push(line.trim());
    } else if (!line.trim()) {
      flush(); // blank line ends an item
    }
  }
  flush();
  return items;
}

/** Summarize executed results into pass/fail counts. */
export function summarize(results) {
  return {
    total: results.length,
    verified: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    unverifiable: results.filter(r => r.status === 'no-verify').length,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function runVerify(cmd) {
  const res = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', timeout: 120_000 });
  return { ok: res.status === 0, code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

function main(argv) {
  const requireVerify = argv.includes('--require-verify');
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage: node scripts/lib/acceptance-verify.mjs <file.md> [--require-verify]'); process.exit(2); }
  if (!existsSync(file)) { console.error(`ERROR: file not found: ${file}`); process.exit(2); }

  const items = parseAcceptance(readFileSync(file, 'utf8'));
  if (items.length === 0) { console.error(`ERROR: no ## ACCEPTANCE checklist items in ${file}`); process.exit(2); }

  console.log(`acceptance-verify: ${items.length} criteria in ${file}`);
  const results = [];
  for (const it of items) {
    if (!it.verify) {
      results.push({ ...it, status: 'no-verify' });
      console.log(`  ? ${it.text}  (no verify: directive)`);
      continue;
    }
    const r = runVerify(it.verify);
    results.push({ ...it, status: r.ok ? 'pass' : 'fail', code: r.code });
    console.log(`  ${r.ok ? '✓' : '✗'} ${it.text}\n      verify: ${it.verify}${r.ok ? '' : `  → exit ${r.code}\n      ${r.out.trim().split('\n').slice(-3).join('\n      ')}`}`);
  }

  const s = summarize(results);
  console.log(`\nacceptance-verify: ${s.verified} verified, ${s.failed} failed, ${s.unverifiable} unverifiable (no directive)`);

  let exit = 0;
  if (s.failed > 0) { console.error(`BLOCK — ${s.failed} acceptance criterion(s) failed verification.`); exit = 1; }
  if (requireVerify && s.unverifiable > 0) { console.error(`BLOCK — ${s.unverifiable} acceptance criterion(s) have no verify: directive (--require-verify).`); exit = 1; }
  if (exit === 0) console.log('acceptance-verify: OK.');
  process.exit(exit);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
