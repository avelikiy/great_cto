<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Constructeur de Produits IA — décrivez un produit, approuvez la spécification, livrez le logiciel.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Site web](https://greatcto.systems) · [Une exécution réelle →](https://greatcto.systems/proof) · [Démo en direct](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Construisez le produit, pas seulement le code

great_cto est un **Constructeur de Produits IA**. Décrivez un produit logiciel et il exécute tout le
build — architecture, modèle de données, backend, frontend, tests, déploiement. **Une seule gate humaine :** vous,
le CTO, approuvez la spécification. Tout ce qui suit est automatisé, jusqu'à un dépôt livré et une URL en ligne.

Les principaux secteurs américains pour lesquels il construit — services à domicile et sur le terrain, services
professionnels, hôtellerie, retail/e-commerce, proptech, fitness, marketing & créateurs, RH/recrutement,
construction, logistique — se réduisent à **6 archétypes de build réutilisables** (SaaS vertical CRUD,
réservation, CRM, tableau de bord, place de marché, contenu/média). Un seul template livre n'importe lequel des ~40 produits.
Voir [docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md).

```
   describe a product
        │
   spec synthesis  ── architecture · data model · screens          (automated)
        ▼
   👤  CTO gate — approve the spec        ← the one human checkpoint
        │
   scaffold → backend → frontend → integrate → test → deploy        (automated)
        ▼
   shipped product · repo · live URL
```

La CI et les tests générés constituent la gate qualité — vous signez la **direction**, pas chaque ligne.

> **Operate** — la surface d'exécution où un humain signe chaque transaction régulée (console
> opérateur, runtime d'autopilote, flux verticaux) — **a déménagé dans son propre repo :**
> [github.com/avelikiy/operate](https://github.com/avelikiy/operate). great_cto est désormais le
> produit de build.

## Sous le capot (pour le CTO qui le pilote)

→ *L'histoire de cette surface côté builder : [greatcto.systems/build](https://greatcto.systems/build)*

Chaque produit est construit par un pipeline d'agents spécialistes — architecte, design-advisor, senior-dev,
QA, security-officer, devops — qui exécute spec → scaffold → backend → frontend → tests → déploiement.
**Vous prenez une seule décision : approuver la spécification.** Tout ce qui suit est automatisé. Le pipeline est
hiérarchisé par risque — un correctif de maintenance n'ouvre aucune gate (la CI est la gate), une fonctionnalité réversible n'ouvre que la
gate de plan, et un changement irréversible impose l'ensemble complet — de sorte que la cérémonie s'adapte au rayon d'impact,
pas à la paperasse. La CI et les tests générés du build constituent la gate qualité qui rend sûr
le fait de laisser le pipeline tourner jusqu'au déploiement.

**MCP compagnon recommandé : Serena (navigation de code sémantique).** Sur les grandes bases de code, les
agents qui écrivent du code (senior-dev, coder) brûlent du contexte à grepper et lire des fichiers entiers. Le
[MCP Serena](https://github.com/oraios/serena) leur donne une navigation au niveau des symboles
(find-symbol, references, structure) à la place :

```bash
claude mcp add serena -- uvx --from git+https://github.com/oraios/serena \
  serena start-mcp-server --context ide-assistant --project "$(pwd)"
```

Optionnel — tout fonctionne sans lui ; avec lui, les tâches d'implémentation sur de gros repos utilisent
nettement moins de contexte par édition.

**Une seule gate, là où ça compte.** Les étapes de build sont hiérarchisées par risque : un changement réversible se construit et se livre
derrière la CI ; un changement irréversible — un déploiement en production, une migration de schéma, une nouvelle intégration
capable d'écriture — escalade vers la gate CTO et le modèle frontier avant de s'exécuter. Vous signez la spécification
et les appels à fort rayon d'impact ; le reste passe en direct. `change-tier` + `effectiveGates`
font respecter l'invariant dans le code.

## En chiffres

| | |
|---|---|
| Une fonctionnalité, de bout en bout (exécution réelle, entièrement tracée) | **1h 26m · 3,40 $ LLM** vs ~42 K$ / ~6 semaines en traditionnel |
| Une exécution antérieure de fonctionnalité CLI, même pipeline | 2,39 $ LLM vs ~5 460 $ équivalent humain ; la sécurité a détecté 2 défauts que la QA avait laissé passer |
| Coût mensuel (20 exécutions de pipeline) | **~34 $** |
| Secteurs US ciblés | **10** (services à domicile · retail · proptech · fitness · RH · …) |
| Produits constructibles | **~40** répartis sur les 10 secteurs |
| Pipelines de build réutilisables | **6** (CRUD · réservation · CRM · tableau de bord · place de marché · contenu) |
| Agents spécialistes | **46** |

→ [Trace complète avec tous les artefacts](https://greatcto.systems/proof) · [les 6 pipelines](https://greatcto.systems/pipelines)

## Comment ça marche

**`npx great-cto init`** — scanne votre stack et écrit `.great_cto/FLOW.md` avec le pipeline pour votre produit : les agents, l'archétype de build et l'unique gate CTO.

**`/start "décrivez le produit"`** — architect et design-advisor rédigent la spécification, le modèle de données et les écrans. Vous les examinez et les approuvez à l'**unique gate** — `gate:plan`.

**Le pipeline le livre** — senior-dev échafaude et construit en TDD, QA exécute les tests générés, devops déploie. Aucune approbation supplémentaire n'est requise pour un build réversible.

## Trois produits — un seul pipeline

Même commande, produit différent. L'archétype de build façonne la stack et les intégrations :

| | **App de répartition** | **App de réservation de cours** | **Tableau de bord de rentabilité** |
|---|---|---|---|
| Archétype | SaaS vertical CRUD | Réservation / planification | Tableau de bord / analytique |
| Stack | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Intégrations | Auth · RBAC | Stripe · Twilio | connecteurs de sources |
| Gates humaines | `gate:plan` (la gate CTO) | `gate:plan` | `gate:plan` |

→ Voir les 6 pipelines : [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## Le tableau de bord que vous consulterez vraiment

`great-cto board` s'ouvre sur `http://localhost:3141` — le build board : SSE temps réel, le pipeline en direct avec son badge change_tier (une gate CTO · juge économique), coût par agent, dépense LLM sur 30 jours vs référence équivalent-humain.

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>Métriques</b> — tâches livrées, dépense IA, économies de coût vs une équipe humaine, burn quotidien</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Mémoire</b> — couches de mémoire projet parcourables : PROJECT.md, archétypes, skills, leçons</sub></td>
</tr>
</table>

**Conçu pour l'organisation d'ingénierie à une seule personne.** GreatCTO s'adresse à l'indie hacker, au fondateur solo ou au CTO technique qui veut livrer de vrais produits sans équipe — en exécutant le pipeline sur Claude Code ou OpenAI Codex, en approuvant une seule spécification, et en livrant vers une URL en ligne. *Pas pour les équipes d'ingénierie multi-dev* — voir [FAQ](../FAQ.md#is-great_cto-for-teams).

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
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Les plugins compagnons Superpowers et Beads s'installent automatiquement — aucune configuration manuelle nécessaire.

---

<details>
<summary>📖 Documentation complète — une gate CTO · hiérarchisation par risque · critiques · 46 agents · archétypes de build · board · coût · MCP</summary>

## Une décision par fonctionnalité

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

Le pipeline est hiérarchisé par risque (`change_tier`) : un correctif de maintenance n'ouvre **aucune** gate (la CI est la gate), une fonctionnalité réversible n'ouvre **que** `gate:plan`, et un changement irréversible impose l'ensemble complet + le modèle frontier. Tout ce qui se trouve entre la gate et le déploiement s'exécute automatiquement. **La mémoire persiste** entre les sessions : chaque verdict de gate est ajouté à `~/.great_cto/decisions.md`, chaque rétrospective au `lessons.md` propre au projet, et `/crystallize` promeut les patterns à fort impact vers une bibliothèque globale que les agents interrogent avant de re-résoudre.

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
| Agents spécialistes | **46** (architect · design-advisor · senior-dev · QA · sécurité · devops · relecteurs sur archétypes) | 1 généraliste | 1 généraliste |
| Pipeline de build | spec → gate CTO → scaffold → build → test → deploy | autonomie one-shot | boucle d'édition |
| Gates humaines | ✅ une — vous approuvez la spécification (hiérarchisée par risque) | ❌ aucune | ❌ |
| Mémoire entre sessions | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ thread uniquement | ⚠️ thread uniquement |
| Suivi des coûts | ✅ par agent + historique 30j + savings_x | ❌ | ❌ |
| Design intégré | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
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
/start "build a dispatch & scheduling app for an HVAC business"
# → architect + design-advisor → spec, data model, screens
# → pm → Beads tasks → gate:plan (you approve the spec — the one gate)
# → senior-dev → review → qa → devops → built · tested · deployed

/inbox
# Pending gate · P0 incidents · blocked tasks · stale in-progress

/digest
# Weekly DORA + delta vs last week + cost-per-feature roll-up
```

En plus : `/audit` (scan de base de code existante), `/cost` (économies du routeur LLM), `/sec` (parapluie sécurité), `/oncall`, `/release`, `/rfc`. Liste complète : `~/.claude/commands/` après l'installation.

## Coût

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| Pipeline | Coût/exécution | Exéc./mois | Total |
|---|---|---|---|
| quick (config / typo) | 0,10 $ | 10 | 1 $ |
| quick (nouveau endpoint) | 1 $ | 6 | 6 $ |
| standard (fonctionnalité) | 5 $ | 3 | 15 $ |
| deep (transversal) | 12 $ | 1 | 12 $ |
| | | | **~34 $** |

Payez vos propres tokens de l'API Anthropic. **Aucun frais par siège. Aucun verrouillage SaaS.** Le triage de routine est auto-routé vers Kimi K2 (équivalent Sonnet à un coût ~5× inférieur) → réduction de 60–80 % sur le clustering de logs.

## Archétypes de build

Chaque produit correspond à un **archétype de build** qui façonne son pipeline — le template de stack,
la forme des données, l'intégration signature. Les 6 archétypes du Constructeur de Produits (les ~40 produits
se réduisent à ceux-ci) :

| Archétype | Forme | Stack | Intégration |
|---|---|---|---|
| `vertical-saas` | entités · rôles · workflow · UI de records | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | calendrier · disponibilité · rappels · paiements | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | contacts · pipeline · séquences automatisées | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | ingestion · métriques · visualisation · alertes | Next.js · warehouse-lite · charts | connecteurs de sources |
| `marketplace` | annonces à deux faces · matching · paiements | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | catalogue · niveaux d'accès · livraison · monétisation | Next.js · object storage · CDN | Stripe · pipeline média |

Plus les archétypes sous-jacents de type-de-logiciel (`web-service`, `mobile-app`, `cli-tool`,
`library`, …) que le moteur détecte automatiquement pour affiner le build. Voir [les 6 pipelines](https://greatcto.systems/pipelines).

Tableau complet (26 archétypes) + fonctionnement de la détection : [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Couverture US approfondie** — au-delà de GDPR/PCI/HIPAA, great_cto relit désormais selon la divulgation cyber de la SEC (8-K Item 1.05), CMMC 2.0 / NIST 800-171 pour les sous-traitants de la défense, la gouvernance IA américaine (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), les contentieux de web-tracking (VPPA · CIPA · Washington MHMDA), et HMDA / SR 11-7 sur le risque de modèle pour le crédit.

## Surcouches de domaine (optionnelles)

Au-delà de l'archétype de build, le moteur peut auto-attacher une **surcouche de domaine** optionnelle quand il
détecte des signaux spécifiques à un domaine (dépendances, termes du README) — ajoutant un relecteur spécialiste et quelques
contrôles supplémentaires pour des choses comme la voix/téléphonie, la confidentialité (GDPR/CCPA), ou la gouvernance IA. Elles sont
opt-in et orthogonales au pipeline de build ; la plupart des produits n'en ont besoin d'aucune.

## Une exécution réelle, entièrement tracée

Le reçu canonique : **une seule fonctionnalité réelle** livrée via le pipeline complet en **1h 26m
de temps réel pour 3,40 $ de coût LLM** — architect → plan → implémentation → review → gate humaine →
PR mergée. Le chemin traditionnel pour la même fonctionnalité : ~170 heures et ~42 K$. Chaque étape
horodatée, chaque artefact lié à une PR GitHub publique.

Une exécution antérieure sur une fonctionnalité CLI en Python (2,39 $ vs ~5 460 $ équivalent humain) a montré le modèle de revue à l'œuvre : la sécurité a détecté deux vrais défauts que la QA avait laissé passer (`list(stream_csv())` annulait le streaming → pic de 14,5 Mo de RSS sur une entrée de 13 Mo).

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

- **Pas pour les équipes d'ingénierie multi-dev** — un seul builder est le produit ; 2 ingénieurs ou plus partageant le pipeline l'ont dépassé.
- **Pas un remplacement des ingénieurs seniors** — codifie le processus ; ne prend pas de décisions architecturales à la place d'un humain.
- **Pas un système CI/CD** — les gates s'exécutent en local / en session. Vous avez toujours besoin de GitHub Actions pour le merge réel.
- **Pas audité pour la certification** — les échafaudages d'archétypes PCI/HIPAA/SOC2 sont des points de départ, pas des certifications.
- **Pas déterministe** — sorties générées par LLM. Chaque verdict de gate doit être vérifié par bon sens.

## FAQ (top 5)

**Mon code source sert-il à entraîner des modèles ?** Non. L'API Claude est à rétention zéro par défaut pour les clients payants. great_cto n'ajoute rien.

**Comment maintenez-vous les coûts de tokens bas ?** Haiku par défaut + routeur Kimi K2 pour le triage (économies de 60–80 %) + hook cost-guard.

**Puis-je désactiver les hooks ?** Chaque hook honore `GREAT_CTO_DISABLE_<NAME>=1`. Désactivation du scan de secrets par fichier : `// great_cto:allow-secrets`.

**Et si je ne suis pas solo ?** Le pipeline de build de GreatCTO est conçu pour un seul ingénieur — si vous avez 2 ingénieurs ou plus qui ont besoin de builder boards partagés et de pipelines concurrents, vous l'avez dépassé.

FAQ complète : [docs/FAQ.md](../FAQ.md).

## Documentation

📚 **[Hub de documentation complet →](../README.md)** — organisé selon [Diátaxis](https://diataxis.fr/) :
**[Démarrage](../tutorials/getting-started.md)** · Guides pratiques ·
référence [Agents](../reference/agents.md) & [Commandes](../reference/commands.md) · [Architecture](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Architecture

Le plugin s'exécute dans Claude Code (ou tout hôte compatible MCP) ; 46 agents sont des specs markdown ; les tâches vivent dans Beads (dolt, git-native) ; la mémoire est en markdown brut (pas de vector store). Diagramme + tableau de stack : [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Nouveautés

**v2.74+** (juin 2026) — **Le pivot Constructeur de Produits** : GreatCTO devient un *Constructeur de Produits IA* — décrivez un produit logiciel, approuvez la spécification à une seule gate CTO, et le pipeline le livre (spec → build → test → deploy). 10 secteurs US, ~40 produits, 6 pipelines réutilisables. Les gates de build sont hiérarchisées par risque (`change_tier`) ; la surface d'exécution régulée a déménagé vers [avelikiy/operate](https://github.com/avelikiy/operate). Histoire : [la stratégie](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [les 6 pipelines](https://greatcto.systems/pipelines)

**v2.40–v2.62** (juin 2026) — **Le pivot autopilote** : GreatCTO devient des *autopilotes IA pour l'entreprise* — 25 verticaux de service-autopilote, chacun étant un flux avec un scorecard de qualité mesuré, un propriétaire responsable, et l'invariant d'exécution selon lequel **une action irréversible ne s'exécute jamais sans signature humaine**. 22 connecteurs en direct exécutent chaque vertical sur des données réelles. Histoire : [Nous avons pivoté →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63** (juin 2026) — **La console opérateur** : les exécutions durables se mettent en pause à la gate humaine et attendent dans une boîte de réception un humain habilité et nommé ; la signature exécute l'écriture. Accès basé sur les rôles, invitations à portée limitée, déterminations rédigées par l'IA avec preuves, échantillonnage QA, horloges SLA, onglet Ops (métrologie · santé des connecteurs · requeue de dead-letter), WCAG 2.2 AA, clair/sombre. Histoire : [La console opérateur →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65** (juin 2026) — **Sous le capot** : le dev board devient un *pult* — approuver une gate peut lancer une exécution d'agent diffusée en direct ; auto-amélioration des prompts soumise à des évals held-out (inspiré de SIA) ; compression de contexte à 0 $ (log CI 31 475 → 155 caractères avec le FATAL préservé) ; support de Fable 5. Histoire : [Sous le capot en juin →](https://greatcto.systems/blog/june-under-the-hood)

[Changelog complet →](../../CHANGELOG.md)

## Roadmap

- **Détection d'archétype de produit** — choisir l'archétype de build à partir du brief produit, pas seulement de la stack
- **Templates de build par secteur** — livrer un produit de référence de bout en bout à travers chacun des 6 pipelines
- **Juge conscient des niveaux** — un juge fine-tuné économique sur les évals T0/T1, frontier + humain sur T2 (ADR-004)
- **Task-runner headless** — mettre en file d'attente des builds de produits et les exécuter sur un VPS, sans surveillance

[Votez pour la prochaine fonctionnalité →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Auteur

[avelikiy](https://github.com/avelikiy) — CTO construisant des plateformes de trading et fintech AI-native (0→1, 1→N). great_cto est le résultat de l'automatisation de mes propres boucles, un agent à la fois. Chaque règle est apparue en réponse à un vrai problème dans un vrai système de production.

## Communauté

| Canal | Quoi |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, demandes de fonctionnalités, propositions d'archétypes |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Questions, patterns, show-and-tell |
| 📝 [Blog](https://greatcto.systems/blog/) | Reçus, décompositions de coûts, plongées profondes dans l'architecture |
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
