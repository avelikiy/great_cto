#!/usr/bin/env node
/**
 * gate-weakening-guard — PreToolUse hook for Edit | Write | MultiEdit.
 *
 * The cheapest way to turn a red check green is to stop it checking: skip the
 * failing test, or let the CI step fail without failing the build. The
 * operator's rule against it ("fix the gate or the code — never switch the check
 * off or mark it allow-failure") was a sentence; this makes it a refusal. It
 * denies an edit that ADDS one of these, compared with what was there before:
 *
 *   test files   it/test/describe.skip · .only · xit/xdescribe · @pytest.mark.skip ·
 *                @unittest.skip · pytest.skip( · t.Skip( · #[ignore] · Dart skip: true
 *   CI files     continue-on-error: true · allow_failure: true · *SKIP*: 1|true
 *                (.github/workflows, .gitlab-ci.yml, cloudbuild*, .circleci, azure/bitbucket pipelines)
 *
 * …and one that switches lint or type checking off instead of satisfying it:
 *
 *   source       JS/TS  @ts-ignore · @ts-nocheck · @ts-expect-error · eslint-disable[-next-line|-line]
 *                Python noqa · ruff/flake8: noqa · type: ignore · pylint: disable · pyright: ignore
 *                Rust #[allow( · #![allow(   Go nolint   Java/Kotlin @SuppressWarnings( · @Suppress(
 *   tsconfig*    "strict*": false · "noImplicitAny": false · "skipLibCheck": true
 *   ESLint conf  a rule set to "off" / 0 (.eslintrc*, eslint.config.*)
 *   Python conf  more entries under ignore / extend-ignore / per-file-ignores / disable /
 *                disable_error_code, or ignore_errors = true (pyproject, setup.cfg, tox.ini,
 *                .flake8, ruff.toml, mypy.ini, pylintrc)
 *
 * Counts are before vs after, so existing ones are not re-reported, removing one is
 * fine and moving one (remove here, add there) nets zero. Docs and ordinary source
 * may say the words, and a comment is not a setting — except a suppression, which
 * is a comment by nature, so those kinds match only the directive at a comment's
 * start. An Edit is judged against the whole file it lands in, so a line added
 * inside an existing ignore list is seen.
 *
 * The sanctioned route is a signed, expiring exception for gate `gate-weakening`
 * (`/exception`) — a quarantined flaky test with its ticket, visible and dated.
 *
 * I/O (Claude Code PreToolUse): stdin { tool_name, tool_input }; deny = exit 2 + JSON.
 * Opt out for a whole session (operator's environment): GREAT_CTO_DISABLE_GATE_WEAKENING_GUARD=1
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { isCovered } from '../lib/exceptions.mjs';

const GATE = 'gate-weakening';

const KINDS = [
  { name: 'JS/TS test', file: /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/__tests__\/)/, marks: [
    /\b(it|test|describe|context|suite)\.(skip|only)\s*\(/g, /\bx(it|test|describe|context)\s*\(/g] },
  { name: 'Python test', file: /(^|\/)(test_[^/]*|[^/]*_test)\.py$/, marks: [
    /@pytest\.mark\.skip(if)?\b/g, /@unittest\.skip(If|Unless)?\b/g, /\bpytest\.skip\s*\(/g] },
  { name: 'Go test', file: /_test\.go$/, marks: [/\bt\.Skip(Now|f)?\s*\(/g] },
  { name: 'Rust', file: /\.rs$/, marks: [/#\[ignore\b/g] },
  { name: 'Dart test', file: /_test\.dart$/, marks: [/\bskip:\s*(true|['"])/g] },
  { name: 'CI config', file: /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.ya?ml|cloudbuild[^/]*\.ya?ml|\.circleci\/config\.ya?ml|azure-pipelines\.ya?ml|bitbucket-pipelines\.ya?ml)$/, marks: [
    /continue-on-error:\s*true\b/g, /allow_failure:\s*true\b/g, /\b[A-Z0-9_]*SKIP[A-Z0-9_]*\s*[:=]\s*['"]?(1|true|yes)\b/gi] },

  // Suppressions are comments, so `comments: true` keeps comment lines in the count;
  // each pattern anchors on the comment opener, so prose inside a comment is not one.
  { name: 'JS/TS suppression', comments: true, file: /\.([cm]?[jt]sx?|vue|svelte)$/, marks: [
    /(?:\/\/|\/\*+)\s*@ts-(?:ignore|nocheck|expect-error)\b/g,
    /(?:\/\/|\/\*+)\s*eslint-disable(?:-next-line|-line)?\b/g] },
  { name: 'Python suppression', comments: true, file: /\.pyi?$/, marks: [
    /#\s*(?:(?:ruff|flake8):\s*)?noqa\b/gi, /#\s*type:\s*ignore\b/g,
    /#\s*pylint:\s*disable\b/g, /#\s*pyright:\s*ignore\b/g] },
  { name: 'Go suppression', comments: true, file: /\.go$/, marks: [/\/\/\s*nolint\b/g] },
  { name: 'Rust lint', file: /\.rs$/, marks: [/#!?\[allow\(/g] },
  { name: 'Java/Kotlin suppression', file: /\.(java|kts?)$/, marks: [/@(?:file:)?Suppress(?:Warnings)?\s*\(/g] },

  // Config that checks less.
  { name: 'tsconfig', file: /(^|\/)tsconfig[^/]*\.json$/, marks: [
    /"strict(?:NullChecks|FunctionTypes|BindCallApply|PropertyInitialization)?"\s*:\s*false\b/g,
    /"noImplicitAny"\s*:\s*false\b/g, /"skipLibCheck"\s*:\s*true\b/g] },
  { name: 'ESLint config', file: /(^|\/)(\.eslintrc(\.[cm]?js|\.json|\.ya?ml)?|eslint\.config\.[cm]?[jt]s)$/, marks: [
    /['"]?[@\w/-]+['"]?\s*:\s*\[?\s*(?:['"]off['"]|off\b|0\b(?!\.))/g] },
  { name: 'Python lint/type config', file: /(^|\/)(pyproject\.toml|setup\.cfg|tox\.ini|\.flake8|\.?ruff\.toml|\.?mypy\.ini|\.?pylintrc)$/, marks: [
    { items: pyIgnoreEntries }, /\bignore_errors\s*=\s*true\b/gi] },
];

// Lint-ignore entries in a Python tool config: every code/path listed under an ignore-ish
// key (ini continuation lines and multi-line TOML lists included) or inside a
// `[… per-file-ignores]` table. Counting entries, not keys, catches a code appended to
// an existing list; reformatting the list or swapping one code for another nets zero.
const PY_IGNORE_KEY = /^\s*["']?(?:extend[-_])?(?:ignore|per[-_]file[-_]ignores|disable|disable[-_]error[-_]code)["']?\s*[=:]\s*(.*)$/i;
const PY_ANY_KEY = /^\s*["']?[\w.*/-]+["']?\s*=/;
function pyIgnoreEntries(text) {
  const out = [];
  let section = '', open = false, depth = 0;
  const take = (v) => {
    depth = Math.max(0, depth + (v.match(/\[/g) || []).length - (v.match(/]/g) || []).length);
    for (const t of v.split(/[\s,[\]"'=:]+/)) if (t) out.push(t);
  };
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/(^|\s)[#;].*$/, '');
    if (!line.trim()) continue;
    const sec = depth === 0 && line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sec) { section = sec[1]; open = false; continue; }
    const key = line.match(PY_IGNORE_KEY);
    if (key && depth === 0) { open = true; take(key[1]); continue; }
    if (/per[-_]file[-_]ignores["']?$/i.test(section.trim())) { take(line); continue; }
    if (open && (depth > 0 || (/^\s/.test(raw) && !PY_ANY_KEY.test(line)))) { take(line); continue; }
    open = false; depth = 0;
  }
  return out;
}

// A comment says the words without doing the thing. `#[` / `#![` are Rust attributes, not comments.
const stripComments = (text) => String(text ?? '').split('\n')
  .filter((l) => { const t = l.trim(); return !(t.startsWith('//') || (t.startsWith('#') && !/^#!?\[/.test(t))); })
  .join('\n');

// Every occurrence of a mark (a regex, or `{ items(text) }` for a structured count).
const occurrences = (mark, text, comments) => {
  const t = comments ? String(text ?? '') : stripComments(text);
  return mark.items ? mark.items(t) : (t.match(mark) || []);
};

// The first occurrence in `after` beyond what `before` already had — the added one.
function firstAdded(was, now) {
  const left = new Map();
  for (const x of was) left.set(x, (left.get(x) || 0) + 1);
  for (const x of now) {
    const n = left.get(x) || 0;
    if (n === 0) return x;
    left.set(x, n - 1);
  }
  return now[now.length - 1];
}

/** Pure decision: does going from `before` to `after` in `filePath` add a skip / allow-failure / suppression? */
export function findWeakening(filePath, before, after) {
  const p = String(filePath || '').replace(/\\/g, '/');
  for (const kind of KINDS) {
    if (!kind.file.test(p)) continue;
    for (const mark of kind.marks) {
      const was = occurrences(mark, before, kind.comments);
      const now = occurrences(mark, after, kind.comments);
      if (now.length > was.length) {
        return { kind: kind.name, mark: firstAdded(was, now) ?? String(mark), file: basename(p) };
      }
    }
  }
  return null;
}

function pairsFrom(d) {
  const ti = d.tool_input || d.toolInput || {};
  const file = ti.file_path || ti.path || d.file_path;
  if (!file) return null;
  if (d.tool_name === 'Write' || ('content' in ti && !('old_string' in ti))) {
    const abs = isAbsolute(file) ? file : resolve(process.cwd(), file);
    let before = '';
    try { if (existsSync(abs)) before = readFileSync(abs, 'utf8'); } catch { /* unreadable: treat as new */ }
    return { file, before, after: ti.content ?? '' };
  }
  const edits = Array.isArray(ti.edits) ? ti.edits : [ti];
  // Judge the edit against the whole file when it applies cleanly — context such as
  // "this line sits inside an ignore list" lives outside the fragment. Counts over the
  // untouched text cancel, so the delta is the same; fall back to the fragments.
  const whole = applyEdits(file, edits);
  if (whole) return { file, ...whole };
  return { file, before: edits.map((e) => e.old_string ?? '').join('\n'), after: edits.map((e) => e.new_string ?? '').join('\n') };
}

function applyEdits(file, edits) {
  const abs = isAbsolute(file) ? file : resolve(process.cwd(), file);
  let before;
  try { if (!existsSync(abs)) return null; before = readFileSync(abs, 'utf8'); } catch { return null; }
  let after = before;
  for (const e of edits) {
    const o = e.old_string ?? '', n = e.new_string ?? '';
    if (!o || !after.includes(o)) return null;
    after = e.replace_all ? after.split(o).join(n) : after.replace(o, () => n);
  }
  return { before, after };
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_GATE_WEAKENING_GUARD === '1') return process.exit(0);
  let d = {};
  try { d = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return process.exit(0); }
  if (d.tool_name && !['Edit', 'Write', 'MultiEdit'].includes(d.tool_name)) return process.exit(0);
  const pair = pairsFrom(d);
  const hit = pair ? findWeakening(pair.file, pair.before, pair.after) : null;
  if (!hit || isCovered(GATE)) return process.exit(0);

  const reason =
    `this edit adds \`${hit.mark}\` to ${hit.file} (${hit.kind}) — it turns a check off instead of ` +
    `making it pass. Fix the code or the test. If the check itself is wrong, say so to the operator; ` +
    `a skip they approve is a signed, expiring exception for gate "${GATE}" with its reason ` +
    `(\`/exception\`, or \`node scripts/lib/exceptions.mjs create --gate ${GATE} --reason "…"\`).`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `great_cto gate-weakening guard blocked the edit — ${reason}`,
    },
  }) + '\n');
  process.stderr.write(`[great_cto:gate-weakening] BLOCKED — ${reason}\n`);
  return process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
