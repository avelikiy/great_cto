<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Exécutez les workflows de développement. Examinez les preuves. Décidez de la livraison.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="Projet d'exemple avec données synthétiques, pas un benchmark de modèles en direct." width="900" />

*Projet d'exemple avec données synthétiques, pas un benchmark de modèles en direct. 3.70.1.*

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Une exécution réelle →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](README.md)

</div>

> Traduction du [README](../../README.md) anglais, version **v3.70.1** (2026-10-25).
> En cas de divergence, la version anglaise fait foi.

---

great_cto coordonne les workflows natifs de Claude Code et les exécutions contrôlées expérimentales de Codex par des étapes, revues et gates explicites. Le tableau local relie tâches, exécution enregistrée, documents et consommation. Le catalogue public contient **72** agents ; leur présence ne prouve ni exécution ni expertise. Les preuves absentes restent inconnues. Merge, release et déploiement exigent leurs propres preuves et autorisations. Vous payez votre fournisseur ; great_cto est sous MIT et ne facture rien.

**Périmètre de distribution vérifiée (ADR-045) :** les artefacts signés sont contrôlés avant toute activation. L’auto-mise à jour d’une installation npm globale classique n’est prise en charge qu’avec un outil de vérification authentifié indépendamment et configuré séparément, ainsi que l’ensemble complet des artefacts signés de la version. Le paquet local admis est installé hors ligne, sans scripts de cycle de vie ; un checkout du code ou une session de plugin existante ne prouve pas qu’une mise à jour a été vérifiée.

Actuellement, `init`, la mise à jour native des plugins et l’installation automatique de composants complémentaires refusent l’activation. L’adaptation de Codex par `adapt` produit uniquement des commentaires : elle ne télécharge rien et n’active ni hooks ni voie d’exécution MCP. L’activation du minuteur de mise à jour macOS n’est pas prise en charge. Les minuteurs existants continuent d’exécuter leur ancien cache jusqu’à une migration expressément autorisée.

Les exemples d’installation, de plugins et de minuteurs ci-dessous décrivent **LEGACY 3.70.1**. Ils ne promettent pas une voie d’activation actuellement disponible. Voir les [mises à jour vérifiées](../reference/verified-updates.md).

## Démarrage rapide

```bash
npx great-cto init
```

Redémarrez Claude Code. Au quotidien, il y a trois choses :

| | Dans Claude Code | Dans le terminal |
|---|---|---|
| **Lancer le travail** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **Ce qui vous attend** | `/inbox` | `great-cto status` |
| **Reprendre** | `/resume` | `great-cto resume` |

`/start` accepte un nouveau produit ou une tâche dans un projet existant et choisit
lui-même le flux. `/resume` ne poursuit que ce que vous avez déjà approuvé ; une
décision en attente vous attend toujours. Tout le reste — `/review`, `/spec`, `/save`,
`/digest`, etc. — est là quand vous en avez besoin : [toutes les commandes](../COMMANDS.md).

## Un projet, cinq vues

Lancez `great-cto board` pour ouvrir le tableau local, normalement sur `localhost:3141`.

| Vue | Ce que vous pouvez examiner |
|---|---|
| **Work** | Tâches, critères d'acceptation, prochaine action prise en charge et onglets Overview, Execution et Evidence |
| **Decisions** | Décisions en attente et contrôles des gates existants, sans élargir leur autorité |
| **Knowledge** | Markdown du projet, ADR et lecteur limité de diagrammes avec repli sur le source Mermaid, en lecture seule |
| **Insights** | Résultats enregistrés, tokens par projet, estimations et budgets séparés |
| **Settings** | Executors, Runtime, Capabilities et General |

`unverifiable`, `unmeasured` et `unavailable` ne signifient pas qu'une vérification est réussie.

Execution montre les graphes causaux enregistrés par le contrôleur ; les sessions natives et anciennes restent partielles ou indisponibles. Aucun lien absent n'est inventé. L'exemple utilise des réponses simulées hors ligne, pas des modèles en direct. Les diagrammes décrivent l'architecture déclarée. Tokens et coûts ne mesurent pas la qualité. Les documents gardent leur langue ; l'interface est en anglais.

<details>
<summary>Voir l'exécution, les preuves, les documents et les résultats</summary>

