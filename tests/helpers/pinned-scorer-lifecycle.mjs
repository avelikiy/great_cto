// Fixed trusted fixture launcher. Private configuration stays on stdin, never
// argv or output. This is diagnostic observation, not independent admission.
import { runPinnedBenchmarkScorer } from '../../scripts/lib/pinned-benchmark-scorer.mjs';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
emit({ kind: 'launcher-started', pid: process.pid });
let input = '', refused = false;
const refuse = (reason, kind = 'prelaunch-refused') => {
  if (refused) return;
  refused = true; process.exitCode = 3;
  emit({ kind, reason });
};
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (refused) return;
  if (Buffer.byteLength(input) + Buffer.byteLength(chunk) > 65536) {
    input = ''; refuse('input-limit'); return;
  }
  input += chunk;
});
process.stdin.on('error', () => refuse('input-unavailable'));
process.stdin.on('end', () => {
  if (refused) return;
  let config;
  try {
    config = JSON.parse(input); input = '';
    if (!config || Object.keys(config).join(',') !== 'options' || !config.options
      || Object.keys(config.options).sort().join(',') !== 'expectedReceipt,oracleFile,oracleSha256,root,scorerFile,scorerSha256,timeoutMs') {
      refuse('input-shape'); return;
    }
  } catch { input = ''; refuse('input-shape'); return; }
  emit({ kind: 'runner-invoked', pid: process.pid });
  try {
    runPinnedBenchmarkScorer(config.options);
    emit({ kind: 'unexpected-completion' }); process.exitCode = 2;
  } catch (error) {
    if (error.processDiagnostic) {
      emit({ kind: 'runner-unavailable', processDiagnostic: error.processDiagnostic });
    } else {
      if (error.message === 'candidate receipt differs before scoring') refuse('receipt-refused');
      else refuse('stage-unproven', 'runner-refused');
    }
  }
});
