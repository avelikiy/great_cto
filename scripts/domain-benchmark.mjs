#!/usr/bin/env node
/** Explicit files only; output JSON to stdout, never invoke a model or scorer. */
import { boundedFile } from './lib/domain-evidence.mjs';
import { planDomainPilot, preregisterDomainPilot, describeDomainPilot } from './lib/domain-benchmark.mjs';

export function domainBenchmark(args) {
  if (args.length === 1 && args[0] === 'plan') return planDomainPilot();
  const read = path => JSON.parse(boundedFile(path).toString('utf8'));
  if (args.length === 2 && args[0] === 'preregister') return preregisterDomainPilot(read(args[1]));
  if (args.length === 3 && args[0] === 'describe') return describeDomainPilot(read(args[1]), read(args[2]));
  throw Error('usage: domain-benchmark.mjs plan | preregister INPUT_JSON | describe PROTOCOL_JSON OBSERVATIONS_JSON');
}
if (process.argv[1]?.endsWith('/domain-benchmark.mjs')) {
  try { process.stdout.write(`${JSON.stringify(domainBenchmark(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
