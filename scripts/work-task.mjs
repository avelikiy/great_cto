#!/usr/bin/env node
/** Advanced operator contract behind `great-cto task work`; no new daily flow. */
import { resolve } from 'node:path';
import { listWorkTasks, readWorkTask } from './lib/work-tasks.mjs';
import { approveWorkDecision, decisionCapabilities } from './lib/work-decisions.mjs';
import { applyOutcome, readOutcomeEvidence } from './lib/work-outcomes.mjs';
import { measureWork, compareWork } from './lib/work-metrics.mjs';
const args = process.argv.slice(2), action = args.shift();
try {
  const supported = new Set(['--dir','--task','--decision','--revision','--operation','--evidence','--baseline']);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) { if (!supported.has(args[i]) || !args[i+1] || args[i+1].startsWith('--') || opts[args[i]] !== undefined) throw Error('invalid or duplicate operator option'); opts[args[i]] = args[i+1]; }
  const perAction = { metrics: ['--dir','--baseline'], decisions: ['--dir','--task'], approve: ['--dir','--task','--decision','--revision','--operation'], verify: ['--dir','--task','--revision','--operation','--evidence'], complete: ['--dir','--task','--revision','--operation'] };
  if (perAction[action] && Object.keys(opts).some(k => !perAction[action].includes(k))) throw Error('option is not supported for this operation');
  const root = resolve(opts['--dir'] || '.'), taskId = opts['--task'];
  let result;
  if (action === 'metrics') {
    const listing = listWorkTasks(root); if (listing.state === 'degraded') throw Error('task source is degraded; measurements refused');
    const current = measureWork(listing.tasks), baseline = opts['--baseline'] ? readOutcomeEvidence(root, opts['--baseline']).document : null;
    result = { ...current, comparison: compareWork(current, baseline) };
  } else if (action === 'decisions') result = decisionCapabilities(readWorkTask(taskId, { root }));
  else if (action === 'approve') result = approveWorkDecision({ root, taskId, decisionId: opts['--decision'], expectedRevision: Number(opts['--revision']), operationId: opts['--operation'] });
  else if (['verify','complete'].includes(action)) result = applyOutcome({ root, taskId, kind: action, expectedRevision: Number(opts['--revision']), operationId: opts['--operation'], evidenceFile: opts['--evidence'] });
  else throw Error('usage: great-cto task work decisions|approve|verify|complete|metrics --dir PATH [--task UUID --revision N --operation UUID --decision ID --evidence EXTERNAL_FILE --baseline EXTERNAL_FILE]');
  console.log(JSON.stringify(result, null, 2));
} catch (e) { console.error('work-task: ' + e.message); process.exitCode = 2; }
