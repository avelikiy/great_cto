<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Livrez des produits avec l'agent de code que vous avez déjà.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-skills_·_MCP_·_second_opinion-blueviolet)](https://github.com/openai/codex)

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Une exécution réelle →](https://greatcto.systems/proof) · [Démo en direct](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](README.md)

</div>

> Traduction du [README](../../README.md) anglais à la version **v3.28.0** (2026-09-09).
> En cas de divergence, la version anglaise fait foi.

---

great_cto est la couche **autour de l'agent de code que vous faites déjà
tourner**. Il conduit votre Claude Code à travers une construction entière et
vous remet un **dépôt qui vous appartient** et une **URL qui fonctionne déjà** :
architecture, modèle de données, backend, frontend, tests générés et le
déploiement, terminés. Pas un plan. Pas un prototype.

Le seul travail qu'il fait et qu'un paquet de prompts ne fait pas : **il vous dit
ce que l'agent n'a pas fait.** Une étape sautée, une revue qui n'a jamais tourné,
un coût que rien n'a mesuré — chacun s'affiche pour ce qu'il est et n'est jamais
compté comme une réussite. La preuve est une soustraction : v3.27.0 et v3.27.1
ont supprimé les chiffres favorables de ce projet lui-même — « économies face à
un ETP », une comparaison de dépense contre une équipe humaine, un mois projeté —
parce qu'aucun ne pouvait être démontré vrai.

Sur Codex, le pipeline ne tourne pas : ce qui y tourne, c'est le paquet de skills
et un serveur MCP. L'autre rôle de Codex est d'être le **second avis** — depuis
l'intérieur de Claude Code, il lit le même diff, et chaque ligne de revue porte
le `sha` de l'arbre qu'elle a lu, si bien que « relu » peut être prouvé à propos
de *ce* diff au lieu d'être affirmé. Le journal contient **4 lignes à ce jour, 1
portant un sha** ; aucun taux de détection n'en est tiré, et aucun ne devrait
l'être.

Ce n'est pas un constructeur d'applications hébergé et il ne remplace pas votre
agent ; sans agent, il n'a rien à orchestrer.

Sept produits construits de bout en bout dans le benchmark ouvert ont coûté une
**médiane de $171** en tokens, mesurée en 2026-07. Vous payez votre propre
fournisseur de LLM ; great_cto ne vous facture rien et est sous licence MIT.

Vous êtes arrêté **trois fois** — sur *ce qui* est construit, sur *comment*, et
sur *si ça part en production*. Tout ce qui se trouve entre ces arrêts tourne
sans surveillance, et c'est le travail du pipeline de mériter qu'on le laisse
seul : des spécialistes aux rôles étroits (architect, design-advisor,
senior-dev, code-reviewer, QA, security, devops) et un modèle indépendant qui
vérifie le travail de chaque étape avant que la suivante ne s'appuie dessus.
L'effectif complet est dans [docs/reference/agents.md](../reference/agents.md).

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

Trois checkpoints, c'est le **défaut**, pas le plancher. Une ligne dans
`PROJECT.md` le ramène à un — vous approuvez le déploiement, et les checkpoints 1
et 2 deviennent un écran que vous lisez plutôt qu'un formulaire que vous
remplissez :

```
approval-level: ship-only
```

Voir [Quand il vous demande](#quand-il-vous-demande).

<p align="center">
  <img src="../screenshots/board.png" alt="L'écran Decisions du board — chaque gate en attente sur une ligne : son coût de retour arrière, les verdicts des deux relecteurs, et un Approve qui réclame le nom du gate quand défaire coûterait cher" width="900" />
</p>

<p align="center">
  <img src="../tapes/ci.gif" alt="Terminal : npx great-cto register ajoute le projet au sélecteur du board, puis npx great-cto ci confronte l'archétype déclaré au code et au budget mensuel, et passe" width="900" />
</p>

Le board sur `localhost:3141` se remplit tout seul — état du pipeline, gates en
attente, coût par agent, dépenses sur 30 jours. Vous ne le nourrissez pas ; vous
le consultez. Quatre écrans, une question chacun : **Decisions** (ce qui vous
attend — chaque gate avec les verdicts des deux relecteurs, trié par coût de
retour arrière), **Ledger** (ce que ça a coûté et ce qui tourne), **Fleet**
(quel agent cesser de croire — ses droits d'outils, ses exécutions, sa
dépense), **Harness** (qui est l'hôte, qui donne le second avis, et ce qu'il a
réellement fait). Les réglages sont derrière l'engrenage ; `⌘K` retrouve
n'importe quel agent, document, session, mémoire ou décision par son nom. Rien
n'y présente une absence comme une réussite — un scan qui n'a jamais tourné est
`n/a`, jamais un zéro vert.

## Chiffres mesurés

| | |
|---|---|
| Une feature, de bout en bout, entièrement tracée | **1h 26m · $3.40** en tokens — [les reçus](https://greatcto.systems/proof) |
| Un produit entier — 7 construits dans le benchmark ouvert | médiane **$171** en tokens · qualité **70/100** (58–86), mesurée le **2026-07-10** — [à reproduire](../benchmarks/BENCH-2026-07-batch1.md) |
| Mois typique, 20 exécutions du pipeline | **~$34** — vous payez votre propre fournisseur de LLM, rien d'autre |
| Produits qu'il sait construire | **60**, dans 15 industries américaines, via [6 pipelines réutilisables](https://greatcto.systems/pipelines) |

La note de qualité vient de l'exécution des tests propres à chaque produit, pas
du comptage de fichiers — c'est pourquoi elle affiche 70 et non un chiffre plus
rond et plus flatteur.

## Démarrage rapide

```bash
npx great-cto init
```

Redémarrez Claude Code, puis :

```bash
/start "build a dispatch & scheduling app for an HVAC business"
```

Le pipeline prend le relais. Au quotidien, vous touchez à trois choses :

| | |
|---|---|
| `/start "…"` | décrivez un produit ou une feature — le pipeline l'exécute |
| `/inbox` | ce qui vous attend : gates en attente, P0, tâches bloquées |
| `/digest` | métriques DORA hebdomadaires + coût par feature |

Node ≥ 18.17 requis. Les plugins compagnons (Superpowers, Beads) s'installent
seuls. Après l'init, vérifiez que l'hôte a réellement chargé le plugin :
`claude plugin list --json` ne doit montrer aucune `errors` pour `great-cto`.

**Sur OpenAI Codex** (`npx great-cto init --host codex`), vous obtenez les
**skills et le serveur MCP** — pas le pipeline ci-dessus. Codex n'offre aucune
surface de plugin pour les hooks, les commandes slash ou les agents de rôle,
donc `/start`, `/inbox`, la chaîne de gates et `secret-scan` n'y tournent pas.
C'est une limite de l'hôte, pas un réglage : `hooks` dans un manifeste de plugin
n'est jamais lu
([openai/codex#16430](https://github.com/openai/codex/issues/16430),
[#39895](https://github.com/openai/codex/issues/39895)). L'installeur affiche la
même distinction avant de faire quoi que ce soit.

**Deux harnais, une seule revue.** Depuis la 3.26.0, Codex *participe* bel et
bien au pipeline — depuis l'intérieur de Claude Code, comme second relecteur.
Déclarez-le une fois :

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

et à chaque changement à enjeu élevé, le `code-reviewer` de Claude et
**`codex exec`** (sandbox en lecture seule, votre login Codex, aucune clé d'API)
relisent le **même diff en même temps**. Les constats fusionnent ; un P0 de l'un
ou l'autre côté bloque ; en cas de désaccord, les deux ensembles remontent à
l'humain au gate — le plus strict fixe le verdict, et personne ne fait de
moyenne. L'écran **Harness** du board détecte Codex, conserve le choix, et
montre à côté ce que le second avis *a fait* : chaque exécution, y compris
celles qui ont été sautées, depuis `.great_cto/cross-review.log`. Quatre états,
et le quatrième est tout l'enjeu — *déclaré mais indisponible* n'est jamais
présenté comme *désactivé*.

Dans quelle mesure cela aide se mesure là-bas, ce n'est pas affirmé ici. Ce que
le journal contient à ce jour : la première vraie revue Codex — celle du commit
qui a branché Codex — a trouvé un P1 que l'auteur et la suite de tests avaient
tous deux manqué ; la revue du correctif n'a rien trouvé. Deux exécutions, c'est
la preuve du mécanisme, pas un taux. Le taux, c'est le travail de la fiche.

## Quand il vous demande

Un réglage dans `.great_cto/PROJECT.md` décide où le pipeline s'arrête :

| `approval-level` | Vous arrête sur | Arrêts |
|---|---|---|
| **`ship-only`** | **le déploiement — et vous informe de ce qui sera construit** | **1** |
| `product-only` | ce qu'on construit · si ça part en prod | 2 |
| `gates-only` *(par défaut)* | ce qu'on construit · le design · le déploiement | 3 |
| `strict` | le design · la revue de code · le déploiement | 3 |
| `auto` | rien dans le pipeline | 0 |

Les comptes sont des arrêts du pipeline. Chaque niveau porte en plus une garde
qui n'est pas un choix de processus : importer des données par-dessus des
enregistrements existants vous arrête à **tous** les niveaux, `auto` compris,
parce que celui-là détruit ce qui était là.

**`ship-only` est le minimum qui reste honnête.** Un seul arrêt — le
déploiement, la seule décision dont la conséquence quitte votre machine. La
décision sur *ce qui est construit* ne disparaît pas, car un pipeline qui passe
une journée sur la mauvaise chose est l'échec coûteux : elle arrive sous la forme
d'un écran dans votre console, imprimé une fois, avant que la construction ne
commence.

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

Le silence vaut consentement, et l'écran le dit. Si le brief ne peut pas être lu,
le gate revient — « je n'ai pas pu vous le montrer » n'est jamais délivré comme
« on vous l'a montré et vous n'avez rien dit ».

`gates-only` a gagné le gate produit en v3.0.0. Il s'arrêtait sur *comment*
construire et *s'il faut* livrer, et jamais sur *quoi* construire — la décision
qui reste fausse pendant six étapes avant que quiconque s'en aperçoive. Elle
coûte une pause par **produit**, pas par feature : `product-owner` est un point
d'entrée et ne tourne que depuis `/start`.

Un archétype réglementé — fintech, santé, secteur public — conserve ses gates de
sécurité, de conformité et de mise en production **à tous les niveaux, `auto`
compris**. Un niveau plus léger délègue le jugement ; il ne contourne jamais la
conformité. Table complète : [docs/GATES.md](../GATES.md).

## Quatre choses qu'il refuse de dire

La même règle, aux quatre endroits où la tenir coûte quelque chose : **une chose
qui n'a pas eu lieu ne doit jamais ressembler à une chose qui a eu lieu.**

| Quand | Ce qu'il serait facile d'afficher | Ce qu'il affiche à la place |
|---|---|---|
| Un second avis est déclaré mais son harnais est absent | *désactivé* | **`unavailable`** — déclaré et injoignable n'est pas un choix que vous avez fait |
| Une vérification a tourné sans pouvoir trancher | *réussite* | **`unverifiable`** — et l'étape ne continue pas dessus |
| Le coût d'une exécution n'a jamais été mesuré | **`$0.00`** | **`unmeasured`** — et les budgets ne se déclenchent pas dessus |
| Une étape n'a été évaluée par personne | *0* | **`null`** — un taux de réussite divise par ce qui a réellement été évalué |

Chacun de ces cas est un endroit où la réponse honnête est plus longue, plus
laide et plus difficile à construire que la réponse assurée. C'est tout le
produit.

## Les trois doutes qui méritent d'être posés

**« Je ne peux pas faire confiance à du code que je n'ai pas vu s'écrire. »**
Nous non plus, donc rien n'est pris sur la parole d'un agent à propos de
lui-même. Chaque étape est confrontée à ce qu'elle a réellement produit — les
fichiers nommés existent-ils, les critères d'acceptation gelés passent-ils quand
on les exécute, et seulement ensuite un modèle distinct est interrogé pour savoir
si chaque exigence est traitée. Là où ce contrôle ne peut pas trancher, il
renvoie `unverifiable`, qui n'est **pas** une réussite.

**« Il va dépenser de l'argent pendant que je dors. »**
Les budgets par agent refusent de dispatcher au-delà de leur plafond et
annoncent le chiffre. Une exécution dont le coût n'a pas pu être mesuré affiche
`unmeasured` et ne retient rien — une limite qui se déclenche sur un chiffre que
personne n'a mesuré est pire que pas de limite, et un `$0.00` assuré pour du
travail non mesuré, c'est ainsi qu'une dépense passe inaperçue.

**« Et ensuite je suis enfermé. »**
Une commande pour installer, MIT, tournant sur votre machine avec votre propre
compte LLM. Supprimez great_cto et le dépôt qu'il a construit reste le vôtre —
du Next.js, du Postgres et du Stripe ordinaires que n'importe quel ingénieur
peut reprendre.

## Ce qui le distingue

- **Des spécialistes, pas un généraliste** — 70 agents aux rôles étroits, chacun
  avec ses propres gates de revue, plutôt qu'un assistant qui tape plus vite
  qu'il ne pense. [L'effectif →](../reference/agents.md)
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
- **Des plafonds de dépense qui refusent** — `agent-budgets:` dans PROJECT.md
  plafonne ce qu'une étape peut dépenser ; le pipeline refuse de dispatcher
  au-delà et annonce le chiffre. Une estimation ne refuse jamais — voir la table
  ci-dessus.
- **Une étape est vérifiée avant que la suivante ne s'appuie dessus** — les
  fichiers nommés par le verdict doivent exister, les critères gelés
  `## ACCEPTANCE` doivent passer à l'exécution, et seulement ensuite un second
  modèle est interrogé pour savoir si chaque exigence est traitée. La question la
  moins chère d'abord, et trois réponses plutôt que deux : `verified`, `rework`
  ou `unverifiable`. Un agent qui ne revendique rien et ne gèle aucun critère est
  signalé — sinon la façon la moins chère de passer serait de ne rien
  revendiquer.
- **Le travail repart en arrière, et le retour a un plafond** — une étape en
  échec renvoie `REWORK` avec les constats cités et le même agent la corrige ;
  `BLOCKED` signifie qu'un humain doit trancher. Après trois passes, cela devient
  le problème de l'humain, parce que deux machines qui se renvoient le travail ne
  se lassent jamais.
- **La qualité tenue à part de ce qui s'est passé** — le verdict dit ce qu'une
  exécution a fait, un *score* dit à quel point c'était bon, dans son propre
  stockage en ajout seul, par un acteur différent et à un moment différent. Les
  évaluateurs peuvent diverger, et chaque score nomme celui qui l'a donné.
- **Le silence est enregistré** — le dispatcher écrit ce qu'il a décidé dans
  `.great_cto/pipeline-runs.jsonl`, *y compris quand il n'a rien décidé* et
  pourquoi. Tous les défauts de pipeline trouvés cette année se cachaient dans
  l'écart entre « rien ne devait se passer » et « rien ne pouvait se passer ».

Tout tourne en local, sous licence MIT, avec vos propres clés. Votre code reste
sur votre machine ; les prompts vont à votre fournisseur de LLM et nulle part
ailleurs. La télémétrie est **désactivée par défaut**
([docs/PRIVACY.md](../PRIVACY.md)).

## Limites

- **Pour un seul bâtisseur** — fondateur solo ou CTO. À deux ingénieurs ou plus
  sur le même pipeline, vous l'avez dépassé.
- **Pas un système CI/CD** — les gates tournent en local ; le merge passe
  toujours par GitHub Actions.
- **Pas un audit de certification** — les gabarits PCI/HIPAA/SOC2 sont des
  points de départ, pas des certifications.
- **Pas déterministe** — sortie de LLM. Les verdicts de gate méritent un
  contrôle de bon sens.
- **La dépense est mesurée, l'attribution n'est pas encore par agent** — le coût
  est lu dans la transcription de session de l'hôte lui-même plutôt que dans
  l'auto-déclaration d'un agent, donc les tokens sont réels. Mais la
  transcription remise au hook couvre la session, pas un sous-agent : le coût
  d'une exécution peut donc être attribué à l'étape qui a terminé en dernier —
  gonflé de plusieurs ordres de grandeur. Traitez les chiffres par agent comme un
  plafond tant que ce n'est pas corrigé. Une étape sans aucune mesure affiche
  toujours `unmeasured` plutôt qu'un `$0.00` assuré, et les budgets ne se
  déclenchent pas pour elle.

## Documentation

**[Hub de documentation →](../README.md)** ·
[Bien démarrer](../tutorials/getting-started.md) ·
[Gates et niveaux d'approbation](../GATES.md) ·
[Agents](../reference/agents.md) · [Commandes](../reference/commands.md) ·
[Archétypes](../ARCHETYPES.md) · [Architecture](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[Tout le reste](../DETAILS.md) — critiques, juridictions, détail des coûts, CI, alertes

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
