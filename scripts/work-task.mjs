#!/usr/bin/env node
/** Advanced operator contract behind `great-cto task work`; no new daily flow. */
import { auditHostGraphRuntimes } from './lib/host-graph-runtime.mjs';
import { resolve } from 'node:path';
import { readSync } from 'node:fs';
import { bindNativeGraph, unbindNativeGraph, nativeGraphObservations, observeNativeGraphHook, readNativeGraphPage, enableNativeGraph, disableNativeGraph } from './lib/host-graph-bindings.mjs';
import { listWorkTasks, readWorkTask } from './lib/work-tasks.mjs';
import { approveWorkDecision, decisionCapabilities } from './lib/work-decisions.mjs';
import { applyOutcome, readOutcomeEvidence } from './lib/work-outcomes.mjs';
import { measureWork, compareWork } from './lib/work-metrics.mjs';
import { previewPublication, publishPublication } from './lib/work-publication.mjs';
const args = process.argv.slice(2), action = args.shift();
try {
  const supported = new Set(['--dir','--task','--decision','--revision','--operation','--evidence','--baseline','--base','--allow','--approval','--confirm','--host','--session','--source-version','--cursor','--limit']);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) { if (!supported.has(args[i]) || !args[i+1] || args[i+1].startsWith('--') || opts[args[i]] !== undefined) throw Error('invalid or duplicate operator option'); opts[args[i]] = args[i+1]; }
  const perAction = { 'graph-audit': [], 'graph-enable': ['--dir','--host','--source-version'], 'graph-disable': ['--dir','--host'], 'graph-bind': ['--dir','--host','--session','--source-version'], 'graph-unbind': ['--dir','--host','--session'], 'graph-read': ['--dir','--host','--session','--cursor','--limit'], 'graph-ingest': ['--dir','--host'], preview: ['--dir','--task','--base','--allow'], publish: ['--dir','--task','--base','--allow','--revision','--approval','--confirm','--host','--session','--source-version'], metrics: ['--dir','--baseline'], decisions: ['--dir','--task'], approve: ['--dir','--task','--decision','--revision','--operation'], verify: ['--dir','--task','--revision','--operation','--evidence'], complete: ['--dir','--task','--revision','--operation'] };
  if (perAction[action] && Object.keys(opts).some(k => !perAction[action].includes(k))) throw Error('option is not supported for this operation');
  const root = resolve(opts['--dir'] || '.'), taskId = opts['--task'];
  let result;
  if (action === 'graph-audit') result = auditHostGraphRuntimes();
  else if (action === 'graph-enable' || action === 'graph-disable') result = (action === 'graph-enable' ? enableNativeGraph : disableNativeGraph)({ root, host: opts['--host'], sourceVersion: opts['--source-version'] || null });
  else if (action === 'graph-bind' || action === 'graph-unbind') {
    result = (action === 'graph-bind' ? bindNativeGraph : unbindNativeGraph)({ root, host: opts['--host'], sessionId: opts['--session'], sourceVersion: opts['--source-version'] || null });
  } else if (action === 'graph-read') result = opts['--session'] ? readNativeGraphPage({ root, host: opts['--host'], sessionId: opts['--session'], cursor: opts['--cursor'] || null, limit: opts['--limit'] ? Number(opts['--limit']) : 200 }) : nativeGraphObservations(root);
  else if (action === 'graph-ingest') {
    const pieces = []; let size = 0, count; const buffer = Buffer.alloc(65536);
    while ((count = readSync(0, buffer, 0, buffer.length, null)) > 0) { size += count; if (size > 1024 * 1024) throw Error('event input limit'); pieces.push(Buffer.from(buffer.subarray(0, count))); }
    const raw = Buffer.concat(pieces).toString('utf8');
    result = observeNativeGraphHook({ root, host: opts['--host'], event: JSON.parse(raw) });
  } else if (['preview','publish'].includes(action)) {
    const request = { root, taskId, base: opts['--base'] || 'main', allow: opts['--allow'] ? opts['--allow'].split(',') : null };
    result = action === 'preview' ? previewPublication(request) : publishPublication({ ...request,
      expectedRevision: Number(opts['--revision']), approval: opts['--approval'], confirm: opts['--confirm'] });
  } else if (action === 'metrics') {
    const listing = listWorkTasks(root); if (listing.state === 'degraded') throw Error('task source is degraded; measurements refused');
    const current = measureWork(listing.tasks), baseline = opts['--baseline'] ? readOutcomeEvidence(root, opts['--baseline']).document : null;
    result = { ...current, comparison: compareWork(current, baseline) };
  } else if (action === 'decisions') result = decisionCapabilities(readWorkTask(taskId, { root }));
  else if (action === 'approve') result = approveWorkDecision({ root, taskId, decisionId: opts['--decision'], expectedRevision: Number(opts['--revision']), operationId: opts['--operation'] });
  else if (['verify','complete'].includes(action)) result = applyOutcome({ root, taskId, kind: action, expectedRevision: Number(opts['--revision']), operationId: opts['--operation'], evidenceFile: opts['--evidence'] });
  else throw Error('usage: great-cto task work decisions|approve|verify|complete|metrics|preview|publish|graph-audit|graph-enable|graph-disable|graph-bind|graph-unbind|graph-ingest|graph-read --dir PATH [--task UUID --revision N --operation UUID --decision ID --evidence EXTERNAL_FILE --baseline EXTERNAL_FILE --base BRANCH --allow PATHS --approval DIGEST --confirm publish-draft-pr]');
  console.log(JSON.stringify(result, null, 2));
} catch (e) { console.error('work-task: ' + e.message); process.exitCode = 2; }
