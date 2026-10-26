#!/usr/bin/env node
/** Build one exact public runtime set. This does not admit, sign or publish it. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'avelikiy/great_cto';
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SOURCE_ID = /^[a-f0-9]{40}$/;
const MAX_FILE = 32 * 1024 * 1024, MAX_TOTAL = 192 * 1024 * 1024, MAX_ARCHIVE = 128 * 1024 * 1024, MAX_FILES = 8192;
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const artifactNames = version => [
  ['npm', `great-cto-${version}.tgz`], ['plugin', `great-cto-plugin-${version}.tgz`],
  ['inventory', 'plugin-inventory.json'], ['sbom', 'sbom.cdx.json'],
];

export function isPluginRuntimePath(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') || name.includes('\0')) return false;
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /^(?:node_modules|\.git|\.beads|\.great_cto|\.codex|\.claude|tests?|fixtures?|private(?:-overlay)?s?|overlays?|__pycache__)$/i.test(p) || /^\.env(?:$|\.)/.test(p))) return false;
  if (/\.(?:test\.[cm]?[jt]s|tgz|log|pem|key|p12|pfx|bak|pyc)$/i.test(name)) return false;
  if (['LICENSE', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.codex-plugin/plugin.json', '.codex-plugin/mcp.json', '.codex-plugin/hooks.json', '.agents/plugins/marketplace.json', 'packages/cli/index.mjs', 'packages/cli/package.json'].includes(name)) return true;
  if (parts.some(p => p.startsWith('.'))) return false;
  return /^(?:agents|agents-full|types|hooks|commands|skills|shared|scripts|assets|mcp-servers)\//.test(name) || /^packages\/board\//.test(name);
}

/** Resolve only declared public local assets; references cannot widen the allowlist. */
function assertManifestRuntime(snapshot) {
  const entries=new Map(snapshot.map(x=>[x.path,x]));
  const requireAsset=(reference,base='',directory=false)=>{
    if(typeof reference!=='string'||!reference.startsWith('./')||reference.includes('\\'))throw Error('invalid manifest runtime reference');
    const local=reference.slice(2),name=base+local;
    if(local.split('/').some(x=>x==='.'||x==='..'||!x && !directory)||!isPluginRuntimePath(directory?name.replace(/\/$/,'')+'/entry':name))throw Error('unapproved manifest runtime reference');
    if(directory?![...entries.keys()].some(x=>x.startsWith(name.endsWith('/')?name:name+'/')):!entries.has(name))throw Error('missing manifest runtime asset');
  };
  const claude=json(entries.get('.claude-plugin/plugin.json').bytes,'Claude manifest');
  if(!Array.isArray(claude.agents)||!claude.agents.length)throw Error('missing manifest runtime roles');
  for(const reference of claude.agents)requireAsset(reference);
  requireAsset(claude.types);
  for(const config of Object.values(claude.mcpServers||{}))for(const arg of config.args||[])if(typeof arg==='string'&&arg.startsWith('${CLAUDE_PLUGIN_ROOT}/'))requireAsset('./'+arg.slice('${CLAUDE_PLUGIN_ROOT}/'.length));
  const codex=json(entries.get('.codex-plugin/plugin.json').bytes,'Codex manifest');
  for(const field of ['mcpServers','hooks'])if(typeof codex[field]==='string')requireAsset(codex[field]);
  if(codex.skills)requireAsset(codex.skills,'',true);
  if(codex.interface?.composerIcon)requireAsset(codex.interface.composerIcon);
  requireAsset('./hooks/hooks.json');
  {
    const hooks=json(entries.get('hooks/hooks.json').bytes,'hooks module manifest');
    if(!Array.isArray(hooks.modules)||!hooks.modules.length)throw Error('missing module runtime declarations');
    for(const reference of hooks.modules)requireAsset(reference,'hooks/');
  }
}

