/** Reject duplicate decoded keys before JSON.parse can erase their ambiguity. */
export function parseStrictObject(text, { maxBytes = 256 * 1024 } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > maxBytes) throw Error('JSON input size refused');
  let at = 0, nodes = 0;
  const white = () => { while (/[ \n\r\t]/.test(text[at] || '#')) at++; };
  const string = () => {
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '\\') { at++; continue; }
      if (c === '"') { try { return JSON.parse(text.slice(start, at)); } catch { throw Error('invalid JSON string'); } }
    }
    throw Error('unterminated JSON string');
  };
  const value = depth => {
    if (depth > 32 || ++nodes > 100_000) throw Error('JSON depth or node limit exceeded');
    white(); const c = text[at];
    if (c === '"') { string(); return; }
    if (c === '{') {
      at++; white(); const seen = new Set();
      if (text[at] === '}') { at++; return; }
      while (true) {
        white(); if (text[at] !== '"') throw Error('invalid JSON object key');
        const k = string();
        if (seen.has(k) || ['__proto__', 'constructor', 'prototype'].includes(k)) throw Error('duplicate or unsafe JSON key');
        seen.add(k); white(); if (text[at++] !== ':') throw Error('invalid JSON object separator');
        value(depth + 1); white(); const next = text[at++];
        if (next === '}') return; if (next !== ',') throw Error('invalid JSON object delimiter');
      }
    }
    if (c === '[') {
      at++; white(); if (text[at] === ']') { at++; return; }
      while (true) { value(depth + 1); white(); const next = text[at++]; if (next === ']') return; if (next !== ',') throw Error('invalid JSON array delimiter'); }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));
    if (!match) throw Error('invalid JSON value'); at += match[0].length;
  };
  value(0); white(); if (at !== text.length) throw Error('trailing JSON data');
  let parsed; try { parsed = JSON.parse(text); } catch { throw Error('invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('JSON object required');
  return parsed;
}

