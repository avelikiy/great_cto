// Test-only creator-held handles. No PID/group search, profile deletion or
// authority over resources from another run. A close timeout is never a pass.
const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,
 new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('contrast cleanup deadline exhausted')),ms))]);}finally{clearTimeout(timer);}};
export function createContrastLifetime(signal,{cleanupMs=3000}={}){
 if(!signal||!Number.isInteger(cleanupMs)||cleanupMs<10||cleanupMs>5000)throw Error('invalid contrast lifetime');
 let stopping=false;const owned=new Map();
 const aborted=()=>Error('contrast lifetime aborted');
 const stopOne=record=>record.stopped??=(async()=>{
  const child=record.child;
  const exit=child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve));
  // Start all stops independently. Neither a protocol close nor its rejection
  // may postpone stopping the separately owned board.
  let stopped;
  try{stopped=Promise.resolve(record.stop());}catch(error){stopped=Promise.reject(error);}
  await bounded(Promise.all([stopped,exit]),cleanupMs);
 })();
 const stop=async()=>{stopping=true;await Promise.all([...owned.values()].map(stopOne));};
 const onAbort=()=>{void stop().catch(()=>{});};
 signal.addEventListener('abort',onAbort,{once:true});
 const own=async(handle,child,stopOwned)=>{
  if(!child||typeof child.once!=='function'||typeof child.kill!=='function'||!Number.isInteger(child.pid)||child.pid<1)throw Error('invalid creator-held child');
  if(owned.has(handle))throw Error('duplicate contrast resource');
  const record={child,stop:stopOwned};owned.set(handle,record);
  if(stopping||signal.aborted){await stopOne(record);throw aborted();}
  return handle;
 };
 return Object.freeze({
  ownBoard:child=>own(child,child,()=>{if(child.exitCode===null&&child.signalCode===null&&!child.kill('SIGKILL'))throw Error('contrast board stop refused');}),
  ownBrowser:server=>own(server,server.process(),()=>server.kill()),
  async run(action){
   if(stopping||signal.aborted)throw aborted();let rejectAbort;
   const listener=()=>rejectAbort(aborted());
   try{const cancellation=new Promise((_,reject)=>{rejectAbort=reject;signal.addEventListener('abort',listener,{once:true});});
    const result=await Promise.race([Promise.resolve().then(()=>{if(stopping||signal.aborted)throw aborted();return action();}),cancellation]);
    if(signal.aborted)throw aborted();return result;
   }finally{signal.removeEventListener('abort',listener);}
  },
  async stop(){try{await stop();}finally{signal.removeEventListener('abort',onAbort);}},
 });
}
