import fs from 'node:fs';
import path from 'node:path';
import { GROUPS, groupOf } from '../../../scripts/lib/system-map.mjs';
import { readProjectFile, MAX_DOCS } from './docs.mjs';

/** Legacy source-map projection, using the same bounded reads as Knowledge. */
export function knowledgeMap(root) {
  const nodes = [], files = [], edges = new Map();
  let visited = 0, partial = false;
  const walk = (dir, ext, out, depth = 0) => {
    if (depth > 3 || visited >= MAX_DOCS) { partial = true; return; }
    let current = root;
    try {
      for (const part of dir.split(path.sep)) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) { partial = true; return; }
      }
      for (const e of fs.readdirSync(current, { withFileTypes: true })) {
        if (visited >= MAX_DOCS) { partial = true; break; }
        if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'coverage', 'vendor', '_shared'].includes(e.name)) continue;
        if (e.isSymbolicLink()) { partial = true; continue; }
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel, ext, out, depth + 1);
        else if (e.isFile() && ext.some(x => e.name.endsWith(x))) {
          visited++;
          const read = readProjectFile(root, rel);
          if (read.state === 'readable') out.push({ rel, text: read.content });
          else partial = true;
        }
      }
    } catch (e) { if (e.code !== 'ENOENT') partial = true; }
  };
  for (const g of GROUPS) {
    const own = [];
    for (const dir of g.dirs) walk(dir, g.ext, own);
    files.push(...own);
    if (own.length) nodes.push({ key: g.key, label: g.label, what: g.what, count: own.length });
  }
  for (const f of files.filter(f => /\.(mjs|ts)$/.test(f.rel))) {
    const from = groupOf(f.rel);
    for (const m of f.text.matchAll(/(?:^|\n)\s*import\s[^'"]*from\s+['"](\.[^'"]+)['"]/g)) {
      const to = groupOf(path.join(path.dirname(f.rel), m[1]));
      if (!to || from === to) continue;
      const key = `${from}:${to}`;
      edges.set(key, { from, to, count: (edges.get(key)?.count || 0) + 1 });
    }
  }
  return { nodes, edges: [...edges.values()].sort((a, b) => b.count - a.count),
    generatedAt: new Date().toISOString(), state: partial ? 'partial' : 'observed' };
}
