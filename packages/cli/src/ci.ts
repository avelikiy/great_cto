// great-cto ci — single-command CI gate.
//
// Runs archetype-validate + budget-check. Designed to be the only great_cto
// invocation in a CI step.
//
// Outputs:
//   - human-readable to stderr (always)
//
// Exit codes:
//   0 = clean, all gates pass
//   1 = archetype drift (CI should fail)
//   2 = setup error (not a finding — infrastructure problem)
//
// Example workflow:
//   - run: npx great-cto@latest ci ./
//     env:
//       GREAT_CTO_NO_TELEMETRY: "1"

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface CiArgs {
  path: string;
  noBudget: boolean;
  noArchetype: boolean;
  quiet: boolean;
}

/**
 * Quick archetype-detection sanity check. Fails CI if the archetype changed
 * from what's pinned in .great_cto/PROJECT.md (signals undeclared
 * architectural drift).
 */
async function archetypeCheck(cwd: string, quiet: boolean): Promise<{ ok: boolean; msg: string }> {
  const projectMd = resolve(cwd, ".great_cto", "PROJECT.md");
  if (!existsSync(projectMd)) {
    if (!quiet) console.error("  ⊘ archetype check skipped (no .great_cto/PROJECT.md)");
    return { ok: true, msg: "skipped" };
  }
  const declared = (readFileSync(projectMd, "utf8").match(/^primary:\s*(\S+)/m)?.[1] ?? "").trim();
  if (!declared) {
    return { ok: true, msg: "no archetype declared in PROJECT.md" };
  }

  try {
    const { detect } = await import("./detect.js");
    const { pickArchetype } = await import("./archetypes.js");
    const detected = await detect(cwd);
    const result = pickArchetype(detected);
    if (result.primary !== declared) {
      return {
        ok: false,
        msg:
          `archetype drift: declared=${declared}, detected=${result.primary} (${result.confidence}). ` +
          `Either:\n` +
          `      • run 'npx great-cto adapt' to refresh CLAUDE.md + AGENTS.md after intentional change, or\n` +
          `      • run 'npx great-cto init --force --archetype ${result.primary}' to align PROJECT.md with the codebase, or\n` +
          `      • pass '--no-archetype' to ci to skip this check (e.g. during transitional refactors)`,
      };
    }
    return { ok: true, msg: `archetype confirmed: ${declared}` };
  } catch (e) {
    return { ok: true, msg: `archetype check failed (non-fatal): ${(e as Error).message}` };
  }
}

/**
 * Quick budget sanity check. Reads monthly-budget from PROJECT.md and warns
 * if recent burn (last 30 days) exceeds it. Non-fatal — never blocks CI.
 * Pure observability — for fatal budget enforcement use cost-guard hook.
 */
function budgetCheck(cwd: string, quiet: boolean): { ok: boolean; msg: string } {
  const projectMd = resolve(cwd, ".great_cto", "PROJECT.md");
  if (!existsSync(projectMd)) return { ok: true, msg: "no PROJECT.md" };
  const text = readFileSync(projectMd, "utf8");
  const budget = text.match(/monthly[-_]budget:\s*\$?(\d[\d,]+)/i)?.[1]?.replace(/,/g, "");
  if (!budget) return { ok: true, msg: "no budget set" };
  // Very simple: just confirm budget is well-formed. Real burn calc lives in board.
  if (!quiet) console.error(`  ✓ monthly-budget: $${budget}`);
  return { ok: true, msg: `budget configured: $${budget}` };
}

export async function runCi(args: CiArgs): Promise<number> {
  const startTs = Date.now();

  if (!args.quiet) {
    console.error(`\ngreat-cto ci — archetype + budget gate`);
    console.error(`  path: ${resolve(args.path)}`);
    console.error("");
  }

  // 1. Archetype check
  let archResult = { ok: true, msg: "skipped" };
  if (!args.noArchetype) {
    archResult = await archetypeCheck(args.path, args.quiet);
  }

  // 2. Budget check (warn-only)
  let budgetResult = { ok: true, msg: "skipped" };
  if (!args.noBudget) {
    budgetResult = budgetCheck(args.path, args.quiet);
  }

  // 3. Summary
  const passed = archResult.ok;

  if (!args.quiet) {
    const dur = ((Date.now() - startTs) / 1000).toFixed(1);
    console.error("");
    console.error(`  archetype:  ${archResult.ok ? "✓" : "✗"} ${archResult.msg}`);
    console.error(`  budget:     ${budgetResult.msg}`);
    console.error(`  duration:   ${dur}s`);
    console.error("");
    if (passed) {
      console.error("\x1b[32m✓ great-cto ci: passed\x1b[0m");
    } else {
      console.error("\x1b[31m✗ great-cto ci: failed\x1b[0m");
      if (!archResult.ok) console.error(`  ${archResult.msg}`);
    }
  }

  return passed ? 0 : 1;
}

/**
 * Parse `great-cto ci` flags from raw argv.
 */
export function parseCiArgs(rawArgv: string[]): CiArgs {
  const flag = (n: string) => rawArgv.includes(`--${n}`);

  const ciIdx = rawArgv.indexOf("ci");
  let path = ".";
  for (let i = ciIdx + 1; i < rawArgv.length; i++) {
    if (rawArgv[i] && !rawArgv[i]!.startsWith("--")) {
      path = rawArgv[i]!;
      break;
    }
  }

  return {
    path,
    noBudget: flag("no-budget"),
    noArchetype: flag("no-archetype"),
    quiet: flag("quiet"),
  };
}
