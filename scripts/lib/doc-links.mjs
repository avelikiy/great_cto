/**
 * doc-links — how much of the documentation is connected to the rest of it.
 *
 * The operator's words: "документация — по-прежнему не связана в единое целое."
 * Measured over `docs/`, excluding machine summaries and translations:
 *
 *     155 documents
 *      89 orphans — link to nothing, and nothing links to them
 *      18 ADRs, every one of which links to another ADR
 *
 * So the corpus is one connected island and a field of loose leaves. `ADR-009` has
 * ten inbound links; eighteen plans in `docs/plans` have none in either direction.
 *
 * WHY THIS DOES NOT TRY TO FIX IT
 * ------------------------------
 * The obvious idea is to derive the links: a PLAN about X should point at the ARCH
 * about X and the QA report about X. Measured before attempting it — across 155
 * documents there are THREE shared slugs, covering six files, and front-matter
 * exists on eight. There is no naming convention to derive from. Two real pairs
 * (`judge-provenance`, `stale-after`) are the exception that shows the rule.
 *
 * Connecting the other 89 means reading and understanding 89 documents. A script
 * that guessed would produce links nobody meant, which is exactly the confident
 * fabrication this project spends its checks removing.
 *
 * So this measures, and it ratchets. The number may not grow. Closing it is
 * authoring work, done deliberately, a few documents at a time.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Generated summaries and translations are copies, not documents. */
const IS_SUMMARY = /\.summary\.md$/;
const IS_TRANSLATION = /^docs\/[a-z]{2}(-[A-Z]{2})?\//;

export function listDocs(root = 'docs') {
  // The translation rule is written against a path that starts at the docs
  // directory. `root` may be relative ('docs') or absolute (the board serves
  // other projects by absolute path), so every candidate is re-expressed
  // relative to root's parent before the rule is applied — otherwise the rule
  // matches nothing on an absolute walk and translations count as documents,
  // which is a wrong number that looks like a right one.
  const base = path.dirname(root);
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (e.endsWith('.md') && !IS_SUMMARY.test(e) && !IS_TRANSLATION.test(path.relative(base, full))) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/**
 * @returns {{docs:string[], orphans:string[], inbound:Map<string,string[]>}}
 *   An orphan links to no document in this set AND is linked to by none. Both
 *   directions matter: a document nobody references is unreachable, and one that
 *   references nothing is unplaced.
 */
export function linkGraph(root = 'docs', read = readFileSync) {
  const docs = listDocs(root);
  const known = new Set(docs);
  const out = new Map(docs.map((d) => [d, new Set()]));
  const inbound = new Map(docs.map((d) => [d, new Set()]));

  for (const f of docs) {
    let text = '';
    try { text = String(read(f, 'utf8')); } catch { continue; }
    const add = (target) => {
      if (!known.has(target) || target === f) return;
      out.get(f).add(target);
      inbound.get(target).add(f);
    };
    // Markdown links, resolved relative to the file and to the repo root.
    for (const m of text.matchAll(/\]\(([^)#\s]+\.md)/g)) {
      const rel = m[1];
      add(path.normalize(path.join(path.dirname(f), rel)));
      add(path.normalize(rel.replace(/^\.\.\//, '')));
      add(path.normalize(path.join(root, rel)));
    }
    // `ADR-009` in prose is a reference even without a link — the convention this
    // repository actually uses, and the reason the ADRs are its one connected set.
    for (const m of text.matchAll(/\bADR-(\d{3})\b/g)) {
      for (const c of docs) {
        if (path.basename(c).startsWith(`ADR-${m[1]}`)) add(c);
      }
    }
  }

  const orphans = docs.filter((d) => out.get(d).size === 0 && inbound.get(d).size === 0);
  return {
    docs,
    orphans,
    inbound: new Map([...inbound].map(([k, v]) => [k, [...v]])),
  };
}