function readRegular(file, max = MAX_FILE) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.mode & 0o7000 || before.size > max) throw Error('release input must be a bounded regular file without links');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino) throw Error('release input identity changed');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
    if (bytes.length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw Error('release input changed during read');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function sourceFile(source, name) {
  for (let p = join(source, name); p !== source; p = dirname(p)) if (fs.lstatSync(p).isSymbolicLink()) throw Error('source symlink refused');
  return readRegular(join(source, name));
}

export function makeReleaseIndex({ version, commit, tree, directory }) {
  if (!STABLE.test(version) || !SOURCE_ID.test(commit) || !SOURCE_ID.test(tree)) throw Error('invalid release version or source identity');
  const artifacts = artifactNames(version).map(([kind, filename]) => {
    const bytes = readRegular(join(directory, filename), MAX_ARCHIVE);
    return { kind, filename, size: bytes.length, sha256: hash('sha256', bytes), sha512: hash('sha512', bytes) };
  });
  return { schema: 1, package: 'great-cto', version, source: { repository: REPOSITORY, commit, tree, tag: `v${version}` }, publisher: { workflow: '.github/workflows/publish.yml' }, artifacts };
}

function json(bytes, what) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw Error(`invalid ${what}`); } }
function assertZeroDependencies(pkg) {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) if (pkg[field] && Object.keys(pkg[field]).length) throw Error('unadmitted runtime dependency closure');
  if ((Array.isArray(pkg.bundledDependencies) && pkg.bundledDependencies.length) || pkg.bundledDependencies === true || (Array.isArray(pkg.bundleDependencies) && pkg.bundleDependencies.length) || pkg.bundleDependencies === true) throw Error('unadmitted bundled dependency closure');
}
function walkBuild(source, name) {
  const files = [];
  const visit = dir => {
    for (const item of fs.readdirSync(join(source, dir), { withFileTypes: true }).sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const rel = `${dir}/${item.name}`;
      if (item.isSymbolicLink()) throw Error('build output symlink refused');
      if (item.isDirectory()) visit(rel);
      else if (item.isFile() && /\.[cm]?js$/.test(item.name)) files.push(rel);
      else throw Error('unexpected compiled runtime file');
    }
  };
  visit(name); return files;
}

