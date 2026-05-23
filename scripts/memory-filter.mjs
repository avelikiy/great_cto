#!/usr/bin/env node
/**
 * memory-filter.mjs — Phase 2 of Token Economy initiative.
 *
 * Filters a great_cto memory file (lessons.md / decisions.md) to the k entries
 * most relevant to a given task title. Agents call this instead of `tail -N`
 * to inject only what matters, cutting start-up context by ~25–35%.
 *
 * Usage:
 *   node scripts/memory-filter.mjs "<task title>" <memory-file> [--k=5]
 *   node scripts/memory-filter.mjs "<task title>" ~/.great_cto/decisions.md
 *   node scripts/memory-filter.mjs "<task title>" .great_cto/lessons.md --k=3
 *
 * Output: filtered markdown entries written to stdout.
 *         If file is missing or empty: exits 0, prints nothing.
 *         If LLM is unavailable: heuristic keyword fallback.
 *
 * Cost guard: input to LLM capped at MAX_INPUT_CHARS (~2k tokens → < $0.001).
 * Latency target: < 800 ms (Haiku: ~200 ms, OpenRouter: ~400 ms, heuristic: <5 ms).
 *
 * Exit codes: 0 ok / 1 error (file not found, bad args)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";

// ─── Provider config (mirrors generate-summary.mjs) ──────────────────────────
const ANTHROPIC_API   = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const OPENROUTER_API  = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL =
  process.env.GREAT_CTO_SUMMARY_MODEL ||
  process.env.GREAT_CTO_ROUTER_MODEL  ||
  "moonshotai/kimi-k2";

const TIMEOUT_MS     = 15_000;
const MAX_INPUT_CHARS = 8_000; // ~2k tokens — hard cost cap

// ─── Entry parsers ────────────────────────────────────────────────────────────
/**
 * Split a markdown file into entries at each `## ` heading.
 * Returns: Array<{ id: number; heading: string; body: string; full: string }>
 */
function parseEntries(content) {
  const lines = content.split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (current) {
        current.full = current.full.trimEnd();
        entries.push(current);
      }
      current = {
        id: entries.length,
        heading: line.replace(/^##\s+/, "").trim(),
        body: "",
        full: line + "\n",
      };
    } else if (current) {
      current.body += line + "\n";
      current.full += line + "\n";
    }
    // Lines before first ## are ignored (file header / frontmatter)
  }
  if (current) {
    current.full = current.full.trimEnd();
    entries.push(current);
  }
  return entries;
}

// ─── Heuristic fallback: TF-IDF-style keyword scoring ────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","was","are","were","be","been","being","have","has","had","do",
  "does","did","will","would","shall","should","may","might","must","can",
  "could","not","no","nor","so","yet","both","either","neither","whether",
  "if","then","else","this","that","these","those","it","its","as","use",
  "used","using","via","per","vs","when","where","which","who","what","how",
]);

function scoreRelevance(taskTokens, entry) {
  const entryTokens = tokenize(entry.heading + " " + entry.body);
  const entrySet = new Set(entryTokens);
  let hits = 0;
  for (const t of taskTokens) {
    if (!STOP_WORDS.has(t) && entrySet.has(t)) hits++;
  }
  // Bonus: heading match is worth 3× body match
  const headingTokens = tokenize(entry.heading);
  for (const t of taskTokens) {
    if (!STOP_WORDS.has(t) && headingTokens.includes(t)) hits += 2;
  }
  return hits;
}

function heuristicFilter(taskTitle, entries, k) {
  const taskTokens = tokenize(taskTitle);
  const scored = entries.map((e) => ({ entry: e, score: scoreRelevance(taskTokens, e) }));
  scored.sort((a, b) => b.score - a.score || a.entry.id - b.entry.id);
  return scored.slice(0, k).map((s) => s.entry);
}

// ─── LLM calls ───────────────────────────────────────────────────────────────
function buildPrompt(taskTitle, entryList) {
  const items = entryList
    .map((e) => `[${e.id}] ${e.heading}`)
    .join("\n");

  return `You are a context filter for an AI pipeline. Given a task title and a list of memory entries (each with an ID and heading), return the IDs of the ${Math.min(entryList.length, 5)} most relevant entries.

Task: ${taskTitle}

Entries:
${items}

Rules:
- Return ONLY a JSON array of integer IDs, e.g. [2, 7, 0]
- Order by relevance (most relevant first)
- If nothing is relevant, return []
- No explanation, no markdown fences`;
}

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.content?.find((c) => c.type === "text")?.text || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://greatcto.systems",
        "X-Title": "great_cto-memory-filter",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_DEFAULT_MODEL,
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.choices?.[0]?.message?.content || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function parseIds(text, maxId) {
  try {
    const match = text.match(/\[[\d,\s]*\]/);
    if (!match) return null;
    const ids = JSON.parse(match[0]);
    if (!Array.isArray(ids)) return null;
    return ids.filter((id) => Number.isInteger(id) && id >= 0 && id <= maxId);
  } catch {
    return null;
  }
}

