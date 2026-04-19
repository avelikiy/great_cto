// Minimal terminal UI: colors, logging, prompts. Zero deps.

const isTTY = process.stdout.isTTY && process.env.NO_COLOR !== "1";

function wrap(code: string): (s: string) => string {
  return (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
}

export const bold = wrap("1");
export const dim = wrap("2");
export const red = wrap("31");
export const green = wrap("32");
export const yellow = wrap("33");
export const blue = wrap("34");
export const magenta = wrap("35");
export const cyan = wrap("36");
export const gray = wrap("90");

export function log(msg: string = ""): void {
  process.stdout.write(msg + "\n");
}

export function error(msg: string): void {
  process.stderr.write(red("error: ") + msg + "\n");
}

export function warn(msg: string): void {
  process.stderr.write(yellow("warning: ") + msg + "\n");
}

export function step(n: number, total: number, msg: string): void {
  log(cyan(`[${n}/${total}]`) + " " + msg);
}

export function success(msg: string): void {
  log(green("✓") + " " + msg);
}

export function banner(): void {
  if (!isTTY) {
    log("great-cto");
    return;
  }
  log("");
  log(bold(cyan("  great_cto")) + dim(" — SDLC pipeline plugin for Claude Code"));
  log(dim("  https://github.com/avelikiy/great_cto"));
  log("");
}

export async function confirm(
  question: string,
  defaultYes: boolean = true,
): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const hint = defaultYes ? dim("[Y/n]") : dim("[y/N]");
  process.stdout.write(question + " " + hint + " ");
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data) => {
      const ans = String(data).trim().toLowerCase();
      if (ans === "") resolve(defaultYes);
      else resolve(ans === "y" || ans === "yes");
    });
  });
}