export async function buildReleaseArtifacts({ source = resolve(dirname(fileURLToPath(import.meta.url)), '..'), directory, run = execFileSync, encodeArchive, freshCheckout = false } = {}) {
  source = fs.realpathSync(source);
  if (!isAbsolute(directory || '')) throw Error('release directory must be absolute and outside source');
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw Error('release directory symlink refused');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  directory = fs.realpathSync(directory);
  if (directory === source || directory.startsWith(source + sep)) throw Error('release directory must be outside source');
  if (fs.readdirSync(directory).length) throw Error('release directory must be fresh; refusing overwrite');
  fs.chmodSync(directory, 0o700);
  const git = args => String(run('git', ['-c', 'core.fsmonitor=false', '-C', source, ...args], {encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}));
  if (fs.realpathSync(git(['rev-parse','--show-toplevel']).trim()) !== source) throw Error('release source must be Git root');
  const commit = git(['rev-parse','HEAD']).trim(), tree = git(['rev-parse','HEAD^{tree}']).trim();
  if (!SOURCE_ID.test(commit) || !SOURCE_ID.test(tree) || git(['status','--porcelain','--untracked-files=normal']).trim()) throw Error('release source must be a clean exact commit');
  const tracked = git(['ls-files','--stage','-z']).split('\0').filter(Boolean).map(row => {
    const m = /^(100644|100755) ([a-f0-9]{40}) 0\t(.+)$/.exec(row);
    if (!m) throw Error('unmerged, special or invalid tracked source');
    return { path:m[3], blob:m[2], mode:m[1] === '100755' ? 0o755 : 0o644 };
  });
  const pkg = json(sourceFile(source,'packages/cli/package.json'),'CLI manifest'), version = pkg.version;
  if (pkg.name !== 'great-cto' || !STABLE.test(version)) throw Error('invalid package identity');
  assertZeroDependencies(pkg);
  for (const name of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']) if (json(sourceFile(source,name),'plugin manifest').version !== version) throw Error('release manifests disagree');
  for (const entry of tracked) {
    const stat=fs.lstatSync(join(source,entry.path));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1 || stat.mode & 0o7000) throw Error('source links or special files refused');
  }
  const legacyDist=tracked.filter(x=>x.path.startsWith('packages/cli/dist/'));
  if (fs.existsSync(join(source,'packages/cli/dist'))) {
    const existing=walkBuild(source,'packages/cli/dist');
    if (JSON.stringify(existing.sort())!==JSON.stringify(legacyDist.map(x=>x.path).sort())) throw Error('preexisting compiled dist contains untracked or stale output');
    if (!freshCheckout) throw Error('tracked legacy dist cleanup requires explicit private fresh-checkout authority');
    // Inspect the complete set before deleting any file. Never reuse committed
    // generated code as a substitute for this commit's compiler output.
    for(const entry of legacyDist){const bytes=sourceFile(source,entry.path);if(hash('sha1',Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes]))!==entry.blob)throw Error('tracked legacy dist bytes differ from source');}
    for(const entry of legacyDist)fs.unlinkSync(join(source,entry.path));
  }
  const buildOptions={cwd:source,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']};
  run('npm',['run','build','--ignore-scripts','--offline','--prefix',join(source,'packages/cli')],buildOptions);
  run(process.execPath,[join(source,'packages/cli/scripts/bundle-board.mjs')],buildOptions);
  const packed = String(run('npm',['pack','--ignore-scripts','--offline','--json','--pack-destination',directory],{...buildOptions,cwd:join(source,'packages/cli')}));
  let pack; try { pack=JSON.parse(packed); } catch { throw Error('npm pack did not return a single JSON artifact'); }
  const npmName=`great-cto-${version}.tgz`;
  if (!Array.isArray(pack) || pack.length !== 1 || pack[0].filename !== npmName) throw Error('npm pack artifact identity mismatch');
  fs.chmodSync(join(directory,npmName),0o600);
  const npmBytes=readRegular(join(directory,npmName),MAX_ARCHIVE);
  if (pack[0].integrity !== `sha512-${createHash('sha512').update(npmBytes).digest('base64')}`) throw Error('npm pack digest mismatch');
  const archive = await import('../packages/cli/src/release-archive.mjs');
  const npmFiles = archive.inspectReleaseArchive(npmBytes, {prefix:'package'});
  const packageEntry = npmFiles.find(x=>x.path==='package.json');
  const packedPackage = packageEntry && json(packageEntry.bytes,'packed package manifest');
  if (!packedPackage || packedPackage.name !== 'great-cto' || packedPackage.version !== version) throw Error('packed package identity differs from source');
  assertZeroDependencies(packedPackage);
  for (const name of ['index.mjs','dist/main.js','board/packages/board/server.mjs']) if (!npmFiles.some(x=>x.path===name)) throw Error('npm runtime is incomplete');
  for (const entry of npmFiles) if (!/^(?:index\.mjs|package\.json|postinstall\.mjs|LICENSE|README\.md|dist\/[^/]+\.[cm]?js|assets\/.+|board\/.+)$/.test(entry.path) || /(?:^|\/)(?:tests?|fixtures?|private(?:-overlay)?s?|overlays?)(?:\/|$)/i.test(entry.path)) throw Error('unapproved npm runtime member');
  const selected=tracked.filter(x=>isPluginRuntimePath(x.path));
  const snapshot=selected.map(entry=>{
    const bytes=sourceFile(source,entry.path);
    if (hash('sha1',Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])) !== entry.blob) throw Error('tracked runtime differs from source commit');
    return {path:entry.path,bytes,mode:entry.mode};
  });
  assertManifestRuntime(snapshot);
  const built=walkBuild(source,'packages/cli/dist');
  for (const name of ['packages/cli/dist/main.js','packages/cli/dist/archetypes.js']) if (!built.includes(name)) throw Error('complete CLI build is missing');
  const newestSource=Math.max(...tracked.filter(x=>x.path.startsWith('packages/cli/src/')).map(x=>fs.statSync(join(source,x.path)).mtimeMs));
  if (built.some(name=>fs.statSync(join(source,name)).mtimeMs < newestSource)) throw Error('compiled runtime is stale');
  const packedDist=npmFiles.filter(x=>x.path.startsWith('dist/'));
  if (JSON.stringify(packedDist.map(x=>x.path).sort())!==JSON.stringify(built.map(x=>x.slice('packages/cli/'.length)).sort())) throw Error('npm and plugin compiled runtime inventories differ');
  for (const name of built) {
    const bytes=sourceFile(source,name);
    if (!packedDist.find(x=>x.path===name.slice('packages/cli/'.length))?.bytes.equals(bytes)) throw Error('npm and plugin compiled runtime bytes differ');
    snapshot.push({path:name,bytes,mode:0o644});
  }
  snapshot.sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (snapshot.length > MAX_FILES || new Set(snapshot.map(x=>x.path)).size !== snapshot.length || snapshot.reduce((n,x)=>n+x.bytes.length,0)>MAX_TOTAL) throw Error('runtime inventory exceeds bounds or duplicates files');
  for (const name of ['LICENSE','.claude-plugin/plugin.json','.codex-plugin/plugin.json','.codex-plugin/mcp.json','.agents/plugins/marketplace.json','skills/great_cto/SKILL.md','mcp-servers/llm-router/server.py','packages/board/server.mjs','packages/cli/index.mjs']) if (!snapshot.some(x=>x.path===name)) throw Error('required plugin runtime missing');
  if (git(['status','--porcelain','--untracked-files=normal','--','.',...legacyDist.map(x=>`:(exclude)${x.path}`)]).trim() || git(['rev-parse','HEAD']).trim() !== commit) throw Error('release source changed during build');
  const encode=encodeArchive || archive.encodeReleaseArchive;
  const inventory={schema:1,version,files:snapshot.map(x=>({path:x.path,size:x.bytes.length,sha256:hash('sha256',x.bytes),mode:x.mode}))};
  const write=(name,bytes)=>{if(Buffer.byteLength(bytes)>MAX_ARCHIVE)throw Error('release artifact exceeds approved archive bound');return fs.writeFileSync(join(directory,name),bytes,{flag:'wx',mode:0o600});};
  write(`great-cto-plugin-${version}.tgz`,encode(snapshot,{prefix:'plugin'}));
  write('plugin-inventory.json',JSON.stringify(inventory,null,2)+'\n');
  const ref=`pkg:npm/great-cto@${version}`;
  const sbom={bomFormat:'CycloneDX',specVersion:'1.6',version:1,metadata:{tools:{components:[{type:'application',name:'great-cto-release-builder',version:'1'}]},component:{type:'application',name:'great-cto',version,purl:ref,'bom-ref':ref},properties:[{name:'great-cto:inventory-scope',value:'production runtime dependency closure only; development build tools excluded'},{name:'great-cto:source-commit',value:commit}]},components:[],dependencies:[{ref,dependsOn:[]}]};
  write('sbom.cdx.json',JSON.stringify(sbom,null,2)+'\n');
  const index=makeReleaseIndex({version,commit,tree,directory});
  write('release-index.json',JSON.stringify(index,null,2)+'\n');
  return {state:'PREPARED',version,commit,tree,artifacts:index.artifacts,pluginFiles:snapshot.length,signed:false,published:false,installed:false};
}

