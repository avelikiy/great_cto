/** Trusted launcher binds actual pinned scorer process to exact registered state. */
import { benchmarkScoringContext, privateBenchmarkEvidence } from './adaptive-benchmark-collector.mjs';
import { runPinnedBenchmarkScorer } from './pinned-benchmark-scorer.mjs';
import { signScorerPayload, scorerAuthority } from './benchmark-scorer-signature.mjs';

export function runBoundBenchmarkScorer(options) {
  const before = benchmarkScoringContext(options, { settled: true });
  if (!scorerAuthority(before.identity.scorer)) throw Error('scorer signing authority was not preregistered');
  const privateBytes = privateBenchmarkEvidence(before.root, options.privateKeyFile).raw;
  try {
    // Check authority before any process launch; this provisional envelope is not returned.
    signScorerPayload({}, privateBytes, before.identity.scorer);
    const execution = runPinnedBenchmarkScorer({ root: before.root, scorerFile: options.scorerFile,
      scorerSha256: before.scorer.sha256, oracleFile: options.oracleFile,
      oracleSha256: before.identity.scorer.oracleSha256, expectedReceipt: before.receipt,
      timeoutMs: options.timeoutMs ?? 10000 });
    const after = benchmarkScoringContext(options, { settled: true });
    if (JSON.stringify(after.identity) !== JSON.stringify(before.identity)
      || JSON.stringify(after.receipt) !== JSON.stringify(execution.receipt)) throw Error('registered state changed during scorer execution');
    return signScorerPayload({ runId: before.state.id, stateSha256: options.stateSha256,
      registrationDigest: before.identity.registrationDigest, artifactSha256: before.artifact.sha256,
      scorerSha256: execution.scorerSha256, oracleSha256: execution.oracleSha256,
      receipt: execution.receipt, candidateInputDigest: execution.candidateInputDigest,
      criteria: execution.criteria, accepted: execution.accepted, process: execution.process }, privateBytes, before.identity.scorer);
  } finally { privateBytes.fill(0); }
}
