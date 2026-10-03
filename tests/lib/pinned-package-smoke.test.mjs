import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, statSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { runPinnedPackageSmoke, smokeProcessDiagnostic } from '../../scripts/lib/pinned-package-smoke.mjs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { runtimeImportClosure } from '../../packages/cli/scripts/runtime-import-closure.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveWriter = fileURLToPath(new URL('../helpers/package-smoke-archive.py', import.meta.url));
const writerEnv = { PATH: '/usr/bin:/bin:/usr/local/bin', LANG: 'C', TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1' };
test('bounded process diagnostics distinguish causes without private error text or descendant claims', () => {
  for (const [child, outcome, errorCode, signal] of [
    [{ pid: 123, status: 0 }, 'exited-zero', null, null],
    [{ status: 7 }, 'nonzero-or-unknown', null, null],
    [{ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: 'private argv' } }, 'timeout', 'ETIMEDOUT', 'SIGTERM'],
    [{ error: { code: 'ENOBUFS' } }, 'output-limit', 'ENOBUFS', null],
    [{ error: { code: 'ENOENT' } }, 'process-error', 'ENOENT', null],
    [{ status: null, signal: 'SIGKILL' }, 'signalled', null, 'SIGKILL'],
    [{ error: { code: 'private argv' }, signal: 'private signal' }, 'process-error', 'UNCLASSIFIED', null],
  ]) {
    const diagnostic = smokeProcessDiagnostic(child, { startedAt: 'fixture-start', elapsedMs: 42.4 });
    assert.equal(diagnostic.outcome, outcome); assert.equal(diagnostic.errorCode, errorCode);
    assert.equal(diagnostic.signal, signal); assert.equal(diagnostic.elapsedMs, 42);
    assert.equal(diagnostic.timeoutMs, 30000); assert.equal(diagnostic.descendantQuiescenceVerified, false);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private/);
  }
});
const entry = `import {mkdirSync} from 'node:fs';
if(process.argv[2]==='--version') console.log('9.0.0');
else {mkdirSync(process.env.GREAT_CTO_CODEX_RUNS_DIR,{recursive:true,mode:0o700});console.log(JSON.stringify({state:'ok',runs:[],unreadable:0}));}`;
function fixture(t, { code = entry, extras = [], rawMetadata = null, bomb = false, writerScenario = 'normal' } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'package-smoke-fixture-')));
  let retain = false;
  t.after(() => { if (!retain) rmSync(root, { recursive: true, force: true }); });
  const archive = join(root, 'package.tgz'), marker = join(root, 'lifecycle-marker');
  const payload = { archive, bomb, writerScenario, files: [
    { name: 'package/package.json', content: rawMetadata ?? JSON.stringify({ name: 'great-cto', version: '9.0.0', bin: { 'great-cto': 'index.mjs' } }) },
    { name: 'package/index.mjs', content: code },
    { name: 'package/postinstall.mjs', content: `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'ran');` }, ...extras] };
  // Static writer entrypoint; private data stays on stdin, never in argv.
  const startedAt = new Date().toISOString(), start = performance.now();
  const writer = spawnSync('python3.12', ['-I', '-B', archiveWriter], {
    env: writerEnv, input: JSON.stringify(payload), encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
  const diagnostic = { ...smokeProcessDiagnostic(writer, { startedAt, elapsedMs: performance.now() - start }), timeoutMs: 10000 };
  writeFileSync(join(root, 'writer-diagnostics.json'), JSON.stringify({ ...diagnostic,
    stdout: writer.stdout ?? '', stderr: writer.stderr ?? '' }), { flag: 'wx', mode: 0o600 });
  if (writer.error || writer.status !== 0 || writer.signal) {
    retain = true;
    const error = Error(`fixture archive writer failed; evidence directory ${root}`);
    error.evidenceRoot = root; throw error;
  }
  const options = { artifactFile: archive, artifactSha256: sha(readFileSync(archive)) };
  const clean = evidenceRoot => t.after(() => rmSync(evidenceRoot, { recursive: true, force: true }));
  return { options, marker, clean, writerRoot: root };
}
test('archive writer retains private timeout and nonzero evidence without echoing payload', { timeout: 25000 }, t => {
  for (const [writerScenario, outcome, stage] of [['stall', 'timeout', 'fixed-stall'], ['nonzero', 'nonzero-or-unknown', 'fixed-refusal']]) {
    assert.throws(() => fixture(t, { writerScenario }), error => {
      assert.doesNotMatch(error.message, /private fixture writer error/);
      const root = error.evidenceRoot, diagnostic = JSON.parse(readFileSync(join(root, 'writer-diagnostics.json')));
      const progress = JSON.parse(readFileSync(join(root, 'writer-progress.json')));
      assert.equal(diagnostic.outcome, outcome); assert.equal(diagnostic.timeoutMs, 10000);
      assert.equal(diagnostic.descendantQuiescenceVerified, false);
      assert.equal(progress.stage, stage); assert.match(progress.pythonVersion, /^3\.12\./);
      assert.equal(progress.benchmarkEligible, false);
      assert.equal(statSync(root).mode & 0o077, 0);
      assert.equal(statSync(join(root, 'writer-diagnostics.json')).mode & 0o777, 0o600);
      assert.equal(statSync(join(root, 'writer-progress.json')).mode & 0o777, 0o600);
      if (writerScenario === 'stall') { assert.equal(diagnostic.errorCode, 'ETIMEDOUT'); assert.ok(diagnostic.elapsedMs >= 10000); }
      else assert.equal(diagnostic.exitCode, 1);
      t.diagnostic(`archive writer ${writerScenario}: retained private evidence ${root}`);
      t.after(() => assert.ok(existsSync(root), 'failed writer evidence must survive fixture teardown'));
      return /fixture archive writer failed/.test(error.message);
    });
  }
});
test('actual published-layout CLI runs twice in private isolated store without lifecycle script', t => {
  const f = fixture(t, { code: "if(process.env.PACKAGE_SMOKE_TEST_SENTINEL) throw Error('inherited environment');\n" + entry });
  assert.equal(JSON.parse(readFileSync(join(f.writerRoot, 'writer-progress.json'))).stage, 'archive-write-complete');
  const priorOptions = process.env.NODE_OPTIONS, priorSentinel = process.env.PACKAGE_SMOKE_TEST_SENTINEL;
  let report;
  try {
    process.env.NODE_OPTIONS = '--import=/nonexistent-smoke-preload.mjs'; process.env.PACKAGE_SMOKE_TEST_SENTINEL = randomUUID();
    report = runPinnedPackageSmoke(f.options);
  } finally {
    if (priorOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = priorOptions;
    if (priorSentinel === undefined) delete process.env.PACKAGE_SMOKE_TEST_SENTINEL; else process.env.PACKAGE_SMOKE_TEST_SENTINEL = priorSentinel;
  }
  f.clean(report.evidenceRoot);
  assert.equal(report.packageVersion, '9.0.0'); assert.equal(report.extractedFiles, 3);
  assert.deepEqual(report.processes.map(p => p.args), [['--version'], ['codex-host', 'list']]);
  assert.ok(report.processes.every(p => p.exitCode === 0 && p.pid !== process.pid));
  assert.ok(report.processes.every(p => p.outcome === 'exited-zero' && p.errorCode === null
    && p.signal === null && p.elapsedMs >= 0 && p.descendantQuiescenceVerified === false));
  assert.equal(report.providerCalls, null); assert.equal(report.approvalsRequested, false);
  assert.equal(report.executionArtifactProvenanceVerified, false); assert.equal(report.benchmarkEligible, false);
  assert.equal(statSync(report.evidenceRoot).mode & 0o077, 0);
  assert.equal(statSync(join(report.evidenceRoot, 'process-diagnostics.json')).mode & 0o777, 0o600);
  assert.equal(existsSync(f.marker), false);
});
test('wrong byte pin and symlink archive are refused before extraction', t => {
  const f = fixture(t);
  assert.throws(() => runPinnedPackageSmoke({ ...f.options, artifactSha256: 'a'.repeat(64) }), /byte pin mismatch/);
  const link = `${f.options.artifactFile}.link`; symlinkSync(f.options.artifactFile, link);
  assert.throws(() => runPinnedPackageSmoke({ ...f.options, artifactFile: link }), /noncanonical/);
  assert.equal(existsSync(f.marker), false);
});
test('actual missing extractor executable records spawn error without granting smoke proof', t => {
  const f = fixture(t);
  assert.throws(() => runPinnedPackageSmoke({ ...f.options, pythonBin: join(f.options.artifactFile, 'missing-python') }), error => {
    f.clean(error.evidenceRoot);
    const diagnostic = JSON.parse(readFileSync(join(error.evidenceRoot, 'extraction-diagnostics.json')));
    assert.equal(diagnostic.errorCode, 'ENOTDIR'); assert.equal(diagnostic.outcome, 'process-error');
    assert.equal(diagnostic.exitCode, null); assert.equal(diagnostic.descendantQuiescenceVerified, false);
    assert.equal(existsSync(join(error.evidenceRoot, 'runs')), false);
    return /extraction failed/.test(error.message);
  });
});
test('actual CLI timeout, output limit and signal retain distinct private diagnostics', { timeout: 45000 }, t => {
  for (const [code, outcome, errorCode, signal] of [
    ["setInterval(() => {}, 1000);", 'timeout', 'ETIMEDOUT', 'SIGTERM'],
    ["process.stdout.write('x'.repeat(256 * 1024));", 'output-limit', 'ENOBUFS', 'SIGTERM'],
    ["process.kill(process.pid, 'SIGTERM');", 'signalled', null, 'SIGTERM'],
  ]) {
    const f = fixture(t, { code });
    assert.throws(() => runPinnedPackageSmoke(f.options), error => {
      f.clean(error.evidenceRoot);
      const diagnostic = JSON.parse(readFileSync(join(error.evidenceRoot, 'process-diagnostics.json'))).processes.at(-1);
      assert.equal(diagnostic.outcome, outcome); assert.equal(diagnostic.errorCode, errorCode);
      assert.equal(diagnostic.signal, signal); assert.equal(diagnostic.exitCode, null);
      assert.equal(diagnostic.timeoutMs, 30000); assert.equal(diagnostic.descendantQuiescenceVerified, false);
      if (outcome === 'timeout') assert.ok(diagnostic.elapsedMs >= 30000);
      return /published CLI --version failed/.test(error.message);
    });
  }
});
test('traversal, duplicate, special, overlapping and oversized archive inventory refuses before execution', t => {
  for (const extras of [[{ name: 'package/../outside', content: 'bad' }], [{ name: '/outside', content: 'bad' }],
    [{ name: 'package/index.mjs', content: 'duplicate' }], [{ name: 'package/link', type: 'symlink' }],
    [{ name: 'package/link', type: 'hardlink' }], [{ name: 'package/device', type: 'device' }],
    [{ name: 'package/nested', content: 'file' }, { name: 'package/nested/file', content: 'overlap' }],
    [{ name: 'package/huge', size: 9 * 1024 * 1024 }], [{ name: 'package/negative', size: -1 }]]) {
    const f = fixture(t, { extras });
    assert.throws(() => runPinnedPackageSmoke(f.options), error => {
      f.clean(error.evidenceRoot); assert.equal(existsSync(join(error.evidenceRoot, 'runs')), false);
      assert.equal(existsSync(f.marker), false); return /extraction failed/.test(error.message);
    });
  }
});
test('gzip expansion is bounded before tar metadata parsing', t => {
  const f = fixture(t, { bomb: true });
  assert.throws(() => runPinnedPackageSmoke(f.options), error => { f.clean(error.evidenceRoot); return /extraction failed/.test(error.message); });
});
test('wrong version, non-JSON/unsafe listing, changed package and failed child do not become smoke proof', t => {
  for (const code of [entry.replace("console.log('9.0.0')", "console.log('8.0.0')"),
    entry.replace("state:'ok'", "state:'degraded'"), entry.replace('runs:[]', 'runs:[{}]'),
    entry.replace("console.log(JSON.stringify({state:'ok',runs:[],unreadable:0}))", "console.log('private fixture output')"),
    "import {writeFileSync} from 'node:fs'; writeFileSync(new URL('./extra',import.meta.url),'mutated');\n" + entry,
    "process.stderr.write('private fixture error');process.exit(7);"]) {
    const f = fixture(t, { code });
    assert.throws(() => runPinnedPackageSmoke(f.options), error => {
      f.clean(error.evidenceRoot); assert.doesNotMatch(error.message, /private fixture/);
      if (code.includes('process.exit(7)')) {
        const diagnostic = JSON.parse(readFileSync(join(error.evidenceRoot, 'process-diagnostics.json'))).processes.at(-1);
        assert.equal(diagnostic.exitCode, 7); assert.equal(diagnostic.outcome, 'nonzero-or-unknown');
        assert.equal(diagnostic.errorCode, null); assert.equal(diagnostic.signal, null);
      }
      return /version differs|valid empty listing|not JSON|changed during|published CLI/.test(error.message);
    });
  }
});
test('malformed package metadata does not echo private content', t => {
  for (const rawMetadata of ['private fixture metadata', 'null', '[]']) {
    const f = fixture(t, { rawMetadata });
    assert.throws(() => runPinnedPackageSmoke(f.options), error => {
      f.clean(error.evidenceRoot); assert.doesNotMatch(error.message, /private fixture/); return /unsupported published/.test(error.message);
    });
  }
});

test('opt-in delivered controller probe runs the matrix in a separate private process', t => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const files = runtimeImportClosure(repo, [join(repo, 'scripts/lib/codex-pipeline.mjs')]);
  const extras = files.map(path => ({ name: `package/board/${relative(repo, path)}`, content: readFileSync(path, 'utf8') }));
  extras.push({ name: 'package/board/shared/pipeline.toml', content: readFileSync(join(repo, 'shared/pipeline.toml'), 'utf8') });
  const f = fixture(t, { extras, rawMetadata: JSON.stringify({ name: 'great-cto', version: '9.0.0', type: 'module', bin: { 'great-cto': 'index.mjs' } }) });
  const report = runPinnedPackageSmoke({ ...f.options, controllerProbe: true }); f.clean(report.evidenceRoot);
  assert.equal(report.controllerAssets.cases.length, 12); assert.equal(report.controllerAssets.refusals.length, 8);
  const diagnostics = JSON.parse(readFileSync(join(report.evidenceRoot, 'controller-probe-diagnostics.json')));
  assert.ok(diagnostics.pid !== process.pid); assert.equal(diagnostics.exitCode, 0);
  assert.equal(diagnostics.outcome, 'exited-zero'); assert.equal(diagnostics.errorCode, null);
  assert.equal(diagnostics.signal, null); assert.equal(diagnostics.timeoutMs, 30000);
  assert.equal(diagnostics.descendantQuiescenceVerified, false);
  const progressPath = join(report.evidenceRoot, 'fixtures/probe-progress.json');
  const progress = JSON.parse(readFileSync(progressPath));
  assert.equal(progress.scope, 'diagnostic-progress-only'); assert.equal(progress.stage, 'complete');
  assert.equal(progress.benchmarkEligible, false); assert.equal(progress.descendantQuiescenceVerified, false);
  assert.match(progress.gitVersion, /^git version /);
  // The actual isolated probe must resolve Git through OS-first allowlisted
  // PATH, not through the operator's Homebrew/legacy-local preference.
  const expectedGitVersion = execFileSync('git', ['--version'], {
    env: { PATH: '/usr/bin:/bin:/usr/local/bin', LANG: 'C', TZ: 'UTC' }, encoding: 'utf8', timeout: 10000 }).trim();
  assert.equal(progress.gitVersion, expectedGitVersion);
  assert.equal(statSync(progressPath).mode & 0o777, 0o600);
  assert.equal(statSync(join(report.evidenceRoot, 'controller-probe-diagnostics.json')).mode & 0o777, 0o600);
  assert.equal(report.controllerProbeProcess.pid, diagnostics.pid);
  assert.equal(existsSync(f.marker), false); assert.equal(report.benchmarkEligible, false);
  const missing = fixture(t);
  assert.throws(() => runPinnedPackageSmoke({ ...missing.options, controllerProbe: true }), error => {
    missing.clean(error.evidenceRoot); assert.doesNotMatch(error.message, /ERR_MODULE_NOT_FOUND|Cannot find module/);
    const diagnostic = JSON.parse(readFileSync(join(error.evidenceRoot, 'controller-probe-diagnostics.json')));
    assert.equal(diagnostic.outcome, 'nonzero-or-unknown'); assert.equal(diagnostic.exitCode, 1);
    assert.equal(diagnostic.errorCode, null); assert.equal(diagnostic.descendantQuiescenceVerified, false);
    assert.equal(existsSync(join(error.evidenceRoot, 'fixtures/probe-progress.json')), false,
      'missing plugin root is refused before progress file creation');
    return /packaged controller probe failed/.test(error.message);
  });
  assert.throws(() => runPinnedPackageSmoke({ ...f.options, controllerProbe: 'yes' }), /must be boolean/);
  const altered = fixture(t, { extras: extras.map(file => file.name.endsWith('/pipeline.toml')
    ? { ...file, content: file.content.replace('gate = ["gate:security", "gate:compliance", "gate:ship"]', 'gate = ["gate:ship"]') } : file),
    rawMetadata: JSON.stringify({ name: 'great-cto', version: '9.0.0', type: 'module', bin: { 'great-cto': 'index.mjs' } }) });
  assert.throws(() => runPinnedPackageSmoke({ ...altered.options, controllerProbe: true }), error => {
    altered.clean(error.evidenceRoot); return /packaged controller probe failed/.test(error.message);
  });
});
