// Every name in an agent's `skills:` list reaches the agent.
//
// Checked against 1,987 subagent transcripts on the measuring machine
// (2026-09-22): a listed great_cto skill is preloaded into the subagent at start
// (done-blocked in 120 of senior-dev's runs, archetype-review-base in every
// db-migration-reviewer run). A name that resolves to nothing is dropped without
// a word — `beads` sat in 39 agents' lists and loaded zero times; so did
// `anthropic-skills:*`, `product-management:brainstorm`, and five skill names
// from another toolkit (`ship`, `canary`, `land-and-deploy`, `investigate`,
// `cso`). A list that looks like configuration and configures nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// External plugins great_cto's install documents as prerequisites. Their skills
// load only where that plugin is installed; anything else must ship here.
const EXTERNAL = [/^superpowers:[a-z0-9-]+$/];

function skillsOf(file) {
  const fm = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/)[1];
  const m = fm.match(/^skills:\n((?:[ \t]+- .*\n?)+)/m);
  return m ? m[1].split('\n').filter(Boolean).map((l) => l.trim().slice(2).trim()) : [];
}

test('every skill an agent lists is a great_cto skill or a documented external one', () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'agents')).filter((n) => n.endsWith('.md'))) {
    for (const s of skillsOf(join(ROOT, 'agents', f))) {
      if (existsSync(join(ROOT, 'skills', s, 'SKILL.md'))) continue;
      if (EXTERNAL.some((re) => re.test(s))) continue;
      bad.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(bad, [], 'these names load nothing — ship the skill or remove the name');
});

test('the three field-lesson skills reach the agents that do that work', () => {
  const has = (a, s) => skillsOf(join(ROOT, 'agents', `${a}.md`)).includes(s);
  for (const a of ['devops', 'l3-support', 'infra-provisioner']) assert.ok(has(a, 'deploy-landed'), `${a} → deploy-landed`);
  for (const a of ['security-officer', 'l3-support']) assert.ok(has(a, 'secrets-rotation'), `${a} → secrets-rotation`);
  for (const a of ['senior-dev', 'devops', 'mobile-app-builder']) assert.ok(has(a, 'signing-preflight'), `${a} → signing-preflight`);
});
