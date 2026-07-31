<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Décrivez un produit. Approuvez deux fois. Recevez le logiciel.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Une exécution réelle →](https://greatcto.systems/proof) · [Démo en direct](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

</div>

> Traduction du [README](../../README.md) anglais à la version **v2.90.0** (2026-07-30).
> En cas de divergence, la version anglaise fait foi.

---

great_cto est la **couche d'orchestration au-dessus de l'agent de code que vous
utilisez déjà**. Un pipeline de **69 agents spécialistes** — architect,
design-advisor, senior-dev, code-reviewer, QA, security, devops — planifie,
construit, relit et déploie une vraie application : backend, frontend, tests
générés, URL en ligne.

Vous n'êtes arrêté qu'exactement deux fois : une fois sur **ce qu'on construit**,
une fois sur **si ça part en production**. Tout le reste tourne sans vous.

```
   décrivez un produit
        │
   🤖  spec · architecture · modèle de données · écrans
        ▼
   👤  checkpoint 1 — approuver le design
        │
   🤖  scaffold → backend → frontend → tests → revue → sécurité
        ▼
   👤  checkpoint 2 — approuver le déploiement
        │
   🤖  déployé · dépôt · URL en ligne
```

<p align="center">
  <img src="../screenshots/board.png" alt="Le board de build — pipeline en direct, gates, coût par agent" width="900" />
</p>

Le board sur `localhost:3141` se remplit tout seul — état du pipeline, gates en
attente, coût par agent, dépenses sur 30 jours. Vous ne le nourrissez pas ; vous
le consultez.

## Chiffres mesurés

| | |
|---|---|
| Une feature, de bout en bout, entièrement tracée | **1h 26m · $3.40** en tokens — [les reçus](https://greatcto.systems/proof) |
| Un produit entier — 7 construits dans le benchmark ouvert | médiane **$171** en tokens · qualité **70/100** (58–86) — [à reproduire](../benchmarks/BENCH-2026-07-batch1.md) |
| Mois typique, 20 exécutions du pipeline | **~$34** — vous ne payez que votre fournisseur de LLM |
| Produits qu'il sait construire | **60**, dans 15 industries américaines, via [6 pipelines réutilisables](https://greatcto.systems/pipelines) |

La note de qualité vient de l'exécution des tests de chaque produit, pas du
comptage de fichiers — c'est pourquoi elle affiche 70 et non un chiffre plus
rond et plus flatteur.

## Démarrage rapide

```bash
npx great-cto init            # Claude Code (par défaut) · ajoutez --host codex pour OpenAI Codex
```

Redémarrez votre hôte IA, puis :

```bash
/start "construis une app de dispatch et de planning pour une entreprise de CVC"
```

Le pipeline prend le relais. Au quotidien, vous touchez à trois choses :

| | |
|---|---|
| `/start "…"` | décrivez un produit ou une feature — le pipeline l'exécute |
| `/inbox` | ce qui vous attend : gates, P0, tâches bloquées |
| `/digest` | métriques DORA hebdo + coût par feature |

Node ≥ 18.17 requis. Les plugins compagnons (Superpowers, Beads) s'installent
seuls. Après l'init, vérifiez que l'hôte a réellement chargé le plugin :
`claude plugin list --json` ne doit montrer aucune `errors` pour `great_cto`.

## Quand il vous demande

Un réglage dans `.great_cto/PROJECT.md` décide où le pipeline s'arrête :

| `approval-level` | S'arrête sur | Par feature |
|---|---|---|
| `product-only` | ce qu'on construit · si ça part en prod | 2 |
| `gates-only` *(par défaut)* | le design · le déploiement | 2 |
| `strict` | + revue de code | 3 |
| `auto` | rien | 0 |

Un archétype réglementé — fintech, santé, secteur public — conserve ses gates de
sécurité, de conformité et de mise en production **à tous les niveaux, `auto`
compris**. Un niveau plus léger délègue le jugement ; il ne contourne jamais la
conformité. Table complète : [docs/GATES.md](../GATES.md).

## Ce qui le distingue

- **Des spécialistes, pas un généraliste** — 69 agents aux rôles étroits, chacun
  avec ses gates de revue, plutôt qu'un assistant qui tape plus vite qu'il ne
  pense. [L'effectif →](../reference/agents.md)
- **Des critiques avant le code** — les critiques d'architecture, de spec et de
  schéma tournent avant la planification, quand une erreur coûte encore des
  heures et non des jours.
- **Le périmètre imposé à l'écriture** — un agent ne peut physiquement pas
  toucher un fichier hors de sa mission. Pas signalé en revue ; refusé à
  l'écriture.
- **Un QA qui se méfie de lui-même** — les chemins critiques s'écrivent en
  Gherkin avant le code de test, puis le mutation testing demande si la suite
  attraperait quoi que ce soit.
- **Une mémoire entre les sessions** — décisions, leçons et patterns promus
  persistent par projet et globalement ; une exécution interrompue reprend en
  sachant quelles étapes ont déjà tourné.
- **Un coût visible** — dépense par agent, écart estimé-contre-réel et coût par
  changement accepté, sur le board et non dans un tableur.

Tout tourne en local, sous licence MIT, avec vos propres clés. Votre code reste
sur votre machine ; les prompts vont à votre fournisseur de LLM et nulle part
ailleurs. La télémétrie est **désactivée par défaut**
([docs/PRIVACY.md](../PRIVACY.md)).

## Limites

- **Pour un seul bâtisseur** — fondateur solo ou CTO. À deux ingénieurs ou plus
  sur le même pipeline, vous l'avez dépassé.
- **Pas un CI/CD** — les gates tournent en local ; le merge passe toujours par
  GitHub Actions.
- **Pas un audit de certification** — les gabarits PCI/HIPAA/SOC2 sont des
  points de départ, pas des certifications.
- **Pas déterministe** — sortie de LLM. Les verdicts de gate méritent un
  contrôle humain.

## Documentation

**[Hub de documentation →](../README.md)** ·
[Bien démarrer](../tutorials/getting-started.md) ·
[Gates et niveaux d'approbation](../GATES.md) ·
[Agents](../reference/agents.md) · [Commandes](../reference/commands.md) ·
[Archétypes](../ARCHETYPES.md) · [Architecture](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[Tout le reste](../DETAILS.md) — critiques, juridictions, coûts, CI, alertes

## Communauté

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[Blog](https://greatcto.systems/blog/) ·
[Politique de sécurité](../../SECURITY.md) · [Contribuer](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE). Créé par [@avelikiy](https://github.com/avelikiy) :
CTO qui construit des plateformes de trading et de fintech AI-native ;
great_cto, ce sont mes propres boucles, automatisées un agent à la fois.

S'il vous a fait gagner du temps, une étoile aide d'autres bâtisseurs solo à le
trouver.

<div align="center">

*Cessez d'être la seule personne capable de livrer.*

</div>
