import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserCaseDeadline,BROWSER_CASE_MS,IPC_CONTROL_MS} from './browser-case-deadline.mjs';

test('browser work uses existing case deadline, not the control reply cap',()=>{
 let time=0;const budget=createBrowserCaseDeadline(()=>time);
 time=2700;
 assert.equal(IPC_CONTROL_MS,3000);assert.equal(BROWSER_CASE_MS,20000);
 assert.deepEqual(budget.window('control'),{deadline:5700,delayMs:3000});
 assert.deepEqual(budget.window('prepare'),{deadline:20000,delayMs:17300});
 time=6000;assert.equal(budget.expired({deadline:20000}),false);
 assert.equal(budget.expired({deadline:5700}),true);
});
test('phase changes and progress cannot renew the finite case budget',()=>{
 let time=0;const budget=createBrowserCaseDeadline(()=>time);
 for(time=1;time<20000;time+=97){
  assert.equal(budget.window('prepare').deadline,20000);
  assert.equal(budget.window('observe').deadline,20000);
 }
 time=19900;assert.deepEqual(budget.window('control'),{deadline:20000,delayMs:100});
 time=20000;
 for(const phase of ['control','prepare','observe']){
  const window=budget.window(phase);assert.equal(window.delayMs,0);assert.equal(budget.expired(window),true);
 }
});
test('hung preparation expires without relying on timer callback scheduling',()=>{
 let time=0;const budget=createBrowserCaseDeadline(()=>time),window=budget.window('prepare');
 time=25000;assert.equal(budget.expired(window),true);
 assert.equal(budget.window('observe').delayMs,0);
});
test('unknown phases and invalid clock samples fail closed',()=>{
 let time=0;const budget=createBrowserCaseDeadline(()=>time);
 assert.throws(()=>budget.window('unbounded'),/phase/);
 time=NaN;assert.throws(()=>budget.window('prepare'),/clock/);
 assert.throws(()=>createBrowserCaseDeadline(()=>Infinity),/clock/);
});
