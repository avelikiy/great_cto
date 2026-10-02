<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Livrez des produits avec l'agent de code que vous avez déjà.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Une exécution réelle →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](README.md)

</div>

> Traduction du [README](../../README.md) anglais, version **v3.47.0** (2026-10-02).
> En cas de divergence, la version anglaise fait foi.

---

**Votre agent de code livre du code. Ceci le vérifie.**

Décrivez un produit ou une fonctionnalité. **71 agents** aux missions étroites le
mènent du brief à l'architecture, au build, à la revue et à la sécurité ; un second
modèle d'une autre famille lit le même diff. Trois décisions vous restent — quoi
construire, comment, et si ça part en production — et au bout il y a un **dépôt qui
vous appartient** et une **URL qui fonctionne**. Vous payez votre propre fournisseur
de LLM ; great_cto est sous MIT et ne facture rien.

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

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

Le tableau de bord sur `localhost:3141` s'ouvre sur **Work** — vos tâches, les
décisions qui vous attendent et ce qui est déjà livré. Coûts, agents et relecteurs sont
sous **Tools**. Rien n'y présente une absence comme une réussite : une vérification
qui n'a pas pu trancher affiche `unverifiable`, un coût que personne n'a mesuré
`unmeasured`, un relecteur qui n'a pas pu s'exécuter `unavailable`.

## Sur OpenAI Codex

`npx great-cto init --host codex` donne à Codex les skills, le serveur MCP et six
hooks de sécurité (approuvez-les une fois : lancez `codex` dans un terminal et
choisissez **Trust all and continue**). Codex n'a pas de surface de plugin native pour
les commandes slash ou les agents de rôle, le pipeline passe donc par la CLI :

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Codex ne met jamais le plugin à jour de lui-même — c'est `great-cto upgrade` qui le
fait. Détails, exécutions mixtes Claude + Codex et Codex comme second relecteur :
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
| Un produit entier — 7 construits dans le benchmark ouvert | **$171** · **70/100**, **2026-07-10** — [le reproduire](../benchmarks/BENCH-2026-07-batch1.md) |
| Mois type, 20 exécutions | **~$34** — vous payez votre propre fournisseur de LLM, rien d'autre |

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
