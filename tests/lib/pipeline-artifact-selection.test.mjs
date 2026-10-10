import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/test-pipeline.sh', import.meta.url));
const invoke = args => spawnSync('bash', [script, ...args], { encoding: 'utf8', timeout: 5000 });

test('candidate selection rejects empty, relative and duplicate paths before probes', () => {
  for (const args of [['--plugin-dir='], ['--plugin-dir=relative'], ['--plugin-dir=/one', '--plugin-dir=/two']]) {
    const result = invoke(args);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /L1|pipeline test/);
  }
});

test('candidate selection refuses incomplete artifact before probes', t => {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-artifact-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = invoke([`--plugin-dir=${root}`]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /candidate artifact missing/);
  assert.doesNotMatch(result.stdout, /pipeline test/);
});

test('explicit candidate mode is labelled separately and never registers with hosts', t => {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-artifact-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['.claude-plugin/plugin.json', 'packages/cli/index.mjs', 'packages/cli/dist/main.js', 'packages/board/server.mjs']) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), 'fixture');
  }
  const result = invoke([`--plugin-dir=${root}`, '--skip-l1', '--skip-l2', '--skip-l3', '--skip-l4', '--skip-l5']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /explicit candidate artifact \(not operator installed-plugin evidence\)/);
  assert.match(result.stdout, /NOT CHECKED/);
});

test('canonical library gate bounds scheduling without excluding test inventory', () => {
  const ci = readFileSync(new URL('../../scripts/ci-local.sh', import.meta.url), 'utf8');
  assert.match(ci, /step "lib tests" node --test --test-concurrency=2 tests\/lib\/\*\.test\.mjs scripts\/lib\/\*\.test\.mjs/);
  assert.match(ci, /GREAT_CTO_TEST_PLUGIN_DIR/);
  assert.doesNotMatch(ci, /--test-name-pattern|--test-skip-pattern/);
});

test('actual CLI and hook smoke shell commands treat hostile artifact paths literally', t => {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-literal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // If interpolated as shell source, this component creates the sentinel.
  const artifact = join(root, "artifact ; touch INJECTED ; # ' $(touch INJECTED) ");
  const cli = join(artifact, 'packages/cli/index.mjs');
  const hooks = join(artifact, 'scripts/hooks');
  mkdirSync(join(cli, '..'), { recursive: true }); mkdirSync(hooks, { recursive: true });
  writeFileSync(cli, 'import assert from "node:assert/strict"; assert.equal(process.argv[2],"--version"); console.log("3.61.0");');
  writeFileSync(join(hooks, 'secret-scan.mjs'), `
    import assert from 'node:assert/strict'; let input=''; for await(const part of process.stdin) input+=part;
    const p=JSON.parse(input); assert.equal(p.tool_name,'Write'); assert.equal(p.tool_input.file_path,'/tmp/x.ts');
    console.log('secret-hook-called');
    if(p.tool_input.content.startsWith('const k = ')){assert.match(p.tool_input.content,/^const k = "AKIA/);process.exitCode=2;}
    else if(p.tool_input.content==='const x = 1;'){assert.equal(process.env.GREAT_CTO_DISABLE_SECRET_SCAN,undefined);}
    else {assert.match(p.tool_input.content,/^AKIA/);assert.equal(process.env.GREAT_CTO_DISABLE_SECRET_SCAN,'1');}
  `);
  for (const [name, event] of [['format-check', 'tool_name'], ['cost-guard', 'hook_event_name']]) {
    writeFileSync(join(hooks, `${name}.mjs`), `import assert from 'node:assert/strict';let input='';for await(const p of process.stdin)input+=p;assert.ok(JSON.parse(input)[${JSON.stringify(event)}]);console.log('${name}-called');`);
  }
  const source = readFileSync(script, 'utf8');
  const cliCommand = source.match(/^  CLI=.*\n\n  check "great-cto --version[^]*?(?=\n\n)/m)?.[0];
  const hookCommands = source.slice(source.indexOf('  check "secret-scan blocks'), source.indexOf('  check "session-end writes'));
  assert.ok(cliCommand); assert.ok(hookCommands.includes('cost-guard runs cleanly'));
  const result = spawnSync('/bin/bash', ['-c', [
    'set -euo pipefail', 'PLUGIN_DIR="$1"', 'HOOKS="$1/scripts/hooks"', '_EXAMPLE_KEY="AKIA""IOSFODNN7""EXAMPLE"',
    'check() { shift; "$@"; }', cliCommand, hookCommands,
  ].join('\n'), '_', artifact], { cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/secret-hook-called/g)?.length, 3);
  assert.match(result.stdout, /format-check-called/); assert.match(result.stdout, /cost-guard-called/);
  assert.equal(existsSync(join(root, 'INJECTED')), false);
});
