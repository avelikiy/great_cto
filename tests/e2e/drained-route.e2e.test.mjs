import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { installDrainedRoute } from '../helpers/drained-route.mjs';

test('draining a held route preserves a slower callback and then restores passthrough', {timeout:30000}, async () => {
  const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/api/work'?'application/json':'text/html');res.end(req.url==='/api/work'?'{}':'<html>route fixture</html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch();
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    let release,captured=0,fulfilled=0,firstDone;
    const held=new Promise(resolve=>release=resolve),firstFinished=new Promise(resolve=>firstDone=resolve);
    const drain=await installDrainedRoute(page,'**/api/work',async route=>{
      const sequence=captured++,response=await route.fetch();
      await held;
      if(sequence===1){await firstFinished;await new Promise(resolve=>setTimeout(resolve,100));}
      await route.fulfill({response});fulfilled++;if(sequence===0)firstDone();
    });
    const reads=page.evaluate(()=>Promise.all([fetch('/api/work'),fetch('/api/work')]).then(rows=>rows.map(r=>r.status)));
    // Both callbacks must own their routes before removal. This is fixture
    // synchronization, not a sleep standing in for product readiness.
    const captureDeadline=Date.now()+10000;
    while(captured<2&&Date.now()<captureDeadline)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(captured,2,'both local requests reach the held callback');
    release();await drain();
    assert.equal(fulfilled,2);
    assert.deepEqual(await reads,[200,200]);
    assert.equal(await page.evaluate(()=>fetch('/api/work').then(r=>r.status)),200);
    assert.equal(captured,2,'removed callback must not intercept subsequent reads');
    await page.unrouteAll({behavior:'wait'});
  } finally {
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
