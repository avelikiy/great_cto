# Vendored fonts

great_cto ships zero telemetry (see docs/PRIVACY.md). The board previously
loaded Geist / Geist Mono from fonts.googleapis.com + fonts.gstatic.com on
every open — an IP leak and an offline-breaker. Only the two families the
CSS actually uses (`--sans`/`--serif` → Geist, `--mono` → Geist Mono; Inter
and JetBrains Mono in the stack were unused fallback names, not vendored)
are fetched here and served locally.

| File | Family | Source | Subset |
|------|--------|--------|--------|
| `geist-variable.woff2` | Geist (variable, wght 400-700) | https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFWNOITd.woff2 | latin |
| `geist-mono-variable.woff2` | Geist Mono (variable, wght 400-500) | https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmhHkjko.woff2 | latin |

Fetched via the standard `fonts.googleapis.com/css2` request (same URLs
Google Fonts already serves to browsers); only the `latin` subset was kept
since the UI is English-only — cyrillic/vietnamese/symbols subsets were
dropped. Total added weight: ~56 KB. If a font file is ever unreachable at
build/vendor time, `index.html`'s font stack already falls back to
`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` / system-mono
so the UI still renders — see the `--sans`/`--mono` custom properties.
