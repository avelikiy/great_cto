// tests/lib/grant-audit.test.mjs — AgentSpace #2 grant/credential audit.
// Run: node --test tests/lib/grant-audit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGrants, summarize } from '../../scripts/lib/grant-audit.mjs';

test('classifyGrants: OpenRouter key present → llm ok', () => {
  const r = classifyGrants({ openrouterKey: true, npmUser: 'u', ghUser: 'g' });
  const llm = r.find(x => x.grant.startsWith('llm'));
  assert.equal(llm.status, 'ok');
  assert.match(llm.grant, /OpenRouter/);
});

test('classifyGrants: no key → critical missing', () => {
  const r = classifyGrants({});
  const llm = r.find(x => x.grant === 'llm provider key');
  assert.equal(llm.status, 'missing');
  assert.equal(llm.severity, 'critical');
});

test('classifyGrants: anthropic fallback when no openrouter', () => {
  const r = classifyGrants({ anthropicKey: true });
  assert.ok(r.find(x => x.grant === 'llm: Anthropic' && x.status === 'ok'));
});

test('classifyGrants: orphan — provider configured but key missing', () => {
  const r = classifyGrants({ providerConfigured: 'openrouter', anthropicKey: true });
  const orphan = r.find(x => x.status === 'orphan');
  assert.ok(orphan, 'should flag orphan');
  assert.match(orphan.detail, /OpenRouter.*missing/i);
});

test('classifyGrants: npm + gh missing → med findings', () => {
  const r = classifyGrants({ openrouterKey: true });
  assert.equal(r.find(x => x.grant === 'npm auth').status, 'missing');
  assert.equal(r.find(x => x.grant === 'github auth').status, 'missing');
});

test('summarize: counts ok/missing/orphan/critical', () => {
  const s = summarize(classifyGrants({ providerConfigured: 'openrouter' }));
  assert.equal(s.critical, 1);   // no key at all
  assert.ok(s.missing >= 1);
});
