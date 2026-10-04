import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,linkSync,symlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {boardAccessibilityBenchmarkFixture} from '../../scripts/lib/board-accessibility-benchmark-fixture.mjs';
import {observeBoard,loadPinnedBoardBrowser} from '../../scripts/benchmark-scorers/board-accessibility.mjs';
import {runPinnedBenchmarkScorer} from '../../scripts/lib/pinned-benchmark-scorer.mjs';
import {treeReceipt} from '../../scripts/lib/receipt.mjs';
import {specialistPlan} from '../../scripts/lib/specialist-plan.mjs';
import {RULES} from '../../scripts/hooks/auto-attach-reviewers.mjs';
const scorer=readFileSync(new URL('../../scripts/benchmark-scorers/board-accessibility.mjs',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'board-benchmark-')));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const root=join(temp,'candidate'),operator=join(temp,'operator');mkdirSync(root);mkdirSync(operator,{mode:0o700});
 const recipe=boardAccessibilityBenchmarkFixture(),put=(n,b)=>{mkdirSync(dirname(join(root,n)),{recursive:true});writeFileSync(join(root,n),b);};
 for(const [n,b]of Object.entries(recipe.files))put(n,b);
 const git=args=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgsign=false',...args],{encoding:'utf8'});
 git(['init','-q']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','defective boundary']);
 const scorerFile=join(operator,'scorer.mjs'),oracleFile=join(operator,'oracle.json');writeFileSync(scorerFile,scorer,{mode:0o600});writeFileSync(oracleFile,JSON.stringify(recipe.oracle),{mode:0o600});
 const options={root,scorerFile,oracleFile,scorerSha256:sha(scorer),oracleSha256:sha(readFileSync(oracleFile))};
 return {root,operator,recipe,put,base:git(['rev-parse','HEAD']).trim(),score:()=>runPinnedBenchmarkScorer({...options,expectedReceipt:treeReceipt(root),timeoutMs:30000,stageDiagnostics:true}),setOracle:o=>{
  writeFileSync(oracleFile,JSON.stringify(o));options.oracleSha256=sha(readFileSync(oracleFile));
 }};
}


function repair(f){return f.recipe.files['web/board.html']
 .replace('min-width:960px','min-width:0').replace('flex-wrap:nowrap','flex-wrap:wrap')
 .replace('*:focus{outline:none}','*:focus-visible{outline:3px solid #0968ff;outline-offset:2px}')
 .replace('tabindex="-1">Decisions','tabindex="0">Decisions')
 .replaceAll('wrong-target',f.recipe.oracle.target)
 .replace(/<div class="control"([^>]+)>(Approve|Reject)<\/div>/g,'<button class="control" type="button"$1>$2</button>')
 .replace(/<img[^>]+>/g,'');}
