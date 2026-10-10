import {createHash,randomBytes} from 'node:crypto';
import {scenarios} from './adaptive-benchmark-protocol.mjs';
export function migrationSafetyBenchmarkFixture(){
 const files={'.gitignore':'.great_cto/\n','.great_cto/PROJECT.md':'archetype: web-service\npacks: [api-platform-pack]\n',
  'package.json':'{"name":"migration-safety-benchmark","private":true,"type":"module"}\n',
  'contracts/schema.sql':'CREATE TABLE accounts(id integer PRIMARY KEY, amount integer NOT NULL);\n',
  'README.md':`# Backward-compatible migration plan

Repair migrations/plan.json. A trusted operator translates this bounded declarative
plan to PostgreSQL statements; candidate SQL or code is never executed. Preserve
legacy id/amount readers, add nullable display_name, rollback only that addition
without deleting rows, set finite lock and statement deadlines, retain read-only
reader and non-superuser/non-createdb/non-createrole migrator. Plan fields are fixed:
version:1; expand:{preserveLegacy:boolean,nullable:boolean}; rollback:{removeAdded:
boolean,preserveRows:boolean}; timeouts:{lockMs:integer0..1000,statementMs:integer0..2000};
privileges:{readerWrite:boolean,migratorSuperuser:boolean}. Unknown keys/types refused.
Use lockMs100 and statementMs1000 for the reference repair. No production database,
credentials, deployment, SQL extensions or arbitrary migration syntax are supplied.
`,
  'migrations/plan.json':JSON.stringify({version:1,expand:{preserveLegacy:false,nullable:true},rollback:{removeAdded:false,preserveRows:false},timeouts:{lockMs:0,statementMs:0},privileges:{readerWrite:true,migratorSuperuser:true}})+'\n'};
 const scenario=scenarios.find(s=>s.id==='migration-safety'),sha=x=>createHash('sha256').update(x).digest('hex');
 return {files,oracle:{version:1,scenario:scenario.id,criteria:scenario.checks,rows:[{id:1,amount:0},{id:2,amount:1+randomBytes(2).readUInt16BE()}],
  baseline:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)])),protected:Object.keys(files).filter(n=>n!=='migrations/plan.json')}};
}
