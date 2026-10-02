#!/usr/bin/env node
import { collectBenchmarkObservation } from './lib/adaptive-benchmark-collector.mjs';

const flags = { '--registration': 'registrationFile', '--state': 'stateFile', '--state-sha256': 'stateSha256',
  '--artifact': 'artifactFile', '--scorer': 'scorerFile', '--score': 'scoreFile', '--score-sha256': 'scoreSha256' };
try {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = flags[args[i]];
    if (!key || options[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('unique named arguments and values required');
    options[key] = args[i + 1];
  }
  for (const key of ['registrationFile', 'stateFile', 'stateSha256', 'artifactFile', 'scorerFile']) {
    if (!options[key]) throw Error('registration, state/state-sha256, artifact and scorer arguments required');
  }
  console.log(JSON.stringify(collectBenchmarkObservation(options), null, 2));
} catch (error) {
  console.error(`adaptive-benchmark-collect: ${error.message}`);
  process.exitCode = 2;
}
