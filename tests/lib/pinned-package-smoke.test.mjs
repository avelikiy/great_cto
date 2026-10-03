import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, statSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { runPinnedPackageSmoke, smokeProcessDiagnostic } from '../../scripts/lib/pinned-package-smoke.mjs';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { runtimeImportClosure } from '../../packages/cli/scripts/runtime-import-closure.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
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
function fixture(t, { code = entry, extras = [], rawMetadata = null, bomb = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'package-smoke-fixture-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archive = join(root, 'package.tgz'), marker = join(root, 'lifecycle-marker');
  const payload = { archive, bomb, files: [
    { name: 'package/package.json', content: rawMetadata ?? JSON.stringify({ name: 'great-cto', version: '9.0.0', bin: { 'great-cto': 'index.mjs' } }) },
    { name: 'package/index.mjs', content: code },
    { name: 'package/postinstall.mjs', content: `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'ran');` }, ...extras] };
  // Binary tar headers, links and hostile member names need an archive writer.
  execFileSync('python3.12', ['-I', '-B', '-c', `import sys,json,tarfile,io,gzip
p=json.loads(sys.stdin.read())
if p['bomb']:
 with gzip.open(p['archive'],'wb') as f:
  for _ in range(129): f.write(bytes(1024*1024))
else:
 with tarfile.open(p['archive'],'w:gz') as t:
  for item in p['files']:
   data=item.get('content','').encode();info=tarfile.TarInfo(item['name']);info.mode=0o644;info.size=item.get('size',len(data))
   if item.get('type')=='symlink':info.type=tarfile.SYMTYPE;info.linkname='../outside';info.size=0
   if item.get('type')=='hardlink':info.type=tarfile.LNKTYPE;info.linkname='package/index.mjs';info.size=0
   if item.get('type')=='device':info.type=tarfile.CHRTYPE;info.size=0
   t.addfile(info,io.BytesIO(data) if info.size==len(data) else None)
`], { input: JSON.stringify(payload), timeout: 10000 });
  const options = { artifactFile: archive, artifactSha256: sha(readFileSync(archive)) };
  const clean = evidenceRoot => t.after(() => rmSync(evidenceRoot, { recursive: true, force: true }));
  return { options, marker, clean };
}
test('actual published-layout CLI runs twice in private isolated store without lifecycle script', t => {
  const f = fixture(t, { code: "if(process.env.PACKAGE_SMOKE_TEST_SENTINEL) throw Error('inherited environment');\n" + entry });
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
  assert.equal(statSync(join(report.evidenceRoot, 'controller-probe-diagnostics.json')).mode & 0o777, 0o600);
  assert.equal(report.controllerProbeProcess.pid, diagnostics.pid);
  assert.equal(existsSync(f.marker), false); assert.equal(report.benchmarkEligible, false);
  const missing = fixture(t);
  assert.throws(() => runPinnedPackageSmoke({ ...missing.options, controllerProbe: true }), error => {
    missing.clean(error.evidenceRoot); assert.doesNotMatch(error.message, /ERR_MODULE_NOT_FOUND|Cannot find module/);
    const diagnostic = JSON.parse(readFileSync(join(error.evidenceRoot, 'controller-probe-diagnostics.json')));
    assert.equal(diagnostic.outcome, 'nonzero-or-unknown'); assert.equal(diagnostic.exitCode, 1);
    assert.equal(diagnostic.errorCode, null); assert.equal(diagnostic.descendantQuiescenceVerified, false);
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
