import { lstatSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute, sep } from 'node:path';

// Literal runtime imports only. Computed imports and filesystem assets need
// separate runtime probes; this is not a loaded-module attestation.
export function runtimeImportClosure(root, seeds) {
  root = resolve(root);
  const needed = new Set(seeds.map(file => resolve(file)));
  for (const file of needed) {
    const rel = relative(root, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw Error('runtime import escapes repository');
    // Reject links at every level, not only at the final module.
    let cursor = root;
    for (const part of rel.split(sep)) {
      cursor = resolve(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) throw Error('runtime import uses symbolic link');
    }
    if (!lstatSync(file).isFile()) throw Error('runtime import is not a regular file');
    const source = readFileSync(file, 'utf8');
    const imports = /\bfrom\s*['"](\.{1,2}\/[^'"\n]+)['"]|\bimport\s*(?:\(\s*)?['"](\.{1,2}\/[^'"\n]+)['"]/g;
    for (const match of source.matchAll(imports)) {
      const specifier = match[1] || match[2];
      if (!/\.(?:mjs|js)$/.test(specifier)) throw Error('unsupported relative runtime import');
      needed.add(resolve(dirname(file), specifier));
    }
  }
  return [...needed].sort();
}
