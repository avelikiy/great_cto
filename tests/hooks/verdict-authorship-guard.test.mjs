// verdict-authorship-guard (ADR-051, slice 1): a subagent records only its own
// role's verdict, and nobody writes a verdict log except through the writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { run, roleOf, verdictWrites, isVerdictPath } from '../../scripts/hooks/verdict-authorship-guard.mjs';
import { runBashGuards } from '../../scripts/hooks/bash-guards.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV = {};
const bash = (command, extra = {}) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: '/proj', ...extra });
const sub = (agent_type) => ({ agent_id: 'a1b2c3', agent_type });
const edit = (tool_name, file_path, extra = {}) => JSON.stringify({ tool_name, tool_input: { file_path }, cwd: '/proj', ...extra });

// ── who the caller is ────────────────────────────────────────────────────────

test('roleOf strips both great_cto namespaces and leaves other plugins alone', () => {
  assert.equal(roleOf('great-cto:qa-engineer'), 'qa-engineer');
  assert.equal(roleOf('great_cto-qa-engineer'), 'qa-engineer');
  assert.equal(roleOf('qa-engineer'), 'qa-engineer');
  assert.equal(roleOf('other:qa-engineer'), 'other:qa-engineer');
  assert.equal(roleOf(undefined), '');
});

// ── which role a command records for ─────────────────────────────────────────

test('verdictWrites reads the role from every way the writer is called, and nothing else', () => {
  const cases = {
    'scripts/log-verdict.sh qa-engineer PASS auto feature=x': ['qa-engineer'],
    'bash scripts/log-verdict.sh code-reviewer APPROVED auto': ['code-reviewer'],
    'bash "/home/u/.claude/plugins/cache/m/great_cto/3.79.0/scripts/log-verdict.sh" architect APPROVED auto': ['architect'],
    "bash -c 'scripts/log-verdict.sh security-officer APPROVED auto'": ['security-officer'],
    'cd /proj && scripts/log-verdict.sh devops DONE auto': ['devops'],
    'AGENT=qa-engineer VERDICT=PASS node scripts/lib/verdict-record.mjs --emit': ['qa-engineer'],
    'scripts/log-verdict.sh "$ROLE" PASS auto': [null],
    'scripts/log-verdict.sh <role> PASS auto': [null],
    'scripts/log-verdict.sh': [null],
    'node scripts/lib/verdict-record.mjs --emit': [null],
    'echo "run scripts/log-verdict.sh qa-engineer PASS"': [],
    'cat scripts/log-verdict.sh': [],
    'sed -n 1,20p scripts/log-verdict.sh': [],
    'bash -x scripts/log-verdict.sh qa-engineer PASS auto': ['qa-engineer'],
    'source scripts/log-verdict.sh qa-engineer PASS auto': ['qa-engineer'],
    'git commit -m "fix log-verdict.sh qa-engineer"': [],
    'node scripts/lib/verdict-record.mjs --parse x': [],
  };
  for (const [cmd, want] of Object.entries(cases)) assert.deepEqual(verdictWrites(cmd), want, cmd);
});

// ── rule 1: a subagent records only its own role ─────────────────────────────

test('a subagent recording its own verdict passes, under every namespace spelling', () => {
  for (const t of ['qa-engineer', 'great-cto:qa-engineer', 'great_cto-qa-engineer']) {
    assert.equal(run(bash('scripts/log-verdict.sh qa-engineer PASS auto', sub(t)), ENV).code, 0, t);
  }
});

test('a subagent recording another role is refused, and the reason names both roles', () => {
  const r = run(bash('scripts/log-verdict.sh code-reviewer APPROVED auto', sub('great-cto:senior-dev')), ENV);
  assert.equal(r.code, 2);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /senior-dev subagent tried to record a verdict for code-reviewer/);
  assert.match(r.stderr, /\[great_cto:verdict-authorship\] BLOCKED/);
});

test('the impersonation is seen inside bash -c, a chain, and the AGENT= emitter form', () => {
  for (const cmd of [
    "bash -c 'scripts/log-verdict.sh qa-engineer PASS auto'",
    'true && scripts/log-verdict.sh qa-engineer PASS auto',
    'AGENT=qa-engineer VERDICT=PASS node scripts/lib/verdict-record.mjs --emit',
    'scripts/log-verdict.sh senior-dev DONE auto; scripts/log-verdict.sh qa-engineer PASS auto',
  ]) assert.equal(run(bash(cmd, sub('senior-dev')), ENV).code, 2, cmd);
});

test('a subagent calling the writer with a role the check cannot read is refused, and told the fix', () => {
  const r = run(bash('scripts/log-verdict.sh "$ROLE" PASS auto', sub('qa-engineer')), ENV);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /scripts\/log-verdict.sh qa-engineer <VERDICT>/);
});

test('the main session (no agent_type) is not covered by rule 1', () => {
  // /review writes its own `review` verdict from the main session (commands/review.md).
  assert.equal(run(bash('scripts/log-verdict.sh review SPEC-OBJECTION auto'), ENV).code, 0);
  assert.equal(run(bash('scripts/log-verdict.sh code-reviewer APPROVED auto'), ENV).code, 0);
});