/** Compare independent builds before signing; never rebuild during publication. */
export function compareReleaseArtifactSets(first,second){
  const left=json(readRegular(join(first,'release-index.json'),256*1024),'release index');
  const right=json(readRegular(join(second,'release-index.json'),256*1024),'release index');
  for(const [directory,index] of [[first,left],[second,right]]){
    const actual=makeReleaseIndex({version:index.version,commit:index.source?.commit,tree:index.source?.tree,directory});
    if(JSON.stringify(actual)!==JSON.stringify(index))throw Error('build index does not bind artifact bytes');
  }
  if(JSON.stringify(left)!==JSON.stringify(right))throw Error('independent release builds differ');
  for(const name of [...left.artifacts.map(x=>x.filename),'release-index.json'])if(!readRegular(join(first,name),MAX_TOTAL).equals(readRegular(join(second,name),MAX_TOTAL)))throw Error('independent release bytes differ');
  return {state:'BYTE_IDENTICAL',version:left.version,commit:left.source.commit,artifacts:5,scope:'same pinned hosted toolchain; not a SLSA level claim'};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--self-test')){
    if(process.argv.length!==3){console.error('--self-test accepts no release arguments');process.exitCode=2;}else{
    // A nested Node test runner would silently skip files under this marker.
    const testEnv={...process.env};delete testEnv.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../tests/lib/release-distribution-publisher.test.mjs',import.meta.url))],{stdio:'inherit',env:testEnv});
    process.exitCode=result.status??1;
    }
  }else{
  const args=process.argv.slice(2), out=args.indexOf('--out'), source=args.indexOf('--source');
  if(args[0]==='--compare'){try{process.stdout.write(JSON.stringify(compareReleaseArtifactSets(args[1],args[2]))+'\n');}catch(error){console.error(`release comparison refused: ${error.message}`);process.exitCode=1;}}
  else
  if (out < 0 || !args[out+1]) { console.error('usage: build-release-artifacts.mjs --out ABSOLUTE_DIRECTORY [--source GIT_ROOT]'); process.exitCode=2; }
  else buildReleaseArtifacts({directory:args[out+1],freshCheckout:args.includes('--fresh-checkout'),...(source>=0?{source:args[source+1]}:{})}).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{console.error(`release build refused: ${error.message}`);process.exitCode=1;});
  }
}
