/** Pinned trusted observer; actual static HTML/CSS repair, candidate JS disabled. */
import {realpathSync,lstatSync,readdirSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const viewports=[{width:320,height:640},{width:375,height:720},{width:1280,height:800}];
function bounded(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{
 const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('unsafe candidate file');const b=Buffer.alloc(s.size+1);let used=0,n;
 while(used<b.length&&(n=readSync(fd,b,used,b.length-used,null))>0)used+=n;const after=fstatSync(fd);
 if(used!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('candidate changed');return b.subarray(0,used);
}finally{closeSync(fd);}}
export async function loadPinnedBoardBrowser(browser,root){
 if(!browser||typeof browser.entry!=='string'||!/^[a-f0-9]{64}$/.test(browser.entrySha256))throw Error('browser tool unavailable');
 const path=realpathSync(browser.entry),rel=relative(root,path);
 if(path!==browser.entry||!isAbsolute(path)||(!rel.startsWith('../')&&!isAbsolute(rel))||sha(bounded(path))!==browser.entrySha256)throw Error('browser tool pin or scope changed');
 const mod=await import(pathToFileURL(path).href),chromium=mod.chromium??mod.default?.chromium;
 if(!chromium)throw Error('Chromium tool unavailable');return chromium;
}
function verifyOracle(o){
 const names=['.gitignore','.great_cto/PROJECT.md','package.json','README.md','contracts/decision.json','web/board.html'];
 if(o.scenario!=='board-accessibility'||!/^decision-[a-f0-9]{16}$/.test(o.target||'')||!same(o.viewports,viewports)
  ||!same(Object.keys(o.baseline||{}).sort(),names.sort())||!Array.isArray(o.protected)
  ||!same([...o.protected].sort(),names.filter(n=>n!=='web/board.html').sort()))throw Error('unsupported board oracle');
}
export async function observeBoard(html,o,root){
 verifyOracle(o);
 if(typeof html!=='string'||Buffer.byteLength(html)>65536||/<\s*(?:script|meta|base|iframe|frame|object|embed|form|link)\b/i.test(html))return {passed:[false,false,false,false],admitted:false};
 const chromium=await loadPinnedBoardBrowser(o.browser,root);let browser;
 try{browser=await chromium.launch({headless:true,timeout:5000});}catch{throw Error('Chromium launch unavailable');}
 const passed=[true,true,true,true];let requestCount=0;
 try{for(const viewport of viewports){
  const context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',route=>{requestCount++;return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(1500);const errors=[];
  page.on('pageerror',()=>errors.push('pageerror'));page.on('console',m=>{if(m.type()==='error')errors.push('consoleerror');});
  const csp="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  await page.setContent('<!doctype html><head><meta http-equiv="Content-Security-Policy" content="'+csp+'"></head>'+html,{timeout:3000,waitUntil:'load'});
  const safe=await page.evaluate(()=>![...document.querySelectorAll('*')].some(el=>[...el.attributes].some(a=>
   /^on/i.test(a.localName)||['target','download','formaction','action'].includes(a.localName)||(a.localName==='href'&&!/^#[a-zA-Z][\w-]*$/.test(a.value)))));
  if(!safe){await context.close();return {passed:[false,false,false,false],admitted:false};}
  // CSP denies candidate scripts. Only this fixed operator listener executes.
  await page.evaluate(()=>{window.__boardCalls=[];document.addEventListener('click',e=>{
   const el=e.target.closest('#approve,#reject');if(el&&e.isTrusted)window.__boardCalls.push({action:el.id,target:el.dataset.target});
  },true);});
  const active=()=>page.evaluate(()=>document.activeElement?.id);
  const focusVisible=()=>page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2;});
  let keyboard=true;
  try{
   await page.keyboard.press('Tab');keyboard&&=await active()==='nav-decisions'&&await focusVisible();
   await page.keyboard.press('Enter');keyboard&&=await active()==='decisions';
   await page.keyboard.press('Tab');keyboard&&=await active()==='approve'&&await focusVisible();
   await page.keyboard.press('Enter');await page.keyboard.press('Space');
   await page.keyboard.press('Tab');keyboard&&=await active()==='reject'&&await focusVisible();
   await page.keyboard.press('Enter');await page.keyboard.press('Space');
   await page.keyboard.press('Shift+Tab');keyboard&&=await active()==='approve';
   const calls=await page.evaluate(()=>window.__boardCalls);
   keyboard&&=same(calls.map(c=>c.action),['approve','approve','reject','reject']);
  }catch{keyboard=false;}
  passed[0]&&=keyboard;
  passed[1]&&=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1
   &&[...document.querySelectorAll('#approve,#reject')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}));
  let targets=true;
  try{
   await page.evaluate(()=>{window.__boardCalls=[];});
   for(const [id,label]of [['approve','Approve'],['reject','Reject']]){
    const control=page.getByRole('button',{name:label,exact:true});targets&&=await control.count()===1&&await control.isVisible();
    targets&&=await control.getAttribute('id')===id&&await control.getAttribute('data-target')===o.target;
    await control.click();
   }
   targets&&=same(await page.evaluate(()=>window.__boardCalls),[{action:'approve',target:o.target},{action:'reject',target:o.target}]);
  }catch{targets=false;}
  passed[2]&&=targets;passed[3]&&=errors.length===0;
  await context.close();
 }}finally{await browser.close();}
 return {passed,admitted:true,requestCount};
}
function inventory(root){const files=new Map();let count=0,total=0;function visit(name=''){
 const path=join(root,name),s=lstatSync(path);if(++count>200||s.isSymbolicLink())throw Error('unsafe inventory');
 if(s.isDirectory()){const ns=readdirSync(path);if(ns.length>200)throw Error('oversized inventory');for(const n of ns)if(name||n!=='.git')visit(name?name+'/'+n:n);return;}
 const bytes=bounded(path);if((total+=bytes.length)>1048576)throw Error('oversized inventory');files.set(name,bytes);
}visit();return files;}
async function score(){
 const root=realpathSync(process.argv[2]),o=JSON.parse(process.argv[3]);verifyOracle(o);let files,integrity=false;
 try{files=inventory(root);integrity=Object.keys(o.baseline).every(n=>files.has(n))&&[...files.keys()].every(n=>Object.hasOwn(o.baseline,n))&&o.protected.every(n=>sha(files.get(n))===o.baseline[n]);
  if(integrity)integrity=same(JSON.parse(files.get('contracts/decision.json').toString('utf8')),{target:o.target,actions:['approve','reject']});}catch{}
 let passed=[false,false,false,false];if(integrity)passed=(await observeBoard(files.get('web/board.html').toString('utf8'),o,root)).passed;
 process.stdout.write(JSON.stringify({version:1,pid:process.pid,scenario:o.scenario,criteria:o.criteria.map((text,i)=>({text,state:passed[i]?'passed':'failed',
  evidence:passed[i]?'Chromium observed native keyboard, layout and local decision recorder contract':'Browser behavior or protected inventory failed; decision values withheld'}))}));
}
if(process.argv[1]==='-')await score();
