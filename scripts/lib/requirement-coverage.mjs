// The question nothing here asks: did the plan cover what the brief asked for?
//
// `artifact-lint` checks INSIDE a document — does the ARCH have a Risks
// section, does the ADR cite a file that exists. Spec Kit's `analyze` stage
// checks BETWEEN them, and that gap is real: a brief can raise five things, the
// architecture address three, and every check in this repository stays green
// because each document is individually well-formed.
//
// Why this needs a convention first
// ---------------------------------
// `trace.mjs` already walks requirement → use-case → task → test, and I
// proposed pointing it at this chain. Opening a real brief killed that: both
// sides are prose sections with no identifier in common, so there is no graph to
// walk. Semantic matching would need a model call per pair — cost,
// non-determinism, and a coverage report nobody can reproduce twice.
//
// So a brief numbers what it asks for, downstream documents cite the number, and
// this reads the two. The citation is a bare `R1` token on purpose: a syntax
// people have to remember is a syntax people forget, and the check would then
// measure discipline rather than coverage.

/**
 * Requirement IDs a brief declares, with the line that declares them.
 *
 * A declaration is an ID at the START of a list item or heading — the place a
 * brief actually introduces something. A mention mid-sentence is a citation,
 * not a declaration, and treating the two alike would let a document declare
 * requirements by talking about them.
 */
export function requirements(text) {
  const out = new Map();
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    // `- **BOARD-R1** — …`, `- BOARD-R1: …`, `### BOARD-R1 — …`
    const m = line.match(/^(?:[-*+]|\|?\s*|#{1,6})\s*\**\s*((?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-)?R\d+)\b\**\s*[—:\-|]?\s*(.*)$/);
    if (!m) continue;
    const [, id, rest] = m;
    // First declaration wins: a brief that lists R1 in Scope and refers back to
    // it later should not have the later mention overwrite the definition.
    if (!out.has(id)) out.set(id, rest.replace(/\*\*/g, '').trim() || '(no summary on the declaring line)');
  }
  return out;
}

/** Every requirement ID a document mentions, however it mentions it. */
export function citations(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/\b(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-)?R\d+\b/g)) out.add(m[0]);
  return out;
}

/** A bare `R1` belongs to no brief in particular. */
export function isUnprefixed(id) {
  return /^R\d+$/.test(String(id));
}

/**
 * What the downstream documents cover, and what they miss.
 *
 * Three answers rather than two. `dangling` — a citation of an ID the brief
 * never declared — is usually a typo and occasionally a requirement someone
 * deleted while work continued against it, which is the more interesting case
 * and the one a two-state answer would hide.
 *
 * @param {object} o
 *   brief       the brief's text
 *   downstream  [{name, text}] — ARCH docs, plans, task titles
 */
