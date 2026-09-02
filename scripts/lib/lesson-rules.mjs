// Lessons that fire mechanically, instead of asking anyone to remember them.
//
// Why this exists
// ---------------
// This repository has measured, three separate times, that a rule enforced by
// structure lands ~5x more reliably than the same rule written as prose (18%
// adherence against 92% on the devops campaign). And yet its own learning loop
// ends in prose: `lessons.md` → `/crystallize` → a skill is a paragraph
// pipeline from start to finish. The incident that bought the lesson never
// becomes a check.
//
// This is the missing last step: a small pack of deterministic rules, each one
// bought by a specific incident here, evaluated on every file the agent edits —
// BEFORE any reviewer sees it. The agent that just wrote the defect fixes it in
// the next turn, which is cheaper than every alternative.
//
// What this is not
// ----------------
// Not a general linter. General linters exist and are good at catching what
// humans mistype; these rules catch what THIS system's agents actually did.
// Three rules that have each cost a real debugging session, tuned against this
// codebase until the false-positive rate is boring. A rule nobody trusts gets
// worked around, and a worked-around guard protects nothing — this week's
// pre-push hook, in miniature.
//
// Rules are hand-written, always. A recurring lesson may PROPOSE a rule; a
// human lands it through review. An optimiser writing its own ruler is the
// exact shape §3.3 of the improvement plan forbids.

/**
 * Split source into lines with 1-based numbering, keeping it dumb on purpose.
 * These rules read text, not an AST: an AST parser that fails on a half-written
 * file would make the hook noisy exactly when the agent is mid-edit.
 */
function lines(text) {
  return String(text ?? '').split('\n');
}

/**
 * The catch blocks of a JS/TS source, textually.
 *
 * Brace-counting rather than parsing, for the reason above. Returns
 * {binding, body, line} — binding is null for `catch {`.
 */
