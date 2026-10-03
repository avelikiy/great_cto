import {createHash,randomBytes} from 'node:crypto';
import {scenarios} from './adaptive-benchmark-protocol.mjs';
export function apiCompatibilityBenchmarkFixture(){
 const files={'.gitignore':'.great_cto/\n','.great_cto/PROJECT.md':'archetype: web-service\npacks: [api-platform-pack]\n',
  'package.json':'{"name":"api-compatibility-benchmark","private":true,"type":"module"}\n',
  'README.md':`# Optional API metadata repair

Repair src/api/summary.mjs. Export async run({request,source}). Request must be a
non-null object, not array, with only optional includeSource:boolean. Empty request
is the old client. Invalid request returns {status:400,body:{error:'invalid_request'}}
before source access. Source must be {available:true,id:nonempty string,count:
nonnegative safe integer,asOf:nonempty string}. Missing/unavailable/malformed source
returns {status:503,body:{error:'source_unavailable'}}, never count0 or missing-ID
success. Valid zero is real data. Success is {status:200,body:{id,count}} exactly;
includeSource:true adds source:{asOf} to body. False/omitted must preserve the old
exact body shape. Never mutate request/source; never expose other source fields.
No production endpoint/provider or authentication is supplied. This is the API
handler contract, not an HTTP deployment or full authentication stack.
`,
  'contracts/legacy-response.json':'{"status":200,"bodyFields":["id","count"]}\n',
  'src/api/summary.mjs':`export async function run({request,source}){
 return {status:200,body:{id:source?.id??'missing',count:Number(source?.count??0),source:{asOf:source?.asOf??'unknown'}}};
}\n`};
 const suffix=randomBytes(8).toString('hex'),source={available:true,id:'source-'+suffix,count:17,asOf:'snapshot-'+suffix};
 const cases=[],add=(kind,request,value,expected)=>cases.push({kind,input:{request,source:value},expected});
 const success=(s,extra=false)=>({status:200,body:{id:s.id,count:s.count,...(extra?{source:{asOf:s.asOf}}:{})}});
 const invalid={status:400,body:{error:'invalid_request'}},missing={status:503,body:{error:'source_unavailable'}};
 add('legacy',{},source,success(source));add('legacy',{includeSource:false},source,success(source));
 add('legacy',{}, {...source,count:0},success({...source,count:0}));
 add('optional',{includeSource:true},source,success(source,true));add('optional',{includeSource:true},{...source,count:0},success({...source,count:0},true));
 for(const request of [null,[],{includeSource:'true'},{includeSource:0},{includeSource:null},{unknown:true}])add('schema',request,source,invalid);
 add('schema',{includeSource:'false'},null,invalid); // request validation wins over missing source
 for(const value of [null,{...source,available:false},{...source,count:null},{...source,count:'0'},
  {...source,count:-1},{...source,count:1.5},{...source,id:''},{...source,asOf:''},{...source,count:9007199254740992}])add('missing',{includeSource:true},value,missing);
 const scenario=scenarios.find(s=>s.id==='api-compatibility'),sha=x=>createHash('sha256').update(x).digest('hex');
 return {files,oracle:{version:1,scenario:scenario.id,criteria:scenario.checks,cases,
  baseline:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)])),protected:Object.keys(files).filter(n=>n!=='src/api/summary.mjs')}};
}
