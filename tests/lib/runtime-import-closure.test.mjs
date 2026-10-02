import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeImportClosure } from '../../packages/cli/scripts/runtime-import-closure.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-import-closure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'lib')); mkdirSync(join(root, 'hooks'));
  return root;
}
test('runtime closure follows parent imports, reexports, side effects, dynamic literals and cycles', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'lib/main.mjs'), "import {x} from '../hooks/rules.mjs'; import './side.mjs'; await import('../hooks/lazy.mjs'); import 'node:fs';");
  writeFileSync(join(root, 'hooks/rules.mjs'), "export {x} from '../lib/main.mjs';");
  writeFileSync(join(root, 'lib/side.mjs'), ''); writeFileSync(join(root, 'hooks/lazy.mjs'), '');
  assert.deepEqual(runtimeImportClosure(root, [join(root, 'lib/main.mjs')]),
    ['hooks/lazy.mjs', 'hooks/rules.mjs', 'lib/main.mjs', 'lib/side.mjs'].map(p => join(root, p)));
});
test('runtime closure fails loudly for missing, escaped, linked and unsupported dependencies', t => {
  const root = fixture(t); const entry = join(root, 'lib/main.mjs');
  for (const [source, pattern] of [["import './missing.mjs';", /ENOENT/],
    ["import '../../outside.mjs';", /escapes repository/], ["import './data.json';", /unsupported/]]) {
    writeFileSync(entry, source); assert.throws(() => runtimeImportClosure(root, [entry]), pattern);
  }
  symlinkSync(join(root, 'hooks'), join(root, 'alias'));
  writeFileSync(join(root, 'hooks/rules.mjs'), '');
  writeFileSync(entry, "import '../alias/rules.mjs';");
  assert.throws(() => runtimeImportClosure(root, [entry]), /symbolic link/);
});
test('real controlled host closure includes cross-directory specialist rules', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
  const files = runtimeImportClosure(root, [join(root, 'scripts/codex-pipeline.mjs'), join(root, 'scripts/work-task.mjs')]);
  assert.ok(files.includes(join(root, 'scripts/hooks/auto-attach-reviewers.mjs')));
  assert.ok(files.includes(join(root, 'scripts/lib/specialist-plan.mjs')));
  const board = runtimeImportClosure(root, [join(root, 'packages/board/server.mjs')]);
  assert.ok(board.includes(join(root, 'scripts/hooks/pipeline-dispatcher.mjs')));
});
