// The eight request classes, and the one place they are defined.
//
// They were named in four documents in four different subsets: CLAUDE.md had all
// eight, agents/coordinator.md five, skills/great_cto/SKILL.md four,
// shared/safety-rules.md three. Nothing related them, so an agent reading
// SKILL.md never learned that SURVEY or SIMPLE CODE exist — four partial copies
// of one table, disagreeing silently.
//
// shared/routing.toml is now the source and CLAUDE.md's table must agree with it
// row for row. Everything else may quote a subset — a document that discusses
// incidents need not list all eight — but it may not invent a class, because a
// class that exists in one document and nowhere else routes to nothing.
//
// WHAT THIS DOES NOT TEST: the model's actual routing. The classification is a
// prompt-level judgement; classify-telemetry.mjs keeps a regex proxy of it and
// says in its own header that it is "a PROXY of the model's classifier, not the
// model's own decision". A green test here says the documents agree, not that a
// request reaches the right pipeline. Behaviour belongs in tests/eval/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The source: `[CLASS]` sections with `signals` and `pipeline`. */
function parseRouting(text) {
  const out = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const sec = line.match(/^\[([A-Z_]+)\]$/);
    if (sec) { cur = { name: sec[1].replace(/_/g, ' '), signals: '', pipeline: '' }; out.push(cur); continue; }
    if (!cur) continue;
    const kv = line.match(/^(signals|pipeline)\s*=\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    // Literal strings delimited by ''' — the values carry both " and ', and this
    // way the file holds exactly the text the table shows, with no escaping to
    // diverge from.
    if (v.startsWith("'''") && v.endsWith("'''")) v = v.slice(3, -3);
    else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    cur[kv[1]] = v;
  }
  return out;
}

/** CLAUDE.md's classifier table, as rows. */
function parseClaudeTable(text) {
  const start = text.indexOf('## Request classifier');
  assert.notEqual(start, -1, 'CLAUDE.md still has a "Request classifier" section');
  const body = text.slice(start, text.indexOf('\n## ', start + 4));
  return body.split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l) && !/\|\s*Class\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length === 3)
    .map(([name, signals, pipeline]) => ({ name: name.replace(/\*\*/g, '').trim(), signals, pipeline }));
}

test('the source lists eight classes, each with signals and a pipeline', () => {
  const classes = parseRouting(read('shared/routing.toml'));
  assert.equal(classes.length, 8, 'eight classes');
  for (const c of classes) {
    assert.ok(c.signals.length > 0, `${c.name} declares what indicates it`);
    assert.ok(c.pipeline.length > 0, `${c.name} declares what runs`);
  }
});

test("CLAUDE.md's table is the source, rendered", () => {
  const source = parseRouting(read('shared/routing.toml'));
  const table = parseClaudeTable(read('CLAUDE.md'));

  assert.deepEqual(table.map((r) => r.name), source.map((c) => c.name),
    'the same classes, in the same order — a table and a source that disagree on '
    + 'the set are two tables');

  for (const [i, row] of table.entries()) {
    assert.equal(row.signals, source[i].signals, `${row.name}: signals differ from shared/routing.toml`);
    assert.equal(row.pipeline, source[i].pipeline, `${row.name}: pipeline differs from shared/routing.toml`);
  }
});

test('no document routes to a class that does not exist', () => {
  const known = new Set(parseRouting(read('shared/routing.toml')).map((c) => c.name));
  // Only where a document is clearly naming a class: a bold **CLASS** or a table
  // cell. Bare words like "design" are ordinary English and are not claims.
  const files = ['CLAUDE.md', 'skills/great_cto/SKILL.md', 'agents/coordinator.md', 'shared/safety-rules.md'];
  const unknown = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/\*\*([A-Z][A-Z ]{2,20})\*\*/g)) {
      const name = m[1].trim();
      // All-caps bold is also used for emphasis ("NOT", "ALWAYS"); only judge
      // tokens that look like a class — two words, or a known single word.
      if (!/^[A-Z]+( [A-Z]+)?$/.test(name)) continue;
      if (name.split(' ').length === 1 && !known.has(name)) continue;
      if (!known.has(name)) unknown.push(`${f}: ${name}`);
    }
  }
  assert.deepEqual(unknown, [],
    `these documents name a request class that shared/routing.toml does not define:\n  ${unknown.join('\n  ')}`);
});
