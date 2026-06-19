> ⚠️ **This translation is being updated.** GreatCTO has repositioned to an **AI Product Builder** — describe a product, approve the spec, ship the software (one CTO gate, maximum automation). For the current positioning see the [English README](../../README.md). The text below reflects the previous "AI autopilots" direction.

<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**KI-Autopiloten fürs Business – die Arbeit wird erledigt, nicht nur die Software.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-$2.39_vs_$5460_human-darkgreen)](https://greatcto.systems/proof)

<img src="../screenshots/pipeline.svg" alt="great_cto pipeline: Flow Compiler → gate:plan → 61 agents → gate:ship → Deployed" width="900" />

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [Ein echter Durchlauf →](https://greatcto.systems/proof) · [Live-Demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Diskussionen](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Services sind die neue Software

Die nächste Welle sind keine Werkzeuge für Spezialisten – es sind **Autopiloten, die das Ergebnis eines Service verkaufen**.
Ein Autopilot betreibt eine komplette Geschäftsfunktion von Anfang bis Ende (Erfassung → Verarbeitung → Entscheidung → Lieferung) und
eskaliert nur die Ermessensentscheidungen an einen qualifizierten Menschen. Jede Modellverbesserung macht den Service
schneller und günstiger.

GreatCTO liefert diese Autopiloten – jeder einzelne ist ein **Flow aus Agenten + Tools mit einem Menschen an den riskanten
Schritten**, einem integrierten Compliance-Reviewer und **Live-Connectoren**, die jeden Flow mit echten Daten betreiben.

## Die Autopiloten

| Autopilot | Was er leistet | Markt | Wer ihn baut |
|---|---|---|---|
| 🩺 **[Medical-coding](https://greatcto.systems/autopilots/rcm.html)** | Klinische Notizen → saubere, regelkonforme Abrechnungen; ein zertifizierter Coder zeichnet die riskanten ab | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[Managed-IT](https://greatcto.systems/autopilots/msp.html)** | Patches, Konfigurationen & Zugriffe über die gesamte Flotte – gestaffelt, reversibel, Mensch bei großen Änderungen | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[Legal-document](https://greatcto.systems/autopilots/legaltech.html)** | Entwirft & redlined Verträge und NDAs; ein zugelassener Anwalt zeichnet alles ab, was Rechtsberatung ist | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[Bookkeeping & close](https://greatcto.systems/autopilots/accounting.html)** | Bucht, gleicht ab & schließt den Monat ab; ein Controller zeichnet den Abschluss ab | $50–80B | Rillet · Basis · Digits |
| 🧾 **[Tax-prep](https://greatcto.systems/autopilots/tax.html)** | Erstellt Steuererklärungen & klassifiziert Sachverhalte; ein zertifizierter Steuerberater zeichnet vor der Einreichung ab | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[Source-to-pay](https://greatcto.systems/autopilots/procurement.html)** | Onboardet Lieferanten, gleicht Rechnungen ab, gibt Zahlungen frei – geprüft auf Sanktionen & Betrug | $200B+ | Tacto · Zip · AskLio |

→ [Alle Autopiloten](https://greatcto.systems/autopilots.html) · führe `/flow <vertical>` aus, um jeden Flow in deinem Terminal zu sehen

**Jeder Autopilot behält einen Menschen bei den Ermessensentscheidungen** – einen zertifizierten Coder, einen zugelassenen Anwalt, einen
Controller, einen zertifizierten Steuerberater. Der Autopilot erledigt das Volumen; der Mensch trägt die Entscheidung, die
die Haftung mit sich bringt. **9 Live-Connectoren laufen über alle sechs Autopiloten hinweg** – FHIR, ICD-10 (NLM),
NCCI/MUE, X12 837P, DocuSign, Plaid, OFAC, Staged-Rollout und eine US-Bundessteuer-Engine. Sie sind
standardmäßig schlüssellos (öffentliche Quelle oder deterministische echte Generierung) und senden per POST an den echten Anbieter,
sobald du Zugangsdaten hinzufügst.

## Unter der Haube (für den CTO, der es betreibt)

Jeder Autopilot wird von einer gegateten Pipeline aus Spezialisten-Agenten gebaut und betrieben – Architekt, 12-Winkel-
Reviewer, QA, Security Officer, DevOps – abgestimmt auf deinen Stack und deine Jurisdiktion. **Du triffst zwei
Entscheidungen pro Feature; alles andere läuft automatisch.** Der Compliance-Reviewer, signierte menschliche
Gates, der Audit-Trail und die Live-Connectoren bilden die Vertrauensschicht, die es sicher macht, den Autopiloten
laufen zu lassen.

## In Zahlen

| | |
|---|---|
| LLM-Kosten (ein echtes Feature, getrackt) | **$2.39** |
| Menschliches Äquivalent für dieselbe Arbeit | **~$5.460** |
| Von QA übersehene, gefundene Defekte | **2** |
| Monatliche Kosten (20 Pipeline-Durchläufe) | **~$34** |
| Spezialisten-Agenten | **61** |
| Automatisch erkannte Archetypen | **26** |
| Jurisdiktionen | **12** (GDPR · HIPAA · PCI-DSS · SOX · und mehr) |

→ [Vollständiger Trace mit allen Artefakten](https://greatcto.systems/proof)

## So funktioniert es

**`npx great-cto init`** – scannt deinen Stack und deine README, erkennt die Jurisdiktion (GDPR? HIPAA? PCI?), schreibt `.great_cto/FLOW.md` mit den genauen Agenten, Gates und Compliance-Frameworks für dein Projekt.

**`/start "beschreibe das Feature"`** – Kritiker prüfen die Architektur und Spezifikation, bevor irgendein Code geschrieben wird. Du prüfst den Plan bei `gate:plan`.

**Agenten laufen automatisch** – Senior-Dev implementiert mit TDD, 12-Winkel-Review, QA, Security, DevOps. Du gibst den Versand bei `gate:ship` frei.

## Drei Projekte – drei verschiedene Pipelines

Derselbe Befehl. Das Ergebnis hängt davon ab, was du baust und wo es läuft:

| | **Fintech-Startup · EU** | **Healthcare-Portal · US** | **CLI-Tool** |
|---|---|---|---|
| Spezialisten-Agenten | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| Menschliche Gates | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| Compliance | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| Kosten / Zyklus | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ Probiere den interaktiven Picker: [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## Das Dashboard, das du wirklich prüfen wirst

`great-cto board` öffnet sich unter `http://localhost:3141` – Kanban mit Echtzeit-SSE, Kostenkachel pro Agent, Pipeline-Status, 30-Tage-LLM-Ausgaben vs. menschliche Äquivalenz-Baseline.

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Metriken</b> — LLM-Kosten, menschliche Äquivalenz-Baseline, savings_x-Verhältnis</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Inbox</b> — ausstehende Gates, P0-Vorfälle, blockierte Aufgaben, stehengebliebene In-Progress-Tasks</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>Agenten</b> — 61 Spezialisten mit Last-Used + Durchlaufzahlen</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Memory</b> — 11 Schichten + kristallisierte Vorfallmuster</sub></td>
</tr>
</table>

**Gebaut für die Ein-Personen-Engineering-Organisation.** Indie-Hacker, Solo-Gründer, technische CTOs, die alles selbst betreiben – auf Claude Code oder OpenAI Codex. *Nicht für Teams* – siehe [FAQ](../FAQ.md#is-great_cto-for-teams).

## Installation

```bash
npx great-cto init
```

Starte deinen KI-Host nach dem Init neu. **Voraussetzungen:** Node 18.17+ und eines von:

| Host | Install-Flag | Status |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(Standard)_ | ✅ volle Unterstützung |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ Hooks + MCP + Agenten |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Die Begleit-Plugins Superpowers und Beads installieren sich automatisch – kein manuelles Setup nötig.

---

<details>
<summary>📖 Vollständige Dokumentation — zwei Gates · Kritiker · 61 Agenten · 26 Archetypen · 12 Jurisdiktionen · 45+ Compliance-Frameworks · Board · Kosten · MCP</summary>

## Zwei Entscheidungen pro Feature

```
🟡 gate:plan   ←  you decide here (architecture + tasks + cost)
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  you decide here (PR ready, security signed off)
```

Architekten, Planer, Reviewer, QA, Security, DevOps laufen automatisch zwischen diesen beiden menschlichen Checkpoints. **Memory bleibt erhalten** zwischen Sessions: jedes Gate-Urteil wird an `~/.great_cto/decisions.md` angehängt, jede Retrospektive an die projektspezifische `lessons.md`, und `/crystallize` befördert Muster mit hoher Wirkung in eine globale Bibliothek, die Agenten abfragen, bevor sie ein Problem erneut lösen.

## Kritiker vor dem Plan

Die teuersten Bugs stecken nicht im Code – sie stecken in Entscheidungen, die vor Beginn des Codings getroffen werden. Drei Kritiker-Agenten laufen vor der Plan-Phase, an den drei Stellen, an denen ein Fehler am meisten kostet:

| Kritiker | Fängt ab |
|---|---|
| **Architektur-Kritiker** | Kopplung, die Multi-Tenancy später ausschließt · "offensichtliches" O(n²) auf real-skalierten Daten · zirkuläre Abhängigkeiten zwischen Bounded Contexts |
| **Spec-Kritiker** | "Wir haben das falsche Problem gelöst" – die schlimmste Bug-Klasse, weil kein Unit-Test sie fängt · fehlausgerichtete Akzeptanzkriterien · Scope, der nie vereinbart wurde |
| **Schema-Kritiker** | `NOT NULL` ohne Default auf einer Tabelle mit 50M Zeilen (Deadlock 10 Min. nach Deploy) · fehlendes `CONCURRENTLY` bei der Index-Erstellung · irreversible Migrationen ohne Rollback-Pfad |

Früher wurden Kritiker erst ab dem Plan aktiviert. Jetzt fängt die Pipeline Architektur- und Spezifikationsfehler ab, bevor die Implementierung beginnt – wenn ein Rückgängigmachen Stunden kostet, nicht Tage.

## Wie great_cto im Vergleich abschneidet

|  | **great_cto** | Devin | Claude Code (allein) |
|---|---|---|---|
| Open Source | ✅ MIT | ❌ closed | ❌ geschlossenes Plugin-Modell |
| Self-Host | ✅ läuft lokal | ❌ Cognition Cloud | ✅ |
| Host | ✅ Claude Code + Codex | ❌ Cognition Cloud | ✅ Claude Code |
| BYOK / Multi-Model | ✅ Claude Code · Codex | ❌ proprietär | ❌ nur Anthropic |
| Spezialisten-Agenten | **57** (Architekt · PM · 12-Winkel-Review · QA · Security · DevOps · 42 Reviewer über Archetypen, Packs & Jurisdiktionen) | 1 Generalist | 1 Generalist |
| SDLC-Orchestrierung | architect → plan → impl → review → QA → security → devops | One-Shot-Autonomie | Edit-Loop |
| Menschliche Gates | ✅ 2 pro Feature (plan + ship) | ❌ keine | ❌ |
| Memory über Sessions hinweg | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ nur Thread | ⚠️ nur Thread |
| Kostenverfolgung | ✅ pro Agent + 30-Tage-Historie + savings_x | ❌ | ❌ |
| Compliance-Frameworks | ✅ 33+ (PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …) | ❌ | ❌ |
| Preis | kostenlos (du zahlst deinen LLM-Anbieter) | $500/Mon. | $20/Mon. |
| Setup | `npx great-cto init` | Anmeldung | CLI installieren |

great_cto ist **kein** weiterer Coding-Agent-Loop – es ist die **Orchestrierungsschicht über** dem Coding-Agenten, den du bereits nutzt. Denk an "Spezialisten-Team, das die Arbeit prüft und gatet" statt an "noch ein Assistent, der Code tippt".

## Jurisdiktionserkennung

`npx great-cto init` scannt drei Signalquellen – README-Schlüsselwörter, Infra-Region-Strings (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`) und die `package.json`-Homepage-TLD – und erkennt automatisch, welche der **12 Jurisdiktionen** zutreffen:

| Jurisdiktion | Signale (README + Infra) | Frameworks | Reviewer |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · `.de` TLD | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · california residents · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · information commissioner · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi data localisation | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic · notifiable data breach | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas guidelines · singpass | PDPA · MAS TRM | `us-privacy-reviewer` |
| `ca` | pipeda · quebec law 25 · casl · canadian users · `ca-central-*` | PIPEDA · Quebec Law 25 · CASL · OSFI B-10 | `us-privacy-reviewer` |
| `jp` | appi · japan users · my number · `ap-northeast-1` · `japaneast` | APPI 2022 · PPC Guidelines · FISC | `us-privacy-reviewer` |
| `cn` | pipl · mlps · china users · `cn-north-*` · `cn-east-*` | PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT | `gdpr-reviewer` |
| `kr` | pipa korea · isms-p · kisa · korea users · `ap-northeast-2` | PIPA · ISMS-P · FSC regulations | `us-privacy-reviewer` |
| `us` | ftc · us users · virginia cdpa · texas tdpsa | FTC Act · US state privacy laws | `us-privacy-reviewer` |

Word-Boundary-Matching verhindert False Positives (`"india"` matcht nicht `"indiana"`). Die erkannte Jurisdiktion wird in `PROJECT.md` als `jurisdiction: [eu, us-ca]` geschrieben und gatet den passenden Reviewer bei jedem Feature. Manuell überschreiben:

```yaml
jurisdiction: [eu, us-ca]
```

## Drei Befehle, die du jeden Tag nutzt

```bash
/start "build a refund endpoint with PCI-DSS scoping"
# → architect → enterprise-saas-reviewer (PCI-DSS auto-loaded)
# → pm → 5 Beads tasks → gate:plan (you approve)
# → senior-dev → 12-angle review → qa → security-officer
# → gate:ship (you approve) → devops → deployed

/inbox
# Pending gates · P0 incidents · blocked tasks · stale in-progress

/digest
# Weekly DORA + delta vs last week + cost-per-feature roll-up
```

Außerdem: `/audit` (Scan bestehender Codebases), `/cost` (LLM-Router-Einsparungen), `/sec` (Security-Schirm), `/oncall`, `/release`, `/rfc`. Vollständige Liste: `~/.claude/commands/` nach der Installation.

## Kosten

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| Pipeline | Kosten/Durchlauf | Durchläufe/Mon. | Gesamt |
|---|---|---|---|
| quick (Config / Tippfehler) | $0.10 | 10 | $1 |
| quick (neuer Endpoint) | $1 | 6 | $6 |
| standard (Feature) | $5 | 3 | $15 |
| deep (übergreifend) | $12 | 1 | $12 |
| | | | **~$34** |

Bezahle deine eigenen Anthropic-API-Tokens. **Keine Gebühr pro Sitzplatz. Kein SaaS-Lock-in.** Routine-Triage wird automatisch zu Kimi K2 geroutet (Sonnet-äquivalent bei ~5× niedrigeren Kosten) → 60–80 % Reduktion beim Log-Clustering.

## 26 automatisch erkannte Archetypen

Jeder Archetyp aktiviert seine eigenen Spezialisten-Agenten und Compliance-Checklisten. Top 7:

| Archetyp | Tier | Spezialisten-Agenten | Compliance |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

Vollständige Tabelle (26 Archetypen) + wie die Erkennung funktioniert: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Tiefe US-Abdeckung** – über GDPR/PCI/HIPAA hinaus prüft great_cto jetzt gegen SEC-Cyber-Disclosure (8-K Item 1.05), CMMC 2.0 / NIST 800-171 für Verteidigungsauftragnehmer, US-KI-Governance (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), Web-Tracking-Klagen (VPPA · CIPA · Washington MHMDA) sowie HMDA / SR 11-7 Modellrisiko bei Kreditvergabe.

## 14 Domain-Packs – Overlay-Reviewer

Domain-Packs setzen **auf** Archetypen auf. Automatisch angehängt, wenn die CLI pack-spezifische Signale erkennt (Dependencies, README-Begriffe). Jedes Pack fügt seine eigenen Reviewer, ein Threat-Model-Template, eine EVAL-Suite und menschliche Gates hinzu – unabhängig vom Basis-Archetyp.

| Kategorie | Packs |
|---|---|
| **KI-Verticals** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **Digital Health** | `digital-health-pack` _(Wearable-Telemetrie · Mental-Health-KI · Ernährungs-KI · Physician HITL)_ |
| **Fintech / reguliert** | `lending-pack` · `em-fintech-pack` |
| **High-Compliance** | `clinical-trials-pack` · `climate-pack` |
| **Engineering** | `api-platform-pack` · `robotics-pack` |
| **US-Markt** | `sec-cyber-pack` _(SEC 8-K Disclosure)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 Typen menschlicher Gates** + 53 Referenz-EVAL-Suiten + 15 TM-Templates. Durchstöbere alle 14 Packs mit **4-schichtiger Journey-Visualisierung** (Archetyp → Pack → Reviewer → Gate): [greatcto.systems/packs.html](https://greatcto.systems/packs.html).

## Ein echter Durchlauf, vollständig getraced

Ein Python-CLI-Feature wurde durch die komplette Pipeline versandt: **$2.39 LLM-Ausgaben** vs. ~$5.460 menschliches Äquivalent. Security fing zwei echte Defekte ab, die QA durchgelassen hatte (`list(stream_csv())` hat das Streaming ausgehebelt → 14,5 MB Peak-RSS bei 13 MB Input). Ein Multi-Reviewer-Modell fängt vor dem Merge ab, was einzelne Agenten übersehen.

Vollständiger Trace + Artefakte: [greatcto.systems/proof](https://greatcto.systems/proof) · roh: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## CI-Integration

Lässt sich in jeden GitHub-Actions-Workflow einbinden:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` erkennt `$GITHUB_ACTIONS` automatisch und gibt `::error file=...,line=N::`-Annotationen direkt auf PR-Diffs aus. Exit-Codes: 0 sauber / 1 Funde / 2 Setup-Fehler.

## Test-Pyramide

Geschichtete Test-Suite – **die strukturelle + State-Machine-Ebene läuft in <2 Min. für $0** (`node --test tests/*.test.mjs`); die Echt-LLM-Ebene (26 Archetypen × 4–8 Stufen + 14 Packs + 13 Reviewer) läuft on-demand über OpenRouter für ~$5–10. Vollständige Aufschlüsselung: [docs/testing/](../testing/).

## MCP

Nativer [MCP](https://modelcontextprotocol.io/)-Server – **7 Tools** aufrufbar aus Claude Desktop, Codex oder jedem MCP-Host. Lokal (kein Board nötig): `detect_archetype` · `estimate_cost` · `query_decisions`. Board-gestützt: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Vollständiges Setup + interne MCPs (Grafana, LLM-Router, Beads): [docs/MCP.md](../MCP.md).

## E-Mail-Benachrichtigungen (Zero-Setup)

Fünf Dinge, bei denen du in <2 Std. handeln musst, werden automatisch per E-Mail gesendet – auch wenn du nicht am Board bist:

| Trigger | Wann |
|---|---|
| 🚨 **P0-Vorfall** | Ein P0-Task wird in irgendeinem Projekt geöffnet |
| ⏸️ **Gate steht > 2 Std.** | Ein `gate:ship` wartet seit Stunden auf dich |
| 🛡️ **Security BLOCKED** | `security-officer` hat einen Merge abgelehnt |
| 💸 **Budget-Alarm** | Monatliche LLM-Ausgaben überschreiten 80 % / 100 % des Budgets |
| 📊 **Wöchentlicher Digest** | Freitag 09:00 – versandt, ausgegeben, eingespart, QA |

**Setup**: Board → **Notifications**-Tab → E-Mail eingeben → den 6-stelligen Code eingeben, den wir senden → Trigger auswählen. Keine Resend-Anmeldung, keine API-Keys – die Zustellung wird über `greatcto.systems/notify` geroutet (kostenlos, 100 E-Mails/24 Std. pro verifizierter E-Mail).

## Einschränkungen & Nicht-Ziele

- **Nicht für Teams** – Solo-CTO ist das Produkt. 2+ Engineers? Dann bist du herausgewachsen.
- **Kein Ersatz für Senior Engineers** – kodifiziert Prozesse; trifft ohne einen solchen keine architektonischen Ermessensentscheidungen.
- **Kein CI/CD-System** – Gates laufen lokal / in der Session. Für den eigentlichen Merge brauchst du weiterhin GitHub Actions.
- **Nicht zertifizierungsauditiert** – PCI/HIPAA/SOC2-Archetyp-Gerüste sind Ausgangspunkte, keine Zertifizierungen.
- **Nicht deterministisch** – LLM-generierte Ausgaben. Jedes Gate-Urteil sollte einem Plausibilitätscheck unterzogen werden.

## FAQ (Top 5)

**Wird mein Quellcode zum Trainieren von Modellen verwendet?** Nein. Die Claude-API ist für zahlende Kunden standardmäßig Zero-Retention. great_cto fügt nichts hinzu.

**Wie haltet ihr die Token-Kosten niedrig?** Haiku-by-default + Kimi-K2-Router für Triage (60–80 % Einsparung) + Cost-Guard-Hook.

**Kann ich Hooks deaktivieren?** Jeder Hook respektiert `GREAT_CTO_DISABLE_<NAME>=1`. Pro-Datei-Opt-out beim Secret-Scan: `// great_cto:allow-secrets`.

**Was, wenn ich nicht solo bin?** great_cto ist für die Ein-Personen-Engineering-Organisation gebaut. Wenn du 2+ Engineers hast und gemeinsame Boards / Multi-Seat-Auth brauchst, bist du herausgewachsen.

Vollständige FAQ: [docs/FAQ.md](../FAQ.md).

## Dokumentation

📚 **[Vollständiger Dokumentations-Hub →](../README.md)** – organisiert nach [Diátaxis](https://diataxis.fr/):
**[Erste Schritte](../tutorials/getting-started.md)** · How-to-Guides ·
[Agenten](../reference/agents.md)- & [Befehle](../reference/commands.md)-Referenz · [Architektur](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Architektur

Das Plugin läuft innerhalb von Claude Code (oder jedem MCP-fähigen Host); 61 Agenten sind Markdown-Spezifikationen; Aufgaben liegen in Beads (dolt, git-nativ); Memory ist reines Markdown (kein Vector Store). Diagramm + Stack-Tabelle: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Was ist neu

**v2.21.0** (Mai 2026) – **Flow-Compiler-UX**: `npx great-cto init` druckt jetzt einen **kompilierten Flow** mit Agenten, Gates, Compliance und Kostenschätzung pro Feature-Zyklus. Schreibt `.great_cto/FLOW.md` – Agenten lesen es, um genau zu wissen, wie sie deinen SDLC orchestrieren.

**v2.20.0** (Mai 2026) – **Detection v2**: **Abdeckung von 12 Jurisdiktionen** (CA · JP · CN · KR hinzugefügt, mit vollständigem Rechtsrahmen + menschlichen Gates) · **Infra-Signal-Erkennung** (Terraform-Region-Strings, `.env` `AWS_REGION=`, docker-compose `TZ=`, `package.json`-Homepage-TLD) · **Word-Boundary-Matching** (keine "india" → "indiana"-False-Positives mehr) · **Pack-Hints** für Nischen-Archetypen (`suggestedPacks` schlägt Robotics/Climate/Clinical-Trials/HR-AI/EM-Fintech-Packs vor, wenn die Konfidenz niedrig ist). Token-Einsparung: –87,7 % pro Pipeline-Durchlauf (v2.19.0 Context-Architecture-Redesign).

**v2.19.0** (Mai 2026) – **Token-Economy Phase 1+2**: Artefakt-Zusammenfassungen (≤250 Tokens, automatisch generiert) + aufgabenbewusster Memory-Filter (Top-k relevante Einträge pro Aufgabe). –87,7 % Tokens pro Pipeline-Durchlauf.

**v2.17.0** (Mai 2026) – **Begleit-Plugins installieren sich automatisch** · **Architektur- / Spec- / Schema-Kritiker** vor der Plan-Phase.

[Vollständiges Changelog →](../../CHANGELOG.md)

## Roadmap

- **Evals-Runner in CI** – Golden-Set-Eval-Suiten bei jedem PR ausführen, Prompt-Regressionen automatisch abfangen
- **Selbstverbessernder Loop** – Agenten, die aus Urteilen lernen und ihre eigenen Prompts mit der Zeit verbessern
- **Decision Scoring** – verfolgen, welche Gate-Entscheidungen sich als richtig herausgestellt haben; Muster sichtbar machen
- **/crystallize** – Lektionen mit hoher Wirkung zu wiederverwendbaren Skills befördern, die die gesamte Pipeline abfragen kann

[Über das nächste Feature abstimmen →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Autor

[avelikiy](https://github.com/avelikiy) – CTO, der KI-native Trading- und Fintech-Plattformen baut (0→1, 1→N). great_cto ist das Ergebnis der Automatisierung meiner eigenen Loops, ein Agent nach dem anderen. Jede Regel ist als Reaktion auf ein echtes Problem in einem echten Produktionssystem entstanden.

## Community

| Kanal | Wofür |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, Feature-Requests, Archetyp-Vorschläge |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Fragen, Muster, Show-and-Tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Architektur-Deep-Dives |
| 🔒 [SECURITY.md](../../SECURITY.md) | Verantwortungsvolle Offenlegung |

## Mitwirken & Lizenz

Pull-Requests sind willkommen – siehe [CONTRIBUTING.md](../../CONTRIBUTING.md). Gute erste Issues: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT – siehe [LICENSE](../../LICENSE).

Wenn great_cto dir Zeit gespart hat, gib dem Repo bitte einen Stern – das hilft anderen Solo-CTOs, es zu finden.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Gebaut von [@avelikiy](https://github.com/avelikiy)**
*Hör auf, die einzige Person zu sein, die ausliefern kann.*

</div>