export function catchBlocks(text) {
  const out = [];
  const src = String(text ?? '');
  const re = /catch\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const binding = m[1] ?? null;
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    out.push({
      binding,
      body: src.slice(start, i - 1),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * `try { … } catch (e?) { … }` pairs, textually.
 *
 * catchBlocks reads the catch alone, which is the right frame for a rule about
 * what a catch does. It is the wrong frame for the shape where the WORK is in
 * the try and the catch is empty — there is nothing in the catch to count.
 *
 * @returns {{binding: string|null, tryBody: string, catchBody: string,
 *            line: number, endIndex: number}[]}
 */
export function tryCatchPairs(text) {
  const src = String(text ?? '');
  const out = [];
  const re = /\btry\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    // Walk the try block to its closing brace.
    let i = m.index + m[0].length;
    const tryStart = i;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    if (depth !== 0) continue;               // unbalanced — not ours to guess at
    const tryBody = src.slice(tryStart, i - 1);

    // The catch must follow immediately (whitespace only). `try/finally` has none.
    const rest = src.slice(i);
    const cm = /^\s*catch\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\))?\s*\{/.exec(rest);
    if (!cm) continue;
    let j = i + cm[0].length;
    const catchStart = j;
    depth = 1;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    if (depth !== 0) continue;

    out.push({
      binding: cm[1] ?? null,
      tryBody,
      catchBody: src.slice(catchStart, j - 1),
      line: src.slice(0, m.index).split('\n').length,
      endIndex: j,
    });
  }
  return out;
}

/** Statements in a block, ignoring comments and bare control flow. */
function countStatements(body) {
  return String(body).split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
    .filter((l) => !/^[{}()\][;]*$/.test(l))
    .length;
}

/** A catch body that is empty, or carries nothing but comments. */
function isLabelOnlyCatch(body) {
  const withoutComments = String(body)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  return withoutComments === '';
}

const JS_EXT = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

/**
 * The rule pack. Each rule:
 *   id         stable slug
 *   lesson     the incident that bought it — a rule without a story gets
 *              deleted by the next person who finds it inconvenient
 *   appliesTo  (file) => bool
 *   check      (text, file) => findings [{line, excerpt, why}]
 */
export const RULES = [
  {
    id: 'fabricated-cause',
    lesson: '2026-08-10: a catch reported "pipeline-wake unavailable in this '
      + 'board build" — a guess printed as a finding. The real error was a '
      + 'ReferenceError three lines up, and the guess sent the reader to '
      + 'packaging. A handler that names a cause it did not observe is worse '
      + 'than one that says nothing.',
    appliesTo: (f) => JS_EXT.test(f),
    check(text) {
      const findings = [];
      for (const cb of catchBlocks(text)) {
        if (!cb.binding) continue;               // `catch {` reports nothing about the error
        const usesError = new RegExp(`\\b${cb.binding}\\b`).test(cb.body);
        if (usesError) continue;
        // Does the body REPORT a cause — assign or emit a quoted explanation?
        const reports = /(?:why|error|reason|message)\s*[:=][^=]/.test(cb.body)
          && /['"`][^'"`]{8,}['"`]/.test(cb.body);
        if (reports) {
          findings.push({
            line: cb.line,
            excerpt: cb.body.trim().split('\n')[0].slice(0, 90),
            why: `this catch binds \`${cb.binding}\` and reports a quoted cause without ever reading it — the message is a guess about the error, not the error`,
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'silent-catch',
    lesson: 'The repository\'s oldest defect: a read that failed must not look '
      + 'like an absence of data. First cut of this rule flagged 323 sites — it '
      + 'had caught the one-line `catch { return fallback }` idiom, which is '
      + 'this codebase\'s accepted probe shape, and a catch that RESPONDS with '
      + 'an error status, which is handling. A rule nobody trusts gets worked '
      + 'around, so it was narrowed to the shape that has actually hurt: a '
      + 'multi-statement recovery that swallows the error without a word.',
    appliesTo: (f) => JS_EXT.test(f),
    check(text) {
      const findings = [];
      for (const cb of catchBlocks(text)) {
        const usesError = cb.binding && new RegExp(`\\b${cb.binding}\\b`).test(cb.body);
        const hasComment = /\/\*[\s\S]*?\*\/|\/\//.test(cb.body);
        const rethrows = /\bthrow\b/.test(cb.body);
        // A response IS handling: sending an error status, logging, or writing
        // to a stream names the failure to someone. Recording it into the
        // result (`missing.push(...)`) is reporting too. The defect is recovery
        // that tells no one.
        const reportsOut = /\b(?:res\.|json\(|console\.|log\.|warn\(|error\(|status\s*[:(]|writeHead|\.write\(|\.push\()/.test(cb.body);
        // One statement is the probe idiom; the dangerous shape does WORK in
        // the dark. Cleanup (clearTimeout, close) and bare control flow
        // (continue, return null) are not work — counting them flagged the
        // ordinary cleanup-then-honest-null shape in memory-filter.
        const statements = cb.body.split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('//'))
          .filter((l) => !/^(?:continue|break|return(?:\s+(?:null|false|undefined|\[\]|\{\}|''|""))?)\s*;?$/.test(l))
          .filter((l) => !/^(?:clearTimeout|clearInterval|clearImmediate)\b|\.(?:close|abort|destroy|unref)\(/.test(l))
          .length;
        if (!usesError && !hasComment && !rethrows && !reportsOut && statements >= 2) {
          findings.push({
            line: cb.line,
            excerpt: (cb.body.trim() || '(empty)').split('\n')[0].slice(0, 90),
            why: 'multi-statement recovery that neither uses the error, reports it, nor says why ignoring it is right — this is work done in the dark',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'work-in-try-success-after',
    lesson: '2026-09-01: /api/gate/:id approve wrote the decision log inside a '
      + 'try whose catch was `{ /* best-effort */ }`, then returned '
      + '`{ ok: true }`. When the write failed the gate still landed, the audit '
      + 'trail silently did not, and the caller was told it had. It read as a '
      + 'flaky test for weeks. silent-catch could not see it twice over: the '
      + 'comment exempts, AND the catch was empty so the statement count never '
      + 'applied — that rule counts the CATCH, and this shape puts the work in '
      + 'the TRY. Measured before writing this: 214 catch blocks in scripts/ and '
      + 'packages/ carry a comment and 40 of those are bare labels, so dropping '
      + 'the comment exemption was never an option — a rule nobody trusts gets '
      + 'worked around, which is how silent-catch got narrowed in the first place.',
    appliesTo: (f) => JS_EXT.test(f),
    check(text) {
      const findings = [];
      const src = String(text ?? '');
      for (const p of tryCatchPairs(src)) {
        // The work must be substantial. One or two statements is a probe.
        if (countStatements(p.tryBody) < 3) continue;
        // The catch must say nothing at all — empty, or comments only.
        if (!isLabelOnlyCatch(p.catchBody)) continue;
        // A rethrow inside the try is not swallowed; the caller still learns.
        if (/\bthrow\b/.test(p.catchBody)) continue;

        // The honest form of this shape, and it must not be flagged: the try
        // ends by setting a flag, and the flag travels out with the answer.
        //
        //   let historyRead = false;
        //   try { …read…; historyRead = true; } catch { }
        //   res.end(JSON.stringify({ measured: historyRead, agents }));
        //
        // The 200 is truthful because the body carries `measured: false`. That
        // is reporting the failure, in the same way silent-catch treats a
        // response as handling. Flagging it would teach people to delete the
        // flag, which is the opposite of the lesson.
        const successFlags = [...p.tryBody.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*true\s*;/g)].map((x) => x[1]);
        if (successFlags.some((v) => new RegExp(`\\b${v}\\b`).test(src.slice(p.endIndex, p.endIndex + 900)))) continue;

        // And the caller must then be told it worked. Look at what follows the
        // catch, up to the end of the enclosing function — a literal success, or
        // a bare `return` that yields undefined where a value was promised.
        const after = src.slice(p.endIndex, p.endIndex + 900);
        const announcesSuccess =
          /return\s*\{[^}]*\b(?:ok|success|logged|written|saved)\s*:\s*true/.test(after) ||
          /return\s+true\s*;/.test(after) ||
          /\bres\.(?:writeHead\(\s*20\d|statusCode\s*=\s*20\d)/.test(after) ||
          /\bstatus\s*:\s*['"](?:ok|success|done)['"]/.test(after);
        if (!announcesSuccess) continue;

        findings.push({
          line: p.line,
          excerpt: (p.tryBody.trim().split('\n')[0] || '(empty)').trim().slice(0, 90),
          why: 'the work is inside the try, the catch says nothing, and the caller '
            + 'is then told it succeeded — if this throws, the thing did not happen '
            + 'and nobody is told. Return what actually happened '
            + '(`{ logged: false, why }`), or let it throw',
        });
      }
      return findings;
    },
  },
  {
    id: 'exclusion-without-why',
    lesson: 'The writeup\'s "excluded directories became bug reserves", and this '
      + 'week\'s own EXCLUDE_PATHS edits. First cut demanded a comment on every '
      + 'ENTRY and flagged 18 sites — but the codebase\'s real convention is a '
      + 'block comment above the LIST, and "node_modules" does not need a per-line '
      + 'essay. It also walked past a `])` that shared a line with the last entry '
      + 'and wandered into a neighbouring keywords map. Narrowed: one finding per '
      + 'LIST whose declaration has no justification within three lines above it.',
    appliesTo: (f) => JS_EXT.test(f) || /\.(sh|bash)$/.test(f),
    check(text) {
      const findings = [];
      const ls = lines(text);
      // A list whose NAME says it excludes: SKIP / EXCLUDE / IGNORE / DENY.
      // A Set or array of strings — an object map named DENY_FIX is a config
      // table, not an exclusion list, and matching it taught this rule that
      // the NAME alone is not the shape.
      const decl = /^\s*(?:const|let|var|export const|readonly)\s+[A-Za-z_]*(?:SKIP|EXCLUDE|IGNORE|DENY)[A-Za-z_]*\s*=\s*(?:Object\.freeze\(\s*)?(?:new Set\(\s*)?\[|^[A-Z_]*(?:SKIP|EXCLUDE|IGNORE|DENY)[A-Z_]*=\(/;
      for (let i = 0; i < ls.length; i++) {
        if (!decl.test(ls[i])) continue;
        // The justification is a comment near the declaration: on it, or within
        // the three lines above (block comment, //, or shell #).
        const above = ls.slice(Math.max(0, i - 3), i).join('\n');
        const hasWhy = /\/\/|\/\*|\*\/|^\s*\*|#/m.test(above) || /\/\/|#/.test(ls[i]);
        if (!hasWhy) {
          findings.push({
            line: i + 1,
            excerpt: ls[i].trim().slice(0, 90),
            why: 'an exclusion list with no stated reason — "deliberate in June" and "still right in December" are different claims, and the second one starts from a comment saying what this list protects',
          });
        }
      }
      return findings;
    },
  },
];

/**
 * Run every applicable rule over one file's text.
 *
 * @returns findings [{rule, lesson, line, excerpt, why}]
 */
export function runRules(text, file, { rules = RULES } = {}) {
  const out = [];
  for (const r of rules) {
    if (!r.appliesTo(file)) continue;
    for (const f of r.check(text, file)) {
      out.push({ rule: r.id, lesson: r.lesson, ...f });
    }
  }
  return out;
}

/** The message the agent that just wrote the file should see. */
export function brief(findings, file) {
  if (!findings.length) return null;
  const head = `lesson-rules: ${findings.length} finding(s) in ${file} — each of these is a rule bought by a real incident here, not style:`;
  const body = findings.slice(0, 5).map((f) =>
    `  ${file}:${f.line} [${f.rule}] ${f.why}`).join('\n');
  const tail = findings.length > 5 ? `  …and ${findings.length - 5} more` : '';
  return [head, body, tail, 'Fix these now, while the context is yours — a reviewer finding them later costs a round-trip.'].filter(Boolean).join('\n');
}

// ── CLI: sweep the repository ───────────────────────────────────────────────
//
// `--sweep` runs the pack over every tracked source file and prints a count per
// rule. This is how a new rule earns its place: run it against the code that
// already exists, read every finding, and either fix the code or fix the rule.
// A rule shipped without this pass is a guess about its own precision.

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');

  // Test files legitimately contain the shapes the rules hunt — as fixtures.
  // The hook skips them for the same reason; the two exclusions must agree, or
  // the sweep reports findings no edit will ever surface.
  const isFixture = (f) => /(^|\/)tests?\//.test(f) || /\.test\./.test(f);
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n').filter((f) => f && !isFixture(f) && RULES.some((r) => r.appliesTo(f)));

  const all = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; /* deleted since ls-files */ }
    for (const finding of runRules(text, f)) all.push({ file: f, ...finding });
  }

  const byRule = new Map();
  for (const f of all) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);

  console.log(`lesson-rules sweep: ${files.length} file(s), ${all.length} finding(s)`);
  for (const [rule, n] of byRule) console.log(`  ${rule}: ${n}`);
  if (process.argv.includes('--list')) {
    for (const f of all) console.log(`  ${f.file}:${f.line} [${f.rule}] ${f.excerpt}`);
  }
  process.exitCode = all.length && process.argv.includes('--strict') ? 1 : 0;
}
