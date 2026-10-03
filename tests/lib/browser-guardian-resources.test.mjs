import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,chmodSync,symlinkSync,rmSync,lstatSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createBrowserResourceOwner} from '../../scripts/lib/browser-guardian-resources.mjs';
const platformOptions={skip:!['darwin','linux'].includes(process.platform)?'OS inventory unsupported; resource ownership NOT CHECKED':false};

for(const mode of ['empty','duplicate','foreign-scorer','outside-profile','symlink-profile','wrong-name','root-mode','pre-registration']){
 test('resource owner preserves '+mode,platformOptions,()=>{
  const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot(),identity=lstatSync(root);
  const profile=join(root,'playwright_chromiumdev_profile-Test123');
  mkdirSync(profile,{mode:0o700});
  mkdirSync(join(root,'playwright-artifacts-Test123'),{mode:0o700});
  try{
   const input={scorerPid:process.pid,browserRoots:[process.pid+1],profilePath:profile};
   if(mode==='empty')input.browserRoots=[];
   if(mode==='duplicate')input.browserRoots=[process.pid+1,process.pid+1];
   if(mode==='outside-profile')input.profilePath='/tmp/playwright_chromiumdev_profile-Test123';
   if(mode==='symlink-profile'){input.profilePath=join(root,'playwright_chromiumdev_profile-Link123');symlinkSync(profile,input.profilePath);}
   if(mode==='wrong-name')input.profilePath=root;
   if(mode==='root-mode')chmodSync(root,0o755);
   const result=mode==='pre-registration'?owner.observe():owner.register(input);
   assert.equal(result.state,'PRESERVED');
   assert.equal(result.cleanupAuthorized,false);
   assert.equal(result.benchmarkEligible,false);
   const diagnostic=owner.privateDiagnostic();
   assert.ok(Object.isFrozen(diagnostic));assert.ok(Object.isFrozen(diagnostic.inventory));
   assert.equal(diagnostic.inventory.timeoutMs,1000);
   assert.equal(diagnostic.inventory.benchmarkEligible,false);
   assert.ok(!JSON.stringify(diagnostic).includes(root));
   assert.ok(!Object.hasOwn(result,'privateDiagnostic')&&!Object.hasOwn(result,'inventory'));
   assert.equal(owner.register(input).state,'PRESERVED','failed owner cannot be revived');
   assert.equal(owner.observe().state,'PRESERVED');
   assert.ok(!JSON.stringify(result).includes(root),'public snapshot withholds private root');
   assert.ok(lstatSync(profile).isDirectory(),'registration never deletes profile');
  }finally{
   const current=lstatSync(root);assert.equal(current.ino,identity.ino);assert.equal(current.dev,identity.dev);
   rmSync(root,{recursive:true,force:true});
  }
 });
}
test('resource owner rejects caller-selected owner PID',()=>{
 assert.throws(()=>createBrowserResourceOwner({ownerPid:process.pid+1}),/unavailable/);
});
test('resource owner rejects replaced root inode before registration',platformOptions,()=>{
 const owner=createBrowserResourceOwner({ownerPid:process.pid}),root=owner.privateRoot(),identity=lstatSync(root),moved=root+'-original';
 renameSync(root,moved);mkdirSync(root,{mode:0o700});const replacement=lstatSync(root);
 try{
  assert.equal(owner.register({scorerPid:process.pid,browserRoots:[process.pid+1],
   profilePath:join(root,'playwright_chromiumdev_profile-Test123')}).state,'PRESERVED');
  assert.equal(lstatSync(moved).ino,identity.ino,'original root must remain untouched');
 }finally{
  assert.equal(lstatSync(root).ino,replacement.ino);rmSync(root,{recursive:true,force:true});
  assert.equal(lstatSync(moved).ino,identity.ino);rmSync(moved,{recursive:true,force:true});
 }
});
