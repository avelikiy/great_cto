/**
 * The global memory layer (~/.great_cto/{preferences,decisions,lessons}.md) is
 * injected into every session of every project. What is true of one project
 * belongs in that project's own .great_cto/, never here: in the global layer it
 * tells every other project about it — and, with a private name in it, it does
 * so for a project the operator keeps private.
 *
 * 2026-10-05: a learner run whose cwd was the home directory wrote two lessons
 * naming a private project into ~/.great_cto/lessons.md. 3.49.1 stopped that
 * writer. This is the read side, and holds whoever writes the file: a learner,
 * /crystallize, a hand edit, a future tool.
 *
 * An entry is dropped when it names a private project (see private-terms.mjs)
 * or declares `project: <name>` for anything but the public project. An entry
 * is the preamble, a `#`/`##` section, or a frontmatter block (`---` followed by
 * a `key: value` line) up to the next entry. Fenced code is content, never a
 * boundary.
 */

const HEADING = /^#{1,2}\s/;
const FM_KEY = /^[A-Za-z_][\w-]*:\s?/;
const FENCE = /^\s*(```|~~~)/;
/** `project:` values that do not scope an entry to one private project. */
const UNSCOPED = new Set(['', 'great_cto', 'great-cto', '<private-project>', 'any', 'all', '*']);

function fenceMask(lines) {
  let open = false;
  return lines.map((l) => {
    if (FENCE.test(l)) { open = !open; return true; }
    return open;
  });
}

function projectOf(entryLines) {
  if (entryLines[0] !== '---') return null;
  for (let i = 1; i < entryLines.length && entryLines[i] !== '---'; i++) {
    const m = entryLines[i].match(/^project:\s*(.*)$/i);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
  }
  return null;
}

/**
 * @param {string} text
 * @param {{has: (text: string) => boolean}} opts  has = termMatcher(privateTerms().terms)
 * @returns {{content: string, dropped: {line: number, why: 'names-private-project'|'project-scoped'}[]}}
 */
export function screenProjectScope(text, { has }) {
  const lines = String(text ?? '').split('\n');
  const fenced = fenceMask(lines);
  const starts = [0];
  for (let i = 1; i < lines.length; i++) {
    if (fenced[i]) continue;
    const opensFm = lines[i] === '---' && i + 1 < lines.length && FM_KEY.test(lines[i + 1]);
    if (HEADING.test(lines[i]) || opensFm) starts.push(i);
  }
  const kept = []; const dropped = [];
  for (let e = 0; e < starts.length; e++) {
    const from = starts[e];
    const to = e + 1 < starts.length ? starts[e + 1] : lines.length;
    const chunk = lines.slice(from, to);
    const project = projectOf(chunk);
    if (project !== null && !UNSCOPED.has(project)) {
      dropped.push({ line: from + 1, why: 'project-scoped' });
    } else if (has(chunk.join('\n'))) {
      dropped.push({ line: from + 1, why: 'names-private-project' });
    } else {
      kept.push(...chunk);
    }
  }
  return { content: kept.join('\n'), dropped };
}
