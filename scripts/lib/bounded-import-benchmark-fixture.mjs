import { createHash, randomBytes } from 'node:crypto';
import { scenarios } from './adaptive-benchmark-protocol.mjs';

/** Real executable repair surface; operator-only sequences never enter files. */
export function boundedImportBenchmarkFixture() {
  const files = {
    '.gitignore': '.great_cto/\n', '.great_cto/PROJECT.md': 'archetype: data-platform\n',
    'package.json': '{"name":"bounded-import-benchmark","private":true,"type":"module"}\n',
    'README.md': `# Historical importer repair

Repair src/import/history.mjs. Export async run({state,input,dryRun,rollbackToken}).
State is {rows:[],imports:[],revision:0}; imports stores applied batch IDs.
Input is {batchId,from,sources:[{name,coveredTo}],rows:[{id,source,time,value}]}.
Validate BEFORE any change, including dry-run: batchId/name/id nonempty strings;
from/time/coveredTo nonnegative safe integers; sources nonempty, at most100, with unique names
and coveredTo >= from; rows an array of at most100 entries with unique IDs, known
source, time in [from, that source's coveredTo], finite numeric value (null and
numeric strings are invalid). Invalid input returns {status:'invalid'} unchanged.
For valid input coveredTo is MINIMUM across all sources. Replace only the inclusive
[from,coveredTo] range; retain local rows outside it, and do not import rows beyond
that common coveredTo. Preserve values, including zero. Sort rows by time then id.
dryRun returns {status:'preview',coveredTo} without mutation. Apply returns
{status:'applied',coveredTo,rollbackToken}, increments revision once, and records
batchId once. A repeated batch returns {status:'duplicate',coveredTo} unchanged.
The token is a snapshot of the prior state; run({state,rollbackToken}) must restore
rows/imports/revision exactly and return {status:'rolled-back'}. It is operator-owned
in-memory state, not an untrusted network token. Reapply after rollback must work.
No real database, external source, production history or credentials are supplied.
`,
    'src/import/history.mjs': `export async function run({state,input,dryRun,rollbackToken}) {
 if(rollbackToken)return {status:'rolled-back'};
 state.rows=input.rows;state.imports.push(input.batchId);state.revision++;
 return {status:dryRun?'preview':'applied',coveredTo:Math.max(...input.sources.map(s=>s.coveredTo))};
}\n`,
  };
  const suffix=randomBytes(8).toString('hex'), id=n=>n+'-'+suffix;
  const row=(name,time,value=12,source='a')=>({id:id(name),source:id(source),time,value});
  const initial={rows:[row('old',90),row('replace-left',100),row('replace-mid',140),
    row('newer',151),row('source-a-tail',180),row('future',200)],imports:[],revision:0};
  const input={batchId:id('batch'),from:100,sources:[{name:id('a'),coveredTo:180},{name:id('b'),coveredTo:150}],
    rows:[row('new-left',100,0),row('new-right',150,42,'b'),row('not-common',160,7)]};
  const applied={rows:[...initial.rows.filter(r=>r.time<100||r.time>150),...input.rows.filter(r=>r.time<=150)]
    .sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)),imports:[input.batchId],revision:1};
  const bad=[];
  for(const kind of ['null-value','string-value','missing-coverage','empty-sources','duplicate-source','duplicate-id','unknown-source','outside-coverage','oversized','string-coverage','invalid-from','fractional-time','empty-batch']){
    const x=structuredClone(input);
    if(kind==='null-value')x.rows[0].value=null;
    if(kind==='string-value')x.rows[0].value='0';
    if(kind==='missing-coverage')delete x.sources[1].coveredTo;
    if(kind==='empty-sources')x.sources=[];
    if(kind==='duplicate-source')x.sources[1].name=x.sources[0].name;
    if(kind==='duplicate-id')x.rows[1].id=x.rows[0].id;
    if(kind==='unknown-source')x.rows[0].source=id('missing');
    if(kind==='outside-coverage')x.rows[0].time=181;
    if(kind==='oversized')x.rows=Array.from({length:101},(_,i)=>row('many'+i,100));
    if(kind==='string-coverage')x.sources[1].coveredTo='150';
    if(kind==='invalid-from')x.from=-1;
    if(kind==='fractional-time')x.rows[0].time=100.5;
    if(kind==='empty-batch')x.batchId='';
    bad.push({input:x,dryRun:false,expected:{status:'invalid'},state:initial});
  }
  const apply={input,dryRun:false,expected:{status:'applied',coveredTo:150},state:applied};
  const groups=[
    {kind:'invalid',initial,steps:bad},
    {kind:'dry-run',initial,steps:[{input,dryRun:true,expected:{status:'preview',coveredTo:150},state:initial},
      {input:bad[0].input,dryRun:true,expected:{status:'invalid'},state:initial}]},
    {kind:'bounded',initial,steps:[apply]},
    {kind:'repeat',initial,steps:[apply,{input,dryRun:false,expected:{status:'duplicate',coveredTo:150},state:applied}]},
    {kind:'rollback',initial,steps:[apply,{rollback:true,expected:{status:'rolled-back'},state:initial},apply]},
  ];
  const sha=x=>createHash('sha256').update(x).digest('hex'), scenario=scenarios.find(s=>s.id==='bounded-import');
  return {files,oracle:{version:1,scenario:scenario.id,criteria:scenario.checks,groups,
    baseline:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha(bytes)])),
    protected:Object.keys(files).filter(n=>n!=='src/import/history.mjs')}};
}