export function coverage({ brief = '', downstream = [] } = {}) {
  const reqs = requirements(brief);

  // A bare `R1` is not an identifier, it is a coincidence.
  //
  // Found by running this against a real brief rather than a fixture: three
  // requirements reported as fully covered, and every "citation" came from
  // unrelated plans that carry their OWN R1..R8. An R-number is global while a
  // requirement is local to its brief, so any document with its own numbering
  // makes any brief look addressed — a green light exactly where the gap is.
  // The unit tests all passed, because every fixture came from one brief.
  const bare = [...reqs.keys()].filter(isUnprefixed);
  if (bare.length) {
    return {
      state: 'ambiguous',
      why: `${bare.join(', ')} carry no brief prefix — a bare R-number cannot be told apart from another document's numbering, so coverage here would be a coincidence. Number them <SLUG>-R1 (e.g. BOARD-R1).`,
      covered: [], uncovered: [], dangling: [],
    };
  }

  if (reqs.size === 0) {
    // Not zero coverage. A brief written before the convention declares nothing,
    // and reporting that as "0 of 0 covered, all good" would be the same defect
    // this repository keeps removing — an absent measurement wearing a result's
    // clothes.
    return { state: 'no-requirements', why: 'this brief declares no R-numbered requirements — nothing to check coverage against', covered: [], uncovered: [], dangling: [] };
  }

  // Only this brief's own namespace counts.
  //
  // Without this the report listed eight `dangling` R4..R8 belonging to an
  // unrelated plan's numbering — noise that reads as a finding, which is how a
  // check earns the reputation that gets it ignored.
  const prefixes = new Set([...reqs.keys()].map((id) => id.replace(/-R\d+$/, '')));
  const mine = (id) => prefixes.has(id.replace(/-R\d+$/, ''));

  const seen = new Map();   // id → [document names]
  for (const doc of downstream) {
    for (const id of citations(doc?.text ?? '')) {
      if (!mine(id)) continue;
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id).push(doc?.name ?? '(unnamed)');
    }
  }

  const covered = [];
  const uncovered = [];
  for (const [id, summary] of reqs) {
    if (seen.has(id)) covered.push({ id, summary, by: seen.get(id) });
    else uncovered.push({ id, summary });
  }
  const dangling = [...seen.keys()].filter((id) => !reqs.has(id))
    .map((id) => ({ id, by: seen.get(id) }));

  return {
    state: uncovered.length ? 'gaps' : 'complete',
    why: uncovered.length
      ? `${uncovered.length} of ${reqs.size} requirement(s) are not mentioned anywhere downstream`
      : `all ${reqs.size} requirement(s) are addressed downstream`,
    covered, uncovered, dangling,
  };
}

/** Lines a human can act on — the requirement text, not just its number. */
export function describeCoverage(cov, { max = 12 } = {}) {
  if (!cov) return '';
  const lines = [cov.why];
  for (const r of cov.uncovered.slice(0, max)) lines.push(`  uncovered  ${r.id} — ${r.summary}`);
  if (cov.uncovered.length > max) lines.push(`  … and ${cov.uncovered.length - max} more`);
  for (const d of cov.dangling.slice(0, max)) {
    lines.push(`  dangling   ${d.id} cited by ${d.by.join(', ')} but the brief never declares it`);
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/requirement-coverage.mjs <brief.md> [downstream...]
//
// With no downstream arguments it reads docs/architecture/ and docs/plans/,
// which is the ordinary case: "what did this brief ask for that nothing has
// picked up".

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const briefPath = argv[0];
  if (!briefPath) {
    console.error('usage: requirement-coverage.mjs <brief.md> [downstream.md ...]');
    process.exit(2);
  }

  let brief;
  try { brief = readFileSync(briefPath, 'utf8'); }
  catch (e) { console.error(`cannot read ${briefPath}: ${e.message}`); process.exit(2); }

  let paths = argv.slice(1);
  if (!paths.length) {
    for (const dir of ['docs/architecture', 'docs/plans']) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) if (f.endsWith('.md')) paths.push(join(dir, f));
    }
  }

  const downstream = [];
  for (const p of paths) {
    try { downstream.push({ name: p, text: readFileSync(p, 'utf8') }); }
    catch { /* a file that vanished between listing and reading is not a coverage gap */ }
  }

  const cov = coverage({ brief, downstream });
  console.log(`requirement-coverage: ${briefPath} against ${downstream.length} downstream document(s)`);
  console.log(describeCoverage(cov));
  if (process.argv.includes('--json')) console.log(JSON.stringify(cov, null, 2));
  // Reported by default; `--strict` gates.
  //
  // `no-requirements` fails under --strict alongside `gaps`, and that is the
  // point rather than an edge case. Both real briefs in this repository carried
  // zero R-numbers, so this module answered "no requirements declared" — its own
  // header calls that honest and useless — and a gate wired to it would have
  // passed every time while checking nothing. A check that could not look must
  // not exit like one that looked and found nothing. `ambiguous` fails for the
  // same reason.
  const blocking = new Set(['gaps', 'no-requirements', 'ambiguous']);
  process.exit(process.argv.includes('--strict') && blocking.has(cov.state) ? 1 : 0);
}
