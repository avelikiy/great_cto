/**
 * shared-fragments — inline the `agents/_shared/*.md` fragments an agent points at.
 *
 * An agent file says "see `agents/_shared/verdict-format.md`". That relative path
 * exists in this repository and nowhere an agent runs: in a user's project the
 * pointer names a file that is not there. Across every retained session log on
 * the machine that measured it (2026-09-21), agents outside this repository
 * opened a fragment twice — once by searching the whole disk — while being
 * dispatched hundreds of times.
 *
 * One function, two callers, on purpose: sync-managed inlines fragments into the
 * agents it installs, and the eval runner inlines them into the prompt it
 * measures. When the two drifted, the evals measured a prompt users never got.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function stripFrontmatter(text) {
  return String(text).replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

/**
 * @param {string} body  the agent text (frontmatter may be present; it is left alone)
 * @param {{root:string, seen?:Set<string>}} opts  root = the plugin's agents/ directory
 * @returns {{text:string, expanded:string[]}}
 */
export function expandSharedRefs(body, { root, seen = new Set() } = {}) {
  if (!body) return { text: body, expanded: [] };
  const expanded = [];
  const text = body.replace(/`?agents\/_shared\/([a-z0-9-]+\.md)`?/gi, (match, file) => {
    if (seen.has(file)) return match;   // a pointer back to something already inlined
    let content;
    try {
      content = stripFrontmatter(readFileSync(join(root, '_shared', file), 'utf8'));
    } catch {
      return match;   // a pointer at a file that does not exist stays a pointer
    }
    seen.add(file);
    expanded.push(file);
    // Nested: a shared file may point at another. Same `seen` set bounds the walk.
    const inner = expandSharedRefs(content, { root, seen });
    expanded.push(...inner.expanded);
    return `${match}\n\n<<< BEGIN agents/_shared/${file} >>>\n${inner.text}\n<<< END agents/_shared/${file} >>>`;
  });
  return { text, expanded };
}