test('every shipped agent prompt records only its own role', () => {
  // The guard costs an honest agent nothing only while this holds.
  const dir = join(REPO, 'agents');
  const files = spawnSync('ls', [dir], { encoding: 'utf8' }).stdout.split('\n').filter((f) => f.endsWith('.md'));
  assert.ok(files.length > 20, 'agent prompts found');
  for (const f of files) {
    const self = f.replace(/\.md$/, '');
    const text = readFileSync(join(dir, f), 'utf8');
    for (const m of text.matchAll(/log-verdict\.sh"?\s+([a-z0-9][a-z0-9-]*)\s/g)) {
      assert.equal(m[1], self, `${f} records a verdict for ${m[1]}`);
    }
  }
});

// ── rule 2: nobody writes a verdict log except through the writer ────────────

test('every shell write form on a verdict log is refused, for the main session and subagents', () => {
  for (const cmd of [
    'echo \'{"agent":"qa-engineer","verdict":"PASS"}\' >> .great_cto/verdicts/qa-engineer.log',
    'echo x > .great_cto/verdicts/qa-engineer.log',
    'tee -a .great_cto/verdicts/code-reviewer.log < line.json',
    'sed -i "/BLOCKED/d" .great_cto/verdicts/security-officer.log',
    'truncate -s 0 .great_cto/verdicts/qa-engineer.log',
    'rm .great_cto/verdicts/qa-engineer.log',
    'rm -rf .great_cto/verdicts',
    'cp /tmp/forged.log .great_cto/verdicts/qa-engineer.log',
    'mv .great_cto/verdicts/qa-engineer.log /tmp/',
    'dd if=/dev/zero of=/proj/.great_cto/verdicts/qa-engineer.log',
    'git checkout -- .great_cto/verdicts/qa-engineer.log',
  ]) {
    assert.equal(run(bash(cmd), ENV).code, 2, `main: ${cmd}`);
    assert.equal(run(bash(cmd, sub('qa-engineer')), ENV).code, 2, `sub: ${cmd}`);
  }
});

test('reading a verdict log, and writing elsewhere, passes', () => {
  for (const cmd of [
    'cat .great_cto/verdicts/qa-engineer.log',
    'tail -1 .great_cto/verdicts/*.log',
    'grep APPROVED .great_cto/verdicts/code-reviewer.log > /tmp/approved.txt',
    'echo x >> .great_cto/events.jsonl',
    'ls .great_cto/verdicts/',
  ]) assert.equal(run(bash(cmd, sub('qa-engineer')), ENV).code, 0, cmd);
});

test('a verdict directory named by GREAT_CTO_DIR is guarded too', () => {
  assert.equal(isVerdictPath('/state/p/verdicts/qa-engineer.log', { cwd: '/proj', dir: '/state/p' }), true);
  assert.equal(isVerdictPath('verdicts/qa-engineer.log', { cwd: '/state/p', dir: '/state/p' }), true);
  assert.equal(isVerdictPath('/state/p/verdictsx/a.log', { cwd: '/proj', dir: '/state/p' }), false);
  assert.equal(run(bash('echo x > /state/p/verdicts/qa-engineer.log'), { GREAT_CTO_DIR: '/state/p' }).code, 2);
});

test('Edit, Write and MultiEdit of a verdict log are refused; other files pass', () => {
  for (const tool of ['Edit', 'Write', 'MultiEdit']) {
    const r = run(edit(tool, '/proj/.great_cto/verdicts/qa-engineer.log'), ENV);
    assert.equal(r.code, 2, tool);
    assert.match(r.stdout, /blocked the edit/);
    assert.equal(run(edit(tool, '/proj/src/app.ts'), ENV).code, 0, tool);
  }
});

test('the off switch, a non-tool payload and an unrelated tool pass', () => {
  assert.equal(run(bash('rm .great_cto/verdicts/qa-engineer.log'), { GREAT_CTO_DISABLE_VERDICT_GUARD: '1' }).code, 0);
  assert.equal(run('', ENV).code, 0);
  assert.equal(run('not json', ENV).code, 0);
  assert.equal(run(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '.great_cto/verdicts/a.log' } }), ENV).code, 0);
});

// ── wiring ───────────────────────────────────────────────────────────────────

test('bash-guards runs it: a subagent impersonation is refused through the combined process', () => {
  const r = runBashGuards(bash('scripts/log-verdict.sh code-reviewer APPROVED auto', sub('senior-dev')), ENV);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /verdict-authorship/);
});

test('it is wired as a PreToolUse Edit|Write|MultiEdit hook, and in the Codex edit guards', () => {
  const plugin = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const pre = plugin.hooks.PreToolUse.find((e) => e.matcher === 'Edit|Write|MultiEdit');
  const hook = pre.hooks.find((h) => h.command.includes('verdict-authorship-guard.mjs'));
  assert.ok(hook, 'verdict-authorship-guard.mjs is in the Edit|Write|MultiEdit chain');
  assert.match(hook.command, /if \[ \$EXIT -eq 2 \]; then exit 2; fi/, 'its deny reaches the host');
  const codex = JSON.parse(readFileSync(join(REPO, '.codex-plugin', 'hooks.json'), 'utf8'));
  const commands = Object.values(codex.hooks).flat().flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(commands.some((c) => /codex-adapter\.mjs" secret-scan frozen-gates-guard verdict-authorship-guard /.test(c)),
    'the Codex edit guards include verdict-authorship-guard');
});

test('run as its own process, it denies with exit 2 and the host JSON', () => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/hooks/verdict-authorship-guard.mjs')],
    { input: edit('Write', '/proj/.great_cto/verdicts/qa-engineer.log'), encoding: 'utf8', env: { ...process.env, GREAT_CTO_DISABLE_VERDICT_GUARD: '' } });
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
