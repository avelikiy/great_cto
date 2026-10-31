// An agent does not print a secret file into its own transcript (great_cto-87jh).
//
// Both directions are pinned. A guard that misses `cat .env` is the gap it was
// written for; a guard that refuses `source .env`, `cat .env.example` or a commit
// message mentioning `.env` gets switched off within a day, and then it misses
// everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSecretPath, globTargetsSecret, secretReadInCommand, findSecretRead, run,
} from '../../scripts/hooks/secret-read-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = path.join(ROOT, 'scripts/hooks/secret-read-guard.mjs');
const BASH_GUARDS = path.join(ROOT, 'scripts/hooks/bash-guards.mjs');
const payload = (tool_name, tool_input) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input, cwd: ROOT });

test('secret files are known by name, and files meant to be read are not among them', () => {
  for (const p of ['.env', 'app/.env.local', '.env.production', '.envrc', '~/.great_cto/secrets.env',
    'prod.secrets.env', 'server.pem', 'tls/server.key', '~/.ssh/id_rsa', 'id_ed25519', 'id_ecdsa_sk']) {
    assert.ok(isSecretPath(p), `${p} is a secret file`);
  }
  for (const p of ['.env.example', '.env.sample', '.env.template', '.env.local.example', 'id_rsa.pub',
    'environment.ts', 'id_utils.js', 'README.md', 'src', '', null]) {
    assert.ok(!isSecretPath(p), `${p} is not`);
  }
});

test('Bash: a reader given a secret file is refused, whatever wraps it', () => {
  for (const cmd of [
    'cat .env', 'cat .env | grep X', 'head -3 ~/.ssh/id_ed25519', 'base64 < secrets.env',
    'sudo cat ~/.great_cto/secrets.env', 'bash -c "cat .env.local"', 'grep KEY .env',
    'rg TOKEN .env.production', 'less key.pem', 'diff .env .env.example',
    'tail -n1 "$HOME/.great_cto/secrets.env"', 'echo $(cat .env)', 'openssl rsa -in server.key -text',
    'jq --from-file=x .env',
  ]) {
    assert.ok(secretReadInCommand(cmd), `refused: ${cmd}`);
  }
});

test('Bash: using a secret without printing it passes', () => {
  for (const cmd of [
    'source .env', 'set -a; . .env; set +a', "grep -q '^KEY=' .env", 'grep -c KEY .env', 'grep -l KEY .env',
    'cat .env.example', 'cat ~/.ssh/id_ed25519.pub', 'cp .env .env.bak', 'cat .env.example > .env', 'sort names.txt >> .env.local', 'echo x > .env', 'printf y >> .env',
    'sed -i s/a/b/ .env', 'openssl x509 -in cert.pem -noout -fingerprint', 'ls -la .env', 'test -f .env && echo ok',
    'echo "cat .env"', 'git commit -m "do not cat .env"', 'cat README.md', 'cat id_utils.js',
  ]) {
    assert.equal(secretReadInCommand(cmd), null, `passes: ${cmd}`);
  }
});

test('Read and Grep: a secret file or a glob that selects one is refused; a directory search is not', () => {
  assert.ok(findSecretRead({ tool_name: 'Read', tool_input: { file_path: '/p/.env' } }));
  assert.ok(findSecretRead({ tool_name: 'Grep', tool_input: { pattern: 'K', path: '.env.local' } }));
  for (const glob of ['.env*', '*.pem', '**/secrets.env', '{.env,*.ts}']) {
    assert.ok(globTargetsSecret(glob), `glob ${glob}`);
  }
  assert.equal(findSecretRead({ tool_name: 'Read', tool_input: { file_path: '/p/.env.example' } }), null);
  assert.equal(findSecretRead({ tool_name: 'Grep', tool_input: { pattern: 'K', path: 'src' } }), null);
  assert.equal(findSecretRead({ tool_name: 'Grep', tool_input: { pattern: 'K', glob: '*.ts' } }), null);
  assert.equal(findSecretRead({ tool_name: 'Grep', tool_input: { pattern: 'K', glob: '.env.example' } }), null);
  assert.equal(findSecretRead({ tool_name: 'Edit', tool_input: { file_path: '.env' } }), null, 'writes are secret-scan’s job');
});

test('the refusal says how to use the file instead, and the operator can switch it off', () => {
  const r = run(payload('Read', { file_path: '.env' }), {});
  assert.equal(r.code, 2);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /source <file>/);
  assert.match(out.permissionDecisionReason, /grep -q/);
  assert.equal(run(payload('Read', { file_path: '.env' }), { GREAT_CTO_DISABLE_SECRET_READ_GUARD: '1' }).code, 0);
  assert.equal(run('not json', {}).code, 0, 'an unreadable payload is not a refusal');
});

test('as a process: the Read hook and the merged Bash guards both exit 2 on a secret read', () => {
  const read = spawnSync(process.execPath, [HOOK], { input: payload('Read', { file_path: '/p/.env' }), encoding: 'utf8' });
  assert.equal(read.status, 2);
  assert.match(read.stdout, /"permissionDecision":"deny"/);
  const bash = spawnSync(process.execPath, [BASH_GUARDS], { input: payload('Bash', { command: 'cat ~/.great_cto/secrets.env' }), encoding: 'utf8' });
  assert.equal(bash.status, 2);
  assert.match(bash.stdout, /secret-read guard/);
  const ok = spawnSync(process.execPath, [BASH_GUARDS], { input: payload('Bash', { command: 'set -a; source .env; set +a' }), encoding: 'utf8' });
  assert.equal(ok.status, 0);
});

test('wired: the plugin runs the guard on Read|Grep, not just ships it', () => {
  const plugin = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const entry = plugin.hooks.PreToolUse.find((e) => e.matcher === 'Read|Grep');
  assert.ok(entry, 'a PreToolUse Read|Grep matcher exists');
  assert.ok(entry.hooks.some((h) => /scripts\/hooks\/secret-read-guard\.mjs/.test(h.command)
    && /exit 2/.test(h.command)), 'it runs secret-read-guard.mjs and passes its block through');
});
