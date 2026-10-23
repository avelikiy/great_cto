import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';
import { conditionalGraphProposal } from '../../scripts/lib/conditional-graph-proposal.mjs';

test('actual stored-run API renders review evidence and rejects a changed synthetic snapshot', { timeout:120000 }, async()=>{
  // A sticky temporary ancestor cannot establish the reader's trust boundary.
  const trustedHome = fs.realpathSync(os.homedir());
  const dir = fs.mkdtempSync(path.join(trustedHome,'.gcto-bound-browser-api-'));
  fs.chmodSync(dir,0o700);
  const root = path.join(dir,FIXTURE_NAME), home = path.join(dir,'home'), store = path.join(dir,'store');
  fs.mkdirSync(root,{mode:0o700}); fs.mkdirSync(home,{mode:0o700}); fs.mkdirSync(store,{mode:0o700});
  buildFixture(root);
  const policy = 'archetype: devtools\napproval-level: gates-only\n';
  const projectFile = path.join(root,'.great_cto','PROJECT.md');
  fs.writeFileSync(projectFile,policy,{mode:0o600});
  commitFixture(root);
  fs.mkdirSync(path.join(home,'.great_cto'),{mode:0o700});
  const registryFile = path.join(home,'.great_cto','projects.json');
  fs.writeFileSync(registryFile,JSON.stringify({projects:[{slug:FIXTURE_NAME,path:root}]}),{mode:0o600});
  const sha = value => createHash('sha256').update(value).digest('hex');
  const runId = '12345678-1234-1234-1234-123456789abc', base = 'a'.repeat(40), fingerprint = 'b'.repeat(64);
  const roles = ['code-reviewer','qa-engineer','security-officer'];
  const plan = {
    version:1,state:'planned',advisory:true,planningOnly:false,reusablePass:false,fingerprint,
    scope:'whole Git-visible tree plus project declaration; ignored runtime inputs not attested',
    assessment:{known:true,tier:'T1',base,fingerprint:'c'.repeat(64),files:['src/view.ts'],reasons:['auto:T1:behavioral(1)'],escalatedFromLabel:null},
    reviewers:roles.map(agent=>({agent,reasons:['mandatory independent delivery review'],files:[]})),
  };
  const state = {
    version:1,id:runId,root,
    specialistPolicy:{mode:'adaptive',workflow:'existing-change',base,contracts:[],projectDigest:sha(policy)},
    specialistReview:{roles,fingerprint,plan,hardGates:['gate:ship'],reusablePass:false},
    hostRoutes:{'qa-engineer':'claude-code'},prompt:'PRIVATE_REAL_API_PROMPT_CANARY',token:'PRIVATE_REAL_API_TOKEN_CANARY',
  };
  const stateFile = path.join(store,`${runId}.json`), original = JSON.stringify(state);
  fs.writeFileSync(stateFile,original,{mode:0o600});
  assert.equal(fs.statSync(store).mode & 0o777,0o700);
  assert.equal(fs.statSync(stateFile).mode & 0o777,0o600);
  let server,browser;
  try {
    server=await startServerOnFreePort({entry:path.resolve('packages/board/server.mjs'),cwd:root,portEnv:'PORT',env:{HOME:home,GREAT_CTO_PROJECTS_FILE:registryFile,GREAT_CTO_CODEX_RUNS_DIR:store,GREAT_CTO_NO_UPDATE_CHECK:'1'}});
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1440,height:1100}}),requests=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/focus-run-'))requests.push(request.url());});
    await page.goto(`http://127.0.0.1:${server.port}/?project=${FIXTURE_NAME}&host=codex#/settings/executors`);
    await page.waitForFunction(slug=>currentProject===slug,FIXTURE_NAME);
    await page.waitForFunction(()=>fleetState.registry&&fleetState.registryScope===pqs()&&!fleetState.registryLoading);
    await page.getByRole('button',{name:'Mental Care',exact:true}).click();
    await page.getByLabel('Controlled run UUID',{exact:true}).fill(runId);
    await page.getByLabel('Snapshot phase',{exact:true}).selectOption('review');
    assert.equal(requests.length,0);
    const [bindingResponse] = await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/focus-run-binding'),
      page.getByRole('button',{name:'Load snapshot',exact:true}).click(),
    ]);
    assert.equal(bindingResponse.status(),200);
    assert.equal(bindingResponse.headers()['cache-control'],'no-store');
    const descriptor=await bindingResponse.json();
    assert.equal(descriptor.state,'available');
    assert.equal(descriptor.binding.snapshotDigest,sha(original));
    assert.equal(descriptor.binding.policyDigest,sha(policy));
    assert.equal(descriptor.controller,'codex');
    await page.getByRole('button',{name:'Inspect stored proposal',exact:true}).waitFor();
    assert.equal(requests.length,1,'loading descriptor must not inspect automatically');
    const [proposalResponse] = await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/focus-run-proposal'),
      page.getByRole('button',{name:'Inspect stored proposal',exact:true}).click(),
    ]);
    assert.equal(proposalResponse.status(),200);
    const inspected=await proposalResponse.json();
    assert.equal(inspected.state,'available');
    assert.equal(inspected.provenance,'stored-snapshot');
    assert.equal(inspected.currentTreeAssessment,false);assert.equal(inspected.reusablePass,false);
    assert.equal(inspected.advisory,true);assert.equal(inspected.changesExecution,false);
    assert.deepEqual(inspected.binding,descriptor.binding);
    assert.equal(inspected.proposal.assessmentState,'known');
    await page.getByText('Stored proposal loaded.',{exact:true}).waitFor();
    assert(await page.locator('#bound-run-graph li').count()>0);
    for(const role of roles)assert.match(await page.locator('#bound-run-graph').innerText(),new RegExp(role));
    assert.match(await page.locator('#bound-run-descriptor').innerText(),/Controlled Codex/);
    assert.match(await page.locator('#bound-run-graph').innerText(),/not revalidated against the current working tree/);
    assert.doesNotMatch(await page.locator('body').innerHTML(),/PRIVATE_REAL_API_(?:PROMPT|TOKEN)_CANARY/);
    assert.equal(fs.readFileSync(stateFile,'utf8'),original,'inspection is read-only');
    if(process.env.GREAT_CTO_BOUND_UI_EVIDENCE_DIR){
      const evidence=fs.realpathSync(process.env.GREAT_CTO_BOUND_UI_EVIDENCE_DIR);
      assert.equal(fs.statSync(evidence).mode & 0o777,0o700);
      await page.setViewportSize({width:1440,height:2400});
      await page.locator('#bound-run-panel').screenshot({path:path.join(evidence,'stored-review-proposal.png')});
      await page.setViewportSize({width:1440,height:1100});
    }
    state.status='PRIVATE_REAL_API_MUTATION_CANARY';
    fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
    const [changedResponse] = await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/focus-run-proposal'),
      page.getByRole('button',{name:'Inspect stored proposal',exact:true}).click(),
    ]);
    assert.equal(changedResponse.status(),409);
    const changed=await changedResponse.json();
    assert.equal(changed.binding,null);assert.equal(changed.proposal,null);assert.equal(changed.reason,'snapshot-changed');
    await page.getByText('Stored snapshot changed. Load the snapshot again before inspecting its proposal.',{exact:true}).waitFor();
    assert.equal(await page.locator('#bound-run-descriptor').innerHTML(),'');
    assert.equal(await page.locator('#bound-run-graph li').count(),0);
    assert.equal(requests.length,3,'409 must not trigger an automatic read or retry');
    assert.equal(fs.readFileSync(projectFile,'utf8'),policy);
    assert.doesNotMatch(await page.locator('body').innerHTML(),/PRIVATE_REAL_API_(?:PROMPT|TOKEN|MUTATION)_CANARY/);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();if(server)await reapAndClean(server.proc,dir);else fs.rmSync(dir,{recursive:true,force:true});}
});

