#!/usr/bin/env node
import { realpathSync, lstatSync, openSync, writeFileSync, closeSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute, sep, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { runBoundBenchmarkScorer } from './lib/bound-benchmark-scorer.mjs';
import { benchmarkScoringContext } from './lib/adaptive-benchmark-collector.mjs';

const flags = { '--registration': 'registrationFile', '--state': 'stateFile', '--state-sha256': 'stateSha256',
  '--artifact': 'artifactFile', '--scorer': 'scorerFile', '--oracle': 'oracleFile', '--signing-key': 'privateKeyFile',
  '--out': 'outputFile', '--timeout-ms': 'timeoutMs' };
try {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = flags[args[i]];
    if (!key || key in options || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('unique named arguments and values required');
    options[key] = args[i + 1];
  }
  for (const key of ['registrationFile', 'stateFile', 'stateSha256', 'artifactFile', 'scorerFile', 'oracleFile', 'privateKeyFile', 'outputFile']) {
    if (!options[key]) throw Error('registered state, artifact, scorer, oracle, signing-key and out arguments required');
  }
  if (options.timeoutMs != null) options.timeoutMs = Number(options.timeoutMs);
  const context = benchmarkScoringContext(options, { settled: true });
  const path = resolve(options.outputFile), parent = realpathSync(dirname(path)), info = lstatSync(parent);
  let outputExists = false;
  try { lstatSync(path); outputExists = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const rel = relative(context.root, parent);
  if (path !== resolve(parent, basename(path)) || !info.isDirectory() || (info.mode & 0o077)
    || !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) || outputExists) throw Error('score output requires a new file in a canonical private external directory');
  const report = runBoundBenchmarkScorer(options), raw = JSON.stringify(report);
  if (Buffer.byteLength(raw) > 65536) throw Error('signed scorer report exceeds size bound');
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try { writeFileSync(fd, raw); } finally { closeSync(fd); }
  console.log(JSON.stringify({ runId: report.payload.runId, accepted: report.payload.accepted,
    scoreSha256: createHash('sha256').update(raw).digest('hex'), scoreFile: path,
    evidenceLevel: 'trusted-launcher-signed-local-scorer-not-package-or-provider-attestation', benchmarkEligible: false }));
} catch (error) {
  console.error(`adaptive-benchmark-score: ${error.message}`); process.exitCode = 2;
}
