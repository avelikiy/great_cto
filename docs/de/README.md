<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Liefere Produkte mit dem Coding-Agenten, den du schon hast.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-skills_·_MCP_·_second_opinion-blueviolet)](https://github.com/openai/codex)

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [Ein echter Lauf →](https://greatcto.systems/proof) · [Live-Demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Übersetzung des englischen [README](../../README.md), Stand **v3.28.0** (2026-09-09).
> Bei Abweichungen gilt die englische Fassung.

---

great_cto ist die Schicht **um den Coding-Agenten herum, den du bereits
betreibst**. Es führt deinen Claude Code durch einen kompletten Build und
übergibt dir ein **Repository, das dir gehört**, und eine **URL, die schon
funktioniert**: Architektur, Datenmodell, Backend, Frontend, generierte Tests und
den Deploy, fertig. Kein Plan. Kein Prototyp.

Die eine Aufgabe, die es erledigt und ein Prompt-Bundle nicht: **es sagt dir, was
der Agent nicht getan hat.** Eine übersprungene Stufe, ein Review, das nie lief,
Kosten, die niemand gemessen hat — jedes davon erscheint als das, was es ist, und
zählt nie als Bestanden. Der Beweis ist Subtraktion: v3.27.0 und v3.27.1 haben
die eigenen günstigen Zahlen dieses Projekts gelöscht — „Kostenersparnis
gegenüber einer Vollzeitkraft", einen Ausgabenvergleich mit einem menschlichen
Team, einen hochgerechneten Monat — weil sich für keine davon zeigen ließ, dass
sie stimmt.

Auf Codex läuft die Pipeline nicht: Dort laufen das Skills-Bundle und ein
MCP-Server. Die andere Aufgabe von Codex ist die **zweite Meinung** — aus Claude
Code heraus liest es denselben Diff, und jede Review-Zeile trägt den `sha` des
Baums, den sie gelesen hat, sodass sich „reviewt" über *diesen* Diff beweisen
lässt, statt behauptet zu werden. Das Log enthält **bisher 4 Zeilen, 1 davon mit
einem sha**; daraus wird keine Trefferquote abgeleitet, und das sollte auch
niemand tun.

Es ist kein gehosteter App-Builder und ersetzt deinen Agenten nicht; ohne einen
gibt es nichts zu orchestrieren.

Sieben Produkte, im offenen Benchmark Ende zu Ende gebaut, kosteten im **Median
$171** an Tokens, gemessen 2026-07. Du zahlst deinen eigenen LLM-Anbieter;
great_cto stellt dir nichts in Rechnung und ist MIT.

Du wirst **dreimal** angehalten — bei *was* gebaut wird, bei *wie*, und bei *ob
es live geht*. Alles dazwischen läuft unbeaufsichtigt, und es ist die Aufgabe der
Pipeline, es wert zu sein, allein gelassen zu werden: Spezialisten mit engen
Aufgaben (architect, design-advisor, senior-dev, code-reviewer, QA, security,
devops) und ein unabhängiges Modell, das die Arbeit jeder Stufe prüft, bevor die
nächste darauf aufbaut. Die vollständige Besetzung steht in
[docs/reference/agents.md](../reference/agents.md).

```
   describe a product
        │
   🤖  problem framed · options weighed · brief written
        ▼
   👤  checkpoint 1 — approve WHAT gets built
        │
   🤖  architecture · data model · screens · plan
        ▼
   👤  checkpoint 2 — approve HOW it gets built
        │
   🤖  scaffold → backend → frontend → tests → review → security
        ▼
   👤  checkpoint 3 — approve the deploy
        │
   🤖  deployed · repo · live URL
```

Drei Checkpoints sind der **Standard**, nicht die Untergrenze. Eine Zeile in
`PROJECT.md` macht daraus einen — du genehmigst den Deploy, und Checkpoint 1
und 2 werden zu einem Bildschirm, den du liest, statt zu einem Formular, das du
ausfüllst:

```
approval-level: ship-only
```

Siehe [Wann es dich fragt](#wann-es-dich-fragt).

<p align="center">
  <img src="../screenshots/board.png" alt="Der Decisions-Bildschirm des Boards — jedes wartende Gate als eine Zeile: seine Rückabwicklungskosten, die Urteile beider Reviewer und ein Approve, das nach dem Namen des Gates fragt, wenn das Rückgängigmachen teuer wäre" width="900" />
</p>

<p align="center">
  <img src="../tapes/ci.gif" alt="Terminal: npx great-cto register fügt das Projekt dem Umschalter des Boards hinzu, dann prüft npx great-cto ci den deklarierten Archetyp gegen den Code und das Monatsbudget — und besteht" width="900" />
</p>

Das Board auf `localhost:3141` füllt sich selbst — Pipeline-Zustand, offene
Gates, Kosten pro Agent, 30-Tage-Ausgaben. Du fütterst es nicht; du schaust
darauf. Vier Bildschirme, je eine Frage: **Decisions** (was dich braucht — jedes
Gate mit den Urteilen beider Reviewer, sortiert nach Rückabwicklungskosten),
**Ledger** (was es gekostet hat und was gerade läuft), **Fleet** (welchem Agenten
du das Vertrauen entziehen solltest — seine Tool-Rechte, seine Läufe, seine
Ausgaben), **Harness** (wer Host ist, wer die zweite Meinung liefert und was sie
tatsächlich getan hat). Die Einstellungen liegen hinter dem Zahnrad; `⌘K` findet
jeden Agenten, jedes Dokument, jede Session, jede Erinnerung und jede
Entscheidung per Name. Nichts darauf stellt eine Abwesenheit als Bestanden dar —
ein Scan, der nie lief, ist `n/a`, nie eine grüne Null.

## Gemessene Zahlen

| | |
|---|---|
| Ein Feature, Ende zu Ende, voll nachvollziehbar | **1h 26m · $3.40** in Tokens — [die Belege](https://greatcto.systems/proof) |
| Ein ganzes Produkt — 7 im offenen Benchmark gebaut | Median **$171** in Tokens · Qualität **70/100** (58–86), gemessen **2026-07-10** — [selbst reproduzieren](../benchmarks/BENCH-2026-07-batch1.md) |
| Typischer Monat, 20 Pipeline-Läufe | **~$34** — du zahlst deinen eigenen LLM-Anbieter, sonst nichts |
| Produkte, die es bauen kann | **60**, in 15 US-Branchen, über [6 wiederverwendbare Pipelines](https://greatcto.systems/pipelines) |

Der Qualitätswert entsteht durch das Ausführen der Tests jedes Produkts, nicht
durch das Zählen von Dateien — deshalb lautet er 70 und nicht eine rundere,
hübschere Zahl.

## Schnellstart

```bash
npx great-cto init
```

Claude Code neu starten, dann:

```bash
/start "build a dispatch & scheduling app for an HVAC business"
```

Ab da übernimmt die Pipeline. Im Alltag berührst du drei Dinge:

| | |
|---|---|
| `/start "…"` | Produkt oder Feature beschreiben — die Pipeline führt es aus |
| `/inbox` | was auf dich wartet: offene Gates, P0s, blockierte Aufgaben |
| `/digest` | wöchentliche DORA-Metriken + Kosten pro Feature |

Benötigt Node ≥ 18.17. Begleit-Plugins (Superpowers, Beads) installieren sich
selbst. Prüfe nach dem init, ob der Host das Plugin wirklich geladen hat —
`claude plugin list --json` darf für `great-cto` keine `errors` zeigen.

**Auf OpenAI Codex** (`npx great-cto init --host codex`) bekommst du **die Skills
und den MCP-Server** — nicht die Pipeline von oben. Codex hat keine
Plugin-Oberfläche für Hooks, Slash-Befehle oder Rollen-Agenten, also laufen
`/start`, `/inbox`, die Gate-Kette und `secret-scan` dort nicht. Das ist eine
Grenze des Hosts, keine Einstellung: `hooks` in einem Plugin-Manifest wird nie
gelesen ([openai/codex#16430](https://github.com/openai/codex/issues/16430),
[#39895](https://github.com/openai/codex/issues/39895)). Der Installer druckt
dieselbe Aufteilung, bevor er irgendetwas tut.

**Zwei Harnesses, ein Review.** Seit 3.26.0 nimmt Codex *doch* an der Pipeline
teil — aus Claude Code heraus, als zweiter Reviewer. Einmal deklarieren:

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

und bei jeder Änderung mit hohem Einsatz reviewen der Claude-`code-reviewer` und
**`codex exec`** (Read-only-Sandbox, dein Codex-Login, kein API-Key) **denselben
Diff zur selben Zeit**. Die Befunde werden zusammengeführt; ein P0 von einer der
beiden Seiten blockiert; wo sie sich uneinig sind, erreichen beide Sätze den
Menschen am Gate — die strengere Seite bestimmt das Urteil, und niemand bildet
einen Mittelwert. Der **Harness**-Bildschirm des Boards erkennt Codex, hält die
Wahl fest und zeigt daneben, was die zweite Meinung *getan* hat: jeden Lauf,
übersprungene eingeschlossen, aus `.great_cto/cross-review.log`. Vier Zustände,
und der vierte ist der Punkt — *deklariert, aber nicht verfügbar* wird nie als
*aus* angezeigt.

Wie viel es hilft, wird dort gemessen und nicht hier behauptet. Was das Log
bisher enthält: das erste echte Codex-Review — über den Commit, der Codex
angebunden hat — fand einen P1, den der Autor und die Testsuite beide übersehen
hatten; das Review des Fixes fand nichts. Zwei Läufe sind ein Beleg für den
Mechanismus, keine Quote. Die Quote ist die Aufgabe der Karte.

## Wann es dich fragt

Eine Einstellung in `.great_cto/PROJECT.md` bestimmt, wo die Pipeline anhält:

| `approval-level` | Hält dich an bei | Stopps |
|---|---|---|
| **`ship-only`** | **dem Deploy — und informiert dich darüber, was gebaut wird** | **1** |
| `product-only` | was wir bauen · ob es live geht | 2 |
| `gates-only` *(Standard)* | was wir bauen · dem Design · dem Deploy | 3 |
| `strict` | dem Design · dem Code-Review · dem Deploy | 3 |
| `auto` | nichts in der Pipeline | 0 |

Gezählt werden Pipeline-Stopps. Jede Stufe trägt zusätzlich eine Sicherung, die
keine Prozessentscheidung ist: der Import von Daten über bestehende Datensätze
hält dich auf **jeder** Stufe an, `auto` eingeschlossen, weil genau der zerstört,
was vorher da war.

**`ship-only` ist das Minimum, das noch ehrlich ist.** Ein Stopp — der Deploy,
die einzige Entscheidung, deren Folge deine Maschine verlässt. Die Entscheidung
*was gebaut wird* verschwindet dabei nicht, denn eine Pipeline, die einen Tag
lang das Falsche baut, ist der teure Fehlschlag: Sie kommt als ein Bildschirm in
deiner Konsole, einmal ausgegeben, bevor der Build startet.

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

Schweigen ist Zustimmung, und der Bildschirm sagt das auch. Lässt sich das
Briefing nicht lesen, kommt das Gate zurück — „ich konnte es dir nicht zeigen"
wird nie als „dir wurde es gezeigt und du hast nichts gesagt" ausgeliefert.

`gates-only` hat das Produkt-Gate in v3.0.0 bekommen. Früher hielt es beim *wie*
gebaut wird und beim *ob* released wird an, nie beim *was* gebaut wird — der
Entscheidung, die sechs Stufen lang falsch ist, bevor es irgendwem auffällt. Es
kostet eine Pause pro **Produkt**, nicht pro Feature: `product-owner` ist ein
Einstiegspunkt und läuft nur aus `/start`.

Ein regulierter Archetyp — Fintech, Gesundheit, Behörden — behält seine
Security-, Compliance- und Ship-Gates **auf jeder Stufe, auch bei `auto`**. Eine
leichtere Stufe delegiert Urteilsvermögen; sie umgeht niemals Compliance.
Vollständige Tabelle: [docs/GATES.md](../GATES.md).

## Vier Dinge, die es sich weigert zu sagen

Dieselbe Regel, an den vier Stellen, an denen sie etwas kostet: **etwas, das
nicht passiert ist, darf nie aussehen wie etwas, das passiert ist.**

| Wann | Was leicht zu zeigen wäre | Was es stattdessen zeigt |
|---|---|---|
| Eine zweite Meinung ist deklariert, aber ihr Harness fehlt | *aus* | **`unavailable`** — deklariert und nicht erreichbar ist keine Entscheidung, die du getroffen hast |
| Eine Prüfung lief und konnte nicht entscheiden | *bestanden* | **`unverifiable`** — und die Stufe läuft darauf nicht weiter |
| Die Kosten eines Laufs wurden nie gemessen | **`$0.00`** | **`unmeasured`** — und Budgets lösen darauf nicht aus |
| Eine Stufe wurde von niemandem bewertet | *0* | **`null`** — eine Bestehensquote teilt durch das, was tatsächlich bewertet wurde |

Jede dieser Stellen ist eine, an der die ehrliche Antwort länger, hässlicher und
schwerer zu bauen ist als die selbstsichere. Das ist das ganze Produkt.

## Die drei Zweifel, die sich lohnen

**„Ich kann Code nicht trauen, bei dessen Entstehung ich nicht zugesehen habe."**
Wir auch nicht, deshalb wird einem Agenten nichts über sich selbst geglaubt. Jede
Stufe wird gegen das geprüft, was sie tatsächlich produziert hat — existieren die
genannten Dateien, bestehen die eingefrorenen Akzeptanzkriterien beim Ausführen,
und erst dann wird ein separates Modell gefragt, ob jede Anforderung adressiert
ist. Wo diese Prüfung es nicht entscheiden kann, liefert sie `unverifiable`, und
das ist **kein** Bestanden.

**„Es gibt Geld aus, während ich schlafe."**
Budgets pro Agent verweigern die Beauftragung jenseits ihrer Obergrenze und
nennen die Zahl. Ein Lauf, dessen Kosten sich nicht messen ließen, steht als
`unmeasured` da und hält nichts auf — ein Limit, das auf einer Zahl auslöst, die
niemand gemessen hat, ist schlimmer als kein Limit, und ein selbstsicheres
`$0.00` für ungemessene Arbeit ist genau der Weg, auf dem Ausgaben unbemerkt
bleiben.

**„Und dann hänge ich fest."**
Ein Befehl zur Installation, MIT, läuft auf deiner Maschine gegen deinen eigenen
LLM-Account. Lösche great_cto, und das Repository, das es gebaut hat, gehört
weiterhin dir — gewöhnliches Next.js, Postgres und Stripe, mit dem jeder Engineer
weiterarbeiten kann.

## Was es anders macht

- **Spezialisten statt Generalist** — 70 Agenten mit engen Aufgaben und eigenen
  Review-Gates, statt eines Assistenten, der schneller tippt als denkt.
  [Die Besetzung →](../reference/agents.md)
- **Kritiker vor dem Code** — Architektur-, Spezifikations- und Schema-Kritiker
  laufen vor der Planung, wo ein Fehler noch Stunden statt Tage kostet.
- **Scope beim Schreiben erzwungen** — ein Agent kann Dateien außerhalb seines
  Auftrags physisch nicht anfassen. Nicht im Review markiert; beim Schreiben
  verweigert.
- **QA, das sich selbst misstraut** — kritische Pfade werden vor dem Testcode in
  Gherkin geschrieben, dann fragt Mutationstesten, ob die Suite überhaupt etwas
  fangen würde.
- **Gedächtnis über Sessions** — Entscheidungen, Lektionen und beförderte Muster
  bleiben pro Projekt und global erhalten; ein unterbrochener Lauf setzt fort und
  weiß, welche Stufen schon liefen.
- **Sichtbare Kosten** — Ausgaben pro Agent, Abweichung Schätzung-gegen-Ist und
  Kosten pro akzeptierter Änderung auf dem Board, nicht in einer Tabelle.
- **Ausgabengrenzen, die verweigern** — `agent-budgets:` in PROJECT.md deckelt,
  was eine Stufe ausgeben darf; die Pipeline verweigert die Beauftragung darüber
  hinaus und nennt die Zahl. Eine Schätzung verweigert nie — siehe die Tabelle
  oben.
- **Eine Stufe wird geprüft, bevor die nächste darauf aufbaut** — die vom Urteil
  genannten Dateien müssen existieren, eingefrorene `## ACCEPTANCE`-Kriterien
  müssen beim Ausführen bestehen, und erst dann wird ein zweites Modell gefragt,
  ob jede Anforderung adressiert ist. Die billigste Frage zuerst, und drei
  Antworten statt zwei: `verified`, `rework` oder `unverifiable`. Ein Agent, der
  nichts behauptet und keine Kriterien einfriert, wird gemeldet — sonst wäre der
  billigste Weg zu bestehen, nichts zu behaupten.
- **Arbeit geht zurück, und die Rückgabe hat eine Obergrenze** — eine gescheiterte
  Stufe kommt als `REWORK` zurück, mit zitierten Befunden, und derselbe Agent
  behebt es; `BLOCKED` heißt, ein Mensch muss entscheiden. Nach drei Durchgängen
  wird es zum Problem des Menschen, denn zwei Maschinen, die sich Arbeit hin- und
  herreichen, werden nicht müde.
- **Qualität getrennt von dem, was passiert ist** — das Urteil sagt, was ein Lauf
  getan hat, ein *Score* sagt, wie gut, in einem eigenen, nur anhängenden
  Speicher, von einem anderen Akteur zu einer anderen Zeit. Scorer dürfen sich
  uneinig sein, und jeder Score nennt seinen Urheber.
- **Schweigen wird protokolliert** — der Dispatcher schreibt nach
  `.great_cto/pipeline-runs.jsonl`, was er entschieden hat, *auch wenn er nichts
  entschieden hat*, und warum. Jeder in diesem Jahr gefundene Pipeline-Defekt
  versteckte sich in der Lücke zwischen „nichts sollte passieren" und „nichts
  konnte passieren".

Alles läuft lokal, MIT-lizenziert, mit deinen eigenen Schlüsseln. Dein Code
bleibt auf deiner Maschine; Prompts gehen an deinen LLM-Anbieter und nirgendwo
sonst hin. Telemetrie ist **standardmäßig aus** ([docs/PRIVACY.md](../PRIVACY.md)).

## Grenzen

- **Für eine Person** — Solo-Gründer oder CTO. Zwei oder mehr Engineers an einer
  Pipeline sind ihr entwachsen.
- **Kein CI/CD-System** — Gates laufen lokal; gemergt wird weiterhin über GitHub
  Actions.
- **Kein Zertifizierungsaudit** — PCI/HIPAA/SOC2-Gerüste sind Startpunkte, keine
  Zertifizierungen.
- **Nicht deterministisch** — LLM-Ausgabe. Gate-Urteile verdienen einen zweiten
  Blick.
- **Ausgaben werden gemessen, die Zuordnung noch nicht pro Agent** — die Kosten
  werden aus dem Session-Transkript des Hosts gelesen und nicht aus dem
  Selbstbericht eines Agenten, die Tokens sind also echt. Aber das Transkript,
  das der Hook bekommt, deckt die Session ab und nicht einen Subagenten, also
  können die Kosten eines Laufs derjenigen Stufe zugeordnet werden, die zuletzt
  fertig wurde — um Größenordnungen aufgebläht. Behandle Zahlen pro Agent als
  Obergrenze, bis das behoben ist. Eine Stufe ganz ohne Messung zeigt weiterhin
  `unmeasured` statt eines selbstsicheren `$0.00`, und Budgets lösen für sie
  nicht aus.

## Dokumentation

**[Doku-Hub →](../README.md)** ·
[Erste Schritte](../tutorials/getting-started.md) ·
[Gates & Genehmigungsstufen](../GATES.md) ·
[Agenten](../reference/agents.md) · [Befehle](../reference/commands.md) ·
[Archetypen](../ARCHETYPES.md) · [Architektur](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[Alles Weitere](../DETAILS.md) — Kritiker, Jurisdiktionen, Kostenaufschlüsselung, CI, Alerts

## Community

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[Blog](https://greatcto.systems/blog/) ·
[Sicherheitsrichtlinie](../../SECURITY.md) · [Mitwirken](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE). Gebaut von [@avelikiy](https://github.com/avelikiy):
CTO für AI-native Trading- und Fintech-Plattformen; great_cto sind meine eigenen
Abläufe, automatisiert — ein Agent nach dem anderen.

Wenn es dir Zeit gespart hat: Ein Stern hilft anderen Solo-Buildern, es zu
finden.

<div align="center">

*Hör auf, die einzige Person zu sein, die shippen kann.*

</div>
