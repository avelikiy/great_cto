// `/review --domain <name>` replaced nine one-job wrapper commands (/tax-review,
// /upl-check, /aedt-bias-audit, …) that each did nothing but invoke one domain
// reviewer. Two things can silently rot after that merge:
//
//   1. the domain table in commands/review.md names a reviewer agent that no
//      longer exists — the Agent call then fails at run time, not at review time;
//   2. an old command name stops resolving, and the operator's muscle memory
//      (`/review --domain upl-check`) lands on "Unknown domain".
//
// This test reads the table AND executes the real `resolve_domain` bash function
// out of review.md, so what is checked is what runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REVIEW = readFileSync(path.join(ROOT, 'commands/review.md'), 'utf8');

// The former standalone commands and the domain each one became.
const FORMER_WRAPPERS = {
  'tax-review': 'tax',
  'upl-check': 'legal',
  'aedt-bias-audit': 'hr-ai',
  'api-contract-review': 'api',
  'close-review': 'accounting',
  'coding-audit': 'rcm',
  'msp-review': 'msp',
  'procurement-review': 'procurement',
  'voice-compliance': 'voice',
};

/** Rows of the domain table: | `domain` | aliases | `agent` | `TM-…` | … */
function domainTable() {
  const start = REVIEW.indexOf('## Domain mode');
  assert.ok(start >= 0, 'commands/review.md has no "## Domain mode" section');
  const section = REVIEW.slice(start, REVIEW.indexOf('\n## ', start + 1));
  const rows = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|([^|]*)\|\s*`([a-z0-9-]+)`\s*\|\s*`(TM-[a-z0-9-]+)-\{slug\}\.md`\s*\|/);
    if (!m) continue;
    const aliases = [...m[2].matchAll(/`([a-z0-9-]+)`/g)].map((a) => a[1]);
    rows.push({ domain: m[1], aliases, agent: m[3], tm: m[4] });
  }
  return rows;
}

function resolveFn() {
  const m = REVIEW.match(/# >>> resolve_domain\n([\s\S]*?)# <<< resolve_domain/);
  assert.ok(m, 'resolve_domain block (between # >>> / # <<< markers) not found in review.md');
  return m[1];
}

/** Run the real resolver from review.md; returns { ok, domain, agent, tm }. */
function resolve(name) {
  const script = `${resolveFn()}\nif resolve_domain "$1"; then printf '%s %s %s' "$D" "$AGENT" "$TM"; else exit 3; fi`;
  const r = spawnSync('bash', ['-c', script, 'resolve', name], { encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, stderr: r.stderr };
  const [domain, agent, tm] = r.stdout.trim().split(' ');
  return { ok: true, domain, agent, tm };
}

test('the domain table lists all nine domains', () => {
  const domains = domainTable().map((r) => r.domain).sort();
  assert.deepEqual(domains, [...new Set(Object.values(FORMER_WRAPPERS))].sort());
});

test('every domain maps to an existing agents/<reviewer>.md', () => {
  for (const { domain, agent } of domainTable()) {
    assert.ok(
      existsSync(path.join(ROOT, 'agents', `${agent}.md`)),
      `--domain ${domain} names agent "${agent}" but agents/${agent}.md does not exist`,
    );
  }
});

test('every domain\'s TM template exists', () => {
  for (const { domain, tm } of domainTable()) {
    assert.ok(
      existsSync(path.join(ROOT, 'skills/great_cto/templates', `${tm}.md`)),
      `--domain ${domain} writes ${tm}-{slug}.md but skills/great_cto/templates/${tm}.md is missing`,
    );
  }
});

test('the resolver agrees with the table for every domain and alias', () => {
  for (const { domain, aliases, agent, tm } of domainTable()) {
    for (const name of [domain, ...aliases]) {
      const r = resolve(name);
      assert.ok(r.ok, `resolve_domain ${name} failed`);
      assert.equal(r.domain, domain, `${name} resolves to domain ${r.domain}, table says ${domain}`);
      assert.equal(r.agent, agent, `${name} resolves to ${r.agent}, table says ${agent}`);
      assert.equal(`TM-${r.tm}`, tm, `${name} writes TM-${r.tm}, table says ${tm}`);
    }
  }
});

test('every former wrapper command name resolves as an alias', () => {
  const rows = domainTable();
  for (const [oldName, domain] of Object.entries(FORMER_WRAPPERS)) {
    const row = rows.find((r) => r.domain === domain);
    assert.ok(row?.aliases.includes(oldName), `table row for ${domain} does not list alias ${oldName}`);
    for (const spelled of [oldName, `/${oldName}`]) {
      const r = resolve(spelled);
      assert.ok(r.ok, `--domain ${spelled} does not resolve`);
      assert.equal(r.domain, domain, `--domain ${spelled} resolves to ${r.domain}, expected ${domain}`);
    }
  }
});

test('an unknown domain is refused, not silently routed', () => {
  assert.equal(resolve('bogus').ok, false);
  assert.equal(resolve('').ok, false);
});

test('the nine wrapper command files are gone', () => {
  for (const oldName of Object.keys(FORMER_WRAPPERS)) {
    assert.equal(existsSync(path.join(ROOT, 'commands', `${oldName}.md`)), false, `commands/${oldName}.md still exists`);
  }
});

test('/review no longer carries a traceability mode — /trace owns it', () => {
  assert.doesNotMatch(REVIEW, /TRACE feature|scripts\/lib\/trace\.mjs/);
  assert.match(REVIEW, /`\/trace`/);
});
