// skill-usage — which great_cto skills are really used, read from Claude Code's own
// session logs. Agents had agent-usage; skills had nothing, so ~47 skills shipped
// with no signal whether any session ever loaded them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { skillUsage, skillOf } from '../../scripts/lib/skill-usage.mjs';

const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const SKILLS = ['done-blocked', 'prose-style', 'test-strategy', 'pre-mortem', 'brainstorming', 'well-architected'];
const SECRET = 'PRIVATE-MESSAGE-TEXT-must-not-leak';

function write(root, rel, lines) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return p;
}
const toolUse = (name, input, ts, cwd = '/work/great_cto') => ({
  type: 'assistant', timestamp: ts, cwd,
  message: { id: `m-${ts}`, content: [{ type: 'text', text: SECRET }, { type: 'tool_use', id: `t-${ts}`, name, input }] },
});
const skillCall = (skill, ts, cwd) => toolUse('Skill', { skill, args: SECRET }, ts, cwd);
const preload = (name, ts) => ({
  type: 'user', isMeta: true, timestamp: ts,
  message: { role: 'user', content: [{ type: 'text', text: `<command-message>${name}</command-message>\n<command-name>${name}</command-name>\n<skill-format>true</skill-format>` }, { type: 'text', text: SECRET }] },
});
const prompt = (ts) => ({ type: 'user', timestamp: ts, message: { role: 'user', content: SECRET } });
const assistantText = (ts) => ({ type: 'assistant', timestamp: ts, message: { id: `a-${ts}`, content: [{ type: 'text', text: SECRET }] } });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-usage-'));
  made.push(root);
  write(root, '-Users-x-work-great-cto/s1.jsonl', [
    prompt('2026-09-10T09:00:00Z'),
    skillCall('great-cto:done-blocked', '2026-09-10T10:00:00Z'),
    skillCall('done-blocked', '2026-09-12T10:00:00Z'),
    skillCall('superpowers:brainstorming', '2026-09-12T11:00:00Z'), // another plugin's skill of the same name
    toolUse('Read', { file_path: '/work/great_cto/skills/prose-style/SKILL.md' }, '2026-09-11T10:00:00Z'),
    toolUse('Bash', { command: 'cat skills/well-architected/SKILL.md | head -20' }, '2026-09-11T11:00:00Z'),
    toolUse('Bash', { command: 'git log -- skills/pre-mortem/SKILL.md' }, '2026-09-11T12:00:00Z'), // not a read
    // a user slash command in the main thread is not a preload
    preload('great-cto:pre-mortem', '2026-09-11T13:00:00Z'),
  ]);
  write(root, '-Users-x-work-great-cto/s1/subagents/agent-a1.jsonl', [
    prompt('2026-09-13T10:00:00Z'),
    preload('great-cto:test-strategy', '2026-09-13T10:00:01Z'),
    preload('pre-mortem', '2026-09-13T10:00:02Z'),
    preload('superpowers:test-driven-development', '2026-09-13T10:00:03Z'),
    assistantText('2026-09-13T10:01:00Z'),
    // after the first model turn a command-name message is no longer a preload
    preload('prose-style', '2026-09-13T10:02:00Z'),
  ]);
  // a scripted temp-dir session (bench / eval sandbox) is excluded by default
  write(root, '-private-tmp-bench-x/s2.jsonl', [skillCall('done-blocked', '2026-09-12T10:00:00Z', '/private/tmp/bench-x')]);
  return root;
}

test('skillOf merges bare and great-cto: prefixed names, drops other plugins', () => {
  const known = new Set(SKILLS);
  assert.equal(skillOf('done-blocked', known), 'done-blocked');
  assert.equal(skillOf('great-cto:done-blocked', known), 'done-blocked');
  assert.equal(skillOf('great_cto:done-blocked', known), 'done-blocked');
  assert.equal(skillOf('/done-blocked', known), 'done-blocked');
  assert.equal(skillOf('superpowers:brainstorming', known), null);
  assert.equal(skillOf('not-a-skill', known), null);
});

test('no logs directory is unavailable, never zeros that read as disuse', async () => {
  const u = await skillUsage({ root: path.join(os.tmpdir(), 'skill-usage-absent-xyz'), skills: SKILLS });
  assert.equal(u.state, 'unavailable');
  assert.deepEqual(u.skills, {});
});

test('counts Skill-tool invocations, subagent preloads and SKILL.md reads per skill', async () => {
  const u = await skillUsage({ root: fixture(), skills: SKILLS });
  assert.equal(u.state, 'counted');
  assert.deepEqual(u.skills['done-blocked'], { invoked: 2, preloaded: 0, read: 0, lastSeen: '2026-09-12T10:00:00Z' });
  assert.equal(u.skills['brainstorming'].invoked, 0, 'superpowers:brainstorming is not ours');
  assert.equal(u.skills['test-strategy'].preloaded, 1);
  assert.equal(u.skills['pre-mortem'].preloaded, 1, 'only the subagent preload counts, not the main-thread command');
  assert.equal(u.skills['pre-mortem'].read, 0, '`git log` of a SKILL.md is not a read');
  assert.equal(u.skills['prose-style'].read, 1);
  assert.equal(u.skills['prose-style'].preloaded, 0, 'a command-name after the first model turn is not a preload');
  assert.equal(u.skills['well-architected'].read, 1, '`cat` via Bash is a read');
  assert.deepEqual(u.never, ['brainstorming'], 'only the skill nobody used is listed');
});

test('scripted temp-dir projects are excluded unless asked for', async () => {
  const root = fixture();
  const u = await skillUsage({ root, skills: SKILLS });
  assert.equal(u.skills['done-blocked'].invoked, 2);
  const all = await skillUsage({ root, skills: SKILLS, includeScripted: true });
  assert.equal(all.skills['done-blocked'].invoked, 3);
});

test('--since/--until bound the window; unseen skills are listed as never seen', async () => {
  const u = await skillUsage({ root: fixture(), skills: SKILLS, since: '2026-09-12', until: '2026-09-13' });
  assert.equal(u.skills['done-blocked'].invoked, 1);
  assert.equal(u.skills['prose-style'].read, 0);
  assert.deepEqual(u.never.sort(), ['brainstorming', 'pre-mortem', 'prose-style', 'test-strategy', 'well-architected']);
});

test('output carries numbers and skill names only — never message text or paths', async () => {
  const u = await skillUsage({ root: fixture(), skills: SKILLS });
  const s = JSON.stringify(u);
  assert.ok(!s.includes(SECRET), 'message text leaked');
  assert.ok(!s.includes('/work/'), 'a path leaked');
  assert.ok(!s.includes('Users-x'), 'a project dir leaked');
});
