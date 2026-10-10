import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {scenarios} from './adaptive-benchmark-protocol.mjs';
export function boardAccessibilityBenchmarkFixture(){
 const sha=x=>createHash('sha256').update(x).digest('hex'),target='decision-'+randomBytes(8).toString('hex');
 const files={'.gitignore':'.great_cto/\n','.great_cto/PROJECT.md':'archetype: web-service\n',
  'package.json':'{"name":"board-accessibility-benchmark","private":true,"type":"module"}\n',
  'contracts/decision.json':JSON.stringify({target,actions:['approve','reject']})+'\n',
  'README.md':`# Accessible decision board repair

Repair web/board.html, actual markup and CSS. Native keyboard navigation must reach
nav-decisions, activate its #decisions destination, then reach approve/reject in
logical order with visible focus. Enter and Space activate both controls. Keep both
controls visible and within narrow viewport; do not hide overflow as a repair.
Both action targets must match protected contracts/decision.json. No console errors.
Scripts, inline handlers, frames, forms, meta refresh, foreign link destinations,
downloads and navigation targets are not admitted. CSP blocks candidate script
execution. CSS and static DOM are the repair surface, not a synthetic policy.
The operator attaches a fixed local-only recorder to native trusted clicks; it
does not approve any real task or call a provider/backend. External resources are
blocked by CSP/request routing. Keep project/contract/package/docs untouched.
`,
  'web/board.html':`<!doctype html><html><head><style>
body{margin:0;padding:24px;background:white;color:#111;font:16px sans-serif}main{min-width:960px}
.actions{display:flex;gap:16px;flex-wrap:nowrap}.control{width:160px;flex-shrink:0;height:48px;padding:8px;box-sizing:border-box}
*:focus{outline:none}
</style></head><body><main><nav><a id="nav-decisions" href="#decisions" tabindex="-1">Decisions</a></nav>
<section id="decisions" tabindex="-1"><h1>Decision review</h1><div class="actions">
<div class="control" id="approve" role="button" tabindex="0" data-target="wrong-target">Approve</div>
<div class="control" id="reject" role="button" tabindex="0" data-target="wrong-target">Reject</div>
</div></section><img src="https://example.invalid/missing-icon.png" alt=""></main></body></html>\n`};
 const scenario=scenarios.find(s=>s.id==='board-accessibility');
 let browser;try{const require=createRequire(import.meta.url),entry=realpathSync(require.resolve('playwright'));
  browser={entry,entrySha256:sha(readFileSync(entry))};}catch{browser=null;}
 return {files,oracle:{version:1,scenario:scenario.id,criteria:scenario.checks,target,
  viewports:[{width:320,height:640},{width:375,height:720},{width:1280,height:800}],browser,
  baseline:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)])),protected:Object.keys(files).filter(n=>n!=='web/board.html')}};
}
