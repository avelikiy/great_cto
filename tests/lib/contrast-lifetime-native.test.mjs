import{test}from'node:test';
import assert from'node:assert/strict';
import{spawn,spawnSync}from'node:child_process';
import{loadBrowser}from'../../scripts/lib/layout-snapshot.mjs';
import{createContrastLifetime}from'../helpers/contrast-lifetime.mjs';

test('actual browser abort reaps captured owned processes and leaves unrelated sentinel alive',{timeout:20000},async t=>{
 if(!['darwin','linux'].includes(process.platform))return t.skip('native process identity NOT CHECKED');
 const chromium=await loadBrowser();if(!chromium)return t.skip('Playwright unavailable; NOT CHECKED');
 const control=new AbortController(),life=createContrastLifetime(control.signal),env={LANG:'C',TZ:'UTC'};
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{env,stdio:'ignore'});
 const board=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{env,stdio:'ignore'});
 const closed=child=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(r=>child.once('exit',r));
 t.after(async()=>{try{await life.stop();}finally{for(const child of [board,sentinel])if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await Promise.all([closed(board),closed(sentinel)]);}});
 await life.ownBoard(board);
 let server;
 try{server=await chromium.launchServer({channel:'chrome',headless:true,timeout:5000});}
 catch(error){if(String(error.message).includes("Executable doesn't exist"))return t.skip('Chrome unavailable; NOT CHECKED');throw Error('native contrast browser launch failed');}
 await life.ownBrowser(server);
 const browser=await chromium.connect(server.wsEndpoint(),{timeout:5000});const page=await browser.newPage();await page.setContent('<p>native owned browser fixture</p>');
 const table=()=>{const result=spawnSync('/bin/ps',['-axo','pid=,ppid=,stat=,lstart='],{env,encoding:'utf8',timeout:1000,maxBuffer:1048576});assert.equal(result.status,0);
  const rows=new Map();for(const line of result.stdout.split('\n')){const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/);if(m)rows.set(Number(m[1]),{parent:Number(m[2]),state:m[3],birth:m[4]});}return rows;};
 const rows=table(),root=server.process().pid,owned=new Map([[root,rows.get(root)],[board.pid,rows.get(board.pid)]]);
 assert.equal(rows.get(root)?.parent,process.pid);assert.equal(rows.get(board.pid)?.parent,process.pid);
 const foreign=rows.get(sentinel.pid);assert.equal(foreign?.parent,process.pid);
 for(let changed=true;changed;){changed=false;for(const [pid,row]of rows)if(!owned.has(pid)&&owned.has(row.parent)){owned.set(pid,row);changed=true;}}
 assert.ok(owned.size>3,'browser renderer descendants captured before abort');
 const running=life.run(()=>new Promise(()=>{}));control.abort();await assert.rejects(running,/aborted/);await life.stop();
 let live=[];
 for(let i=0;i<40;i++){const current=table();live=[...owned].filter(([pid,row])=>{const now=current.get(pid);return now?.birth===row.birth&&!now.state.startsWith('Z');});if(!live.length)break;await new Promise(r=>setTimeout(r,25));}
 assert.deepEqual(live,[],'captured creator-owned board/browser processes are no longer running');
 const current=table().get(sentinel.pid);assert.equal(current?.birth,foreign.birth);assert.ok(!current.state.startsWith('Z'));
 t.diagnostic('native abort: '+owned.size+' captured owned processes stopped; unrelated sentinel remains alive; no manual profile deletion');
});
