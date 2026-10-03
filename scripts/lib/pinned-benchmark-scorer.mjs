/** Trusted operator scorer process; no sandbox or provider-attestation claim. */
import { openSync, fstatSync, readSync, closeSync, realpathSync, lstatSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { treeReceipt } from './receipt.mjs';
import { scenarios } from './adaptive-benchmark-protocol.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function baselineInputDigest(root, names) {
  const inputs = names.map(name => {
    const path = resolve(root, name);
    try {
      if (realpathSync(path) !== path || !lstatSync(path).isFile()) return [name, 'unsafe'];
      const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > 65536) return [name, 'unsafe'];
        const bytes = Buffer.alloc(stat.size + 1); let used = 0, count;
        while (used < bytes.length && (count = readSync(fd, bytes, used, bytes.length - used, null)) > 0) used += count;
        if (used !== stat.size) throw Error('candidate input changed during bounded read');
        return [name, stat.mode, sha(bytes.subarray(0, used))];
      } finally { closeSync(fd); }
    } catch (error) { if (error.code === 'ENOENT') return [name, 'missing']; throw error; }
  });
  return sha(JSON.stringify(inputs));
}
function pinnedExternal(root, file, pin) {
  const path = resolve(file), canonical = realpathSync(path), rel = relative(root, canonical);
  if (path !== canonical || !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw Error('scorer evidence must be canonical and external');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077)) throw Error('scorer evidence must be bounded private regular files');
    const buffer = Buffer.alloc(stat.size + 1); let used = 0, count;
    while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
    const bytes = buffer.subarray(0, used);
    if (used !== stat.size || sha(bytes) !== pin) throw Error('scorer evidence pin or size changed');
    return bytes;
  } finally { closeSync(fd); }
}

export function readPinnedScorerOracle(root, oracleFile, oracleSha256) {
  if (!hex(oracleSha256)) throw Error('invalid scorer oracle pin');
  const oracleBytes = pinnedExternal(root, oracleFile, oracleSha256);
  let oracle;
  try { oracle = JSON.parse(oracleBytes); } catch { throw Error('invalid private scorer oracle JSON'); }
  const scenario = scenarios.find(s => s.id === oracle?.scenario);
  if (oracle?.version !== 1 || !scenario || !same(oracle.criteria, scenario.checks)) throw Error('scorer oracle scenario or criteria mismatch');
  const names = Object.keys(oracle.baseline || {}).sort();
  if (!names.length || names.length > 200 || names.some(name => !hex(oracle.baseline[name])
    || isAbsolute(name) || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..'))) throw Error('scorer oracle baseline inventory invalid');
  return oracle;
}

export function runPinnedBenchmarkScorer({ root, scorerFile, scorerSha256, oracleFile, oracleSha256,
  expectedReceipt, timeoutMs = 10000 }) {
  const candidate = realpathSync(root);
  if (candidate !== resolve(root) || !hex(scorerSha256) || !hex(oracleSha256)
    || !Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 30000) throw Error('invalid pinned scorer invocation');
  const code = pinnedExternal(candidate, scorerFile, scorerSha256);
  const oracle = readPinnedScorerOracle(candidate, oracleFile, oracleSha256);
  const scenario = scenarios.find(s => s.id === oracle.scenario), names = Object.keys(oracle.baseline).sort();
  const before = treeReceipt(candidate);
  if (!expectedReceipt || expectedReceipt.truncated || !before || !same(before, expectedReceipt)) throw Error('candidate receipt differs before scoring');
  const candidateInputDigest = baselineInputDigest(candidate, names);
  // Execute the exact verified bytes, not a filename that could be swapped after reading.
  // Pinned code is trusted and may perform side effects; this is not a sandbox.
  const startedAt = new Date().toISOString();
  const child = spawnSync(process.execPath, ['--input-type=module', '-', candidate, JSON.stringify(oracle)], {
    input: code, cwd: dirname(realpathSync(scorerFile)), env: { LANG: 'C', TZ: 'UTC' },
    // spawnSync waits for child exit even after its deadline signal. SIGTERM
    // can be handled (e.g. by Playwright) without exiting Node, so it cannot
    // enforce this process boundary. Descendant/profile cleanup is separate.
    timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 65536, encoding: 'utf8', windowsHide: true,
  });
  const finishedAt = new Date().toISOString(), after = treeReceipt(candidate);
  if (!after || !same(before, after) || baselineInputDigest(candidate, names) !== candidateInputDigest) throw Error('candidate changed during scoring');
  if (child.error || child.status !== 0 || child.signal) throw Error('pinned scorer process did not complete');
  let score;
  try { score = JSON.parse(child.stdout); } catch { throw Error('pinned scorer returned invalid JSON'); }
  if (score?.version !== 1 || score.pid !== child.pid || score.scenario !== scenario.id
    || !Array.isArray(score.criteria) || score.criteria.length !== scenario.checks.length
    || score.criteria.some((c, i) => c.text !== scenario.checks[i] || !['passed', 'failed'].includes(c.state)
      || typeof c.evidence !== 'string' || !c.evidence.trim() || c.evidence.length > 1024)) throw Error('pinned scorer returned invalid identity or criteria');
  return { version: 1, source: 'trusted-operator-launched-pinned-scorer', scenario: scenario.id,
    scorerSha256, oracleSha256, receipt: after, candidateInputDigest, criteria: score.criteria,
    accepted: score.criteria.every(c => c.state === 'passed'),
    process: { pid: child.pid, exitCode: child.status, startedAt, finishedAt, node: process.version },
    evidenceLevel: 'local-process-execution-not-provider-or-package-attestation', benchmarkEligible: false };
}
