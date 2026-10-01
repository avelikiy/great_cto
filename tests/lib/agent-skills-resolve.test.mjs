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

// A preloaded skill is injected in full into every run of the agent and re-read
// on every turn. Measured 25.09 in a senior-dev transcript: 96 KB of skills
// before the task, 75 KB of it for work senior-dev does not do — a UI-design
// skill on backend tasks, and a guide to dispatching subagents for an agent with
// no Agent tool.
const toolsOf = (file) => (readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/)[1].match(/^tools:(.*)$/m) || [, ''])[1];

test('only an agent that dispatches subagents preloads the guides to dispatching them', () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'agents')).filter((n) => n.endsWith('.md'))) {
    const file = join(ROOT, 'agents', f);
    const dispatches = /\b(Agent|Task)\b/.test(toolsOf(file));
    for (const s of skillsOf(file)) {
      if (/^superpowers:(subagent-driven-development|dispatching-parallel-agents)$/.test(s) && !dispatches) bad.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(bad, [], 'no Agent tool, so the guide is dead weight on every turn');
});

// A skill over 20 KB is preloaded only by the agents whose job it is; everyone
// else reads it as a file when the task needs it (see the Skill-tool test below).
const HEAVY_OWNERS = {
  'ui-ux-pro-max': ['design-advisor', 'mobile-app-builder'], // the design contract and the mobile UI build
};

test('a heavy skill is preloaded only where it is the job', () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'agents')).filter((n) => n.endsWith('.md'))) {
    for (const s of skillsOf(join(ROOT, 'agents', f))) {
      const p = join(ROOT, 'skills', s, 'SKILL.md');
      if (!existsSync(p) || readFileSync(p).length <= 20_000) continue;
      if (!(HEAVY_OWNERS[s] || []).includes(f.replace(/\.md$/, ''))) bad.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(bad, [], 'read it on demand as a file, or name the agent in HEAVY_OWNERS with the reason');
});

// The Skill tool puts the name and description of every installed skill into the
// agent's prompt — measured 25.09 as a dispatched subagent: +13k tokens a turn on
// a machine with a few hundred skills, more than the one skill it would load.
// On-demand skills are read as files instead.
test('no agent carries the Skill tool; on-demand skills are read as files', () => {
  const withTool = []; const bad = [];
  for (const f of readdirSync(join(ROOT, 'agents')).filter((n) => n.endsWith('.md'))) {
    const file = join(ROOT, 'agents', f);
    if (/\bSkill\b/.test(toolsOf(file))) withTool.push(f);
    const body = readFileSync(file, 'utf8');
    if (/Skills on demand/.test(body) && !/skills\/<name>\/SKILL\.md/.test(body)) bad.push(f);
  }
  assert.deepEqual(withTool, [], 'drop the Skill tool; read the skill file when it applies');
  assert.deepEqual(bad, [], 'an on-demand list must say how to read the file');
});
