import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildReleaseArtifacts, isPluginRuntimePath } from '../../scripts/build-release-artifacts.mjs';
import { inspectReleaseArchive } from '../../packages/cli/src/release-archive.mjs';
import { NATIVE_COMPANIONS } from '../../packages/cli/src/native-companion-bundle.mjs';
import { nativeCompanionSources } from '../helpers/native-companion-sources.mjs';
import { releaseBuildFixture } from '../helpers/release-build-fixture.mjs';

function candidate(t, { lock = true, dependencies = true } = {}) {
  const upstream = nativeCompanionSources(t), f = releaseBuildFixture(t);
  if (lock) fs.writeFileSync(path.join(f.source, 'native-companions.lock.json'), JSON.stringify(upstream.lock));
  const file = path.join(f.source, '.claude-plugin/plugin.json'), manifest = JSON.parse(fs.readFileSync(file));
  if (dependencies) manifest.dependencies = NATIVE_COMPANIONS.map(component => component.id);
  fs.writeFileSync(file, JSON.stringify(manifest));
  f.git(['add', '.']); f.git(['commit', '--quiet', '-m', 'Pin inert companion fixture sources']);
  return { ...f, upstream, nativeCompanionSources: upstream.repositories };
}

test('explicit offline profile includes component inventories and truthful SBOM edges in the plugin only', async t => {
  const f = candidate(t), result = await buildReleaseArtifacts(f);
  assert.equal(result.state, 'PREPARED'); assert.equal(result.signed, false); assert.equal(result.installed, false);
  assert.deepEqual(result.nativeCompanions.components, NATIVE_COMPANIONS.map(component => component.id));
  assert.equal(result.nativeCompanions.runtimeClosure, 'NOT_CHECKED');
  const entries = inspectReleaseArchive(fs.readFileSync(path.join(f.directory, 'great-cto-plugin-1.2.3.tgz')), { prefix: 'plugin' });
  const descriptor = JSON.parse(entries.find(file => file.path === 'native-companions.json').bytes);
  assert.equal(descriptor.components.length, 2);
  for (const component of descriptor.components) {
    const actual = entries.filter(file => file.path.startsWith(component.root + '/'));
    assert.equal(actual.length, component.files.length);
    assert.ok(actual.some(file => file.path.endsWith('/LICENSE')));
  }
  assert.equal(entries.some(file => file.path.includes('.beads')), false);
  const sbom = JSON.parse(fs.readFileSync(path.join(f.directory, 'sbom.cdx.json')));
  assert.equal(sbom.components.length, 2); assert.equal(sbom.dependencies[0].dependsOn.length, 2);
  assert.match(sbom.metadata.properties[0].value, /native runtime closure NOT CHECKED/);
  for (const component of sbom.components) assert.ok(sbom.dependencies[0].dependsOn.includes(component['bom-ref']));
  const npm = inspectReleaseArchive(fs.readFileSync(path.join(f.directory, 'great-cto-1.2.3.tgz')));
  assert.equal(npm.some(file => file.path.startsWith('vendor/')), false);
  const publicMetadata = JSON.stringify({ sbom, descriptor, result });
  assert.equal(publicMetadata.includes(f.source), false); assert.equal(publicMetadata.includes(f.upstream.base), false);
});

test('existing default build stays unchanged even when a companion lock is present', async t => {
  const f = candidate(t); const { nativeCompanionSources: unused, ...plain } = f;
  const result = await buildReleaseArtifacts(plain);
  assert.equal(result.nativeCompanions, undefined);
  const entries = inspectReleaseArchive(fs.readFileSync(path.join(f.directory, 'great-cto-plugin-1.2.3.tgz')), { prefix: 'plugin' });
  assert.equal(entries.some(file => file.path === 'native-companions.json'), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory, 'sbom.cdx.json'))).components.length, 0);
});

test('profile requires committed source lock and original required dependencies before packing', async t => {
  const absent = candidate(t, { lock: false });
  await assert.rejects(buildReleaseArtifacts(absent), /lock must belong/);
  assert.equal(absent.calls.some(call => call.bin === 'npm'), false);
  const dropped = candidate(t, { dependencies: false });
  await assert.rejects(buildReleaseArtifacts(dropped), /preserve required/);
  assert.equal(dropped.calls.some(call => call.bin === 'npm'), false);
});

test('offline source projection helper never becomes shipped runtime', () => {
  assert.equal(isPluginRuntimePath('scripts/lib/native-companion-builder.mjs'), false);
  assert.equal(isPluginRuntimePath('native-companions.lock.json'), false);
});
