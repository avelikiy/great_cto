/** Fixed, source-bound offline derivation. No caller-provided patch rules. */
import { createHash } from 'node:crypto';
export const BEADS_OFFLINE_PROJECTION = 'beads-offline-guidance-v2';
export const SUPERPOWERS_OFFLINE_PROJECTION = 'superpowers-offline-runtime-v1';
const recipes = [
  {
    "component": "beads",
    "path": "skills/beads/commands/version.md",
    "originalSha256": "f994ab7afb0aef464fe0e77e7aad522d5f2d1558415d4ba63aede43a7411a075",
    "projectedSha256": "b6e38b1cdabe7d620a0bffa2681bb31c818838b5d1f8ba06f949b4ea05f225ca",
    "hunks": [
      [
        "curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash",
        "printf '%s\\n' 'Offline bundle: automatic installation is refused. Ask the operator to provide independently verified bd and Dolt executables.' >&2; false"
      ]
    ]
  },
  {
    "component": "beads",
    "path": "skills/beads/resources/TROUBLESHOOTING.md",
    "originalSha256": "93dfa0a143a1117de111652cef340ca893e699d91875472d7968160388fa4c77",
    "projectedSha256": "121470631cfce72cf50a4bd591b72b35eb19d706afd6ac29b3e56e833529933d",
    "hunks": [
      [
        "curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh | bash",
        "printf '%s\\n' 'Offline bundle: automatic installation is refused. Ask the operator to provide independently verified bd and Dolt executables.' >&2; false"
      ]
    ]
  },
  {
    "component": "superpowers",
    "path": "skills/brainstorming/scripts/server.cjs",
    "originalSha256": "2d2961ea8d11f56c5f4c3a1a68d22709efa5d7601a2246d8c880774e7e9e8412",
    "projectedSha256": "965794ee6fa004407dbdcd59328afb417faea4eb6c640508acca656c290052d2",
    "hunks": [
      [
        "const HOST = process.env.BRAINSTORM_HOST || '127.0.0.1';\nconst URL_HOST = process.env.BRAINSTORM_URL_HOST || (HOST === '127.0.0.1' ? 'localhost' : HOST);",
        "// Release-bound offline projection: remote bind/URL hosts are unsupported.\nif ((process.env.BRAINSTORM_HOST && process.env.BRAINSTORM_HOST !== '127.0.0.1') ||\n    (process.env.BRAINSTORM_URL_HOST && !['127.0.0.1', 'localhost'].includes(process.env.BRAINSTORM_URL_HOST))) {\n  throw new Error('offline-companion-loopback-required');\n}\nconst HOST = '127.0.0.1';\nconst URL_HOST = 'localhost';"
      ],
      [
        "const SUPERPOWERS_BRAND_IMAGE_URL = 'https://primeradiant.com/brand/superpowers-visual-brainstorming-logo.png';",
        "// Release-bound offline projection: no external branding image."
      ],
      [
        "  const logo = SUPERPOWERS_TELEMETRY_DISABLED\n    ? ''\n    : '<img class=\"brand-logo\" src=\"' + SUPERPOWERS_BRAND_IMAGE_URL + '?v=' + encodeURIComponent(SUPERPOWERS_VERSION) + '\" alt=\"Prime Radiant\" referrerpolicy=\"no-referrer\" decoding=\"async\">';",
        "  const logo = ''; // Offline projection: branding never initiates a network request."
      ],
      [
        "// browser is already connected. Override the launcher with BRAINSTORM_OPEN_CMD.",
        "// browser is already connected. Custom shell launchers are unsupported offline."
      ],
      [
        "  // Operator-provided launcher: run as given (this env var is trusted operator input).\n  if (process.env.BRAINSTORM_OPEN_CMD) {\n    try { cp.exec(process.env.BRAINSTORM_OPEN_CMD + ' ' + JSON.stringify(url), () => {}); } catch (e) { /* best effort */ }\n    return;\n  }",
        "  // Offline projection: never interpret a launcher from the environment as shell.\n  if (process.env.BRAINSTORM_OPEN_CMD) return;"
      ]
    ]
  },
  {
    "component": "superpowers",
    "path": "skills/brainstorming/scripts/start-server.sh",
    "originalSha256": "a4e5ae84275bcaacd2f84345afeabe59cf7b00ba080e123da7cc1fb226f12847",
    "projectedSha256": "94cdd42789e235ac02b63fbca5e74340dfc7bbb61f34d2eceff679db9c8ea140",
    "hunks": [
      [
        "# Kill any existing server\nif [[ -f \"$PID_FILE\" ]]; then\n  old_pid=$(cat \"$PID_FILE\")\n  kill \"$old_pid\" 2>/dev/null\n  rm -f \"$PID_FILE\"\nfi",
        "# Offline projection: a PID file alone is not process identity proof.\nif [[ -e \"$PID_FILE\" || -L \"$PID_FILE\" ]]; then\n  printf '%s\\n' 'offline-companion-existing-pid-refused' >&2\n  exit 1\nfi"
      ]
    ]
  }
];
const fail = () => { throw Error('native-companion-hardening-refused'); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function requiredHardenedMembers(component) {
  const name = component.projection === BEADS_OFFLINE_PROJECTION ? 'beads' : component.projection === SUPERPOWERS_OFFLINE_PROJECTION ? 'superpowers' : null;
  return recipes.filter(row => row.component === name).map(row => row.path);
}
export function deriveHardenedMember(component, memberPath, bytes, inverse = false) {
  if (!Buffer.isBuffer(bytes)) fail();
  if (![BEADS_OFFLINE_PROJECTION, SUPERPOWERS_OFFLINE_PROJECTION].includes(component.projection)) return bytes;
  const recipe = recipes.find(row => row.component === component.name && row.path === memberPath);
  if (!recipe) return bytes;
  if (sha(bytes) !== (inverse ? recipe.projectedSha256 : recipe.originalSha256)) fail();
  let output = bytes;
  const hunks = inverse ? [...recipe.hunks].reverse() : recipe.hunks;
  for (const pair of hunks) {
    const from = Buffer.from(pair[inverse ? 1 : 0]), to = Buffer.from(pair[inverse ? 0 : 1]);
    const at = output.indexOf(from);
    if (at < 0 || output.indexOf(from, at + from.length) !== -1 || output.includes(to)) fail();
    output = Buffer.concat([output.subarray(0, at), to, output.subarray(at + from.length)]);
  }
  if (sha(output) !== (inverse ? recipe.originalSha256 : recipe.projectedSha256)) fail();
  return output;
}
