import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const version = JSON.parse(read('packages/cli/package.json')).version;

test('the Codex host skill works after a plugin-only install', () => {
  const skill = read('skills/codex-host/SKILL.md');
  const shellBlocks = [...skill.matchAll(/```(?:sh)?\n([\s\S]*?)```/g)].map(match => match[1]).join('\n');

  assert.doesNotMatch(shellBlocks, /^great-cto codex-host/m,
    'a plugin install does not put the npm binary on PATH');
  assert.match(shellBlocks, new RegExp(`^npx --yes great-cto@${version.replaceAll('.', '\\.') } codex-host doctor$`, 'm'),
    'the skill must invoke the exact CLI version shipped with it');

  for (const line of shellBlocks.split('\n').filter(line => line.includes('codex-host'))) {
    assert.match(line, new RegExp(`^npx --yes great-cto@${version.replaceAll('.', '\\.') } codex-host`),
      `unportable Codex host command: ${line}`);
  }
});

test('public Codex host examples do not assume a global npm install', () => {
  for (const path of ['README.md', 'docs/HOST-CODEX.md']) {
    assert.doesNotMatch(read(path), /^great-cto codex-host/m, `${path} assumes a global binary`);
  }
});
