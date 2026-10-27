#!/usr/bin/env node
// How often did a stage name what the graph says it produces? (ADR-039 rule 2)
//
//   node scripts/edge-contract-adherence.mjs [--since YYYY-MM-DD] <project-dir>...
//
// Reads each project's .great_cto/verdicts/*.log, read-only. For every successful
// verdict of a stage that declares `produces` in shared/pipeline.toml: was each key
// named (a receipt by its files), and does a named path exist? Prints counts per
// stage only — never a project name or a path — so the output can be quoted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePipelineToml } from './lib/pipeline-toml.mjs';
import { parseVerdictLog } from './lib/verdict-record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const i = args.indexOf('--since');
const since = i >= 0 ? args.splice(i, 2)[1] : '';
if (!args.length) { console.error('usage: edge-contract-adherence.mjs [--since YYYY-MM-DD] <project-dir>...'); process.exit(2); }
const graph = parsePipelineToml(fs.readFileSync(path.join(ROOT, 'shared', 'pipeline.toml'), 'utf8'));

const rows = {};
let projects = 0;
for (const dir of args) {
  let counted = false;
  for (const [stage, rule] of Object.entries(graph)) {
    if (!rule.produces?.length) continue;
    const agent = stage.split('.')[0];
    let text;
    try { text = fs.readFileSync(path.join(dir, '.great_cto', 'verdicts', `${agent}.log`), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }   // an unreadable log is an error, not "no runs"
    for (const v of parseVerdictLog(text).records) {
      if (!(rule.on || []).includes(String(v.verdict).toUpperCase()) || String(v.ts) < since) continue;
      counted = true;
      const r = rows[stage] ??= { runs: 0, met: 0, unnamed: 0, missing: 0 };
      r.runs++;
      let state = 'met';
      for (const key of rule.produces) {
        const val = key === 'receipt' ? (Object.keys(v.receipt?.files || {}).length ? 'receipt' : '') : v.meta?.[key];
        if (!val) { state = 'unnamed'; break; }
        if (typeof val === 'string' && val.includes('/') && !fs.existsSync(path.resolve(dir, val))) { state = 'missing'; break; }
      }
      r[state]++;
    }
  }
  if (counted) projects++;
}
console.log(`projects with matching verdicts: ${projects}${since ? ` · since ${since}` : ''}`);
for (const [stage, r] of Object.entries(rows).sort()) {
  console.log(`  ${stage.padEnd(24)} ${r.met}/${r.runs} met · ${r.unnamed} unnamed · ${r.missing} named a path that does not exist`);
}
