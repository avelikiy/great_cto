#!/usr/bin/env node
// Fixed local read-only task fixture; never imports Beads or opens a database.
import { readFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.SHIP_FIXTURE_BD_CALLS, JSON.stringify(args) + '\n');
const required = ['--readonly', '--sandbox', 'list', '--all', '--limit', '0', '--include-gates', '--include-infra', '--include-templates', '--include-ephemeral', '--max-rows', '10000', '--json'];
if (JSON.stringify(args) !== JSON.stringify(required) || process.env.BD_DOLT_AUTO_PUSH !== 'false' || process.env.BD_DISABLE_METRICS !== '1' || process.env.BD_DISABLE_EVENT_FLUSH !== '1') {
  console.error('synthetic bd refuses incomplete global read or unsafe background configuration'); process.exit(9);
}
const scenario = JSON.parse(readFileSync(process.env.SHIP_FIXTURE_SCENARIO, 'utf8'));
if (scenario.taskReadError) {console.error('SYNTHETIC_PRIVATE_TASK_READ_ERROR'); process.exit(3);}
if (scenario.malformedTaskOutput) {console.log('{malformed'); process.exit(0);}
console.log(JSON.stringify(scenario.tasks || []));
