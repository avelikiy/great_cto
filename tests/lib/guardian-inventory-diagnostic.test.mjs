import {test} from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync,lstatSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createBrowserResourceOwner} from '../../scripts/lib/browser-guardian-resources.mjs';
const entry=fileURLToPath(new URL('../helpers/guardian-inventory-fault.mjs',import.meta.url));
for(const [mode,outcome,errorCode,signal,status,reason] of [
 ['nonzero','nonzero-or-unknown',null,null,7,'process-refused'],
 ['timeout','timeout','ETIMEDOUT','SIGKILL',null,'process-refused'],
 ['output-limit','output-limit','ENOBUFS','SIGKILL',null,'process-refused'],
 ['signal','signalled',null,'SIGKILL',null,'process-refused'],
 ['invalid-rows','exited-zero',null,null,0,'rows-refused'],
])test('actual inventory construction cause remains private '+mode,
 {skip:!['darwin','linux'].includes(process.platform)},t=>{
 const original=cp.spawnSync;
 t.after(()=>{cp.spawnSync=original;syncBuiltinESMExports();});
 cp.spawnSync=(bin,args,options)=>{
  assert.equal(bin,'/bin/ps');assert.equal(options.timeout,1000);assert.equal(options.maxBuffer,1048576);
  assert.equal(options.killSignal,'SIGKILL');
  return original(process.execPath,[entry,mode],options);
 };
 syncBuiltinESMExports();
 assert.throws(()=>createBrowserResourceOwner({ownerPid:process.pid}),error=>{
  assert.equal(error.message,'inventory unavailable');
  const diagnostic=error.privateDiagnostic;
  assert.equal(diagnostic.stage,'construction-inventory');assert.equal(diagnostic.reason,reason);
  assert.equal(diagnostic.inventory.outcome,outcome);assert.equal(diagnostic.inventory.errorCode,errorCode);
  assert.equal(diagnostic.inventory.signal,signal);assert.equal(diagnostic.inventory.exitCode,status);
  assert.equal(diagnostic.inventory.timeoutMs,1000);assert.equal(diagnostic.inventory.descendantQuiescenceVerified,false);
  assert.equal(diagnostic.inventory.benchmarkEligible,false);assert.ok(Object.isFrozen(diagnostic));
  assert.ok(Object.isFrozen(diagnostic.inventory));assert.ok(diagnostic.inventory.elapsedMs>=0);
  assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_PAYLOAD|stdout|stderr|capability|profilePath/);
  return true;
 });
});

// Construction uses the real OS inventory. Only the subsequent registration
// inventory is faulted; no successful process registration is claimed here.
for(const [mode,outcome,reason] of [
 ['nonzero','nonzero-or-unknown','process-refused'],
 ['timeout','timeout','process-refused'],
 ['output-limit','output-limit','process-refused'],
 ['signal','signalled','process-refused'],
 ['invalid-rows','exited-zero','rows-refused'],
])test('registration preserves private native cause '+mode,
 {skip:!['darwin','linux'].includes(process.platform)},t=>{
 const owner=createBrowserResourceOwner({ownerPid:process.pid});
 const root=owner.privateRoot(),identity=lstatSync(root);
 const profilePath=join(root,'playwright_chromiumdev_profile-Test123');
 mkdirSync(profilePath,{mode:0o700});
 mkdirSync(join(root,'playwright-artifacts-Test123'),{mode:0o700});
 const original=cp.spawnSync;
 t.after(()=>{
  cp.spawnSync=original;syncBuiltinESMExports();
  const current=lstatSync(root);
  assert.equal(current.ino,identity.ino);assert.equal(current.dev,identity.dev);
  rmSync(root,{recursive:true,force:true});
 });
 cp.spawnSync=(bin,args,options)=>{
  assert.equal(bin,'/bin/ps');assert.equal(options.timeout,1000);
  assert.equal(options.maxBuffer,1048576);assert.equal(options.killSignal,'SIGKILL');
  return original(process.execPath,[entry,mode],options);
 };
 syncBuiltinESMExports();
 const snapshot=owner.register({scorerPid:process.pid,browserRoots:[process.pid+1],profilePath});
 assert.equal(snapshot.state,'PRESERVED');
 for(const flag of ['osQuiescenceVerified','resourceClosureVerified','cleanupAuthorized',
  'independentAdmissionVerified','benchmarkEligible'])assert.equal(snapshot[flag],false);
 assert.ok(!Object.hasOwn(snapshot,'privateDiagnostic')&&!Object.hasOwn(snapshot,'inventory'));
 const diagnostic=owner.privateDiagnostic();
 assert.equal(diagnostic.stage,'registration-inventory');assert.equal(diagnostic.reason,reason);
 assert.equal(diagnostic.inventory.outcome,outcome);
 assert.ok(Object.isFrozen(diagnostic));assert.ok(Object.isFrozen(diagnostic.inventory));
 assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_PAYLOAD|stdout|stderr|capability|profilePath/);
 assert.ok(!JSON.stringify(diagnostic).includes(root));
 owner.observe();owner.register({});
 assert.deepEqual(owner.privateDiagnostic(),diagnostic,'irreversible refusal retains its native cause');
 assert.ok(lstatSync(profilePath).isDirectory(),'refusal does not delete test-owned scratch');
});
