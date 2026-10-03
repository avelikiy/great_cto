import{test}from'node:test';
import assert from'node:assert/strict';
import{createBrowserGuardianProtocol}from'../../scripts/lib/browser-guardian-protocol.mjs';

const id=n=>n.toString(16).padStart(64,'0');
const registry=[{id:id(1),kind:'scorer'},{id:id(2),kind:'browser'},{id:id(3),kind:'profile'}];
function fixture(){
 const guard=createBrowserGuardianProtocol({attemptId:'attempt-1',receiptSha256:id(10),registrationSha256:id(11)});
 const b=guard.binding();let seq=0;
 const message=(type,payload={},overrides={})=>JSON.stringify({version:1,attemptId:b.attemptId,capability:b.capability,sequence:++seq,type,...payload,...overrides});
 const send=(type,payload)=>guard.receive(message(type,payload));
 const observing=()=>{send('ready');send('register',{resources:registry});};
 const stopping=()=>{observing();send('stop',{reason:'scorer-death'});};
 return{guard,b,message,send,observing,stopping};
}
for(const reason of ['normal','dom-refusal','deadline','scorer-death','parent-death'])test('complete bound lifecycle '+reason+' remains unattested',()=>{
 const f=fixture();f.observing();f.send('stop',{reason});
 const s=f.send('quiescent',{processes:[id(2),id(1)],profile:id(3),profileState:'retained'});
 assert.equal(s.state,'QUIESCENT');assert.equal(s.reason,reason);assert.equal(s.sequence,4);
 assert.equal(s.cleanupAuthorized,false);assert.equal(s.independentAdmissionVerified,false);assert.equal(s.benchmarkEligible,false);
 assert.equal(s.observationAuthority,'unattested-message-consistency');assert.equal(s.osQuiescenceVerified,false);assert.equal(s.resourceClosureVerified,false);
 assert.ok(Object.isFrozen(s));assert.ok(Object.isFrozen(f.guard));
 assert.ok(!JSON.stringify(s).includes(f.b.capability));assert.ok(!JSON.stringify(s).includes(f.b.receiptSha256));
});
for(const reason of ['guardian-death','invalid-registration','inventory-unavailable','identity-changed','timeout','incomplete-registry'])test('fault '+reason+' preserves terminal attempt',()=>{
 const f=fixture();f.observing();const s=f.send('fault',{reason});assert.equal(s.state,'PRESERVED');
 assert.equal(s.reason,reason);assert.deepEqual(f.send('ready'),s);assert.equal(s.cleanupAuthorized,false);
});
for(const mutation of ['foreign attempt','foreign capability','missing sequence','old sequence','future sequence','missing field','extra path','object','oversized','duplicate key','malformed','null','noncanonical'])test('wire refuses '+mutation+' without payload echo',()=>{
 const f=fixture();let raw=f.message('ready');const m=JSON.parse(raw);
 if(mutation==='foreign attempt')m.attemptId='other';
 if(mutation==='foreign capability')m.capability=id(99);
 if(mutation==='missing sequence')delete m.sequence;
 if(mutation==='old sequence')m.sequence=0;
 if(mutation==='future sequence')m.sequence=2;
 if(mutation==='missing field')delete m.type;
 if(mutation==='extra path')m.path='private-sentinel';
 raw=JSON.stringify(m);
 if(mutation==='object')raw=m;
 if(mutation==='oversized')raw='x'.repeat(8193);
 if(mutation==='duplicate key')raw=raw.replace('"type":"ready"','"type":"stop","type":"ready"');
 if(mutation==='malformed')raw='{private-sentinel';
 if(mutation==='null')raw='null';
 if(mutation==='noncanonical')raw=' '+raw;
 const s=f.guard.receive(raw);assert.equal(s.state,'PRESERVED');assert.equal(s.reason,'invalid-message');
 assert.ok(!JSON.stringify(s).includes('private-sentinel'));assert.equal(s.cleanupAuthorized,false);
});
for(const mutation of ['empty','missing browser','missing scorer','missing profile','duplicate ID','unknown kind','invalid ID','extra scope','too many'])test('registration refuses '+mutation,()=>{
 const f=fixture();f.send('ready');let resources=structuredClone(registry);
 if(mutation==='empty')resources=[];
 if(mutation==='missing browser')resources=resources.filter(r=>r.kind!=='browser');
 if(mutation==='missing scorer')resources=resources.filter(r=>r.kind!=='scorer');
 if(mutation==='missing profile')resources=resources.filter(r=>r.kind!=='profile');
 if(mutation==='duplicate ID')resources[1].id=id(1);
 if(mutation==='unknown kind')resources[1].kind='other';
 if(mutation==='invalid ID')resources[1].id='pid-42';
 if(mutation==='extra scope')resources[1].root='private-sentinel';
 if(mutation==='too many')resources=Array.from({length:65},(_,i)=>({id:id(i+1),kind:i===0?'scorer':i===1?'profile':'browser'}));
 assert.equal(f.send('register',{resources}).state,'PRESERVED');
});
for(const mutation of ['subset','foreign','duplicates','wrong profile','bad profile state','extra proof'])test('quiescence refuses '+mutation,()=>{
 const f=fixture();f.stopping();const payload={processes:[id(1),id(2)],profile:id(3),profileState:'removed'};
 if(mutation==='subset')payload.processes=[id(1)];
 if(mutation==='foreign')payload.processes=[id(1),id(8)];
 if(mutation==='duplicates')payload.processes=[id(1),id(1)];
 if(mutation==='wrong profile')payload.profile=id(8);
 if(mutation==='bad profile state')payload.profileState='unknown';
 if(mutation==='extra proof')payload.osVerified=true;
 assert.equal(f.send('quiescent',payload).state,'PRESERVED');
});
test('out-of-order, replay, late registration and removed messages cannot authorize cleanup',()=>{
 for(const type of ['register','stop','quiescent','removed']){const f=fixture();assert.equal(f.send(type).state,'PRESERVED');}
 const f=fixture(),ready=f.message('ready');f.guard.receive(ready);assert.equal(f.guard.receive(ready).state,'PRESERVED');
 const g=fixture();g.observing();assert.equal(g.send('register',{resources:registry}).state,'PRESERVED');
 const h=fixture();h.stopping();h.send('quiescent',{processes:[id(1),id(2)],profile:id(3),profileState:'removed'});
 assert.equal(h.send('removed').state,'PRESERVED');assert.equal(h.guard.snapshot().cleanupAuthorized,false);
});
test('copied registry cannot mutate owned protocol state; capabilities are per instance',()=>{
 const f=fixture(),g=fixture();assert.notEqual(f.b.capability,g.b.capability);
 f.send('ready');const resources=structuredClone(registry);f.send('register',{resources});resources[0].id=id(8);
 f.send('stop',{reason:'normal'});assert.equal(f.send('quiescent',{processes:[id(1),id(2)],profile:id(3),profileState:'removed'}).state,'QUIESCENT');
});
test('maximum complete registry is admitted only as unattested consistency',()=>{
 const f=fixture(),resources=Array.from({length:64},(_,i)=>({id:id(i+1),kind:i===0?'scorer':i===1?'profile':'browser'}));
 f.send('ready');assert.equal(f.send('register',{resources}).state,'OBSERVING');f.send('stop',{reason:'deadline'});
 const s=f.send('quiescent',{processes:resources.filter(r=>r.kind!=='profile').map(r=>r.id),profile:id(2),profileState:'retained'});
 assert.equal(s.state,'QUIESCENT');assert.equal(s.resourcesRegistered,64);assert.equal(s.osQuiescenceVerified,false);assert.equal(s.cleanupAuthorized,false);
});
