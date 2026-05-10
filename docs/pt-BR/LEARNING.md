# Aprendizado contínuo (Continuous Learning)

> **Idioma:** [English](../LEARNING.md) · [Русский](../ru/LEARNING.md) · [简体中文](../zh-CN/LEARNING.md) · [繁體中文](../zh-TW/LEARNING.md) · [日本語](../ja/LEARNING.md) · [한국어](../ko/LEARNING.md) · [Español](../es/LEARNING.md) · **Português (BR)**
>
> ⚠️ Resumo traduzido por máquina. Para detalhes completos e links de ADR, ver [English original](../LEARNING.md).

great_cto v1.2.0 adicionou um **loop de aprendizado de dois níveis** que extrai automaticamente padrões de cada sessão e os reutiliza em sessões futuras.

## Pipeline

```
Sessão termina → hook SessionEnd captura snapshot + registra projeto
              → agente continuous-learner lê transcript + git + verdicts
              → Extrai ≤3 lições por sessão → .great_cto/lessons.md (LOCAL DO PROJETO)
              → lessons-merge.mjs: padrão em ≥3 projetos → ~/.great_cto/decisions.md (CROSS-PROJETO)
              → Próxima sessão: architect, pm, senior-dev LEEM ambos arquivos no início
```

## Memória de dois níveis

| Arquivo | Escopo | Critério de promoção | Quem lê |
|---|---|---|---|
| `.great_cto/lessons.md` | Local do projeto | Filtros de qualidade no continuous-learner | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | Todos os projetos nesta máquina | Padrão em ≥3 projetos distintos | architect, pm, senior-dev |

## O que é capturado

5 formas de padrão, cada uma com filtros de qualidade rígidos:

| Forma | Sinal fonte | Exemplo |
|---|---|---|
| **A. Reviewer detectou X** | Achado Critical/High em agent-verdicts | "PCI reviewer detectou assinatura de webhook faltando em 3 projetos fintech" |
| **B. Custo atípico** | Invocação de agente 2x+ acima da média | "Architect custa 3x mais em projetos fintech solo — pré-alocar $8" |
| **C. Erro repetido** | Mesmo fix em ≥2 commits | "Refatorado cleanup de `useEffect` em 3 componentes" |
| **D. Discovery faltando** | Suposição do architect sobrescrita durante implementação | "Assumiu US-only; era EU-required" |
| **E. Decisão de tool/lib** | ADR com resultado mensurável | "Escolheu Drizzle sobre Prisma para mlops — 40% redução de bundle" |

continuous-learner **rejeita** qualquer coisa que não combine com essas formas — silêncio > ruído.

## Filtros de qualidade

Uma lição candidata é **rejeitada** se qualquer destas for verdade:
- Aplica apenas a um arquivo específico de um projeto (muito estreito)
- Captura preferência do usuário, não padrão transferível
- Reafirma boa prática óbvia
- Sem evidência concreta (sha, file:line, número de custo)
- Contém PII, secrets, ou termos confidenciais do negócio
- Pattern slug já está em lessons.md (de-dup)
- Subjetivo sem resultado mensurável

## Privacidade

**Local por padrão, global opt-in.** O learner roda na sua máquina; lessons.md e decisions.md nunca deixam seu disco.

O que o learner NÃO DEVE capturar (forçado via agent prompt):
- API keys, tokens, senhas, JWTs
- Emails, telefones, nomes
- Codenames internos, terminologia confidencial do negócio
- IDs de cliente/usuário ou dados `.env*`
- Conteúdo de código fonte (apenas referências file:line)

Regras completas de privacidade em **ADR-016**.

## Configuração

```bash
# Desativar captura session-end completamente
export GREAT_CTO_DISABLE_SESSION_LEARNING=1

# Trigger manual
/learn              # extrair lições desta sessão
/learn cost         # foco em padrões de custo atípico (shape B)
/learn security     # foco em achados de reviewer (shape A)
/learn architecture # foco em decisões de tool/lib (shape E)

# Inspecionar estado
cat .great_cto/lessons.md
cat ~/.great_cto/decisions.md
ls ~/.great_cto/projects/

# Forçar re-agregação
node scripts/lessons-merge.mjs
node scripts/lessons-merge.mjs --dry-run
node scripts/lessons-merge.mjs --force

# Reset
rm .great_cto/lessons.md
rm -rf ~/.great_cto/{decisions.md,projects/}
```

## Como os agentes usam as lições

3 agentes leem lessons.md + decisions.md no início da sessão:
- **Architect** — consulta lições passadas antes de qualquer decisão arquitetônica; filtra pelo arquétipo atual
- **PM** — antes de estimar, calibra contra lições de custo atípico (shape B)
- **Senior-dev** — antes de claim de tarefa, escaneia anti-padrões conhecidos; cita no commit

## Roadmap

- **v1.2.0** — continuous-learner + lessons-merge + integração de agentes
- **v1.3.0** — Telemetria: rastrear quais lições agentes citam vs ignoram
- **v1.4.0** — Auto-promoção: decisões de alto impacto → skills reutilizáveis

## Referência

- **ADR-015** — arquitetura do loop de aprendizado
- **ADR-016** — proteção de privacidade
- **ADR-017** — critério de promoção a skill
- `agents/continuous-learner.md` — o agente
- `scripts/lessons-merge.mjs` — script de promoção cross-projeto
- `commands/learn.md` — trigger manual

Documentação completa em [English LEARNING.md](../LEARNING.md).
