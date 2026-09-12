/** Minimal TOML subset used by both native hook and controlled Codex host. */
export function parsePipelineToml(text) {
  const transitions = {};
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[transitions\.([\w.-]+)\]$/);
    if (sec) { cur = transitions[sec[1]] = {}; continue; }
    if (/^\[/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const kv = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, valRaw] = kv;
    if (valRaw.startsWith('[')) {
      cur[key] = valRaw.replace(/^\[|\]$/g, '').split(',')
        .map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else cur[key] = valRaw.trim().replace(/^"|"$/g, '');
  }
  return transitions;
}
