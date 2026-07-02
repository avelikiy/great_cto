#!/usr/bin/env node
/**
 * gate-expiry — SessionStart hook enforcing the 72h gate-expiry policy
 * mechanically.
 *
 * SKILL.md has always SAID "gate auto-expires in 72h if no response" — but
 * that was prose a live model had to remember. This hook makes it real: at
 * session start it scans open `gate`-labelled Beads tasks and
 *   - > 72h old  → marks the gate blocked (bd update --status blocked) with an
 *                  expiry note, and tells the CTO how to re-open
 *   - 24–72h old → prints an aging warning
 *
 * Blocked ≠ deleted: `bd update <id> --status open` re-opens, or say
 * "approve <gate>" as usual. SessionStart stdout is injected into context.
 *
 * Exit: always 0 (no bd / no project / parse failure = silent no-op).
 * Opt out: GREAT_CTO_DISABLE_GATE_EXPIRY=1
 * Tunable: GREAT_CTO_GATE_EXPIRY_HOURS (default 72)
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXPIRY_HOURS = Number(process.env.GREAT_CTO_GATE_EXPIRY_HOURS || 72);
const WARN_HOURS = 24;

/** Pure: classify open gates by age. now/created in ms. */
export function classifyGates(gates, now, expiryHours = EXPIRY_HOURS) {
  const expired = [], aging = [];
  for (const g of gates) {
    const created = Date.parse(g.created_at || "");
    if (Number.isNaN(created)) continue;
    const ageH = (now - created) / 3_600_000;
    if (ageH > expiryHours) expired.push({ ...g, ageH: Math.round(ageH) });
    else if (ageH > WARN_HOURS) aging.push({ ...g, ageH: Math.round(ageH) });
  }
  return { expired, aging };
}

function bd(args) {
  return execFileSync("bd", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_GATE_EXPIRY === "1") return process.exit(0);
  if (!existsSync(process.env.GREAT_CTO_DIR || ".great_cto")) return process.exit(0);

  let gates;
  try {
    gates = JSON.parse(bd(["list", "--label", "gate", "--status", "open", "--json"]));
  } catch { return process.exit(0); } // bd missing/uninitialized — no-op
  if (!Array.isArray(gates) || gates.length === 0) return process.exit(0);

  const { expired, aging } = classifyGates(gates, Date.now());

  for (const g of expired) {
    try {
      bd(["update", g.id, "--status", "blocked", "--notes",
        `auto-expired: gate open ${g.ageH}h > ${EXPIRY_HOURS}h policy (SKILL.md). Re-open: bd update ${g.id} --status open`]);
      console.log(`⛔ gate expired (${g.ageH}h > ${EXPIRY_HOURS}h) → marked blocked: ${g.id} — ${g.title}`);
      console.log(`   Pipeline paused at this gate. Say "approve ${g.id}" to re-open+approve, or "cancel" to drop.`);
    } catch {
      console.log(`⛔ gate ${g.id} is ${g.ageH}h old (>${EXPIRY_HOURS}h policy) but bd update failed — handle manually.`);
    }
  }
  for (const g of aging) {
    console.log(`⚠ gate open ${g.ageH}h (expires at ${EXPIRY_HOURS}h): ${g.id} — ${g.title}. Approve or reject via /inbox.`);
  }
  return process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