let browserAvailable=false;try{const r=boardAccessibilityBenchmarkFixture();const chromium=await loadPinnedBoardBrowser(r.oracle.browser,'/tmp');const b=await chromium.launch({headless:true,timeout:5000});await b.close();browserAvailable=true;}catch{}
const browser={skip:browserAvailable?false:'Chromium/Playwright unavailable; browser NOT CHECKED'};
test('actual Chromium baseline fails4; HTML/CSS repair passes external pinned observer',browser,t=>{
 const f=fixture(t);assert.deepEqual(f.score().criteria.map(c=>c.state),['failed','failed','failed','failed']);
 f.put('web/board.html',repair(f));const before=treeReceipt(f.root),result=f.score();
 assert.equal(result.accepted,true);assert.equal(result.benchmarkEligible,false);assert.notEqual(result.process.pid,process.pid);assert.deepEqual(treeReceipt(f.root),before);
 assert.ok(!JSON.stringify(result).includes(f.recipe.oracle.target));
 const plan=specialistPlan({root:f.root,base:f.base,rules:RULES});assert.equal(plan.state,'planned');assert.equal(plan.assessment.tier,'T1');
 for(const role of ['design-advisor','code-reviewer','qa-engineer','security-officer'])assert.ok(plan.reviewers.some(r=>r.agent===role),role);
});
for(const [mutation,index]of [['nav-unreachable',0],['non-native',0],['focus-hidden',0],['overflow',1],['no-wrap',1],['wrong-target',2],['hide-control',2],['console-error',3]]){
 test('browser behavior refuses '+mutation,browser,t=>{
 const f=fixture(t);let html=repair(f);
 if(mutation==='nav-unreachable')html=html.replace('tabindex="0">Decisions','tabindex="-1">Decisions');
 if(mutation==='non-native')html=html.replaceAll('<button','<div').replaceAll('</button>','</div>');
 if(mutation==='focus-hidden')html=html.replace('outline:3px solid #0968ff','outline:none');
 if(mutation==='overflow')html=html.replace('min-width:0','min-width:960px');
 if(mutation==='no-wrap')html=html.replace('flex-wrap:wrap','flex-wrap:nowrap');
 if(mutation==='wrong-target')html=html.replaceAll(f.recipe.oracle.target,'other-decision');
 if(mutation==='hide-control')html=html.replace('</style>','#reject{display:none}</style>');
 if(mutation==='console-error')html=html.replace('</main>','<img src="https://example.invalid/missing.png" alt=""></main>');
 f.put('web/board.html',html);const result=f.score();assert.equal(result.accepted,false);assert.equal(result.criteria[index].state,'failed');
 t.diagnostic(mutation+': stage timings '+JSON.stringify(result.stageTimings));
 });
}
for(const mutation of ['script','meta-refresh','inline-handler','foreign-navigation','project-drift','contract-drift','extra-source','hardlink','symlink','oversized']){
 test('board admission and protected inputs refuse '+mutation,t=>{
 const f=fixture(t);let html=repair(f);
 if(mutation==='script')html+='<script>throw Error("never execute")</script>';
 if(mutation==='meta-refresh')html+='<meta http-equiv="refresh" content="0;url=file:///etc/passwd">';
 if(mutation==='inline-handler')html=html.replace('id="approve"','id="approve" onclick="fetch(1)"');
 if(mutation==='foreign-navigation')html=html.replace('href="#decisions"','href="file:///etc/passwd"');
 f.put('web/board.html',html);
 if(mutation==='project-drift')f.put('.great_cto/PROJECT.md','archetype: greenfield\n');
 if(mutation==='contract-drift')f.put('contracts/decision.json','{}\n');
 if(mutation==='extra-source')f.put('web/script.js','throw Error("never execute");');
 if(mutation==='hardlink')linkSync(join(f.root,'web/board.html'),join(f.operator,'alias'));
 if(mutation==='symlink'){rmSync(join(f.root,'web/board.html'));symlinkSync(join(f.operator,'missing'),join(f.root,'web/board.html'));}
 if(mutation==='oversized')f.put('web/board.html','x'.repeat(65537));
 if(['inline-handler','foreign-navigation'].includes(mutation)&&!browserAvailable)return t.skip('browser unavailable; DOM admission NOT CHECKED');
 if(mutation==='symlink')assert.throws(()=>f.score(),/candidate receipt differs before scoring/);else assert.equal(f.score().accepted,false);
 });
}
for(const mutation of ['lost-small-viewport','changed-target','lost-protection','changed-browser-pin']){
 test('board oracle refuses '+mutation,t=>{
 const f=fixture(t),o=structuredClone(f.recipe.oracle);f.put('web/board.html',repair(f));
 if(mutation==='lost-small-viewport')o.viewports.shift();
 if(mutation==='changed-target')o.target='forged';
 if(mutation==='lost-protection')o.protected=[];
 if(mutation==='changed-browser-pin'){if(!o.browser)return t.skip('browser entry unavailable');o.browser.entrySha256='0'.repeat(64);}
 f.setOracle(o);assert.throws(()=>f.score(),/pinned scorer process did not complete/);
 });
}
test('resource is blocked and candidate handlers never execute',browser,async t=>{
 const f=fixture(t),html=repair(f).replace('</main>','<img src="https://example.invalid/private.png"></main>');
 const result=await observeBoard(html,f.recipe.oracle,f.root);assert.equal(result.admitted,true);assert.equal(result.passed[3],false);assert.equal(result.requestCount,0);
 const unsafe=await observeBoard(repair(f)+'<script>fetch("https://example.invalid/")</script>',f.recipe.oracle,f.root);
 assert.equal(unsafe.admitted,false);assert.deepEqual(unsafe.passed,[false,false,false,false]);
});
