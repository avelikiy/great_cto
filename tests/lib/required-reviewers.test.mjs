// Which domain reviewers a project must have run, from its PROJECT.md.
//
// pci-reviewer was needed by 7 of 22 registered projects and dispatched once in the
// retained logs; enterprise-saas, us-privacy and voice-ai reviewers were needed by
// 3–5 and never ran. Nothing required them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredReviewers, reviewerStatus, REVIEWERS_BY_ARCHETYPE, PACK_REVIEWERS } from '../../scripts/lib/required-reviewers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const names = (r) => r.map((x) => x.agent).sort();
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'req-rev-')); made.push(d); return d; };

test('the archetype brings its reviewers; QA and security are not repeated here', () => {
  const r = requiredReviewers('primary: commerce\n');
  assert.deepEqual(names(r), ['pci-reviewer'], 'security-officer is mandatory everywhere already');
  assert.match(r[0].why, /archetype commerce/);
});

test('a display label in `primary:` does not hide the registry key in `archetype:`', () => {
  // great_cto's own PROJECT.md: primary: developer-tools, archetype: devtools.
  assert.deepEqual(names(requiredReviewers('primary: developer-tools\narchetype: devtools\n')), ['devtools-reviewer']);
});

test('`archetype:` works when there is no `primary:`', () => {
  assert.deepEqual(names(requiredReviewers('archetype: enterprise-saas\n')), ['enterprise-saas-reviewer']);
});

test('compliance tokens bring their owners, and each reason is kept', () => {
  const r = requiredReviewers('primary: commerce\ncompliance: [owasp, pci-dss-saq-a, tcpa, ccpa]\n');
  assert.deepEqual(names(r), ['pci-reviewer', 'us-privacy-reviewer', 'voice-ai-reviewer']);
  assert.match(r.find((x) => x.agent === 'pci-reviewer').why, /archetype commerce.*compliance pci/);
});

test('a pack that brings a reviewer requires it; a knowledge pack does not', () => {
  assert.deepEqual(names(requiredReviewers('primary: web-service\npacks: [voice-pack, commerce-pack]\n')), ['voice-ai-reviewer']);
});

test('secondary archetypes are not required', () => {
  assert.deepEqual(names(requiredReviewers('primary: web-service\nsecondary: [commerce]\n')), []);
});

test('an unknown or absent archetype requires nothing rather than guessing', () => {
  assert.deepEqual(requiredReviewers('primary: ai-deal-intelligence\n'), []);
  assert.deepEqual(requiredReviewers(''), []);
});

test('compliance tokens match whole words, not substrings', () => {
  assert.deepEqual(requiredReviewers('primary: web-service\ncompliance: [capcpa-internal]\n'), []);
});

test('reviewerStatus: a verdict log line is evidence the reviewer ran', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'primary: commerce\ncompliance: [tcpa]\n');
  writeFileSync(join(dir, '.great_cto', 'verdicts', 'pci-reviewer.log'), '2026-09-01 pci-reviewer APPROVED\n');
  const s = reviewerStatus(dir);
  assert.equal(s.state, 'read');
  assert.deepEqual(s.reviewers.map((r) => [r.agent, r.verdict]), [['pci-reviewer', true], ['voice-ai-reviewer', false]]);
});

test('reviewerStatus: no PROJECT.md is no-project, not "nothing required"', () => {
  assert.equal(reviewerStatus(tmp()).state, 'no-project');
});

// The CLI owns the registry in TypeScript; the plugin's scripts cannot import it.
// This copy is only honest while it equals the source.
test('the archetype registry equals the CLI source', () => {
  const s = readFileSync(join(ROOT, 'packages/cli/src/archetypes.ts'), 'utf8');
  let blk = s.slice(s.indexOf('export const REVIEWERS_BY_ARCHETYPE')); blk = blk.slice(0, blk.indexOf('};'));
  const cli = Object.fromEntries([...blk.matchAll(/"([a-z0-9-]+)":\s*\[([^\]]*)\]/g)].map(([, a, r]) => [a, [...r.matchAll(/"([^"]+)"/g)].map((m) => m[1])]));
  assert.ok(Object.keys(cli).length > 20, 'the source was parsed');
  assert.deepEqual(REVIEWERS_BY_ARCHETYPE, cli);
});

test('the pack registry equals the CLI source', () => {
  const s = readFileSync(join(ROOT, 'packages/cli/src/packs.ts'), 'utf8');
  let blk = s.slice(s.indexOf('const PACK_REVIEWERS')); blk = blk.slice(0, blk.indexOf('};'));
  const cli = Object.fromEntries([...blk.matchAll(/"([a-z0-9-]+)":\s*\[([^\]]*)\]/g)].map(([, a, r]) => [a, [...r.matchAll(/"([^"]+)"/g)].map((m) => m[1])]));
  assert.deepEqual(PACK_REVIEWERS, cli);
});

test('every reviewer named anywhere in the registry is an agent that exists', () => {
  const all = new Set([...Object.values(REVIEWERS_BY_ARCHETYPE).flat(), ...Object.values(PACK_REVIEWERS).flat()]);
  for (const a of all) assert.ok(readFileSync(join(ROOT, 'agents', `${a}.md`), 'utf8').length > 0, a);
});
