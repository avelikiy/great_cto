// Fixed OS-lineage/descriptor fixture, not a Chromium or production bootstrap.
import {fork} from 'node:child_process';
import {openSync,closeSync,fstatSync,constants} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(import.meta.url),mode=process.argv[2];
const send=value=>{if(process.connected)process.send(value);};
const children=[];
function child(kind,fd,detached=false){
 const processChild=fork(entry,[kind],{execPath:process.execPath,execArgv:[],env:{LANG:'C',TZ:'UTC'},
  detached,stdio:['ignore',mode==='browser'?1:'pipe','ignore',fd,'ipc']});
 processChild.stdout?.on('data',()=>{});
 const closed=new Promise(resolve=>processChild.once('close',resolve));
 children.push({processChild,closed});
 processChild.on('message',send);
 return processChild;
}
async function close(){
 for(const {processChild} of children)if(processChild.connected)processChild.send({kind:'close'});
 await Promise.all(children.map(c=>c.closed));
 if(process.connected)process.disconnect();
}
if(mode==='worker'){
 // Retain inherited stdout and fd3 even after the browser fixture dies.
 const timer=setTimeout(()=>{if(process.connected)process.disconnect();},8000);
 process.on('disconnect',()=>{});
 process.on('message',message=>{if(message?.kind==='close'){clearTimeout(timer);if(process.connected)process.disconnect();}});
 send({kind:'late-ready',pid:process.pid,fileIno:fstatSync(3).ino});
}else if(mode==='browser'){
 send({kind:'ready',browserPid:process.pid,fileIno:fstatSync(3).ino});
 process.on('message',message=>{
  if(message?.kind==='late-browser')child('worker',3);
  else if(message?.kind==='exit-browser')process.exit(0);
  else if(message?.kind==='close')void close();
 });
 process.on('disconnect',()=>{void close();});
}else if(mode==='scorer'){
 let browser,file;
 process.on('message',message=>{
  if(message?.kind==='init'&&!browser){
   file=join(message.profilePath,'held-descriptor');
   const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   browser=child('browser',fd,true);closeSync(fd);
   browser.once('exit',()=>send({kind:'browser-exit'}));
   browser.once('close',()=>send({kind:'browser-close'}));
  }else if(message?.kind==='late-scorer'){
   const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);child('worker',fd);closeSync(fd);
  }else if(['late-browser','exit-browser'].includes(message?.kind)&&browser?.connected)browser.send(message);
  else if(message?.kind==='close')void close();
 });
 process.on('disconnect',()=>{void close();});
}else process.exitCode=1;
