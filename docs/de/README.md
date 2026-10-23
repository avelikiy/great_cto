<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Coding-Workflows ausführen. Belege prüfen. Über die Auslieferung entscheiden.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="Beispielprojekt mit synthetischen Daten, kein Live-Modell-Benchmark." width="900" />

*Beispielprojekt mit synthetischen Daten, kein Live-Modell-Benchmark. 3.70.0.*

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [Ein echter Lauf →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Übersetzung des englischen [README](../../README.md), Version **v3.70.0** (2026-10-23).
> Bei Abweichungen gilt die englische Fassung.

---

great_cto koordiniert native Claude-Code-Workflows und experimentelle kontrollierte Codex-Läufe mit expliziten Stufen, Reviews und Gates. Das lokale Board verbindet Aufgaben, protokollierte Ausführung, Projektdokumente und Verbrauch. Der öffentliche Katalog umfasst **72** Agenten; ein Eintrag beweist weder Ausführung noch Expertise. Fehlende Belege bleiben unbekannt. Merge, Release und Deployment brauchen eigene Nachweise und Freigaben. Du bezahlst deinen Anbieter; great_cto ist MIT und berechnet nichts.

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

## Ein Projekt, fünf Ansichten

Mit `great-cto board` öffnest du das lokale Board, normalerweise auf `localhost:3141`.

| Ansicht | Was du prüfen kannst |
|---|---|
| **Work** | Aufgaben, Akzeptanzkriterien, nächste unterstützte Aktion sowie Overview, Execution und Evidence |
| **Decisions** | Offene Entscheidungen und vorhandene Gate-Kontrollen ohne zusätzliche Befugnisse |
| **Knowledge** | Projekt-Markdown, ADRs und begrenzter Diagrammbetrachter mit Mermaid-Quelltext-Fallback, nur lesend |
| **Insights** | Projektspezifischer Tokenverbrauch, protokollierte Ergebnisse, Schätzungen und getrennte Budgets |
| **Settings** | Executors, Runtime, Capabilities und General |

`unverifiable`, `unmeasured` und `unavailable` bedeuten keinen erfolgreichen Check.

Execution zeigt vom Controller aufgezeichnete kausale Graphen; native und ältere Sitzungen bleiben unvollständig oder nicht verfügbar. Fehlende Kanten werden nicht erfunden. Das Beispiel nutzt Offline-Stubs, keine Live-Modelle. Diagramme beschreiben deklarierte Architektur. Tokenverbrauch und Kosten sind keine Qualitätsbewertung. Dokumente behalten ihre Sprache; die Oberfläche ist Englisch.

<details>
<summary>Ausführung, Belege, Projektwissen und Ergebnisse ansehen</summary>

![Execution: Beispielprojekt mit synthetischen Daten, kein Live-Modell-Benchmark.](../screenshots/execution.png)

![Evidence: Beispielprojekt mit synthetischen Daten, kein Live-Modell-Benchmark.](../screenshots/evidence.png)

![Knowledge: Beispielprojekt mit synthetischen Daten, kein Live-Modell-Benchmark.](../screenshots/knowledge.png)

![Insights: Beispielprojekt mit synthetischen Daten, kein Live-Modell-Benchmark.](../screenshots/insights.png)

[Aufnahmevertrag](../reference/public-showcase.md).

</details>

## Auf OpenAI Codex

| Modus | Ausführung und Befugnisse |
|---|---|
| Claude Code native | Native Befehle, spezialisierte Rollen und Hooks; Entscheidungen bleiben beim zugehörigen Host |
| Controlled Codex / mixed-host (experimental) | Der Controller verwaltet Routing, Textvorschläge, Verifier und explizite Gates |
| Codex plugin session | Skills, MCP und Sicherheits-Hooks; die Installation startet die kontrollierte Pipeline nicht automatisch |

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
| Ein ganzes Produkt — 7 im offenen Benchmark gebaut | Median **$171** · **70/100**, **2026-07-10** — [nachstellen](../benchmarks/BENCH-2026-07-batch1.md) |

Diese Werte sind historische Beobachtungen, kein Benchmark der aktuellen Zwei-Host-Pipeline oder Domain Packs. Ein prozentualer Qualitätsgewinn ist nicht belegt. Domain Packs bleiben opt-in; ihre Anwesenheit beweist weder Expertise noch bessere Ergebnisse.

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
