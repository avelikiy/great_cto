<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Entregue produtos com o agente de código que você já tem.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-skills_·_MCP_·_second_opinion-blueviolet)](https://github.com/openai/codex)

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Uma execução real →](https://greatcto.systems/proof) · [Demo ao vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Tradução do [README](../../README.md) em inglês na versão **v3.28.0** (2026-09-09).
> Em caso de divergência, a versão em inglês é a canônica.

---

great_cto é a camada **em volta do agente de código que você já executa**. Ele
conduz o seu Claude Code por uma construção inteira e te entrega um
**repositório que é seu** e uma **URL que já funciona**: arquitetura, modelo de
dados, backend, frontend, testes gerados e o deploy, prontos. Não é um plano.
Não é um protótipo.

O único trabalho que ele faz e que um pacote de prompts não faz: **ele te diz o
que o agente não fez.** Uma etapa que foi pulada, uma revisão que nunca rodou,
um custo que ninguém mediu — cada um aparece como aquilo que é, e nunca conta
como aprovação. A prova é subtração: v3.27.0 e v3.27.1 apagaram os números
favoráveis do próprio projeto — "economia de custo contra um FTE", uma
comparação de gasto contra um time humano, um mês projetado — porque nenhum
deles podia ser demonstrado como verdadeiro.

No Codex o pipeline não roda: o que roda lá é o pacote de skills e um servidor
MCP. O outro trabalho do Codex é ser a **segunda opinião** — de dentro do Claude
Code ele lê o mesmo diff, e cada linha de revisão carrega o `sha` da árvore que
ele leu, de modo que "revisado" pode ser provado sobre *este* diff em vez de
apenas afirmado. O log contém **4 linhas até agora, 1 carregando um sha**;
nenhuma taxa de detecção é reivindicada a partir disso, e nenhuma deveria ser.

Não é um construtor de apps hospedado e não substitui o seu agente; sem um
deles não há nada para orquestrar.

Sete produtos construídos de ponta a ponta no benchmark aberto custaram uma
**mediana de $171** em tokens, medido em 2026-07. Você paga o seu próprio provedor de LLM; great_cto não te cobra nada e é MIT.

Você é interrompido **três vezes** — sobre *o que* será construído, sobre
*como*, e sobre *se vai ao ar*. Tudo entre esses pontos roda sem supervisão, e é
trabalho do pipeline valer a pena ser deixado sozinho: especialistas com funções
estreitas (architect, design-advisor, senior-dev, code-reviewer, QA, security,
devops) e um modelo independente conferindo o trabalho de cada etapa antes que a
próxima construa em cima dele. O elenco completo está em
[docs/reference/agents.md](../reference/agents.md).

```
   descreva um produto
        │
   🤖  problema enquadrado · opções pesadas · brief escrito
        ▼
   👤  checkpoint 1 — aprovar O QUE será construído
        │
   🤖  arquitetura · modelo de dados · telas · plano
        ▼
   👤  checkpoint 2 — aprovar COMO será construído
        │
   🤖  scaffold → backend → frontend → testes → revisão → segurança
        ▼
   👤  checkpoint 3 — aprovar o deploy
        │
   🤖  no ar · repositório · URL ao vivo
```

Três checkpoints é o **padrão**, não o piso. Uma linha em `PROJECT.md` leva isso
a um — você aprova o deploy, e os checkpoints 1 e 2 viram uma tela que você lê
em vez de um formulário que você preenche:

```
approval-level: ship-only
```

Veja [Quando ele pergunta](#quando-ele-pergunta).

<p align="center">
  <img src="../screenshots/board.png" alt="A tela Decisions do board — cada gate em espera como uma linha: seu custo de desfazer, os vereditos dos dois revisores, e um Approve que pede o nome do gate quando desfazer sairia caro" width="900" />
</p>

<p align="center">
  <img src="../tapes/ci.gif" alt="Terminal: npx great-cto register adiciona o projeto ao seletor do board, depois npx great-cto ci confere o arquétipo declarado contra o código e contra o orçamento mensal, e passa" width="900" />
</p>

O board em `localhost:3141` se preenche sozinho — estado do pipeline, gates
pendentes, custo por agente, gasto de 30 dias. Você não o alimenta; você o
consulta. Quatro telas, uma pergunta cada: **Decisions** (o que precisa de você
— cada gate com os vereditos dos dois revisores, ordenados por custo de
desfazer), **Ledger** (quanto custou e o que está rodando), **Fleet** (em qual
agente parar de confiar — sua concessão de ferramentas, suas execuções, seu
gasto), **Harness** (quem é o host, quem dá a segunda opinião, e o que ela de
fato fez). Settings fica atrás da engrenagem; `⌘K` encontra qualquer agente,
doc, sessão, memória ou decisão pelo nome. Nada nele mostra uma ausência como
aprovação — um scan que nunca rodou é `n/a`, nunca um zero verde.

## Números medidos

| | |
|---|---|
| Uma feature, de ponta a ponta, com rastro completo | **1h 26m · $3.40** em tokens — [os recibos](https://greatcto.systems/proof) |
| Um produto inteiro — 7 construídos no benchmark aberto | mediana **$171** em tokens · qualidade **70/100** (58–86), medido em **2026-07-10** — [reproduza](../benchmarks/BENCH-2026-07-batch1.md) |
| Mês típico, 20 execuções do pipeline | **~$34** — você paga o seu próprio provedor de LLM, nada além disso |
| Produtos que ele sabe construir | **60**, em 15 indústrias dos EUA, por [6 pipelines reutilizáveis](https://greatcto.systems/pipelines) |

A nota de qualidade vem de executar os testes de cada produto, não de contar
arquivos — por isso ela diz 70 e não um número mais redondo e bonito.

## Início rápido

```bash
npx great-cto init
```

Reinicie o Claude Code, e então:

```bash
/start "construa um app de despacho e agenda para uma empresa de HVAC"
```

O pipeline assume dali. No dia a dia você toca em três coisas:

| | |
|---|---|
| `/start "…"` | descreva um produto ou feature — o pipeline executa |
| `/inbox` | o que espera por você: gates pendentes, P0, tarefas bloqueadas |
| `/digest` | métricas DORA semanais + consolidado de custo por feature |

Requer Node ≥ 18.17. Os plugins companheiros (Superpowers, Beads) instalam-se
sozinhos. Depois do init, confira se o host de fato carregou o plugin —
`claude plugin list --json` não deve mostrar `errors` para `great-cto`.

**No OpenAI Codex** (`npx great-cto init --host codex`) você recebe as **skills e
o servidor MCP** — não o pipeline acima. O Codex não tem superfície de plugin
para hooks, slash commands ou agentes de papel, então `/start`, `/inbox`, a
cadeia de gates e o `secret-scan` não rodam lá. Isso é um limite do host, não um
ajuste: `hooks` num manifesto de plugin nunca é lido
([openai/codex#16430](https://github.com/openai/codex/issues/16430),
[#39895](https://github.com/openai/codex/issues/39895)). O instalador imprime a
mesma divisão antes de fazer qualquer coisa.

**Dois harnesses, uma revisão.** Desde a 3.26.0 o Codex *participa* do pipeline
— de dentro do Claude Code, como segundo revisor. Declare uma vez:

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

e em toda mudança de alto risco o `code-reviewer` do Claude e o **`codex exec`**
(sandbox somente leitura, o seu login do Codex, sem chave de API) revisam o
**mesmo diff ao mesmo tempo**. Os achados se juntam; um P0 de qualquer um dos
lados bloqueia; onde eles discordam, os dois conjuntos chegam ao humano no gate
— o mais rigoroso define o veredito, e ninguém tira média. A tela **Harness** do
board detecta o Codex, guarda a escolha e mostra ao lado o que a segunda opinião
*fez*: cada execução, inclusive as puladas, a partir de
`.great_cto/cross-review.log`. Quatro estados, e o quarto é o ponto — *declarado
mas indisponível* nunca é mostrado como *desligado*.

O quanto isso ajuda é medido lá, não afirmado aqui. O que o log tem até agora: a
primeira revisão real do Codex — a do commit que ligou o Codex — encontrou um P1
que o autor e a suíte de testes tinham deixado passar; a revisão da correção não
encontrou nada. Duas execuções são evidência do mecanismo, não de uma taxa. A
taxa é trabalho do card.

## Quando ele pergunta

Um ajuste em `.great_cto/PROJECT.md` decide onde o pipeline para:

| `approval-level` | Interrompe você em | Paradas |
|---|---|---|
| **`ship-only`** | **o deploy — e te informa sobre o que será construído** | **1** |
| `product-only` | o que construímos · se vai ao ar | 2 |
| `gates-only` *(padrão)* | o que construímos · o design · o deploy | 3 |
| `strict` | o design · revisão de código · o deploy | 3 |
| `auto` | nada no pipeline | 0 |

As contagens são paradas do pipeline. Todo nível também carrega uma proteção que
não é uma escolha de processo: importar dados por cima de registros existentes
te interrompe em **todos** os níveis, `auto` incluído, porque essa destrói o que
estava lá.

**`ship-only` é o mínimo que ainda é honesto.** Uma parada — o deploy, a única
decisão cuja consequência sai da sua máquina. A decisão sobre *o que será
construído* não desaparece, porque um pipeline que gasta um dia na coisa errada é
a falha cara: ela chega como uma tela no seu console, impressa uma vez, antes de
a construção começar.

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

Silêncio é consentimento, e a tela diz isso. Se o brief não puder ser lido, o
gate volta — "não consegui te mostrar" nunca é entregue como "você foi avisado e
não disse nada".

`gates-only` ganhou o gate de produto na v3.0.0. Antes ele parava sobre *como*
construir e sobre *se* lançar, e nunca sobre *o que* construir — a decisão que
fica errada por seis etapas até alguém descobrir. Custa uma pausa por
**produto**, não por feature: `product-owner` é um ponto de entrada e roda só a
partir de `/start`.

Um arquétipo regulado — fintech, saúde, governo — mantém os seus gates de
segurança, compliance e deploy **em todos os níveis, inclusive `auto`**. Um nível
mais leve delega o julgamento; nunca pula o compliance. Tabela completa:
[docs/GATES.md](../GATES.md).

## Quatro coisas que ele se recusa a dizer

A mesma regra, nos quatro lugares em que mantê-la custa alguma coisa: **algo que
não aconteceu nunca pode parecer algo que aconteceu.**

| Quando | O que é fácil mostrar | O que ele mostra em vez disso |
|---|---|---|
| Uma segunda opinião está declarada mas o harness dela não existe | *desligado* | **`unavailable`** — declarado e inalcançável não é uma escolha que você fez |
| Uma verificação rodou e não conseguiu decidir | *aprovado* | **`unverifiable`** — e a etapa não avança em cima disso |
| O custo de uma execução nunca foi medido | **`$0.00`** | **`unmeasured`** — e os orçamentos não disparam em cima disso |
| Uma etapa não foi avaliada por ninguém | *0* | **`null`** — uma taxa de aprovação divide pelo que foi de fato avaliado |

Cada um desses é um lugar em que a resposta honesta é mais longa, mais feia e
mais difícil de construir do que a confiante. É esse o produto inteiro.

## As três dúvidas que valem a pena

**“Não consigo confiar em código que não vi ser escrito.”**
Nós também não, então nada é aceito com base na palavra de um agente sobre si
mesmo. Cada etapa é conferida contra o que ela de fato produziu — os arquivos
citados existem, os critérios de aceite congelados passam quando executados, e só
então um modelo separado é perguntado se cada requisito foi atendido. Onde essa
conferência não consegue dizer, ela devolve `unverifiable`, que **não** é uma
aprovação.

**“Ele vai gastar dinheiro enquanto eu durmo.”**
Os orçamentos por agente se recusam a despachar além do seu teto e dizem o
número. Uma execução cujo custo não pôde ser medido lê `unmeasured` e não segura
nada — um limite disparando em cima de um número que ninguém mediu é pior do que
nenhum limite, e um `$0.00` confiante para trabalho não medido é como um gasto
passa despercebido.

**“E aí eu fico preso.”**
Um comando para instalar, MIT, rodando na sua máquina contra a sua própria conta
de LLM. Apague o great_cto e o repositório que ele construiu continua sendo seu —
Next.js, Postgres e Stripe comuns, que qualquer engenheiro assume.

## O que o torna diferente

- **Especialistas, não um generalista** — 70 agentes com funções estreitas e seus
  próprios gates de revisão, em vez de um assistente que digita mais rápido do
  que pensa. [O elenco →](../reference/agents.md)
- **Críticos antes do código** — críticos de arquitetura, spec e schema rodam
  antes do planejamento, quando um erro ainda custa horas e não dias.
- **Escopo imposto na escrita** — um agente fisicamente não consegue tocar
  arquivos fora do seu encargo. Não é sinalizado na revisão; é recusado na
  escrita.
- **Um QA que desconfia de si mesmo** — os caminhos críticos são escritos em
  Gherkin antes do código de teste, e então o mutation testing pergunta se a
  suíte pegaria alguma coisa.
- **Memória entre sessões** — decisões, lições e padrões promovidos persistem por
  projeto e globalmente; uma execução interrompida retoma sabendo quais etapas
  rodaram.
- **Custo visível** — gasto por agente, desvio entre estimado e real, e custo por
  mudança aceita, no board e não numa planilha.
- **Tetos de gasto que recusam** — `agent-budgets:` no PROJECT.md limita quanto
  uma etapa pode gastar; o pipeline se recusa a despachar além disso e diz o
  número. Uma estimativa nunca recusa — veja a tabela acima.
- **Uma etapa é conferida antes que a próxima construa em cima dela** — os
  arquivos citados pelo veredito precisam existir, os critérios `## ACCEPTANCE`
  congelados precisam passar quando executados, e só então um segundo modelo é
  perguntado se cada requisito foi atendido. A pergunta mais barata primeiro, e
  três respostas em vez de duas: `verified`, `rework` ou `unverifiable`. Um agente
  que não afirma nada e não congela critérios é reportado — caso contrário o jeito
  mais barato de passar seria não afirmar nada.
- **O trabalho volta, e o retorno tem teto** — uma etapa que falha volta como
  `REWORK` com os achados citados e o mesmo agente conserta; `BLOCKED` significa
  que um humano precisa decidir. Depois de três passagens vira problema do humano,
  porque duas máquinas passando trabalho de uma para a outra não se cansam.
- **Qualidade mantida separada do que aconteceu** — o veredito diz o que uma
  execução fez, uma *nota* diz quão bem, no seu próprio armazenamento
  append-only, por outro ator e em outro momento. Avaliadores podem discordar, e
  toda nota diz quem a deu.
- **O silêncio é registrado** — o dispatcher escreve o que decidiu em
  `.great_cto/pipeline-runs.jsonl`, *inclusive quando decidiu não fazer nada* e
  por quê. Todo defeito de pipeline encontrado neste ano se escondia na lacuna
  entre "nada deveria acontecer" e "nada pôde acontecer".

Tudo roda localmente, licença MIT, com as suas chaves. Seu código fica na sua
máquina; os prompts vão para o seu provedor de LLM e para nenhum outro lugar. A
telemetria vem **desligada por padrão** ([docs/PRIVACY.md](../PRIVACY.md)).

## Limitações

- **Para um construtor só** — fundador solo ou CTO. Dois ou mais engenheiros
  compartilhando o pipeline já o superaram.
- **Não é um sistema de CI/CD** — os gates rodam localmente; o merge continua
  pelo GitHub Actions.
- **Não é auditado para certificação** — os scaffolds PCI/HIPAA/SOC2 são pontos
  de partida, não certificações.
- **Não é determinístico** — saída de LLM. Vereditos de gate merecem uma
  conferência de sanidade.
- **O gasto é medido, a atribuição ainda não é por agente** — o custo é lido do
  próprio transcript de sessão do host, e não do auto-relato de um agente, então
  os tokens são reais. Mas o transcript entregue ao hook cobre a sessão, não um
  subagente, então o custo de uma execução pode ser atribuído a qualquer etapa
  que tenha terminado por último — inflado em ordens de grandeza. Trate os
  números por agente como um teto até isso ser corrigido. Uma etapa sem nenhuma
  medição continua mostrando `unmeasured` em vez de um `$0.00` confiante, e os
  orçamentos não disparam para ela.

## Documentação

**[Hub de documentação →](../README.md)** ·
[Primeiros passos](../tutorials/getting-started.md) ·
[Gates e níveis de aprovação](../GATES.md) ·
[Agentes](../reference/agents.md) · [Comandos](../reference/commands.md) ·
[Arquétipos](../ARCHETYPES.md) · [Arquitetura](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[Todo o resto](../DETAILS.md) — críticos, jurisdições, detalhamento de custos, CI, alertas

## Comunidade

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[Blog](https://greatcto.systems/blog/) ·
[Política de segurança](../../SECURITY.md) · [Contribuir](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE). Feito por [@avelikiy](https://github.com/avelikiy):
CTO construindo plataformas de trading e fintech AI-native; great_cto são os
meus próprios loops, automatizados um agente por vez.

Se ele economizou seu tempo, uma estrela ajuda outros construtores solo a
encontrá-lo.

<div align="center">

*Pare de ser a única pessoa capaz de colocar no ar.*

</div>
