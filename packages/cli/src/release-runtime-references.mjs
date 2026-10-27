import path from 'node:path';

export function inspectRuntimeImportReferences(files) {
  const paths = new Set(files.map(f => f.path));
  for (const file of files) {
    if (!/\.(?:mjs|js|cjs)$/.test(file.path)) continue;
    const source = file.bytes.toString('utf8');
    // Match the publisher's literal-import closure. Computed imports still need runtime smoke.
    const pattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.{1,2}\/[^"'\n\r]+)["']/g;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (/[?#\\]/.test(specifier)) throw Error('unsupported relative runtime import');
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), specifier));
      if (target === '..' || target.startsWith('../') || path.posix.isAbsolute(target) || !paths.has(target)) throw Error(`runtime import missing from archive: ${file.path}`);
    }
  }
}