test('stored snapshot controls inspect explicit envelopes with keyboard, privacy and race fences', { timeout:120000 }, async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gcto-bound-browser-'));
  const root=path.join(tmp,FIXTURE_NAME),home=path.join(tmp,'home');
  fs.mkdirSync(root);buildFixture(root);commitFixture(root);
  fs.mkdirSync(path.join(home,'.great_cto'),{recursive:true});
  const registry=path.join(home,'.great_cto','projects.json');
  fs.writeFileSync(registry,JSON.stringify({projects:[{slug:FIXTURE_NAME,path:root}]}));
  const run='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',binding={snapshotDigest:'a'.repeat(64),epochDigest:'b'.repeat(64),planFingerprint:'c'.repeat(64),base:'d'.repeat(40),policyDigest:'e'.repeat(64)};
  const plan={version:1,state:'planned',advisory:true,planningOnly:false,reusablePass:false,scope:'whole Git-visible tree plus project declaration; ignored runtime inputs not attested',fingerprint:binding.planFingerprint,assessment:{known:true,tier:'T1',base:binding.base,fingerprint:'f'.repeat(64),files:['src/view.ts'],reasons:['auto:T1:behavioral(1)'],escalatedFromLabel:null},reviewers:['code-reviewer','qa-engineer','security-officer'].map(agent=>({agent,reasons:['mandatory independent delivery review'],files:[]}))};
  let server,browser;
  try {
    server=await startServerOnFreePort({entry:path.resolve('packages/board/server.mjs'),cwd:root,portEnv:'PORT',env:{HOME:home,GREAT_CTO_PROJECTS_FILE:registry,GREAT_CTO_NO_UPDATE_CHECK:'1'}});
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.port}/?project=${FIXTURE_NAME}&host=codex#/settings/executors`);
    await page.waitForFunction(slug=>currentProject===slug,FIXTURE_NAME);
    await page.waitForFunction(()=>fleetState.registry&&fleetState.registryScope===pqs()&&!fleetState.registryLoading);
    const projectId=await page.evaluate(()=>fleetState.projectId);
    const descriptor=phase=>({schemaVersion:1,kind:'controlled-run-proposal-binding',state:'available',projectId,controller:'codex',runId:run,phase,binding:{...binding},provenance:'stored-snapshot',currentTreeAssessment:false,reusablePass:false});
    const inspection=()=>({...descriptor('review'),kind:'controlled-run-proposal-inspection',focusId:'mental-care',registryVersion:1,advisory:true,changesExecution:false,proposal:conditionalGraphProposal({focusId:'mental-care',host:'codex',base:binding.base,requiredGates:['ship'],plan}),limitations:['stored-snapshot-not-revalidated','content-identity-not-historical-epoch','proposal-not-execution-evidence']});
    let status=200,response=null,delayed=null;
    await page.route('**/api/focus-run-*',async route=>{
      const url=new URL(route.request().url());requests.push(url);
      if(delayed){const barrier=delayed;delayed=null;await barrier;}
      const data=response|| (url.pathname.endsWith('binding')?descriptor(url.searchParams.get('phase')):inspection());
      await route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(data)});
    });
    const uuid=page.getByLabel('Controlled run UUID',{exact:true}),phase=page.getByLabel('Snapshot phase',{exact:true});
    const load=page.getByRole('button',{name:'Load snapshot',exact:true}),inspect=page.getByRole('button',{name:'Inspect stored proposal',exact:true});
    await load.click();assert.equal(requests.length,0);assert.equal(await uuid.getAttribute('aria-invalid'),'true',await page.locator('#bound-run-status').innerText());assert.equal(await uuid.evaluate(el=>el===document.activeElement),true);
    await uuid.fill(run);await phase.selectOption('preparation');assert.equal(requests.length,0);
    await load.focus();await load.press('Enter');await page.getByText('Planning snapshot: graph unavailable under projector v1.',{exact:true}).waitFor();
    assert.equal(requests.length,1);assert.equal(await page.locator('#bound-run-inspect').count(),1);assert.equal(await page.locator('#bound-run-inspect').isVisible(),false);
    await page.locator('#bound-run-descriptor summary').click();assert.match(await page.locator('#bound-run-descriptor').innerText(),new RegExp(binding.snapshotDigest));
    await phase.selectOption('review');assert.equal(await page.locator('#bound-run-descriptor').innerHTML(),'');assert.equal(requests.length,1);
    await page.getByRole('button',{name:'Mental Care',exact:true}).click();
    await load.click();await inspect.waitFor();assert.equal(requests.length,2);
    await inspect.focus();await inspect.press('Enter');await page.getByText('Stored proposal loaded.',{exact:true}).waitFor();
    assert.equal(requests.length,3);assert.equal(requests[2].searchParams.get('snapshot'),binding.snapshotDigest);assert.equal(requests[2].searchParams.has('host'),false);
    assert.match(await page.locator('#bound-run-graph').innerText(),/not revalidated against the current working tree/);
    assert.match(await page.locator('#bound-run-graph').innerText(),/not an approval or reusable PASS/);
    assert(await page.locator('#bound-run-graph li').count()>0);
    assert.equal(await inspect.evaluate(el=>el===document.activeElement),true);
    for(const theme of ['dark','light']){
      await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
      const contrast=await uuid.evaluate(el=>{
        const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
        const luminance=value=>rgb(value).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
        const style=getComputedStyle(el);el.focus();const focused=getComputedStyle(el);
        return {text:ratio(style.color,style.backgroundColor),focus:ratio(focused.outlineColor,focused.backgroundColor)};
      });
      assert(contrast.text>=4.5,`${theme} actual text contrast ${contrast.text}`);assert(contrast.focus>=3,`${theme} actual focus contrast ${contrast.focus}`);
      for(const width of [320,375,768,1024,1440]){
        await page.setViewportSize({width,height:1000});assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,`${theme}/${width} overflow`);
        if(width<=375){assert((await uuid.boundingBox()).height>=44);assert((await phase.boundingBox()).height>=44);assert((await inspect.boundingBox()).height>=44);}
      }
    }
    await page.setViewportSize({width:320,height:1000});
    await page.locator('#bound-run-panel').evaluate(el=>el.style.fontSize='200%');
    assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>document.documentElement.style.zoom='4');
    assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,'400% zoom reflows');
    await page.evaluate(()=>document.documentElement.style.zoom='');
    await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
    await uuid.focus();assert.equal(await uuid.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.emulateMedia({forcedColors:'none'});
    let release;delayed=new Promise(resolve=>{release=resolve;});
    await load.click();await page.waitForFunction(()=>fleetState.boundLoading);
    await uuid.fill('bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee');await uuid.fill(run);
    release();await page.waitForFunction(()=>!fleetState.boundLoading);
    assert.equal(await page.locator('#bound-run-descriptor').innerHTML(),'');assert.equal(await page.locator('#bound-run-graph li').count(),0);
    await load.click();await inspect.waitFor();
    await page.context().setOffline(true);await page.getByText('Board unavailable offline. Reconnect, then retry.',{exact:true}).first().waitFor();
    assert.equal(await page.locator('#bound-run-descriptor').innerHTML(),'');assert.equal(await inspect.isVisible(),false);
    await page.context().setOffline(false);
    status=409;response={schemaVersion:1,kind:'controlled-run-proposal-binding',state:'unavailable',binding:null,proposal:null,reason:'snapshot-changed',error:'PRIVATE_CANARY'};
    await page.locator('#bound-run-retry').click();await page.getByText('Stored snapshot changed. Load the snapshot again before inspecting its proposal.',{exact:true}).waitFor();
    assert.equal(await page.locator('#bound-run-retry').innerText(),'Load snapshot again');
    status=200;response={...descriptor('review'),schemaVersion:2};
    await page.locator('#bound-run-retry').click();await page.getByText('Stored snapshot unavailable. Unsupported or invalid response.',{exact:true}).waitFor();
    status=403;response={error:'PRIVATE_REFUSAL_CANARY'};
    await page.locator('#bound-run-retry').click();await page.waitForFunction(()=>fleetAccessDenied());
    assert.equal(await uuid.inputValue(),'');assert.equal(await phase.inputValue(),'');
    assert.equal(await page.locator('#bound-run-descriptor').innerHTML(),'');assert.equal(await page.locator('#bound-run-retry').isVisible(),false);
    assert.doesNotMatch(await page.locator('body').innerHTML(),/PRIVATE_(?:REFUSAL_)?CANARY/);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>localStorage[k]?.includes('aaaaaaaa-bbbb'))),false);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();if(server)await reapAndClean(server.proc,tmp);else fs.rmSync(tmp,{recursive:true,force:true});}
});

