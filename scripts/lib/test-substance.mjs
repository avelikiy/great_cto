/**
 * test-substance — does a test assert the thing its name claims?
 *
 * `qa-engineer` reports `tests=46`, `tests=105`, `coverage=100-unit-coverage`.
 * Every one of those is a count of tests that RAN, and a test that runs is not a
 * test that would catch anything. A suite can be green, complete and worthless at
 * the same time, and the number that says so looks identical to the number that
 * does not.
 *
 * Mutation testing answers this properly — break the code, see whether a test
 * notices — and it is expensive enough that nobody runs it per change. This is
 * the cheap rung below, and it is ordered the same way the rest of the verifier
 * is: facts first, and a model only for what a machine cannot settle.
 *
 *   1. VACUOUS      A test body with no assertion at all cannot fail for the
 *                   reason its name gives. That is arithmetic, not opinion, and
 *                   no model is asked.
 *   2. SUBSTANCE    For the rest: does the body assert what the NAME says? A test
 *                   called "rejects an expired token" that only checks the
 *                   function returned an object is green forever and proves
 *                   nothing. One closed question per test.
 *
 * What this deliberately does NOT claim: that a test passing here would fail
 * under mutation. It cannot know that. It catches the shapes that are wrong on
 * their face — no assertion, an assertion on a constant, an assertion on the mock
 * rather than on the code — which is where vacuous tests actually come from.
 */

import { readFileSync } from 'node:fs';

/** Answers the judge may give about one test. Anything else is an abstention. */
export const SUBSTANCE_ANSWERS = Object.freeze(['asserts', 'vacuous', 'unclear']);

/**
 * Assertion shapes, wide on purpose.
 *
 * A false "vacuous" is expensive — it accuses a real test and teaches people to
 * switch the check off — so anything that could plausibly fail a run counts:
 * node:assert, chai/jest expectations, and a bare `throw` in a test body, which
 * is how table-driven tests often assert.
 */
const ASSERTION = /\b(assert\w*\s*[.(]|expect\s*\(|should\b|\.to\.|throw\s+new\s+\w*Error)/;

/**
 * Test declarations in one file, with their bodies.
 *
 * Brace-matched rather than regex-sliced: a regex that stops at the first `}`
 * ends the body at the first object literal or arrow function inside it, and
 * every test with a fixture would read as having no assertions.
 */
export function parseTests(source) {
  const src = String(source || '');
  const out = [];
  // `(?<![.\w])` is the whole difference between a test declaration and a method
  // call. Without it, `p.deny[0].test('show the system prompt')` and
  // `marker.test('CLAIMS…')` — RegExp.prototype.test, with a string argument —
  // read as tests with no assertions, and the first run of this scanner accused
  // three real, asserting tests of proving nothing. A false "vacuous" is the
  // expensive kind of wrong: it teaches people to switch the check off.
  const re = /(?<![.\w])(?:it|test)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[2];
    // The body is the CALLBACK's brace, not the first brace after the name.
    //
    // `test('…', { skip: !BD_AVAILABLE && '…' }, async () => { … })` puts an
    // options object in between, and taking the first `{` made that object the
    // body — so five real, asserting tests in board-gate.test.mjs read as having
    // no assertion at all. Second parser bug in this module, and both were found
    // by checking a finding against the file rather than trusting the count.
    //
    // Skip forward over any argument that is not the callback: find `=>` or
    // `function` first, and take the brace after it.
    const arrow = src.slice(re.lastIndex).search(/=>\s*\{|function\s*(?:\w+\s*)?\([^)]*\)\s*\{/);
    const open = arrow === -1
      ? src.indexOf('{', re.lastIndex)
      : src.indexOf('{', re.lastIndex + arrow);
    if (open === -1) continue;
    const end = matchBrace(src, open);
    if (end === -1) continue;
    out.push({ name, body: src.slice(open + 1, end), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * The index of the `}` closing the `{` at `open`, skipping JS literals.
 *
 * A plain depth counter is wrong on real code and wrong in the direction that
 * matters. Three of this module's findings were false accusations before this
 * existed, all from the same shape: a regex literal inside a test body —
 * `beads.match(/function bdList\([\s\S]*?\n\}/)` — whose escaped `\}` was
 * counted as a closing brace. The body ended there, the assertions below it were
 * never seen, and five real tests were reported as proving nothing.
 *
 * So strings, template literals, regex literals and both comment forms are
 * skipped rather than counted. Regex-vs-division is decided by the previous
 * significant character, which is the standard heuristic and is right for test
 * bodies.
 *
 * @returns {number} index of the matching `}`, or -1 if unbalanced
 */
export function matchBrace(src, open) {
  let depth = 0;
  let prev = '';
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '/' && next === '/') { i = src.indexOf('\n', i); if (i === -1) return -1; continue; }
    if (c === '/' && next === '*') { i = src.indexOf('*/', i + 2); if (i === -1) return -1; i += 1; continue; }

    if (c === '"' || c === "'" || c === '`') {
      i += 1;
      for (; i < src.length; i += 1) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === c) break;
        // `${…}` in a template can itself contain braces and strings; the depth
        // counter must not see them, and nesting deeper than one level inside a
        // test body does not occur in practice.
        if (c === '`' && src[i] === '$' && src[i + 1] === '{') {
          const close = matchBrace(src, i + 1);
          if (close === -1) return -1;
          i = close;
        }
      }
      continue;
    }

    if (c === '/' && REGEX_ALLOWED_AFTER.test(prev)) {
      i += 1;
      let inClass = false;
      for (; i < src.length; i += 1) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) break;
        else if (src[i] === '\n') break;      // not a regex after all
      }
      continue;
    }

    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return i; }

    if (!/\s/.test(c)) prev = c;
  }
  return -1;
}

