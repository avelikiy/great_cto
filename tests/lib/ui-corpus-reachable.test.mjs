// A data file that is not in CSV_CONFIG is unreachable, whatever it contains.
//
// `skills/ui-ux-pro-max/scripts/core.py` holds the domain index that `search.py`
// queries — and it is NOT the only consumer: `design_system.py` reads
// `ui-reasoning.csv` by name, outside CSV_CONFIG. The first cut of this test
// asserted CSV_CONFIG was the only index and failed on that file, which was the
// test being wrong rather than the corpus. The property is therefore "every CSV
// has SOME consumer", not "every CSV is in one dict" — the same
// declared-and-unreachable shape this repository has now found five times
// (ask_kimi with 0 calls, acceptance-verify whose only caller was its own test,
// decision-scorer with no verdicts, ten knowledge packs with no selectors, and a
// pre-merge suite nothing ran).
//
// This is the ratchet: every CSV in data/ is registered, and every registered
// file exists. Both directions, because each fails differently — an unregistered
// file is invisible, and a registered file that is missing throws at query time
// on somebody else's machine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SKILL = path.join(ROOT, 'skills/ui-ux-pro-max');
const CORE = path.join(SKILL, 'scripts/core.py');
const DATA = path.join(SKILL, 'data');

/** The `"file": "x.csv"` entries in CSV_CONFIG. Read as text — the index is
 *  Python and this suite is Node, and a regex over one literal dict is a smaller
 *  dependency than a Python bridge. */
function registered() {
  const src = readFileSync(CORE, 'utf8');
  const cfg = src.slice(src.indexOf('CSV_CONFIG = {'));
  return new Set([...cfg.matchAll(/"file":\s*"([^"]+\.csv)"/g)].map((m) => m[1]));
}
const onDisk = () => readdirSync(DATA).filter((f) => f.endsWith('.csv'));

/** Files named directly by a script, outside the domain index. */
function namedBySomeScript() {
  const dir = path.join(SKILL, 'scripts');
  const named = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.py'))) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/"([a-z0-9-]+\.csv)"/g)) named.add(m[1]);
  }
  return named;
}

test('every CSV in data/ has a consumer', () => {
  const reachable = new Set([...registered(), ...namedBySomeScript()]);
  const orphans = onDisk().filter((f) => !reachable.has(f));
  assert.deepEqual(orphans, [],
    `corpus file(s) nothing reads: ${orphans.join(', ')} — register in CSV_CONFIG, or have a script name it`);
});

test('every registered domain names a file that exists', () => {
  const missing = [...registered()].filter((f) => !existsSync(path.join(DATA, f)));
  assert.deepEqual(missing, [],
    `CSV_CONFIG names missing file(s): ${missing.join(', ')}`);
});

test('the dense enterprise corpus is present and answers the questions it was built for', () => {
  // Measured before it existed: `saved view` and `inline edit` matched 0 files in
  // this data, `bulk` 1, `data table` 2. Those are the gaps; assert they closed.
  const csv = readFileSync(path.join(DATA, 'enterprise-dense.csv'), 'utf8');
  for (const term of ['Saved views', 'Inline editing', 'Bulk actions', 'Virtualization',
                      'Keyboard', 'Relations', 'Density', 'Columns', 'Filtering']) {
    assert.ok(csv.includes(term), `the dense corpus covers ${term}`);
  }
  const rows = csv.trim().split('\n').length - 1;
  assert.ok(rows >= 15, `dense corpus has ${rows} rows`);
});

test('design-advisor knows the dense domain exists', () => {
  // A corpus the agent is never told about is registered and still unreachable.
  const agent = readFileSync(path.join(ROOT, 'agents/design-advisor.md'), 'utf8');
  assert.match(agent, /--domain dense/, 'the agent is pointed at it');
  assert.match(agent, /CRM|admin|console/i, 'and told when it applies');
});

test('the two committed-aesthetic skills are declared by the agent that loads them', () => {
  const agent = readFileSync(path.join(ROOT, 'agents/design-advisor.md'), 'utf8');
  const head = agent.slice(0, agent.indexOf('---', 4));
  for (const s of ['committed-aesthetic', 'aesthetic-instrument']) {
    assert.ok(existsSync(path.join(ROOT, 'skills', s, 'SKILL.md')), `${s} exists`);
    assert.match(head, new RegExp(`- ${s}`), `${s} is declared in the agent frontmatter`);
  }
});
