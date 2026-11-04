#!/usr/bin/env node
// Turn the gate's CTRF reports into Allure result files, so Allure 3 can draw
// one report over every suite and `allure quality-gate` can decide pass/fail.
//
// node:test has no Allure reporter; the gate already writes CTRF
// (scripts/lib/ctrf-reporter.mjs), one file per suite. Each CTRF test becomes
// one `<uuid>-result.json`. The mapping keeps what CTRF refuses to blur: a
// skipped test stays `skipped`, a todo is `skipped` with its reason, a failure
// keeps its message and trace. The suite (CTRF tool.name) becomes the Allure
// parentSuite, the file the suite, a describe block the subSuite.
//
//   node scripts/ctrf-to-allure.mjs <out-dir> <report.ctrf.json>...
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isMainModule } from './lib/is-main.mjs';

const STATUS = { passed: 'passed', failed: 'failed', skipped: 'skipped', pending: 'skipped', other: 'broken' };

/** Allure result objects for one CTRF document. */
export function toAllure(ctrf) {
  const suite = ctrf.results?.tool?.name || 'gate';
  return (ctrf.results?.tests || []).map((t) => {
    const file = t.filePath ? path.basename(t.filePath) : 'unknown file';
    const fullName = `${suite} › ${file} › ${t.suite ? `${t.suite} › ` : ''}${t.name}`;
    const stop = t.stop ?? (t.start ?? 0) + (t.duration ?? 0);
    const labels = [{ name: 'parentSuite', value: suite }, { name: 'suite', value: file }];
    if (t.suite) labels.push({ name: 'subSuite', value: t.suite });
    if (t.status === 'pending') labels.push({ name: 'tag', value: 'todo' });
    return {
      uuid: crypto.randomUUID(),
      historyId: crypto.createHash('sha256').update(fullName).digest('hex').slice(0, 32),
      name: t.name,
      fullName,
      status: STATUS[t.status] || 'broken',
      statusDetails: t.message || t.trace ? { message: t.message, trace: t.trace } : undefined,
      stage: 'finished',
      start: t.start ?? stop - (t.duration ?? 0),
      stop,
      labels,
    };
  });
}

function main(argv) {
  const [out, ...reports] = argv;
  if (!out || !reports.length) { console.error('usage: ctrf-to-allure.mjs <out-dir> <report.ctrf.json>...'); return 64; }
  fs.mkdirSync(out, { recursive: true });
  let n = 0;
  for (const file of reports) {
    for (const r of toAllure(JSON.parse(fs.readFileSync(file, 'utf8')))) {
      fs.writeFileSync(path.join(out, `${r.uuid}-result.json`), JSON.stringify(r));
      n++;
    }
  }
  console.log(`ctrf-to-allure: ${n} results from ${reports.length} report(s) → ${out}`);
  return n ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2));
