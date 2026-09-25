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
 * Existing skips are not re-reported, removing one is fine, docs and ordinary
 * source may say the words, and a comment is not a setting.
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
];

// A comment says the words without doing the thing. `#[` is Rust's attribute, not a comment.
const stripComments = (text) => String(text ?? '').split('\n')
  .filter((l) => { const t = l.trim(); return !(t.startsWith('//') || (t.startsWith('#') && !t.startsWith('#['))); })
  .join('\n');

const count = (re, text) => (stripComments(text).match(re) || []).length;

/** Pure decision: does going from `before` to `after` in `filePath` add a skip / allow-failure? */
export function findWeakening(filePath, before, after) {
  const p = String(filePath || '').replace(/\\/g, '/');
  for (const kind of KINDS) {
    if (!kind.file.test(p)) continue;
    for (const re of kind.marks) {
      const added = count(re, after) - count(re, before);
      if (added > 0) {
        const m = stripComments(after).match(re);
        return { kind: kind.name, mark: m ? m[0] : String(re), file: basename(p) };
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
  if (Array.isArray(ti.edits)) {
    return { file, before: ti.edits.map((e) => e.old_string ?? '').join('\n'), after: ti.edits.map((e) => e.new_string ?? '').join('\n') };
  }
  return { file, before: ti.old_string ?? '', after: ti.new_string ?? '' };
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
