# Vendored third-party assets

great_cto ships zero telemetry and phones home to nothing (see docs/PRIVACY.md).
These files were previously loaded from external CDNs on every board open
(fonts.googleapis.com, cdn.jsdelivr.net) — an IP leak and an offline-breaker.
They're now vendored as static assets and served locally instead.

## JS libraries

| File | Package | Version | Source | SHA-384 (matches original SRI hash) |
|------|---------|---------|--------|--------------------------------------|
| `marked.min.js` | [marked](https://www.npmjs.com/package/marked) | 14.1.3 | https://cdn.jsdelivr.net/npm/marked@14.1.3/marked.min.js | `k8o8HikHweyzW55Wd3wl18ovJj6vHVYNQeQbeSM0fxx+0WiH4TcccOG9uz8Xd2JR` |
| `purify.min.js` | [dompurify](https://www.npmjs.com/package/dompurify) | 3.4.17 | `dist/purify.min.js` from the npm tarball dompurify-3.4.17.tgz (registry integrity verified) | `P0JNneQf81HOl9VwNXK76cQ9VMD6Nfsnepxb0cCOg8+UzEdzgPHAPV4wVQrvYQSx` |

Downloaded verbatim; the marked hash was verified to match the SRI `integrity` attributes
the board previously used on the CDN `<script>` tags. DOMPurify was moved
from 3.1.7 to 3.4.17 on 2026-11-09 for GHSA-cg2g-xh64-v4q7 and earlier advisories;
`no-cdn.test.mjs` checks every hash in this table against the file. These are static
vendored assets, not npm runtime dependencies — no package.json entry.

## Fonts

See `../fonts/PROVENANCE.md` for the vendored Geist / Geist Mono woff2 files.