![Execution: Projet d'exemple avec données synthétiques, pas un benchmark de modèles en direct.](../screenshots/execution.png)

![Evidence: Projet d'exemple avec données synthétiques, pas un benchmark de modèles en direct.](../screenshots/evidence.png)

![Knowledge: Projet d'exemple avec données synthétiques, pas un benchmark de modèles en direct.](../screenshots/knowledge.png)

![Insights: Projet d'exemple avec données synthétiques, pas un benchmark de modèles en direct.](../screenshots/insights.png)

[Contrat des captures](../reference/public-showcase.md).

</details>

## Huit rôles centraux, des spécialistes selon la tâche

| Responsabilité | Rôle |
|---|---|
| Problème et acceptation | `product-owner` |
| Conception du système et compromis | `architect` |
| Plan et dépendances | `pm` |
| Implémentation | `senior-dev` |
| Revue indépendante du code | `code-reviewer` |
| Vérification et régressions | `qa-engineer` |
| Risques et gate de publication | `security-officer` |
| Déploiement autorisé | `devops` |

Il s’agit de contrats de responsabilité, pas de huit appels obligatoires au modèle ni de huit agents simultanés. Project focus est une vue de présentation : elle ne supprime aucun spécialiste, ne change pas l’affectation et ne dispense d’aucun contrôle obligatoire. Les reviewers propres à chaque risque restent régis par la politique du projet.

## Un contexte d’ingénierie ciblé

Cinq candidats à des domain packs, versionnés et activés explicitement, couvrent quatre axes :

| Domaine | Invariants d’ingénierie | Limite |
|---|---|---|
| **Argent et exécution crypto** | Idempotence des paiements, envois au résultat incertain, autorité limitée ; frontières de signature, séparation paper/live et finalité de la chaîne | Deux packs techniques ; aucune affirmation de performance d’investissement |
| **Processus de télémédecine** | Habilitation du clinicien, transitions d’état des prescriptions et intégrité des preuves | Aucune affirmation d’efficacité clinique ou de certification |
| **Preuves venture** | Provenance des affirmations, traçabilité des entités et mise en quarantaine des assertions non vérifiées | Aucune affirmation de résultat d’investissement |
| **Sécurité du bien-être mental** | Isolation de l’état de chaque personne, priorité de l’escalade en cas de crise et limites des affirmations cliniques | Séparée du diagnostic, du traitement et de la validation clinique |

Les packs ajoutent un contexte d’ingénierie. Ils n’élargissent pas les permissions et ne modifient pas le routage des reviewers obligatoires. Leur présence ne prouve ni leur invocation, ni une expertise, ni de meilleurs résultats. Aucun gain de qualité n’est établi par des essais comparables du noyau seul face au noyau avec pack. Les overlays privés des projets ne font pas partie de la présentation publique.

## Sur OpenAI Codex

| Mode | Exécution et autorité |
|---|---|
| Claude Code native | Commandes, rôles spécialisés et hooks natifs ; les décisions restent dans le host concerné |
| Controlled Codex / mixed-host (experimental) | Le contrôleur gère routage, propositions textuelles, vérificateur et gates explicites |
| Codex plugin session | Skills, MCP et hooks de sécurité ; l'installation ne démarre pas automatiquement la pipeline contrôlée |

`npx great-cto init --host codex` donne à Codex les skills, le serveur MCP et six
hooks de sécurité (approuvez-les une fois : lancez `codex` dans un terminal et
choisissez **Trust all and continue**). Codex n'a pas de surface de plugin native pour
les commandes slash ou les agents de rôle, le pipeline passe donc par la CLI :

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

La mise à jour reste explicite par défaut (`great-cto upgrade codex`). Sur macOS, `sh scripts/codex-auto-update.sh enable` active un minuteur utilisateur facultatif toutes les six heures ; `status` l'inspecte et `disable` le supprime. Chaque exécution vérifie l'origine Git. Le minuteur suit la référence Git configurée, pas les versions npm ; les hooks modifiés nécessitent toujours l'approbation de l'hôte dans une nouvelle session. Détails et exécutions mixtes :
[guide de l'hôte Codex](../HOST-CODEX.md).

## Quand il vous arrête

Une ligne dans `.great_cto/PROJECT.md` :

| `approval-level` | Vous arrête à | Arrêts |
|---|---|---|
| **`ship-only`** | **le déploiement — avec un brief sur ce qui sera construit** | **1** |
| `product-only` | ce qu'on construit · si ça part en production | 2 |
| `gates-only` *(par défaut)* | ce qu'on construit · le design · le déploiement | 3 |
| `strict` | le design · la revue de code · le déploiement | 3 |
| `auto` | rien dans le pipeline | 0 |

Les produits réglementés — fintech, santé, secteur public — gardent leurs gates de
sécurité, de conformité et de livraison à tous les niveaux. [Fonctionnement des gates](../GATES.md).

## Chiffres, mesurés

| | |
|---|---|
| Une fonctionnalité de bout en bout, entièrement tracée | **1h 26m · $3.40** — [les preuves](https://greatcto.systems/proof) |
| Un produit entier — 7 construits dans le benchmark ouvert | médiane **$171** · **70/100**, **2026-07-10** — [le reproduire](../benchmarks/BENCH-2026-07-batch1.md) |

Ce sont des observations historiques, pas un benchmark de la pipeline actuelle à deux hosts ni des domain packs. Aucun pourcentage de gain de qualité n'est établi. Les domain packs restent opt-in ; leur présence ne prouve ni expertise ni meilleurs résultats.

## Limites

Pour une seule personne, pas pour une équipe ; pas un constructeur d'apps hébergé —
il faut votre agent de code ; pas un système de CI/CD ; les modèles de conformité sont
un point de départ, pas des certifications ; la sortie d'un LLM n'est pas
déterministe. La version honnête de chaque point et ce qu'il refuse d'affirmer :
[docs/DETAILS.md](../DETAILS.md).

## En savoir plus

[Documentation](../README.md) · [Prise en main](../tutorials/getting-started.md) ·
[Commandes](../COMMANDS.md) · [Gates](../GATES.md) · [Agents](../reference/agents.md) ·
[FAQ](../FAQ.md) · [Tout le reste](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [Sécurité](../../SECURITY.md) ·
[Contribuer](../../CONTRIBUTING.md) · [Confidentialité — télémétrie désactivée par défaut](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE). Créé par [@avelikiy](https://github.com/avelikiy).
S'il vous a fait gagner du temps, une étoile aide d'autres développeurs solo à le trouver.
