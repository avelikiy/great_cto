> ⚠️ **This translation is being updated.** GreatCTO has repositioned to an **AI Product Builder** — describe a product, approve the spec, ship the software (one CTO gate, maximum automation). For the current positioning see the [English README](../../README.md). The text below reflects the previous "AI autopilots" direction.

<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Des autopilotes IA pour l'entreprise — faites le travail, pas seulement le logiciel.**

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

[Site web](https://greatcto.systems) · [Une exécution réelle →](https://greatcto.systems/proof) · [Démo en direct](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Les services sont le nouveau logiciel

La prochaine vague, ce ne sont pas des outils pour spécialistes — ce sont des **autopilotes qui vendent le résultat d'un service**.
Un autopilote exécute une fonction métier entière de bout en bout (réception → traitement → décision → livraison) et
n'escalade que les jugements vers un humain qualifié. Chaque amélioration du modèle rend le service
plus rapide et moins coûteux.

GreatCTO livre ces autopilotes — chacun étant un **flux d'agents + d'outils avec un humain sur les étapes
risquées**, un relecteur de conformité intégré, et des **connecteurs en direct** qui exécutent chaque flux sur des données réelles.

## Les autopilotes

| Autopilote | Ce qu'il fait | Marché | Qui le construit |
|---|---|---|---|
| 🩺 **[Codage-médical](https://greatcto.systems/autopilots/rcm.html)** | Notes cliniques → demandes propres et conformes ; un codeur certifié signe les cas risqués | 50–80 Mds$ | Anterior · CodaMetrix · Fathom |
| 🖥️ **[IT-managé](https://greatcto.systems/autopilots/msp.html)** | Correctifs, configurations et accès sur tout le parc — par étapes, réversibles, humain sur les changements majeurs | 100 Mds$+ | Serval · Edra · Electric AI |
| ⚖️ **[Document-juridique](https://greatcto.systems/autopilots/legaltech.html)** | Rédige et révise contrats et NDA ; un avocat habilité signe tout ce qui relève du conseil | 20–25 Mds$ | Crosby · Harvey · Robin AI |
| 📒 **[Comptabilité & clôture](https://greatcto.systems/autopilots/accounting.html)** | Tient les comptes, rapproche et clôture le mois ; un contrôleur de gestion signe la clôture | 50–80 Mds$ | Rillet · Basis · Digits |
| 🧾 **[Préparation-fiscale](https://greatcto.systems/autopilots/tax.html)** | Prépare les déclarations et classe les positions ; un préparateur agréé signe avant dépôt | 30–35 Mds$ | Black Ore · April · Column Tax |
| 🛒 **[Source-to-pay](https://greatcto.systems/autopilots/procurement.html)** | Intègre les fournisseurs, rapproche les factures, libère les paiements — filtrés contre sanctions et fraude | 200 Mds$+ | Tacto · Zip · AskLio |

→ [Tous les autopilotes](https://greatcto.systems/autopilots.html) · lancez `/flow <vertical>` pour voir n'importe quel flux dans votre terminal

**Chaque autopilote garde un humain sur les jugements** — un codeur certifié, un avocat habilité, un
contrôleur de gestion, un préparateur agréé. L'autopilote gère le volume ; l'humain assume la décision qui
porte la responsabilité. **9 connecteurs en direct s'exécutent sur les six autopilotes** — FHIR, ICD-10 (NLM),
NCCI/MUE, X12 837P, DocuSign, Plaid, OFAC, déploiement par étapes, et un moteur fiscal fédéral américain. Ils sont
sans clé par défaut (source publique ou génération réelle déterministe) et envoient un POST au véritable fournisseur
dès que vous ajoutez vos identifiants.

## Sous le capot (pour le CTO qui le pilote)

Chaque autopilote est construit et exploité par un pipeline avec gates composé d'agents spécialistes — architecte, relecteur
à 12 angles, QA, responsable sécurité, devops — adaptés à votre stack et à votre juridiction. **Vous prenez deux
décisions par fonctionnalité ; tout le reste s'exécute automatiquement.** Le relecteur de conformité, les gates humaines
signées, la piste d'audit et les connecteurs en direct constituent la couche de confiance qui rend sûr le fait de laisser l'autopilote
tourner.

## En chiffres

| | |
|---|---|
| Coût LLM (une vraie fonctionnalité, tracée) | **2,39 $** |
| Équivalent humain pour le même travail | **~5 460 $** |
| Défauts détectés que la QA avait manqués | **2** |
| Coût mensuel (20 exécutions de pipeline) | **~34 $** |
| Agents spécialistes | **61** |
| Archétypes détectés automatiquement | **26** |
| Juridictions | **12** (GDPR · HIPAA · PCI-DSS · SOX · et plus) |

→ [Trace complète avec tous les artefacts](https://greatcto.systems/proof)

## Comment ça marche

**`npx great-cto init`** — scanne votre stack et votre README, détecte la juridiction (GDPR ? HIPAA ? PCI ?), écrit `.great_cto/FLOW.md` avec les agents, gates et frameworks de conformité exacts pour votre projet.

**`/start "décrivez la fonctionnalité"`** — les critiques examinent l'architecture et la spécification avant l'écriture de tout code. Vous examinez le plan au `gate:plan`.

**Les agents s'exécutent automatiquement** — senior-dev implémente en TDD, revue à 12 angles, QA, sécurité, devops. Vous approuvez le déploiement au `gate:ship`.

## Trois projets — trois pipelines différents

Même commande. Le résultat dépend de ce que vous construisez et de l'endroit où il tourne :

| | **Startup fintech · UE** | **Portail santé · US** | **Outil CLI** |
|---|---|---|---|
| Agents spécialistes | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| Gates humaines | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| Conformité | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| Coût / cycle | ~8–18 $ | ~8–18 $ | ~0,5–3 $ |

→ Essayez le sélecteur interactif : [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## Le tableau de bord que vous consulterez vraiment

`great-cto board` s'ouvre sur `http://localhost:3141` — Kanban avec SSE temps réel, tuile de coût par agent, statut du pipeline, dépense LLM sur 30 jours vs référence équivalent-humain.

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Métriques</b> — coût LLM, référence équivalent-humain, ratio savings_x</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Boîte de réception</b> — gates en attente, incidents P0, tâches bloquées, en cours obsolètes</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>Agents</b> — 61 spécialistes avec dernière utilisation + nombre d'exécutions</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Mémoire</b> — 11 couches + patterns d'incidents cristallisés</sub></td>
</tr>
</table>

**Conçu pour l'organisation d'ingénierie à une seule personne.** Indie hackers, fondateurs solo, CTO techniques qui font tout eux-mêmes — sur Claude Code ou OpenAI Codex. *Pas pour les équipes* — voir [FAQ](../FAQ.md#is-great_cto-for-teams).

## Installation

```bash
npx great-cto init
```

Redémarrez votre hôte IA après l'init. **Requiert :** Node 18.17+ et l'un de :

| Hôte | Flag d'installation | Statut |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(par défaut)_ | ✅ support complet |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + agents |

```bash
# Claude Code (par défaut)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Les plugins compagnons Superpowers et Beads s'installent automatiquement — aucune configuration manuelle nécessaire.

---

<details>
<summary>📖 Documentation complète — deux gates · critiques · 61 agents · 26 archétypes · 12 juridictions · 45+ frameworks de conformité · board · coût · MCP</summary>

## Deux décisions par fonctionnalité

```
🟡 gate:plan   ←  vous décidez ici (architecture + tâches + coût)
   ↓
🤖 senior-dev → revue à 12 angles → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  vous décidez ici (PR prête, sécurité validée)
```

Architectes, planificateurs, relecteurs, QA, sécurité, DevOps s'exécutent automatiquement entre ces deux points de contrôle humains. **La mémoire persiste** entre les sessions : chaque verdict de gate est ajouté à `~/.great_cto/decisions.md`, chaque rétrospective est ajoutée au `lessons.md` propre au projet, et `/crystallize` promeut les patterns à fort impact vers une bibliothèque globale que les agents interrogent avant de re-résoudre.

## Des critiques avant le plan

Les bugs les plus coûteux ne sont pas dans le code — ils sont dans les décisions prises avant le début du codage. Trois agents critiques s'exécutent avant l'étape Plan, aux trois positions où une erreur coûte le plus cher :

| Critique | Détecte |
|---|---|
| **Critique d'architecture** | Couplage qui exclut le multi-tenant plus tard · O(n²) « évident » sur des données à l'échelle réelle · dépendances circulaires entre bounded contexts |
| **Critique de spécification** | « On a résolu le mauvais problème » — la pire catégorie de bug, car aucun test unitaire ne le détectera · critères d'acceptation mal alignés · périmètre jamais validé |
| **Critique de schéma** | `NOT NULL` sans valeur par défaut sur une table de 50M de lignes (deadlock 10 min après le déploiement) · `CONCURRENTLY` manquant à la création d'index · migrations irréversibles sans chemin de rollback |

Auparavant, les critiques ne s'activaient qu'à partir du Plan. Désormais, le pipeline détecte les erreurs d'architecture et de spécification avant le début de l'implémentation — quand revenir en arrière coûte des heures, pas des jours.

## Comment great_cto se compare

|  | **great_cto** | Devin | Claude Code (seul) |
|---|---|---|---|
| Open source | ✅ MIT | ❌ fermé | ❌ modèle plugin fermé |
| Auto-hébergement | ✅ tourne en local | ❌ cloud Cognition | ✅ |
| Hôte | ✅ Claude Code + Codex | ❌ cloud Cognition | ✅ Claude Code |
| BYOK / multi-modèle | ✅ Claude Code · Codex | ❌ propriétaire | ❌ Anthropic uniquement |
| Agents spécialistes | **57** (architecte · PM · revue à 12 angles · QA · sécurité · devops · 42 relecteurs sur archétypes, packs et juridictions) | 1 généraliste | 1 généraliste |
| Orchestration SDLC | architecte → plan → impl → revue → QA → sécurité → devops | autonomie one-shot | boucle d'édition |
| Gates humaines | ✅ 2 par fonctionnalité (plan + ship) | ❌ aucune | ❌ |
| Mémoire entre sessions | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ thread uniquement | ⚠️ thread uniquement |
| Suivi des coûts | ✅ par agent + historique 30j + savings_x | ❌ | ❌ |
| Frameworks de conformité | ✅ 33+ (PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …) | ❌ | ❌ |
| Tarification | gratuit (vous payez votre fournisseur LLM) | 500 $/mois | 20 $/mois |
| Mise en place | `npx great-cto init` | inscription | installer le CLI |

great_cto n'est **pas** une énième boucle d'agent de codage — c'est la **couche d'orchestration au-dessus** de l'agent de codage que vous utilisez déjà. Pensez « équipe de spécialistes qui relit et met des gates sur le travail » plutôt que « un autre assistant qui tape du code ».

## Détection de juridiction

`npx great-cto init` scanne trois sources de signaux — mots-clés du README, chaînes de région d'infra (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`), et TLD de la homepage du `package.json` — et détecte automatiquement laquelle des **12 juridictions** s'applique :

| Juridiction | Signaux (README + infra) | Frameworks | Relecteur |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · TLD `.de` | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
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

La correspondance par frontière de mot évite les faux positifs (`"india"` ne correspond pas à `"indiana"`). La juridiction détectée est écrite dans `PROJECT.md` sous la forme `jurisdiction: [eu, us-ca]` et déclenche le relecteur approprié sur chaque fonctionnalité. Pour surcharger manuellement :

```yaml
jurisdiction: [eu, us-ca]
```

## Trois commandes que vous utilisez chaque jour

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

En plus : `/audit` (scan de base de code existante), `/cost` (économies du routeur LLM), `/sec` (parapluie sécurité), `/oncall`, `/release`, `/rfc`. Liste complète : `~/.claude/commands/` après l'installation.

## Coût

```
~34 $/mois pour un projet solo-CTO typique — 20 exécutions de pipeline/mois, à titre indicatif.
```

| Pipeline | Coût/exécution | Exéc./mois | Total |
|---|---|---|---|
| quick (config / typo) | 0,10 $ | 10 | 1 $ |
| quick (nouveau endpoint) | 1 $ | 6 | 6 $ |
| standard (fonctionnalité) | 5 $ | 3 | 15 $ |
| deep (transversal) | 12 $ | 1 | 12 $ |
| | | | **~34 $** |

Payez vos propres tokens de l'API Anthropic. **Aucun frais par siège. Aucun verrouillage SaaS.** Le triage de routine est auto-routé vers Kimi K2 (équivalent Sonnet à un coût ~5× inférieur) → réduction de 60–80 % sur le clustering de logs.

## 26 archétypes détectés automatiquement

Chaque archétype active ses propres agents spécialistes et listes de contrôle de conformité. Top 7 :

| Archétype | Niveau | Agents spécialistes | Conformité |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

Tableau complet (26 archétypes) + fonctionnement de la détection : [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Couverture US approfondie** — au-delà de GDPR/PCI/HIPAA, great_cto relit désormais selon la divulgation cyber de la SEC (8-K Item 1.05), CMMC 2.0 / NIST 800-171 pour les sous-traitants de la défense, la gouvernance IA américaine (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), les contentieux de web-tracking (VPPA · CIPA · Washington MHMDA), et HMDA / SR 11-7 sur le risque de modèle pour le crédit.

## 14 domain packs — relecteurs en surcouche

Les domain packs se superposent **par-dessus** les archétypes. Auto-attachés quand le CLI détecte des signaux spécifiques au pack (dépendances, termes du README). Chaque pack ajoute ses propres relecteur(s), modèle de threat-model, suite EVAL et gates humaines — indépendamment de l'archétype de base.

| Catégorie | Packs |
|---|---|
| **Verticaux IA** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **Santé numérique** | `digital-health-pack` _(télémétrie wearable · IA santé mentale · IA nutrition · médecin HITL)_ |
| **Fintech / régulé** | `lending-pack` · `em-fintech-pack` |
| **Haute conformité** | `clinical-trials-pack` · `climate-pack` |
| **Ingénierie** | `api-platform-pack` · `robotics-pack` |
| **Marché US** | `sec-cyber-pack` _(divulgation SEC 8-K)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 types de gates humaines** + 53 suites EVAL de référence + 15 modèles TM. Parcourez les 14 packs avec une **visualisation de parcours à 4 couches** (archétype → pack → relecteur → gate) : [greatcto.systems/packs.html](https://greatcto.systems/packs.html).

## Une exécution réelle, entièrement tracée

Une fonctionnalité CLI en Python livrée via le pipeline complet : **2,39 $ de dépense LLM** vs ~5 460 $ d'équivalent humain. La sécurité a détecté deux vrais défauts que la QA avait laissé passer (`list(stream_csv())` annulait le streaming → pic de 14,5 Mo de RSS sur une entrée de 13 Mo). Le modèle multi-relecteurs détecte ce que les agents seuls manquent, avant le merge.

Trace complète + artefacts : [greatcto.systems/proof](https://greatcto.systems/proof) · brut : [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## Intégration CI

À déposer dans n'importe quel workflow GitHub Actions :

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` détecte automatiquement `$GITHUB_ACTIONS` et émet des annotations `::error file=...,line=N::` directement sur les diffs de PR. Codes de sortie : 0 propre / 1 résultats / 2 erreur de configuration.

## Pyramide de tests

Suite de tests en couches — **le palier structurel + machine à états s'exécute en <2 min pour 0 $** (`node --test tests/*.test.mjs`) ; le palier LLM réel (26 archétypes × 4-8 étapes + 14 packs + 13 relecteurs) s'exécute à la demande via OpenRouter pour ~5–10 $. Détail complet : [docs/testing/](../testing/).

## MCP

Serveur [MCP](https://modelcontextprotocol.io/) natif — **7 outils** appelables depuis Claude Desktop, Codex ou tout hôte MCP. Local (sans board) : `detect_archetype` · `estimate_cost` · `query_decisions`. Adossés au board : `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Configuration complète + MCP internes (Grafana, routeur LLM, Beads) : [docs/MCP.md](../MCP.md).

## Alertes e-mail (sans configuration)

Cinq éléments qui nécessitent votre action en <2h vous sont envoyés automatiquement par e-mail — même quand vous êtes loin du board :

| Déclencheur | Quand |
|---|---|
| 🚨 **Incident P0** | Une tâche P0 s'ouvre dans n'importe quel projet |
| ⏸️ **Gate obsolète > 2h** | Un `gate:ship` vous attend depuis des heures |
| 🛡️ **Sécurité BLOQUÉE** | `security-officer` a rejeté un merge |
| 💸 **Alerte budget** | La dépense LLM mensuelle franchit 80 % / 100 % du budget |
| 📊 **Digest hebdomadaire** | Vendredi 09:00 — livré, dépensé, économisé, QA |

**Mise en place** : board → onglet **Notifications** → saisir l'e-mail → saisir le code à 6 chiffres que nous envoyons → choisir les déclencheurs. Pas d'inscription Resend, pas de clés API — la distribution passe par `greatcto.systems/notify` (gratuit, 100 e-mails/24h par e-mail vérifié).

## Limites & non-objectifs

- **Pas pour les équipes** — le solo-CTO est le produit. 2 ingénieurs ou plus ? Vous l'avez dépassé.
- **Pas un remplacement des ingénieurs seniors** — codifie le processus ; ne prend pas de décisions architecturales à la place d'un humain.
- **Pas un système CI/CD** — les gates s'exécutent en local / en session. Vous avez toujours besoin de GitHub Actions pour le merge réel.
- **Pas audité pour la certification** — les échafaudages d'archétypes PCI/HIPAA/SOC2 sont des points de départ, pas des certifications.
- **Pas déterministe** — sorties générées par LLM. Chaque verdict de gate doit être vérifié par bon sens.

## FAQ (top 5)

**Mon code source sert-il à entraîner des modèles ?** Non. L'API Claude est à rétention zéro par défaut pour les clients payants. great_cto n'ajoute rien.

**Comment maintenez-vous les coûts de tokens bas ?** Haiku par défaut + routeur Kimi K2 pour le triage (économies de 60–80 %) + hook cost-guard.

**Puis-je désactiver les hooks ?** Chaque hook honore `GREAT_CTO_DISABLE_<NAME>=1`. Désactivation du scan de secrets par fichier : `// great_cto:allow-secrets`.

**Et si je ne suis pas solo ?** great_cto est conçu pour l'organisation d'ingénierie à une seule personne. Si vous avez 2 ingénieurs ou plus et avez besoin de boards partagés / d'auth multi-siège, vous l'avez dépassé.

FAQ complète : [docs/FAQ.md](../FAQ.md).

## Documentation

📚 **[Hub de documentation complet →](../README.md)** — organisé selon [Diátaxis](https://diataxis.fr/) :
**[Démarrage](../tutorials/getting-started.md)** · Guides pratiques ·
référence [Agents](../reference/agents.md) & [Commandes](../reference/commands.md) · [Architecture](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Architecture

Le plugin s'exécute dans Claude Code (ou tout hôte compatible MCP) ; 61 agents sont des specs markdown ; les tâches vivent dans Beads (dolt, git-native) ; la mémoire est en markdown brut (pas de vector store). Diagramme + tableau de stack : [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Nouveautés

**v2.21.0** (mai 2026) — **UX du Flow Compiler** : `npx great-cto init` affiche désormais un **flux compilé** avec agents, gates, conformité et estimation de coût par cycle de fonctionnalité. Écrit `.great_cto/FLOW.md` — les agents le lisent pour savoir exactement comment orchestrer votre SDLC.

**v2.20.0** (mai 2026) — **Détection v2** : **couverture de 12 juridictions** (ajout de CA · JP · CN · KR avec framework légal complet + gates humaines) · **détection de signaux d'infra** (chaînes de région Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`, TLD de la homepage du `package.json`) · **correspondance par frontière de mot** (fini les faux positifs « india » → « indiana ») · **indices de pack** pour les archétypes de niche (`suggestedPacks` fait remonter les packs robotics/climate/clinical-trials/hr-ai/em-fintech quand la confiance est faible). Économie de tokens : –87,7 % par exécution de pipeline (refonte de l'architecture de contexte en v2.19.0).

**v2.19.0** (mai 2026) — **Économie de tokens Phase 1+2** : résumés d'artefacts (≤250 tokens, auto-générés) + filtre mémoire conscient de la tâche (top-k entrées pertinentes par tâche). –87,7 % de tokens par exécution de pipeline.

**v2.17.0** (mai 2026) — **auto-installation des plugins compagnons** · critiques **Architecture / Spécification / Schéma** avant l'étape Plan.

[Changelog complet →](../../CHANGELOG.md)

## Roadmap

- **Runner d'évals en CI** — exécuter les suites d'éval golden-set sur chaque PR, détecter automatiquement les régressions de prompt
- **Boucle auto-améliorante** — des agents qui apprennent des verdicts et améliorent leurs propres prompts au fil du temps
- **Scoring de décisions** — suivre quelles décisions de gate se sont révélées justes ; faire émerger les patterns
- **/crystallize** — promouvoir les leçons à fort impact en skills réutilisables que tout le pipeline peut interroger

[Votez pour la prochaine fonctionnalité →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Auteur

[avelikiy](https://github.com/avelikiy) — CTO construisant des plateformes de trading et fintech AI-native (0→1, 1→N). great_cto est le résultat de l'automatisation de mes propres boucles, un agent à la fois. Chaque règle est apparue en réponse à un vrai problème dans un vrai système de production.

## Communauté

| Canal | Quoi |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, demandes de fonctionnalités, propositions d'archétypes |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Questions, patterns, show-and-tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Plongées profondes dans l'architecture |
| 🔒 [SECURITY.md](../../SECURITY.md) | Divulgation responsable |

## Contribution & Licence

Les pull requests sont les bienvenues — voir [CONTRIBUTING.md](../../CONTRIBUTING.md). Bonnes premières issues : [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT — voir [LICENSE](../../LICENSE).

Si great_cto vous a fait gagner du temps, mettez une étoile au repo — cela aide d'autres CTO solo à le trouver.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Construit par [@avelikiy](https://github.com/avelikiy)**
*Arrêtez d'être la seule personne capable de livrer.*

</div>
