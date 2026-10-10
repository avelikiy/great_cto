// Fixed trusted initializer fault seam. No candidate SQL or command accepted.
import {mkdirSync,writeFileSync,existsSync,openSync,closeSync,fstatSync} from 'node:fs';
import {fork} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const mode=process.argv[2],data=process.argv[3];
if(mode==='worker'){
 const fd=openSync(join(data,'held-descriptor'),'wx',0o600),ino=fstatSync(fd).ino;
 process.send({pid:process.pid,ino});
 let stopped=false,timer,watch;
 const close=()=>{if(stopped)return;stopped=true;clearTimeout(timer);clearInterval(watch);closeSync(fd);
  try{writeFileSync(join(data,'worker-closed'),JSON.stringify({pid:process.pid,ino}),{mode:0o600});}catch{}
  if(process.connected)process.disconnect();};
 process.on('disconnect',()=>{});
 watch=setInterval(()=>{if(existsSync(join(data,'worker-stop')))close();},20);
 timer=setTimeout(close,8000);
}else{
 mkdirSync(data,{mode:0o700});writeFileSync(join(data,'init-marker'),'PRIVATE_INIT_PAYLOAD_MUST_NOT_LEAK',{mode:0o600});
 if(mode==='descendant'){
  const child=fork(fileURLToPath(import.meta.url),['worker',data],{execPath:process.execPath,execArgv:[],env:{LANG:'C'},stdio:['ignore','ignore','ignore','ipc']});
  child.once('message',value=>{writeFileSync(join(data,'worker-ready'),JSON.stringify(value),{mode:0o600});child.disconnect();process.exit(7);});
 }else if(mode==='timeout')setInterval(()=>{},1000);
 else if(mode==='signal')process.kill(process.pid,'SIGKILL');
 else{process.stderr.write('PRIVATE_INIT_PAYLOAD_MUST_NOT_LEAK');process.exitCode=7;}
}
