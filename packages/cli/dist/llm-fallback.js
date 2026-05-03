// LLM fallback for low-confidence archetype detection.
//
// When pickArchetype() returns confidence: "low", we optionally call
// Anthropic Haiku with the README (first ~2KB) + dependency list and
// ask for a structured archetype suggestion. Cost: ~$0.001 per call.
//
// Privacy:
//   - Only sends: README first 2KB + dep names (no versions) + stack list.
//   - Never sends: source code, paths, file names, env vars, repo name.
//   - User opts in via:
//       1. ANTHROPIC_API_KEY env var present (implicit), OR
//       2. --use-llm CLI flag (explicit override even on high confidence)
//   - Skipped when --no-llm flag, GREATCTO_NO_LLM=1, or no API key.
//
// Zero deps: uses native fetch (Node 18+). No @anthropic-ai/sdk import.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5"; // cheap + fast; ~$1/M in, $5/M out
const MAX_README_BYTES = 2048;
const TIMEOUT_MS = 8000;
const ALLOWED_ARCHETYPES = [
    "web-service", "mobile-app", "ai-system", "agent-product",
    "data-platform", "infra", "library", "cli-tool",
    "commerce", "fintech", "healthcare", "web3",
    "iot-embedded", "regulated", "devtools", "browser-extension", "game",
];
/**
 * Whether LLM fallback is available and should be tried for this run.
 * Returns false silently if no API key, opted out, or running offline.
 */
export function shouldUseLlmFallback(opts) {
    if (opts.forceSkip)
        return { use: false, reason: "--no-llm flag set" };
    if (process.env.GREATCTO_NO_LLM === "1")
        return { use: false, reason: "GREATCTO_NO_LLM=1" };
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        return { use: false, reason: "no ANTHROPIC_API_KEY" };
    if (opts.forceUse)
        return { use: true, reason: "--use-llm flag" };
    if (opts.heuristicConfidence === "low")
        return { use: true, reason: "low heuristic confidence" };
    return { use: false, reason: "heuristic confidence is high/medium" };
}
/**
 * Build the prompt sent to the LLM. Kept as a pure function for testing.
 */
export function buildPrompt(opts) {
    const archList = ALLOWED_ARCHETYPES.join(" | ");
    const readme = opts.readme.slice(0, MAX_README_BYTES).trim() || "(no README)";
    const stack = opts.stack.length ? opts.stack.join(", ") : "(no detected stack)";
    const hints = opts.readmeKeywords.length ? opts.readmeKeywords.join(", ") : "(none)";
    return `You are classifying a software project into one of these archetypes:
${archList}

DETECTED STACK: ${stack}
README KEYWORDS: ${hints}

README EXCERPT (first 2KB):
"""
${readme}
"""

Respond with ONLY a JSON object matching this schema (no prose, no markdown):
{
  "archetype": "<one value from the list above>",
  "confidence": "<high|medium|low>",
  "rationale": "<one sentence, ≤120 chars, explaining the choice>"
}

Rules:
- Choose the most specific archetype. fintech beats commerce when banking/ACH is present.
- agent-product = autonomous LLM agents (LangGraph/CrewAI/MCP), not just a wrapper around an LLM API.
- ai-system = an app that calls an LLM but is not itself agentic.
- cli-tool = primary distribution is a command-line binary.
- library = published as a reusable package, no app shell.
- If unsure between two, pick the more domain-specific one and use confidence: medium.`;
}
/**
 * Validate the model response and coerce to LlmSuggestion shape.
 * Returns null if the response is malformed or the archetype is invalid.
 */
export function parseLlmResponse(raw) {
    // Strip code fences if model added them despite instructions
    const cleaned = raw.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
    let obj;
    try {
        obj = JSON.parse(cleaned);
    }
    catch {
        return null;
    }
    if (typeof obj !== "object" || obj === null)
        return null;
    const o = obj;
    const arch = o.archetype;
    const conf = o.confidence;
    const rat = o.rationale;
    if (typeof arch !== "string" || typeof conf !== "string" || typeof rat !== "string")
        return null;
    if (!ALLOWED_ARCHETYPES.includes(arch))
        return null;
    if (!["high", "medium", "low"].includes(conf))
        return null;
    return {
        archetype: arch,
        confidence: conf,
        rationale: rat.slice(0, 200),
    };
}
function readReadme(dir) {
    const candidates = ["README.md", "readme.md", "README", "README.rst"];
    for (const f of candidates) {
        const p = join(dir, f);
        if (existsSync(p)) {
            try {
                return readFileSync(p, "utf-8");
            }
            catch {
                return "";
            }
        }
    }
    return "";
}
/**
 * Best-effort LLM call. Returns null if anything fails (network, parse,
 * timeout, rate limit). Never throws — caller is expected to fall back
 * to the heuristic result silently.
 */
export async function suggestArchetypeFromLlm(opts) {
    const readme = readReadme(opts.dir);
    const prompt = buildPrompt({
        readme,
        stack: opts.detection.stack,
        readmeKeywords: opts.detection.readmeKeywords,
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(ANTHROPIC_API, {
            method: "POST",
            headers: {
                "x-api-key": opts.apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 256,
                temperature: 0,
                messages: [{ role: "user", content: prompt }],
            }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok)
            return null;
        const body = (await res.json());
        const text = body.content?.find((c) => c.type === "text")?.text;
        if (!text)
            return null;
        const parsed = parseLlmResponse(text);
        if (!parsed)
            return null;
        return {
            ...parsed,
            conflictsWithHeuristic: parsed.archetype !== opts.heuristicArchetype,
        };
    }
    catch {
        return null;
    }
}