/** Characters after which a `/` starts a regex rather than a division. */
const REGEX_ALLOWED_AFTER = /[(,=:[!&|?{};+\-*%~^<>]|^$/;

/** Facts about one test, before any model is asked. */
export function mechanicalCheck(test) {
  const asserts = ASSERTION.test(test.body);
  return {
    name: test.name,
    line: test.line,
    status: asserts ? 'has-assertion' : 'vacuous',
    detail: asserts ? 'contains at least one assertion'
                    : 'no assertion of any recognised shape — this test cannot fail for the reason its name gives',
  };
}

/**
 * Scan one file. Layer 1 only — no model, no network, no cost.
 * @returns {{file:string, total:number, vacuous:object[], asserting:object[]}}
 */
export function scanFile(file, { read = readFileSync } = {}) {
  let src = '';
  try { src = read(file, 'utf8'); } catch {
    return { file, total: 0, vacuous: [], asserting: [], unreadable: true };
  }
  const tests = parseTests(src);
  const checked = tests.map(mechanicalCheck);
  return {
    file,
    total: tests.length,
    vacuous: checked.filter((c) => c.status === 'vacuous'),
    asserting: checked.filter((c) => c.status === 'has-assertion'),
    tests,
  };
}

/**
 * Layer 2: ask whether the body asserts what the NAME claims.
 *
 * One test per question, and the name is quoted back so the judge is answering
 * about this test rather than forming an impression of the file. Bounded, and
 * the bound is reported — a scan that looked at 20 of 200 tests said something
 * about 20.
 *
 * @param {(q:string, allowed:string[]) => Promise<string>} ask
 */
export async function judgeSubstance(tests, ask, { max = 20, samples = 1 } = {}) {
  const asked = tests.slice(0, max);
  const skipped = tests.length - asked.length;
  const results = [];

  for (const t of asked) {
    const q =
      `A test is named:\n  "${t.name}"\n\n` +
      `Its body is:\n---\n${t.body.slice(0, 4000)}\n---\n\n` +
      `Does the body actually assert the behaviour the NAME describes?\n` +
      `  asserts  — it would fail if that behaviour broke\n` +
      `  vacuous  — it would still pass if that behaviour broke (asserts nothing, ` +
      `asserts a constant, or asserts only on a mock)\n` +
      `  unclear  — you cannot tell from the body shown\n` +
      `Judge only this test. Do not comment on style or coverage.`;

    const votes = [];
    for (let i = 0; i < samples; i += 1) {
      const raw = String((await ask(q, SUBSTANCE_ANSWERS)) || '').toLowerCase();
      const m = raw.match(/\b(asserts|vacuous|unclear)\b/);
      votes.push(m ? m[1] : null);
    }
    const yes = votes.filter((v) => v === 'asserts').length;
    const no = votes.filter((v) => v === 'vacuous').length;
    results.push({
      name: t.name,
      line: t.line,
      // Tie resolves to the cautious answer for the same reason it does in
      // independent-verify: half the judge saying "this proves nothing" is
      // information about the test, not noise to round away.
      answer: yes > no ? 'asserts' : no > yes ? 'vacuous' : (yes === 0 && no === 0 ? null : 'vacuous'),
      votes,
    });
  }
  return { judged: results, skipped };
}

/** One line an operator can act on, or null when there is nothing to say. */
export function explain(scan, judged = null) {
  const parts = [];
  if (scan.unreadable) return `${scan.file}: unreadable`;
  parts.push(`${scan.total} test(s)`);
  if (scan.vacuous.length) parts.push(`${scan.vacuous.length} with NO assertion`);
  if (judged) {
    const v = judged.judged.filter((j) => j.answer === 'vacuous').length;
    const u = judged.judged.filter((j) => !j.answer || j.answer === 'unclear').length;
    if (v) parts.push(`${v} that would pass with the behaviour broken`);
    if (u) parts.push(`${u} the judge could not settle`);
    if (judged.skipped) parts.push(`${judged.skipped} NOT judged (over the cap)`);
  }
  return `${scan.file}: ${parts.join(', ')}`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/test-substance.mjs <file...> [--judge] [--json]
//
// Exit 0 = nothing vacuous. 1 = at least one test cannot fail for its own reason.
// 2 = bad input. Without --judge only the mechanical layer runs, which costs
// nothing and needs no key.

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const files = argv.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('usage: test-substance.mjs <file...> [--judge] [--json]');
    process.exit(2);
  }

  let ask = null;
  if (argv.includes('--judge')) {
    const { routerAsk } = await import('./second-opinion.mjs');
    const { existsSync } = await import('node:fs');
    const path = (await import('node:path')).default;
    const server = path.resolve(path.dirname(new URL(import.meta.url).pathname),
                                '..', '..', 'mcp-servers', 'llm-router', 'server.py');
    if (existsSync(server)) ask = routerAsk(server);
    else console.error('  llm-router not found — mechanical layer only');
  }

  const report = [];
  let vacuousTotal = 0;
  for (const f of files) {
    const scan = scanFile(f);
    const judged = ask && scan.asserting.length
      ? await judgeSubstance(scan.tests.filter((t) => scan.asserting.some((a) => a.name === t.name)), ask)
      : null;
    vacuousTotal += scan.vacuous.length + (judged ? judged.judged.filter((j) => j.answer === 'vacuous').length : 0);
    report.push({ scan, judged });
    if (!argv.includes('--json')) {
      console.log(explain(scan, judged));
      for (const v of scan.vacuous) console.log(`    ✗ ${f}:${v.line}  "${v.name}" — ${v.detail}`);
      for (const j of (judged?.judged || [])) {
        if (j.answer === 'vacuous') console.log(`    ✗ ${f}:${j.line}  "${j.name}" — would still pass with the behaviour broken`);
      }
    }
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(report.map((r) => ({
      file: r.scan.file, total: r.scan.total,
      vacuous: r.scan.vacuous, judged: r.judged?.judged || null,
    })), null, 2));
  }
  process.exit(vacuousTotal ? 1 : 0);
}