test('four advisory focus directions work by keyboard and reflow without execution changes', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-focus-browser-'));
  const root = path.join(tmp, FIXTURE_NAME), home = path.join(tmp, 'home'), agents = path.join(home, '.claude', 'agents');
  fs.mkdirSync(root); buildFixture(root); commitFixture(root);
  fs.mkdirSync(agents, { recursive: true });
  for (const role of ['architect', 'senior-dev', 'game-reviewer']) fs.writeFileSync(path.join(agents, `great_cto-${role}.md`), `---\nname: ${role}\ndescription: Fixture role\n---\n`);
  fs.mkdirSync(path.join(home, '.great_cto'), { recursive: true });
  const registry = path.join(home, '.great_cto', 'projects.json');
  const otherProjects=['focus-b','focus-c'].map(slug=>({slug,path:path.join(tmp,slug)}));
  for(const project of otherProjects){fs.mkdirSync(path.join(project.path,'.great_cto'),{recursive:true});fs.writeFileSync(path.join(project.path,'.great_cto','PROJECT.md'),'archetype: web-service\n');}
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: FIXTURE_NAME, path: root },...otherProjects] }));
  const projectFile = path.join(root, '.great_cto', 'PROJECT.md'), before = fs.readFileSync(projectFile, 'utf8');
  let server, browser;
  try {
    server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: root, portEnv: 'PORT',
      env: { HOME: home, GREAT_CTO_AGENTS_DIR: agents, GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_NO_UPDATE_CHECK: '1' } });
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true }), errors = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.port}/?project=${FIXTURE_NAME}&host=codex#/settings/executors`);
    await page.waitForFunction(slug => currentProject === slug, FIXTURE_NAME);
    await page.waitForFunction(() => fleetState.registryScope === pqs() && !fleetState.registryLoading && fleetState.registry?.directions.length === 4);
    await page.getByRole('group', { name: 'Focus direction', exact: true }).waitFor();
    const controls = page.locator('[data-focus-direction]');
    await page.waitForFunction(() => document.querySelectorAll('[data-focus-direction]').length === 4);
    assert.deepEqual(await controls.allTextContents(), ['Fintech + crypto', 'Telemedicine', 'Venture Pipeline', 'Mental Care']);
    assert.equal(await page.locator('[data-focus-direction][aria-pressed="true"]').count(), 0);
    const finance = page.getByRole('button', { name: 'Fintech + crypto', exact: true });
    await finance.focus(); await finance.press('Enter');
    await page.locator('[data-focus-direction="fintech-crypto"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('#focus-packs details').count(), 2);
    await page.locator('#focus-packs summary').first().click();
    assert.equal(await page.locator('#focus-packs details').first().locator('li').count(), 3);
    const mental = page.getByRole('button', { name: 'Mental Care', exact: true });
    await mental.focus(); await mental.press('Space');
    await page.locator('[data-focus-direction="mental-care"][aria-pressed="true"]').waitFor();
    try { await page.waitForFunction(() => document.querySelector('#focus-proposal-body')?.textContent.includes('Assessment: unavailable')); }
    catch (error) { console.error(await page.locator('#focus-proposal-body').innerText()); console.error(await page.evaluate(() => ({project:fleetState.projectId,focus:fleetState.focusId,failed:fleetState.proposalFailed,invalid:fleetState.proposalInvalid,proposal:fleetState.proposal}))); throw error; }
    assert.match(await page.locator('#focus-proposal-body').innerText(), /Selective omission is not permitted/);
    assert.match(await page.locator('#focus-selection-status').innerText(), /No diagnosis or treatment claim/);
    assert.equal(await page.locator('#focus-proposal-body svg').count(), 0);
    assert.match(await page.locator('#focus-proposal').innerText(), /Advisory\. Does not change execution/);
    const evidenceDetails = page.locator('#focus-evidence-limits');
    assert.equal(await evidenceDetails.count(), 1);
    assert.equal(await evidenceDetails.getAttribute('open'), null);
    await evidenceDetails.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.match(await evidenceDetails.innerText(), /Required gates/);
    await evidenceDetails.locator('summary').press('Enter');
    await page.locator('#nav-view-all').click();
    await page.getByRole('button', { name: 'Mental Care', exact: true }).waitFor();
    assert.match(await page.locator('#fleet-list').innerText(), /game-reviewer/);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      for (const width of [1440, 1024, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${theme}/${width} overflow`);
        if (width <= 375) assert((await controls.first().boundingBox()).height >= 44);
        if (width === 375) assert.equal(Math.round((await page.locator('.focus-inspection').boundingBox()).x), 12);
      }
    }
    await page.locator('.focus-inspection').evaluate(el => { el.style.fontSize = '32px'; });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, '200% focus text reflows');
    await page.locator('.focus-inspection').evaluate(el => { el.style.fontSize = ''; });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.getByRole('button', { name: 'Telemedicine', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-focus-direction="telemedicine"]').getAttribute('aria-pressed'), 'true');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: '/tmp/four-domain-focus-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({ path: '/tmp/four-domain-focus-mobile.png', fullPage: true });
    // The refusal exercises actual page rendering; success data still comes
    // from the real API, while this boundary supplies only an access denial.
    await page.route('**/api/focus-proposal?**', route => route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({state:'refused',error:'PRIVATE_REFUSAL_CANARY'})}));
    await page.evaluate(async () => {
      fleetState.required={state:'read',reviewers:[{agent:'PRIVATE_REVIEWER_CANARY'}]}; fleetState.requiredScope=pqs();
      fleetState.agents=[{slug:'PRIVATE_ROLE_CANARY',description:'PRIVATE_DESCRIPTION_CANARY'}];
      fleetState.drawerSlug='PRIVATE_ROLE_CANARY';
      document.getElementById('agent-drawer-body').textContent='PRIVATE_DRAWER_CANARY';
      await refreshFocusProposal();
    });
    assert.match(await page.locator('#focus-directions').innerText(), /You do not have access to this project/);
    assert.equal(await page.locator('#focus-directions').getByRole('button',{name:'Retry',exact:true}).count(),1);
    assert.equal(await page.locator('[data-focus-direction]').count(),0);
    assert.equal(await page.locator('#focus-packs details').count(),0);
    assert.equal(await page.locator('#agent-drawer-body').innerHTML(),'');
    assert.doesNotMatch(await page.locator('body').innerHTML(),/PRIVATE_(?:REFUSAL|REVIEWER|ROLE|DESCRIPTION|DRAWER)_CANARY/);
    assert.deepEqual(await page.evaluate(()=>({registry:fleetState.registry,projectId:fleetState.projectId,focusId:fleetState.focusId,required:fleetState.required,agents:fleetState.agents,denied:fleetState.proposalDenied})),
      {registry:null,projectId:null,focusId:null,required:null,agents:[],denied:true});
    await page.evaluate(async()=>{await switchProject('focus-b');});
    await page.waitForFunction(()=>fleetState.registryScope===pqs()&&!fleetState.registryLoading&&fleetState.registry&&fleetState.agents.length>0);
    await page.evaluate(()=>{
      fleetState.agents[0].description='B_PRIVATE_CANARY'; renderFleetList();
      document.getElementById('agent-drawer-body').textContent='B_PRIVATE_DRAWER_CANARY';
    });
    let releaseSwitch;
    const switchBarrier=new Promise(resolve=>{releaseSwitch=resolve;});
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url());
      if(url.searchParams.get('project')===FIXTURE_NAME&&['/api/tasks','/api/metrics','/api/share','/api/inbox'].includes(url.pathname)){
        await switchBarrier; await route.continue();
      }else await route.fallback();
    });
    await page.evaluate(slug=>{window.__focusProjectSwitch=switchProject(slug);},FIXTURE_NAME);
    assert.equal(/B_PRIVATE_(?:DRAWER_)?CANARY/.test(await page.locator('body').innerHTML()),false,'B data disappears before generic A responses resolve');
    assert.match(await page.locator('#focus-directions').innerText(),/Loading focus directions/);
    assert.deepEqual(await page.evaluate(()=>({projectId:fleetState.projectId,registry:fleetState.registry,agents:fleetState.agents,denied:fleetState.registryDenied})),
      {projectId:null,registry:null,agents:[],denied:false});
    releaseSwitch(); await page.evaluate(()=>window.__focusProjectSwitch);
    await page.waitForFunction(()=>fleetState.registryScope===pqs()&&!fleetState.registryLoading&&fleetState.registry&&fleetState.agents.length>0);
    await page.evaluate(async()=>{await switchProject('focus-c');});
    await page.waitForFunction(()=>fleetState.registryScope===pqs()&&!fleetState.registryLoading&&fleetState.registry&&fleetState.agents.length>0);
    assert.equal(await page.evaluate(()=>fleetState.deniedScope),null);
    assert.deepEqual(errors, []);
    assert.equal(fs.readFileSync(projectFile, 'utf8'), before);
  } finally {
    await browser?.close();
    if (server) await reapAndClean(server.proc, tmp); else fs.rmSync(tmp, { recursive: true, force: true });
  }
});
