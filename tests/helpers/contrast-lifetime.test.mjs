import{test}from'node:test';
import assert from'node:assert/strict';
import{EventEmitter}from'node:events';
import{createContrastLifetime}from'./contrast-lifetime.mjs';
function child(){const c=new EventEmitter();c.pid=123;c.exitCode=null;c.signalCode=null;c.signals=[];
 c.kill=signal=>{c.signals.push(signal);c.signalCode=signal;c.emit('exit',null,signal);return true;};return c;}
test('abort stops board without waiting for a hung browser close',async()=>{
 const control=new AbortController(),life=createContrastLifetime(control.signal,{cleanupMs:30}),board=child(),browser=child();
 await life.ownBoard(board);await life.ownBrowser({process:()=>browser,kill:()=>new Promise(()=>{})});
 const running=life.run(()=>new Promise(()=>{}));control.abort();
 await assert.rejects(running,/aborted/);assert.deepEqual(board.signals,['SIGKILL']);
 await assert.rejects(life.stop(),/cleanup deadline/);
});
test('late acquired browser is stopped and never admitted after abort',async()=>{
 const control=new AbortController(),life=createContrastLifetime(control.signal),browser=child();control.abort();
 await life.stop();
 await assert.rejects(life.ownBrowser({process:()=>browser,kill:()=>browser.kill('SIGKILL')}),/aborted/);
 assert.deepEqual(browser.signals,['SIGKILL']);await life.stop();
});
test('normal stop is idempotent and never signals unrelated child',async()=>{
 const control=new AbortController(),life=createContrastLifetime(control.signal),board=child(),browser=child(),foreign=child();
 await life.ownBoard(board);await life.ownBrowser({process:()=>browser,kill:()=>browser.kill('SIGKILL')});
 assert.equal(await life.run(()=>42),42);await life.stop();await life.stop();
 assert.deepEqual(board.signals,['SIGKILL']);assert.deepEqual(browser.signals,['SIGKILL']);assert.deepEqual(foreign.signals,[]);
});
test('a delayed operation result cannot pass after abort',async()=>{
 const control=new AbortController(),life=createContrastLifetime(control.signal);let finish;
 const running=life.run(()=>new Promise(resolve=>finish=resolve));await Promise.resolve();control.abort();finish('not acceptance');
 await assert.rejects(running,/aborted/);await life.stop();
});
test('abort before the action microtask prevents resource acquisition',async()=>{
 const control=new AbortController(),life=createContrastLifetime(control.signal);let invoked=false;
 const running=life.run(()=>{invoked=true;});control.abort();await assert.rejects(running,/aborted/);
 assert.equal(invoked,false);await life.stop();
});
test('a successful stop API without child exit is not quiescence',async()=>{
 const control=new AbortController(),life=createContrastLifetime(control.signal,{cleanupMs:30}),browser=child();
 await life.ownBrowser({process:()=>browser,kill:()=>Promise.resolve()});
 await assert.rejects(life.stop(),/cleanup deadline/);assert.equal(browser.signalCode,null);
});
