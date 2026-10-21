import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';

test('approved admin: five destinations, real docs, Mermaid fallback, aliases and mobile themes', {timeout:120000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gcto-admin-shell-'));
  buildFixture(dir);
  const home=path.join(dir,'.home');fs.mkdirSync(path.join(home,'.great_cto'),{recursive:true});
  const registry=path.join(home,'.great_cto','projects.json');
  fs.writeFileSync(registry,JSON.stringify({projects:[{slug:FIXTURE_NAME,name:FIXTURE_NAME,path:dir}]}));
  fs.mkdirSync(path.join(dir,'docs','architecture'),{recursive:true});
  fs.writeFileSync(path.join(dir,'docs','architecture','overview.md'),'# Architecture example\n\nОписание проекта без перевода.\n\n```mermaid\nflowchart LR\n A[Controller] --> B[Codex]\n```\n');
  let server,browser;
  try {
    server=await startServerOnFreePort({entry:path.resolve('packages/board/server.mjs'),cwd:dir,portEnv:'PORT',env:{HOME:home,USERPROFILE:home,GREAT_CTO_PROJECTS_FILE:registry,GREAT_CTO_NO_BOARD:'1'}});
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
    const base=`http://127.0.0.1:${server.port}/?project=${encodeURIComponent(FIXTURE_NAME)}`;
    await page.goto(base+'#/knowledge');
    try {await page.locator('[data-doc-path="docs/architecture/overview.md"]').waitFor({timeout:10000});}
    catch(error){console.error(await page.locator('body').innerText());throw error;}
    assert.equal(await page.locator('#nav-tablist [role=tab]').count(),5);
    await page.locator('[data-doc-path="docs/architecture/overview.md"]').click();
    await page.locator('#knowledge-document .knowledge-diagram').waitFor();
    assert.match(await page.locator('#knowledge-document').innerText(),/Описание проекта без перевода/);
    assert.match(await page.locator('#knowledge-document').innerText(),/not live execution/);
    await page.getByRole('searchbox',{name:'Find a document'}).fill('no-document-matches');
    assert.equal(await page.locator('.knowledge-file:visible').count(),0);
    for(const [input,primary,panelId] of [['usage','insights','panel-usage'],['ledger','insights','panel-budgets'],['fleet','settings','panel-agents'],['harness','settings','panel-harness'],['skills','settings','panel-skills'],['history','work','panel-history'],['insights/outcomes','insights','panel-admin-outcomes']]) {
      await page.evaluate(route=>window.switchTab(route),input);
      assert.equal(await page.locator('#nav-tablist .active').getAttribute('data-tab'),primary);
      assert(await page.locator('#'+panelId).isVisible());
    }
    await page.locator('#admin-outcomes-body .admin-metrics').waitFor();
    assert.match(await page.locator('#admin-outcomes-body').innerText(),/not measured/);
    for(const hash of ['#agents/architect','#/fleet/architect']) {
      await page.goto(base+hash);
      await page.locator('#agent-drawer[open]').waitFor();
      assert.equal(await page.locator('.panel.active').getAttribute('id'),'panel-agents');
      await page.evaluate(()=>closeAgentDrawer());
      assert.equal(await page.locator('.panel.active').getAttribute('id'),'panel-agents');
    }
    for(const theme of ['light','dark']) {
      await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});
        for(const route of ['knowledge','insights/outcomes','work']) {
          await page.evaluate(r=>window.switchTab(r),route);
          assert.equal(await page.locator('.panel.active').count(),1);
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          assert(overflow<=1,`${route}/${theme}/${width}: outer overflow ${overflow}`);
        }
      }
    }
    const response=await page.request.get(`http://127.0.0.1:${server.port}/api/docs?project=nonexistent-project`);
    assert.equal(response.status(),404);
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close();
    if(server)await reapAndClean(server.proc,dir);else fs.rmSync(dir,{recursive:true,force:true});
  }
});
