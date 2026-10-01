// SessionStart used to copy shared/orchestrator.toml and shared/pipeline.toml out
// of the installed plugin into every project, every session. In this repository
// that reverted the originals (nine times in one day before it was traced); in
// every other project it showed each plugin release as an uncommitted diff, and
// made the "project override" the readers honoured impossible to keep.
//
// The copy is gone: hooks read the plugin's contract, and a project file counts
// only when marked `great_cto: project override` (scripts/lib/contract-path.mjs).
// This pins that no SessionStart command writes into a project's shared/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const refreshCmd = manifest.hooks.SessionStart[0].hooks[0].command;

test('no SessionStart command copies the plugin contracts', () => {
  for (const h of manifest.hooks.SessionStart) {
    for (const x of h.hooks) assert.doesNotMatch(x.command, /cp [^;]*shared\/(pipeline|orchestrator)\.toml/);
  }
});

test("a project's shared/ is left exactly as it was — stale copy or source original", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-consumer-'));
  try {
    fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), 'primary: web-service\n');
    fs.mkdirSync(path.join(dir, 'shared'));
    fs.writeFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'stale\n');
    execFileSync('bash', ['-c', refreshCmd], { cwd: dir, stdio: 'ignore', env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT } });
    assert.equal(fs.readFileSync(path.join(dir, 'shared', 'pipeline.toml'), 'utf8'), 'stale\n');
    assert.match(fs.readFileSync(path.join(dir, '.great_cto', '.gitignore'), 'utf8'), /great_cto managed/,
      'the same hook now writes the state .gitignore instead');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
