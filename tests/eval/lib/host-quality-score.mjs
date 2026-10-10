import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { cases } from './host-quality-cases.mjs';

// No host functions, process, filesystem or network exposed to generated code.
// VM is defense in depth for this local corpus, not a production security boundary.
export async function score(source, task) {
  if (typeof vm.SourceTextModule !== 'function') {
    // Keep the ordinary node --test entrypoint working too; only the isolated
    // evaluator child needs VM-module support, not the rest of the test suite.
    return JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url), '--stdin'], {
      input: JSON.stringify({ source, task }), encoding: 'utf8', timeout: 20000,
      maxBuffer: 256 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    }));
  }
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  let module;
  try {
    module = new vm.SourceTextModule(source, { context });
    await module.link(() => { throw Error('imports are forbidden'); });
    await module.evaluate({ timeout: 1000 });
    if (typeof module.namespace[task.fn] !== 'function') throw Error('missing export');
    context.fn = module.namespace[task.fn];
  } catch {
    return { passed: 0, total: task.tests.length, checks: task.tests.map(t => ({ id: t.id, passed: false })) };
  }
  const checks = task.tests.map(t => {
    try {
      // Deserialize and invoke inside the timed context; check input mutation too.
      const encoded = JSON.stringify(t.args);
      const raw = vm.runInContext(`(() => { const args = ${encoded}; const before = JSON.stringify(args); const result = fn(...args); return JSON.stringify({result, unchanged: before === JSON.stringify(args)}); })()`, context, { timeout: 1000 });
      const { result, unchanged } = JSON.parse(raw);
      return { id: t.id, passed: unchanged && JSON.stringify(result) === JSON.stringify(t.expected) };
    } catch { return { id: t.id, passed: false }; }
  });
  return { passed: checks.filter(t => t.passed).length, total: checks.length, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const payload = process.argv[2] === '--stdin' ? JSON.parse(readFileSync(0, 'utf8')) : null;
  const task = payload ? payload.task : cases.find(t => t.id === process.argv[2]);
  if (!task) throw Error('unknown scoring task');
  console.log(JSON.stringify(await score(payload ? payload.source : readFileSync(process.argv[3], 'utf8'), task)));
}
