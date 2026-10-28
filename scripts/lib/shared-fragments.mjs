/**
 * shared-fragments — inline the `shared/agent-fragments/*.md` fragments an agent points at.
 *
 * An agent file says "see `shared/agent-fragments/verdict-format.md`". That relative path
 * exists in this repository and nowhere an agent runs: in a user's project the
 * pointer names a file that is not there. Across every retained session log on
 * the machine that measured it (2026-09-21), agents outside this repository
 * opened a fragment twice — once by searching the whole disk — while being
 * dispatched hundreds of times.
 *
 * Where the fragments live: `shared/agent-fragments/`, not under `agents/`.
 * `claude plugin validate` treats every .md under agents/ as an agent definition,
 * and a fragment has no frontmatter by design — seventeen warnings on every run.
 * `shared/` is already a runtime directory of the plugin (pipeline.toml,
 * orchestrator.toml), carried by the git marketplace checkout and the versioned
 * cache copy alike.
 *
 * One function, two callers, on purpose: sync-managed inlines fragments into the
 * agents it installs, and the eval runner inlines them into the prompt it
 * measures. When the two drifted, the evals measured a prompt users never got.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fragments directory of the plugin installed at `pluginRoot`. */
export const fragmentsDirOf = (pluginRoot) => join(pluginRoot, 'shared', 'agent-fragments');

// This file is scripts/lib/shared-fragments.mjs of the plugin tree, so two levels up is
// the plugin root — the checkout or the cache copy the caller itself runs from.
const OWN_FRAGMENTS = fragmentsDirOf(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

export function stripFrontmatter(text) {
  return String(text).replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

/**
 * @param {string} body  the agent text (frontmatter may be present; it is left alone)
 * @param {{fragmentsDir?:string, seen?:Set<string>}} opts  fragmentsDir = the plugin's
 *   shared/agent-fragments/ directory (default: the one this script ships beside)
 * @returns {{text:string, expanded:string[]}}
 */
export function expandSharedRefs(body, { fragmentsDir = OWN_FRAGMENTS, seen = new Set() } = {}) {
  if (!body) return { text: body, expanded: [] };
  const expanded = [];
  const text = body.replace(/`?shared\/agent-fragments\/([a-z0-9-]+\.md)`?/gi, (match, file) => {
    if (seen.has(file)) return match;   // a pointer back to something already inlined
    let content;
    try {
      content = stripFrontmatter(readFileSync(join(fragmentsDir, file), 'utf8'));
    } catch {
      return match;   // a pointer at a file that does not exist stays a pointer
    }
    seen.add(file);
    expanded.push(file);
    // Nested: a shared file may point at another. Same `seen` set bounds the walk.
    const inner = expandSharedRefs(content, { fragmentsDir, seen });
    expanded.push(...inner.expanded);
    return `${match}\n\n<<< BEGIN shared/agent-fragments/${file} >>>\n${inner.text}\n<<< END shared/agent-fragments/${file} >>>`;
  });
  return { text, expanded };
}