async function llmFilter(taskTitle, entries, k) {
  if (entries.length === 0) return { entries: [], mode: "empty" };

  // Build prompt from headings only (entries bodies may be large — we cap at MAX_INPUT_CHARS total)
  const prompt = buildPrompt(taskTitle, entries);
  const truncatedPrompt = prompt.slice(0, MAX_INPUT_CHARS);

  let raw = await callAnthropic(truncatedPrompt);
  let mode = "anthropic-haiku";
  if (!raw) {
    raw = await callOpenRouter(truncatedPrompt);
    mode = `openrouter:${OPENROUTER_DEFAULT_MODEL}`;
  }

  if (!raw) return null; // signal: no LLM available

  const ids = parseIds(raw, entries.length - 1);
  if (!ids || ids.length === 0) {
    // LLM returned bad JSON or empty → heuristic
    return { entries: heuristicFilter(taskTitle, entries, k), mode: "heuristic-llm-bad-json" };
  }

  const selected = ids.slice(0, k).map((id) => entries[id]).filter(Boolean);
  return { entries: selected, mode };
}

// ─── Main filter function (exported for tests) ────────────────────────────────
/**
 * Filter a memory file to the k most relevant entries for taskTitle.
 *
 * @param {string} taskTitle
 * @param {string} memoryContent  — full file content as string
 * @param {object} opts
 * @param {number} [opts.k=5]     — number of entries to return
 * @param {boolean} [opts.heuristicOnly=false]  — skip LLM, use heuristic always
 * @returns {Promise<{ filtered: string; mode: string; count: number; total: number }>}
 */
async function filterMemory(taskTitle, memoryContent, opts = {}) {
  const k = opts.k ?? 5;
  const heuristicOnly = opts.heuristicOnly ?? false;

  const entries = parseEntries(memoryContent);
  if (entries.length === 0) {
    return { filtered: "", mode: "empty", count: 0, total: 0 };
  }

  // If we have k or fewer entries, return all — no filter needed
  if (entries.length <= k) {
    return {
      filtered: entries.map((e) => e.full).join("\n\n"),
      mode: "passthrough",
      count: entries.length,
      total: entries.length,
    };
  }

  let result;
  if (heuristicOnly) {
    result = { entries: heuristicFilter(taskTitle, entries, k), mode: "heuristic" };
  } else {
    result = await llmFilter(taskTitle, entries, k);
    if (!result) {
      // No LLM available
      result = { entries: heuristicFilter(taskTitle, entries, k), mode: "heuristic" };
    }
  }

  const filtered = result.entries.map((e) => e.full).join("\n\n");
  return {
    filtered,
    mode: result.mode,
    count: result.entries.length,
    total: entries.length,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
import { fileURLToPath } from "node:url";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`Usage:
  node scripts/memory-filter.mjs "<task title>" <memory-file> [--k=5]

Options:
  --k=N           Return top N entries (default: 5)
  --heuristic     Skip LLM, use keyword matching only
  --stats         Append a comment line: # filtered N/total via mode

Examples:
  node scripts/memory-filter.mjs "add Stripe webhooks" ~/.great_cto/decisions.md
  node scripts/memory-filter.mjs "fix auth bug" .great_cto/lessons.md --k=3
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const positional = args.filter((a) => !a.startsWith("--"));
  if (positional.length < 2) {
    process.stderr.write("✗ need <task-title> and <memory-file>\n");
    process.exit(1);
  }

  const taskTitle  = positional[0];
  const filePath   = resolve(positional[1].replace(/^~/, process.env.HOME ?? "~"));
  const kArg       = args.find((a) => a.startsWith("--k="));
  const k          = kArg ? parseInt(kArg.slice(4), 10) : 5;
  const heuristic  = args.includes("--heuristic");
  const stats      = args.includes("--stats");

  if (!existsSync(filePath)) {
    // Graceful — agents call this unconditionally, file may not exist yet
    process.exit(0);
  }

  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) process.exit(0);

  const result = await filterMemory(taskTitle, content, { k, heuristicOnly: heuristic });

  if (result.filtered) {
    process.stdout.write(result.filtered);
    process.stdout.write("\n");
  }

  if (stats) {
    process.stderr.write(
      `# memory-filter: ${result.count}/${result.total} entries via ${result.mode}\n`
    );
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    process.stderr.write(`✗ fatal: ${e?.message ?? e}\n`);
    process.exit(1);
  });
}

export { filterMemory, parseEntries, heuristicFilter };
