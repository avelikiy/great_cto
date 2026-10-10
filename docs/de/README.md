<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Liefere Produkte mit dem Coding-Agenten, den du schon hast.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [Ein echter Lauf →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Übersetzung des englischen [README](../../README.md), Version **v3.48.0** (2026-10-02).
> Bei Abweichungen gilt die englische Fassung.

---

**Dein Coding-Agent liefert Code. Das hier prüft ihn.**

Beschreibe ein Produkt oder ein Feature. **72 Agenten** mit eng umrissenen Aufgaben
führen es durch Brief, Architektur, Build, Review und Security; ein zweites Modell
aus einer anderen Familie liest denselben Diff. Drei Entscheidungen bleiben deine —
was gebaut wird, wie, und ob es ausgeliefert wird — und am Ende steht ein
**Repository, das dir gehört**, und eine **URL, die funktioniert**. Du bezahlst
deinen eigenen LLM-Anbieter; great_cto ist MIT und berechnet nichts.

## Schnellstart

```bash
npx great-cto init
```

Claude Code neu starten. Im Alltag brauchst du drei Dinge:

| | In Claude Code | Im Terminal |
|---|---|---|
| **Arbeit starten** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **Was auf dich wartet** | `/inbox` | `great-cto status` |
| **Weitermachen** | `/resume` | `great-cto resume` |

`/start` nimmt ein neues Produkt oder eine Aufgabe in einem bestehenden Projekt an
und wählt den Ablauf selbst. `/resume` setzt nur fort, was du schon freigegeben hast;
eine offene Entscheidung wartet weiter auf dich. Alles andere — `/review`, `/spec`,
`/save`, `/digest` und der Rest — ist da, wenn du es brauchst:
[alle Befehle](../COMMANDS.md).

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

Das Board auf `localhost:3141` öffnet mit **Work** — deine Aufgaben, die
Entscheidungen, die auf dich warten, und was schon ausgeliefert ist. Kosten, Agenten
und Reviewer liegen unter **Tools**. Nichts dort zeigt ein Fehlen als Erfolg: eine
Prüfung, die nicht entscheiden konnte, steht auf `unverifiable`, nicht gemessene
Kosten auf `unmeasured`, ein Reviewer, der nicht laufen konnte, auf `unavailable`.

## Auf OpenAI Codex

`npx great-cto init --host codex` gibt Codex die Skills, den MCP-Server und sechs
Sicherheits-Hooks (einmal freigeben: `codex` im Terminal starten und
**Trust all and continue** wählen). Codex hat keine native Plugin-Oberfläche für
Slash-Befehle oder Rollen-Agenten, daher läuft die Pipeline über die CLI:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Plugin-Updates sind standardmäßig explizit (`great-cto upgrade codex`). Unter macOS aktiviert `sh scripts/codex-auto-update.sh enable` einen optionalen Benutzertimer alle sechs Stunden; `status` prüft den Timer und `disable` entfernt ihn. Vor jedem Lauf wird der Git-Ursprung geprüft. Der Timer folgt dem konfigurierten Git-Ref, nicht npm-Releases; geänderte Hooks brauchen weiterhin die Freigabe des Hosts in einer neuen Sitzung. Details und gemischte Läufe:
[Codex-Host-Leitfaden](../HOST-CODEX.md).

## Wann es dich stoppt

Eine Zeile in `.great_cto/PROJECT.md`:

| `approval-level` | Stoppt dich bei | Stopps |
|---|---|---|
| **`ship-only`** | **dem Deployment — und gibt dir einen Brief, was gebaut wird** | **1** |
| `product-only` | was wir bauen · ob es ausgeliefert wird | 2 |
| `gates-only` *(Standard)* | was wir bauen · das Design · das Deployment | 3 |
| `strict` | das Design · Code-Review · das Deployment | 3 |
| `auto` | nichts in der Pipeline | 0 |

Regulierte Produkte — Fintech, Gesundheit, Behörden — behalten ihre Security-,
Compliance- und Ship-Gates auf jeder Stufe. [Wie die Gates funktionieren](../GATES.md).

## Zahlen, gemessen

| | |
|---|---|
| Ein Feature komplett, voll nachverfolgt | **1h 26m · $3.40** — [die Belege](https://greatcto.systems/proof) |
| Ein ganzes Produkt — 7 im offenen Benchmark gebaut | **$171** · **70/100**, **2026-07-10** — [nachstellen](../benchmarks/BENCH-2026-07-batch1.md) |
| Typischer Monat, 20 Pipeline-Läufe | **~$34** — du bezahlst deinen eigenen LLM-Anbieter, sonst nichts |

## Grenzen

Für eine Person, nicht für ein Team; kein gehosteter App-Builder — es braucht deinen
Coding-Agenten; kein CI/CD-System; Compliance-Gerüste sind Ausgangspunkte, keine
Zertifizierungen; LLM-Ausgaben sind nicht deterministisch. Die ehrliche Fassung jedes
Punkts und was es zu behaupten ablehnt: [docs/DETAILS.md](../DETAILS.md).

## Mehr erfahren

[Doku](../README.md) · [Erste Schritte](../tutorials/getting-started.md) ·
[Befehle](../COMMANDS.md) · [Gates](../GATES.md) · [Agenten](../reference/agents.md) ·
[FAQ](../FAQ.md) · [Alles andere](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [Sicherheit](../../SECURITY.md) ·
[Mitwirken](../../CONTRIBUTING.md) · [Datenschutz — Telemetrie ist standardmäßig aus](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE). Gebaut von [@avelikiy](https://github.com/avelikiy).
Wenn es dir Zeit gespart hat, hilft ein Stern anderen Solo-Buildern, es zu finden.
