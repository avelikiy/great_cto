import {performance} from 'node:perf_hooks';

// Trusted fixture timing only. No process, admission, gate or cleanup authority.
export const BROWSER_CASE_MS=20000;
export const IPC_CONTROL_MS=3000;
export function createBrowserCaseDeadline(now=()=>performance.now()){
 const sample=()=>{const value=now();if(!Number.isFinite(value)||value<0)throw Error('invalid monotonic clock');return value;};
 const end=sample()+BROWSER_CASE_MS;
 return Object.freeze({
  window(phase){
   if(!['control','prepare','observe'].includes(phase))throw Error('invalid deadline phase');
   const current=sample(),deadline=Math.min(end,phase==='control'?current+IPC_CONTROL_MS:end);
   return Object.freeze({deadline,delayMs:Math.max(0,Math.ceil(deadline-current))});
  },
  expired(window){return sample()>=window.deadline;},
 });
}
