/** Private IPC prototype only; no browser launch, signals or file deletion. */
import {createBrowserGuardianProtocol} from './browser-guardian-protocol.mjs';

const exact=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)
 &&JSON.stringify(Object.keys(o).sort())===JSON.stringify([...fields].sort());
let protocol=null,binding=null,requestId=0,terminal=false;
function fault(){
 if(protocol)protocol.receive(JSON.stringify({version:1,attemptId:binding.attemptId,capability:binding.capability,
  sequence:protocol.snapshot().sequence+1,type:'fault',reason:'guardian-death'}));
}
function finish(kind,code){
 if(terminal)return;terminal=true;fault();
 const reply={kind,pid:process.pid,cleanupAuthorized:false,benchmarkEligible:false,
  snapshot:protocol?.snapshot()??null};
 const close=()=>{if(process.connected)process.disconnect();process.exitCode=code;};
 if(process.connected)process.send(reply,close);else close();
}
if(!process.channel)process.exitCode=1;
else{
 process.on('disconnect',()=>{if(terminal)return;terminal=true;fault();process.exitCode=1;});
 process.on('message',raw=>{
  if(terminal)return;
  try{
   if(typeof raw!=='string'||Buffer.byteLength(raw)>32768)throw Error('invalid transport');
   const m=JSON.parse(raw);if(JSON.stringify(m)!==raw||m.version!==1)throw Error('invalid transport');
   if(!protocol){
    if(!exact(m,['version','kind','attemptId','receiptSha256','registrationSha256'])||m.kind!=='init')throw Error('invalid init');
    protocol=createBrowserGuardianProtocol(m);binding=protocol.binding();
    // This capability is private fork-channel bootstrap, never stdout/status.
    process.send({kind:'ready',pid:process.pid,binding,snapshot:protocol.snapshot(),
     runtime:{execArgvCount:process.execArgv.length,environmentKeys:Object.keys(process.env).sort()}},error=>{if(error)finish('unavailable',1);});
   }else if(exact(m,['version','kind'])&&m.kind==='close')finish('closed',0);
   else{
    if(!exact(m,['version','kind','requestId','raw'])||m.kind!=='step'||!Number.isSafeInteger(m.requestId)
     ||m.requestId!==requestId+1||typeof m.raw!=='string'||Buffer.byteLength(m.raw)>8192)throw Error('invalid step');
    requestId=m.requestId;
    const snapshot=protocol.receive(m.raw);
    process.send({kind:'snapshot',pid:process.pid,requestId,snapshot},error=>{if(error)finish('unavailable',1);});
   }
  }catch{finish('unavailable',1);}
 });
}
