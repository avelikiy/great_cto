/** Isolated synthetic transport fixture. Receives data only; never evaluates input as code. */
import { runKimiReview } from '../../scripts/lib/kimi-review-profile.mjs';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_STDIN_BYTES = 131072;
const input = Buffer.alloc(MAX_STDIN_BYTES);
let inputSize = 0;
for await (const chunk of process.stdin) {
  if (inputSize + chunk.byteLength > MAX_STDIN_BYTES) throw new Error('fixture-input-too-large');
  input.set(chunk, inputSize); inputSize += chunk.byteLength;
}
let fixture;
try { fixture = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.subarray(0, inputSize))); }
catch { throw new Error('fixture-input-invalid-json'); }
if (!fixture || typeof fixture !== 'object' || typeof fixture.source !== 'string'
  || typeof fixture.rawMetadata !== 'string' || !Array.isArray(fixture.metadata) || fixture.metadata.length !== 3
  || !fixture.envelope || !fixture.completion) throw new Error('fixture-input-invalid-shape');

const parent = await realpath(tmpdir());
const dir = await mkdtemp(path.join(parent, 'kimi-fragments-'));
const root = path.join(dir, 'repo'), operatorRoot = path.join(dir, 'operator');
const payload = new TextEncoder().encode(fixture.rawMetadata);
const fragment = new Uint8Array(1), empty = new Uint8Array(0);
const originalFrom = Buffer.from;
let fragmentAllocations = 0, reads = 0, keyReads = 0;
Buffer.from = function (...args) {
  if (args[0] === fragment || args[0] === empty) fragmentAllocations++;
  return originalFrom.apply(Buffer, args);
};
try {
  await mkdir(root, { mode: 0o700 }); await mkdir(operatorRoot, { mode: 0o700 });
  await mkdir(path.join(root, 'src'), { mode: 0o700 });
  await writeFile(path.join(root, 'src/sum.js'), fixture.source, { mode: 0o644 });
  const result = await runKimiReview({ profile: 'kimi-readonly-v1', envelope: fixture.envelope, root, operatorRoot,
    get apiKey() { keyReads++; return 'example-synthetic-key'; },
    uuid: () => '12345678-1234-4234-8234-123456789abc', now: () => 1792843200000,
    fetchImpl: async (url, init) => {
      if (init.method === 'POST') return new Response(JSON.stringify(fixture.completion));
      if (!url.endsWith('/models')) return new Response(JSON.stringify(fixture.metadata[url.endsWith('/endpoints/zdr') ? 2 : 1]));
      let cursor = 0, sendEmpty = true;
      return new Response(new ReadableStream({ pull(controller) {
        if (sendEmpty) { controller.enqueue(empty); sendEmpty = false; return; }
        if (cursor === payload.length) { controller.close(); return; }
        fragment[0] = payload[cursor++]; reads++; controller.enqueue(fragment);
      } }, { highWaterMark: 0 }));
    } });
  process.stdout.write(JSON.stringify({ status: result.status, metadataHash: result.metadataHashes?.models,
    reads, keyReads, fragmentAllocations }));
} finally {
  Buffer.from = originalFrom;
  await rm(dir, { recursive: true, force: true });
}
