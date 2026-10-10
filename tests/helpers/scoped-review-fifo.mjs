// Trusted native fault fixture, not a production worker/command entrypoint.
import fs from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {scopedReviewInput} from '../../scripts/lib/scoped-review-reuse.mjs';
let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>16384)process.exit(3);}
const {state}=JSON.parse(input),target=fs.realpathSync(join(state.root,'src/auth.mjs'));
const originalOpen=fs.openSync,originalRead=fs.readFileSync;
let swapped=false,fifoCreated=false,nonBlocking=false,noFollow=false;
const matches=path=>path===target||path===join(state.root,'src/auth.mjs');
function swap(path){if(!matches(path)||swapped)return;swapped=true;fs.renameSync(path,path+'.original');
 execFileSync('mkfifo',[path],{timeout:1000,stdio:['ignore','ignore','ignore']});fifoCreated=fs.lstatSync(path).isFIFO();}
fs.openSync=(path,flags,...args)=>{swap(path);if(matches(path)){
 nonBlocking=!!(flags&fs.constants.O_NONBLOCK);noFollow=!!(flags&fs.constants.O_NOFOLLOW);}
 return originalOpen(path,flags,...args);};
fs.readFileSync=(path,...args)=>{swap(path);return originalRead(path,...args);};
syncBuiltinESMExports();let refused=false;
try{scopedReviewInput(state,'pci-reviewer',['src/auth.mjs']);}catch{refused=true;}
finally{fs.openSync=originalOpen;fs.readFileSync=originalRead;syncBuiltinESMExports();}
process.stdout.write(JSON.stringify({refused,fifoCreated,nonBlocking,noFollow}));
