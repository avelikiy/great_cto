/** Local feedback is not release evidence. Final evidence is source-bound, not an approval. */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, watch, readdirSync, createWriteStream, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { affectedTests } from './affected-tests.mjs';
import { countSkips } from './count-skips.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const git = (cwd, args, input) => execFileSync('git', args, { cwd, input, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const paths = text => text.split('\0').filter(Boolean);
export function measureResources() {
  const freeBytes = freemem(), total = totalmem(); let availableBytes = freeBytes, memorySource = 'free-fallback';
  try {
    if (process.platform === 'darwin') {
      const text = execFileSync('/usr/bin/memory_pressure', ['-Q'], { encoding: 'utf8', timeout: 1500 });
      const m = text.match(/System-wide memory free percentage: (\d+)%/);
      if (m && Number(m[1]) <= 100) { availableBytes = Math.floor(total * Number(m[1]) / 100); memorySource = 'darwin-memory-pressure'; }
    } else if (process.platform === 'linux') {
      const m = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+) kB$/m);
      if (m && Number(m[1]) * 1024 <= total) { availableBytes = Number(m[1]) * 1024; memorySource = 'linux-mem-available'; }
    }
  } catch { /* Missing OS measurement is conservative, never invented capacity. */ }
  return { cpus: availableParallelism(), freeBytes, availableBytes, memorySource, load: loadavg()[0] };
}
export function selectWorkers({ cpus = availableParallelism(), freeBytes = freemem(), availableBytes = freeBytes,
  memorySource = 'free-fallback', load = loadavg()[0], requested = 'auto' } = {}) {
  if (!['auto', '1', '2'].includes(requested)) throw Error('workers must be auto, 1 or 2');
  const constrained = !Number.isInteger(cpus) || cpus < 4 || !Number.isFinite(availableBytes)
    || availableBytes < 2 * 1024 ** 3 || !Number.isFinite(load) || load >= cpus * 1.2;
  return { workers: requested === 'auto' ? constrained ? 1 : 2 : Number(requested),
    reason: requested === 'auto' ? constrained ? 'resource-constrained' : 'bounded-parallel' : 'explicit', cpus,
    freeMiB: Math.floor(freeBytes / 1024 ** 2), availableMiB: Math.floor(availableBytes / 1024 ** 2), memorySource, load };
}
function inventory(cwd, dir) {
  if (!existsSync(join(cwd, dir))) return [];
  return readdirSync(join(cwd, dir), { withFileTypes: true }).flatMap(e => e.isFile() && e.name.endsWith('.test.mjs') ? [join(dir, e.name)] : []);
}
export function planVerification({ cwd = process.cwd(), base, changed, workers = 1 } = {}) {
  if (!base || ![1, 2].includes(workers)) throw Error('explicit base and bounded workers required');
  const baseSha = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
  const files = [...new Set(changed ?? [
    ...paths(git(cwd, ['diff', '--no-renames', '--name-only', '-z', `${baseSha}...HEAD`, '--'])),
    ...paths(git(cwd, ['diff', '--no-renames', '--name-only', '-z', 'HEAD', '--'])),
    ...paths(git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ])].sort();
  if (files.some(f => f.includes('\0') || f.startsWith('/') || f.split('/').includes('..'))) throw Error('invalid changed path');
  const sensitive = f => /^(?:scripts\/hooks\/|shared\/|agents(?:-full)?\/|skills\/|\.github\/|\.codex\/|\.claude\/|docs\/gates\/)/.test(f)
    || /^(?:AGENTS\.md|CLAUDE\.md|scripts\/verify\.mjs|scripts\/lib\/verification-lane\.mjs)$/.test(f)
    || /(?:^|\/)(?:package(?:-lock)?\.json|pipeline\.toml|ci-local\.sh)$/.test(f);
  const docs = f => /^(?:docs\/.*\.md|README(?:\.[^/]+)?\.md|CHANGELOG\.md|CONTRIBUTING\.md)$/.test(f) && !sensitive(f);
  const ui = f => /^packages\/board\//.test(f);
  const route = files.some(sensitive) ? 'security' : files.length && files.every(docs) ? 'docs' : files.some(ui) ? 'ui' : 'runtime';
  const mapping = affectedTests({ cwd, changed: files.filter(f => !docs(f)) });
  const tests = new Set(mapping.tests.filter(f => f.endsWith('.test.mjs') && existsSync(join(cwd, f))));
  if (files.some(docs)) for (const f of [...inventory(cwd, 'tests/docs'), 'tests/lib/doc-links.test.mjs']) if (existsSync(join(cwd, f))) tests.add(f);
  if (files.some(ui)) for (const f of [...inventory(cwd, 'packages/board'), ...inventory(cwd, 'tests/e2e'), 'tests/lib/rendered-contrast.test.mjs']) if (existsSync(join(cwd, f))) tests.add(f);
  const unmapped = files.filter(f => !docs(f) && !ui(f) && (!/\.(?:mjs|[jt]sx?)$/.test(f) || mapping.unmapped.includes(f)
    || (/\.test\.mjs$/.test(f) && !existsSync(join(cwd, f)))));
  const unsupportedTests = mapping.tests.filter(f => !f.endsWith('.test.mjs'));
  const fullRequired = files.some(sensitive) || unmapped.length > 0 || unsupportedTests.length > 0 || files.length > 0 && tests.size === 0;
  const selected = [...tests].sort();
  const steps = [{ name: 'frozen-gates', command: process.execPath, args: ['scripts/lib/check-frozen-gates.mjs', '--base', baseSha, '--json'] }];
  // Even root/doc tests import ignored CLI output: rebuild it once, never test stale dist.
  if (selected.length) steps.push({ name: 'cli-build', command: 'npm', args: ['--prefix', 'packages/cli', 'run', 'build'] });
  if (selected.length) steps.push({ name: 'affected-tests', command: process.execPath,
    args: ['--test', `--test-concurrency=${workers}`, ...selected.map(f => `./${f}`)] });
  return { version: 1, baseSha, changed: files, route, tests: selected, unmapped, unsupportedTests, fullRequired,
    browserRequired: files.some(ui) || selected.some(f => /browser|guardian|contrast|accessibility|layout-snapshot|board\.e2e/.test(f)),
    mergeEligible: false, steps };
}
export function sourceSnapshot(cwd) {
  if (git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) throw Error('final candidate must be clean, including untracked files');
  return { head: git(cwd, ['rev-parse', 'HEAD']).trim(), tree: git(cwd, ['rev-parse', 'HEAD^{tree}']).trim(),
    gateSha256: sha(readFileSync(join(cwd, 'scripts/ci-local.sh')).toString()) };
}
export function watchSource(cwd) {
  const root = realpathSync(cwd), tracked = new Set(paths(git(root, ['ls-files', '-z'])));
  const stamp = f => { const s = statSync(join(root, f), { bigint: true }); return [s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':'); };
  // macOS may coalesce/delay FSEvents. Metadata also catches edit/revert before
  // event delivery; this is not an adversarial-filesystem attestation.
  const stamps = new Map([...tracked].filter(f => existsSync(join(root, f))).map(f => [f, stamp(f)]));
  const dirs = new Set(['.']);
  for (const f of tracked) { let dir = dirname(f); while (dir !== '.') { dirs.add(dir); dir = dirname(dir); } }
  let failed = false, closed = false; const events = new Set(), watchers = [];
  try { for (const dir of dirs) {
    const path = join(root, dir); if (!existsSync(path)) continue;
    if (relative(root, realpathSync(path)).startsWith('..')) throw Error('source directory escaped checkout');
    const w = watch(path, (_, name) => {
      if (!name) { failed = true; return; }
      const f = join(dir, String(name)); if (f === '.git') return;
      events.add(f);
    }); w.on('error', () => { failed = true; }); watchers.push(w);
  } } catch (e) { for (const w of watchers) w.close(); throw e; }
  return {
    unchanged() {
      if (failed || closed) return false;
      try { for (const [f, before] of stamps) if (stamp(f) !== before) return false; } catch { return false; }
      if ([...events].some(f => tracked.has(f))) return false;
      const additions = [...events]; if (!additions.length) return true;
      try {
        let ignored;
        try { ignored = git(root, ['check-ignore', '--stdin', '-z'], additions.join('\0') + '\0'); }
        catch (e) { if (e.status !== 1) return false; ignored = ''; }
        const allowed = new Set(paths(ignored)); return additions.every(f => allowed.has(f));
      } catch { return false; }
    },
    close() { for (const w of watchers) w.close(); closed = true; },
  };
}
export function receiptCurrent(receipt, cwd) {
  try { return receipt?.version === 1 && receipt.mode === 'final' && receipt.mergeEligible === false
    && ['passed', 'passed-with-not-checked'].includes(receipt.result)
    && JSON.stringify(receipt.source) === JSON.stringify(sourceSnapshot(cwd)); } catch { return false; }
}
export function summarizeGate({ code, text }) {
  const measured = /^(?:# skipped|ℹ skipped) \d+/m.test(text || '');
  return { result: code !== 0 ? 'failed' : !measured ? 'unknown' : countSkips(text) ? 'passed-with-not-checked' : 'passed',
    notChecked: measured ? countSkips(text) : null, mergeEligible: false };
}
/** Only fixed argv from the planner is executed. Never executes its legacy shell command strings. */
export function runStep(step, { cwd, logFile, timeoutMs = 0, env = process.env } = {}) {
  return new Promise(resolveRun => {
    const started = performance.now(), timings = []; let pending = '', current = null;
    const output = createWriteStream(logFile, { flags: 'wx', mode: 0o600 });
    const child = spawn(step.command, step.args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timer, error = null, settled = false, bytes = 0;
    const record = chunk => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) { error = 'log-limit'; stop(); return; }
      output.write(chunk); pending += chunk.toString(); let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end).replace(/\u001b\[[0-9;]*m/g, ''); pending = pending.slice(end + 1);
        if (line.startsWith('── ')) {
          if (current) timings.push({ name: current.name, elapsedMs: Math.round(performance.now() - current.start) });
          current = { name: line.slice(3), start: performance.now() };
        }
      }
      if (pending.length > 1024 * 1024) pending = pending.slice(-1024);
    };
    child.stdout.on('data', record); child.stderr.on('data', record);
    const stop = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const interrupt = () => { error = 'interrupted'; stop(); };
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
    output.on('error', () => { error = 'log-unavailable'; stop(); });
    if (timeoutMs) timer = setTimeout(() => { error = 'timeout'; stop(); }, timeoutMs);
    const finish = (code, signal) => {
      if (settled) return; settled = true; clearTimeout(timer);
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
      if (current) timings.push({ name: current.name, elapsedMs: Math.round(performance.now() - current.start) });
      const result = { name: step.name, code: error ? null : code, signal: signal || null, error, elapsedMs: Math.round(performance.now() - started), timings };
      if (output.destroyed) resolveRun(result); else output.end(() => resolveRun(result));
    };
    child.once('error', () => { error = 'spawn-unavailable'; finish(null); }); child.once('close', finish);
  });
}
export async function preflight({ cwd, browserRequired }) {
  const node = process.versions.node;
  if (Number(node.split('.')[0]) < 22) return { state: 'blocked', reason: 'node-22-required' };
  try { git(cwd, ['rev-parse', '--show-toplevel']); } catch { return { state: 'blocked', reason: 'git-unavailable' }; }
  if (!browserRequired) return { state: 'ready', node, browser: 'not-required-for-feedback' };
  // A real launch, not merely a module/executable existence check. No download or global cache cleanup.
  try {
    const require = createRequire(join(resolve(cwd), 'package.json'));
    const entry = require.resolve('playwright');
    const dir = await import('node:fs').then(m => m.mkdtempSync(join(require('node:os').tmpdir(), 'great-cto-browser-preflight-')));
    const script = `const m=await import(process.argv[1]);const chromium=m.chromium??m.default?.chromium;const b=await chromium.launch({headless:true,timeout:5000});try{console.log(JSON.stringify({version:b.version()}));}finally{await b.close()}`;
    const { pathToFileURL } = await import('node:url');
    const logFile = join(dir, 'launch.log');
    const r = await runStep({ name: 'browser-launch', command: process.execPath, args: ['--input-type=module', '-e', script, pathToFileURL(entry).href] }, { cwd, logFile, timeoutMs: 12000 });
    if (r.code !== 0) return { state: 'blocked', reason: 'browser-launch-unavailable', evidence: logFile };
    const browser = JSON.parse(readFileSync(logFile, 'utf8').trim());
    if (typeof browser.version !== 'string') throw Error('invalid browser result');
    return { state: 'ready', node, browser: browser.version, playwright: require('playwright/package.json').version };
  } catch { return { state: 'blocked', reason: 'browser-runtime-unavailable' }; }
}
