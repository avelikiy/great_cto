/** Unattested guardian protocol core. No OS operations or cleanup authority. */
import {randomBytes} from 'node:crypto';

const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const keys=(o,names)=>o&&typeof o==='object'&&!Array.isArray(o)
 &&JSON.stringify(Object.keys(o).sort())===JSON.stringify([...names].sort());
const header=['version','attemptId','capability','sequence','type'];
const stopReasons=['normal','dom-refusal','deadline','scorer-death','parent-death'];
const faultReasons=['guardian-death','invalid-registration','inventory-unavailable','identity-changed','timeout','incomplete-registry'];

export function createBrowserGuardianProtocol({attemptId,receiptSha256,registrationSha256}){
 if(typeof attemptId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(attemptId)
  ||!hex(receiptSha256)||!hex(registrationSha256))throw Error('invalid guardian attempt binding');
 // This local capability binds messages, not a same-user authority boundary.
 const capability=randomBytes(32).toString('hex');
 let state='CREATED',sequence=0,resources=[],reason=null,profileState=null;
 const preserve=()=>{state='PRESERVED';reason='invalid-message';return snapshot();};
 function snapshot(){return Object.freeze({version:1,state,sequence,resourcesRegistered:resources.length,
  reason,profileState,observationAuthority:'unattested-message-consistency',osQuiescenceVerified:false,
  resourceClosureVerified:false,cleanupAuthorized:false,independentAdmissionVerified:false,benchmarkEligible:false});}
 function receive(raw){
  if(state==='PRESERVED')return snapshot();
  // Canonical dense JSON excludes duplicate keys, coercion, accessors and
  // alternative wire encodings. Do not accept arbitrary caller JS objects.
  let m;try{if(typeof raw!=='string'||Buffer.byteLength(raw)>8192) return preserve();
   m=JSON.parse(raw);if(JSON.stringify(m)!==raw)return preserve();
  }catch{return preserve();}
  if(!m||m.version!==1||m.attemptId!==attemptId||m.capability!==capability
   ||!Number.isSafeInteger(m.sequence)||m.sequence!==sequence+1)return preserve();
  if(m.type==='fault'&&keys(m,[...header,'reason'])&&faultReasons.includes(m.reason)){
   sequence=m.sequence;state='PRESERVED';reason=m.reason;return snapshot();
  }
  if(m.type==='ready'&&state==='CREATED'&&keys(m,header))state='READY';
  else if(m.type==='register'&&state==='READY'&&keys(m,[...header,'resources'])){
   const list=m.resources;
   if(!Array.isArray(list)||list.length<3||list.length>64
    ||list.some(r=>!keys(r,['id','kind'])||!hex(r.id)||!['scorer','browser','profile'].includes(r.kind))
    ||new Set(list.map(r=>r.id)).size!==list.length
    ||list.filter(r=>r.kind==='scorer').length!==1||list.filter(r=>r.kind==='profile').length!==1
    ||!list.some(r=>r.kind==='browser'))return preserve();
   resources=Object.freeze(list.map(r=>Object.freeze({...r})));state='OBSERVING';
  }else if(m.type==='stop'&&state==='OBSERVING'&&keys(m,[...header,'reason'])&&stopReasons.includes(m.reason)){
   reason=m.reason;state='STOPPING';
  }else if(m.type==='quiescent'&&state==='STOPPING'&&keys(m,[...header,'processes','profile','profileState'])){
   const expected=resources.filter(r=>r.kind!=='profile').map(r=>r.id).sort(),ids=m.processes;
   if(!Array.isArray(ids)||ids.length!==expected.length||ids.some(id=>!hex(id))
    ||new Set(ids).size!==ids.length||JSON.stringify([...ids].sort())!==JSON.stringify(expected)
    ||m.profile!==resources.find(r=>r.kind==='profile').id||!['retained','removed'].includes(m.profileState))return preserve();
   profileState=m.profileState;state='QUIESCENT';
  }else return preserve();
  sequence=m.sequence;return snapshot();
 }
 return Object.freeze({
  // Private caller channel only. Neither bindings nor resources appear in status.
  binding:()=>Object.freeze({version:1,attemptId,capability,receiptSha256,registrationSha256}),
  receive,snapshot,
 });
}
