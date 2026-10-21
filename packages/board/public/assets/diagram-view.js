/* Bounded, non-executable Mermaid flowchart subset. Other syntax stays source. */
(() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(source) {
    const unsupported = { state: 'unsupported', html: '', reason: 'This diagram syntax is not supported by the bounded viewer. Read the Mermaid source below.' };
    if (typeof source !== 'string' || source.length > 20000) return unsupported;
    const lines = source.split(/\n|;/).map(s => s.trim()).filter(s => s && !s.startsWith('%%'));
    if (!/^(?:flowchart|graph)\s+LR$/.test(lines.shift() || '')) return unsupported;
    const nodes = new Map(), edges = [];
    const node = part => {
      const m = part.trim().match(/^([A-Za-z_][\w-]*)(?:\[([^\]\n]{1,120})\])?$/);
      if (!m) throw Error('unsupported node');
      if (m[2] !== undefined || !nodes.has(m[1])) nodes.set(m[1], (m[2] || m[1]).replace(/^"(.*)"$/, '$1'));
      if (nodes.size > 40) throw Error('node bound'); return m[1];
    };
    try {
      for (const line of lines) {
        const parts = line.split(/\s*-->\s*/);
        if (parts.length > 8) return unsupported;
        const ids = parts.map(node);
        for (let i = 1; i < ids.length; i++) edges.push([ids[i-1], ids[i]]);
        if (edges.length > 80) return unsupported;
      }
      if (!nodes.size) return unsupported;
      const level = new Map([...nodes.keys()].map(id => [id, 0]));
      let changed = false;
      for (let i = 0; i < nodes.size; i++) {
        changed = false;
        for (const [a,b] of edges) if (level.get(b) <= level.get(a)) { level.set(b, level.get(a)+1); changed = true; }
        if (!changed) break;
      }
      if (changed) return unsupported; // Cyclic diagrams need a full layout engine.
      const lanes = new Map(), positions = new Map();
      for (const id of nodes.keys()) { const l = level.get(id), row = lanes.get(l) || 0; lanes.set(l,row+1); positions.set(id,{x:25+l*220,y:35+row*100}); }
      const width = 50+(Math.max(...level.values())+1)*220, height = 55+Math.max(...lanes.values())*100;
      const paths = edges.map(([a,b]) => { const p=positions.get(a),q=positions.get(b);return `<path d="M${p.x+180} ${p.y+28} C${p.x+205} ${p.y+28},${q.x-25} ${q.y+28},${q.x} ${q.y+28} M${q.x-6} ${q.y+23} L${q.x} ${q.y+28} L${q.x-6} ${q.y+33}"/>`; }).join('');
      const boxes = [...nodes].map(([id,label]) => {const p=positions.get(id);return `<g><rect x="${p.x}" y="${p.y}" width="180" height="56" rx="5"/><text x="${p.x+90}" y="${p.y+33}" text-anchor="middle">${esc(label.length > 24 ? label.slice(0,23)+'…' : label)}</text><title>${esc(label)}</title></g>`;}).join('');
      return {state:'rendered',html:`<svg class="knowledge-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="Declared diagram, not live execution"><g class="diagram-edges" fill="none">${paths}</g>${boxes}</svg>`};
    } catch { return unsupported; }
  }
  window.GctoDiagram = { render };
})();
