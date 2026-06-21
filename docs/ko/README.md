<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**AI 제품 빌더 — 제품을 설명하고, 사양을 승인하고, 소프트웨어를 출시하세요.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[웹사이트](https://greatcto.systems) · [실제 실행 한 건 →](https://greatcto.systems/proof) · [라이브 데모](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [토론](https://github.com/avelikiy/great_cto/discussions) · [변경 이력](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## 코드만이 아니라, 제품을 만듭니다

great_cto는 **AI 제품 빌더**입니다. 소프트웨어 제품을 설명하면 빌드 전체를
실행합니다 — 아키텍처, 데이터 모델, 백엔드, 프런트엔드, 테스트, 배포까지. **사람의 게이트는 하나:** CTO인
당신이 사양을 승인합니다. 그 이후의 모든 것은 자동화되어, 출시된 리포지토리와 라이브 URL로 이어집니다.

이 빌더가 대상으로 삼는 미국 상위 산업군 — 홈·현장 서비스, 전문 서비스,
호스피탈리티, 리테일/이커머스, 프롭테크, 피트니스, 마케팅 & 크리에이터, HR/채용,
건설, 물류 — 은 **6개의 재사용 가능한 빌드 아키타입**(CRUD 버티컬 SaaS,
부킹, CRM, 대시보드, 마켓플레이스, 콘텐츠/미디어)으로 수렴됩니다. 하나의 템플릿으로 약 40개의 제품 중 어떤 것이든 출시합니다.
[docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md) 참조.

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

CI와 생성된 테스트가 품질 게이트입니다 — 당신은 모든 줄이 아니라 **방향**에 서명합니다.

> **Operate** — 사람이 규제 대상 트랜잭션마다 서명하는 런타임 표면(오퍼레이터
> 콘솔, 오토파일럿 런타임, 버티컬 플로우) — 은 **별도 리포지토리로 이동했습니다:**
> [github.com/avelikiy/operate](https://github.com/avelikiy/operate). great_cto는 이제
> 빌드 제품입니다.

## 내부 구조 (이를 운영하는 CTO를 위해)

→ *이 표면의 빌더 관점 이야기: [greatcto.systems/build](https://greatcto.systems/build)*

모든 제품은 전문가 에이전트로 구성된 파이프라인 — 아키텍트, design-advisor, senior-dev,
QA, security-officer, devops — 이 만들어내며, 사양 → 스캐폴드 → 백엔드 → 프런트엔드 → 테스트 → 배포로 실행됩니다.
**당신이 내리는 결정은 하나: 사양 승인.** 그 이후의 모든 것은 자동화됩니다. 파이프라인은
위험 등급화되어 있습니다 — 유지보수 수정은 게이트를 열지 않고(CI가 게이트), 되돌릴 수 있는 기능은
플랜 게이트만 열며, 되돌릴 수 없는 변경은 전체 세트를 강제합니다 — 따라서 의례 절차는 영향 반경에 따라
확장되지, 서류 작업에 따라 확장되지 않습니다. CI와 빌드 자체가 생성한 테스트가 파이프라인을 배포까지
안전하게 실행할 수 있게 하는 품질 게이트입니다.

**권장 동반 MCP: Serena (시맨틱 코드 내비게이션).** 대규모 코드베이스에서는
코드를 작성하는 에이전트(senior-dev, coder)가 grep과 파일 전체 읽기에 컨텍스트를 소모합니다.
[Serena MCP](https://github.com/oraios/serena)는 그 대신 심볼 수준 내비게이션
(find-symbol, references, structure)을 제공합니다:

```bash
claude mcp add serena -- uvx --from git+https://github.com/oraios/serena \
  serena start-mcp-server --context ide-assistant --project "$(pwd)"
```

선택 사항 — 없어도 모든 것이 동작합니다. 있으면 대형 리포의 구현 작업이 편집당
눈에 띄게 적은 컨텍스트를 사용합니다.

**중요한 지점에만 게이트 하나.** 빌드 단계는 위험 등급화되어 있습니다: 되돌릴 수 있는 변경은
CI 뒤에서 빌드되어 출시되고, 되돌릴 수 없는 변경 — 프로덕션 배포, 스키마 마이그레이션, 쓰기 가능한 새 통합 —
은 실행 전에 CTO 게이트와 프런티어 모델로 에스컬레이션됩니다. 당신은 사양과
영향 반경이 큰 호출에 서명하고, 나머지는 그대로 통과합니다. `change-tier` + `effectiveGates`가
이 불변식을 코드로 강제합니다.

## 숫자로 보기

| | |
|---|---|
| 기능 하나, 처음부터 끝까지 (실제 실행, 완전 추적) | **1h 26m · $3.40 LLM** vs ~$42K / ~6주 전통 방식 |
| 동일 파이프라인의 이전 CLI 기능 실행 | $2.39 LLM vs ~$5,460 인력 환산; 보안이 QA가 통과시킨 결함 2건을 잡아냄 |
| 월 비용 (파이프라인 20회 실행) | **~$34** |
| 대상 미국 산업군 | **10** (홈 서비스 · 리테일 · 프롭테크 · 피트니스 · HR · …) |
| 빌드 가능한 제품 | 10개 산업군에 걸쳐 **~40** |
| 재사용 가능한 빌드 파이프라인 | **6** (CRUD · 부킹 · CRM · 대시보드 · 마켓플레이스 · 콘텐츠) |
| 전문가 에이전트 | **46** |

→ [모든 아티팩트를 포함한 전체 추적](https://greatcto.systems/proof) · [6개 파이프라인](https://greatcto.systems/pipelines)

## 작동 방식

**`npx great-cto init`** — 당신의 스택을 스캔하고 제품에 맞는 파이프라인을 `.great_cto/FLOW.md`에 기록합니다: 에이전트, 빌드 아키타입, 그리고 단일 CTO 게이트.

**`/start "제품을 설명하세요"`** — architect와 design-advisor가 사양, 데이터 모델, 화면을 초안으로 작성합니다. 당신은 **단일 게이트** — `gate:plan` — 에서 이를 검토하고 승인합니다.

**파이프라인이 출시합니다** — senior-dev가 TDD로 스캐폴드하고 빌드하며, QA가 생성된 테스트를 실행하고, devops가 배포합니다. 되돌릴 수 있는 빌드에는 추가 승인이 필요 없습니다.

## 세 가지 제품 — 하나의 파이프라인

같은 명령어, 다른 제품. 빌드 아키타입이 스택과 통합을 결정합니다:

| | **디스패치 앱** | **클래스 부킹 앱** | **수익성 대시보드** |
|---|---|---|---|
| 아키타입 | CRUD 버티컬 SaaS | 부킹 / 스케줄링 | 대시보드 / 분석 |
| 스택 | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| 통합 | Auth · RBAC | Stripe · Twilio | source connectors |
| 사람 게이트 | `gate:plan` (CTO 게이트) | `gate:plan` | `gate:plan` |

→ 6개 파이프라인 보기: [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## 실제로 확인하게 될 대시보드

`great-cto board`는 `http://localhost:3141`에서 열립니다 — 빌드 보드: 실시간 SSE, change_tier 배지가 달린 라이브 파이프라인(단일 CTO 게이트 · 저렴한 저지), 에이전트별 비용, 30일 LLM 지출 대 인력 환산 기준선.

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>메트릭</b> — 출시된 작업, AI 지출, 인력 팀 대비 비용 절감, 일일 소진</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>메모리</b> — 탐색 가능한 프로젝트 메모리 계층: PROJECT.md, 아키타입, 스킬, 교훈</sub></td>
</tr>
</table>

**1인 엔지니어링 조직을 위해 만들어졌습니다.** GreatCTO는 팀 없이 실제 제품을 출시하고자 하는 인디 해커, 솔로 창업자, 기술 CTO를 위한 것입니다 — Claude Code 또는 OpenAI Codex 위에서 파이프라인을 실행하고, 사양 하나를 승인하고, 라이브 URL로 출시합니다. *멀티 개발자 엔지니어링 팀을 위한 것은 아닙니다* — [FAQ](../FAQ.md#is-great_cto-for-teams) 참조.

## 설치

```bash
npx great-cto init
```

init 이후 AI 호스트를 재시작하세요. **요구 사항:** Node 18.17+ 및 다음 중 하나:

| 호스트 | 설치 플래그 | 상태 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(기본값)_ | ✅ 완전 지원 |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ 훅 + MCP + 에이전트 |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Superpowers 및 Beads 동반 플러그인은 자동으로 설치됩니다 — 수동 설정이 필요 없습니다.

---

<details>
<summary>📖 전체 문서 — 단일 CTO 게이트 · 위험 등급화 · 크리틱 · 46개 에이전트 · 빌드 아키타입 · 보드 · 비용 · MCP</summary>

## 기능당 하나의 결정

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

파이프라인은 위험 등급화되어 있습니다(`change_tier`): 유지보수 수정은 게이트를 **전혀** 열지 않고(CI가 게이트), 되돌릴 수 있는 기능은 `gate:plan`**만** 열며, 되돌릴 수 없는 변경은 전체 세트 + 프런티어 모델을 강제합니다. 게이트와 배포 사이의 모든 것은 자동으로 실행됩니다. **메모리는 세션 간에 유지됩니다**: 모든 게이트 판정은 `~/.great_cto/decisions.md`에 추가되고, 모든 회고는 프로젝트별 `lessons.md`에 추가되며, `/crystallize`는 영향력이 큰 패턴을 에이전트가 재해결 전에 조회하는 전역 라이브러리로 승격시킵니다.

## 계획 이전의 크리틱

가장 비싼 버그는 코드 안에 있지 않습니다 — 코딩이 시작되기 전 내려진 결정 안에 있습니다. 세 개의 크리틱 에이전트가 Plan 단계 이전에, 실수의 대가가 가장 큰 세 위치에서 실행됩니다:

| 크리틱 | 잡아내는 것 |
|---|---|
| **아키텍처 크리틱** | 나중에 멀티테넌시를 불가능하게 만드는 결합 · 실제 규모 데이터에서의 "뻔한" O(n²) · 바운디드 컨텍스트 간 순환 의존성 |
| **명세 크리틱** | "잘못된 문제를 풀었다" — 최악의 버그 유형, 어떤 단위 테스트도 잡지 못하기 때문 · 어긋난 수용 기준 · 합의된 적 없는 범위 |
| **스키마 크리틱** | 5천만 행 테이블에서 기본값 없는 `NOT NULL` (배포 후 10분 내 데드락) · 인덱스 생성 시 `CONCURRENTLY` 누락 · 롤백 경로가 없는 되돌릴 수 없는 마이그레이션 |

이전에는 크리틱이 Plan 단계부터만 활성화되었습니다. 이제 파이프라인은 구현이 시작되기 전에 — 되돌리는 비용이 며칠이 아니라 몇 시간일 때 — 아키텍처 및 명세 수준의 실수를 잡아냅니다.

## great_cto 비교

|  | **great_cto** | Devin | Claude Code (단독) |
|---|---|---|---|
| 오픈 소스 | ✅ MIT | ❌ 비공개 | ❌ 비공개 플러그인 모델 |
| 셀프 호스트 | ✅ 로컬에서 실행 | ❌ Cognition 클라우드 | ✅ |
| 호스트 | ✅ Claude Code + Codex | ❌ Cognition 클라우드 | ✅ Claude Code |
| BYOK / 멀티 모델 | ✅ Claude Code · Codex | ❌ 독점 | ❌ Anthropic 전용 |
| 전문가 에이전트 | **46** (architect · design-advisor · senior-dev · QA · security · devops · 아키타입 리뷰어) | 1개 제너럴리스트 | 1개 제너럴리스트 |
| 빌드 파이프라인 | spec → CTO gate → scaffold → build → test → deploy | 원샷 자율 실행 | 편집 루프 |
| 사람 게이트 | ✅ 하나 — 당신이 사양을 승인 (위험 등급화) | ❌ 없음 | ❌ |
| 세션 간 메모리 | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ 스레드만 | ⚠️ 스레드만 |
| 비용 추적 | ✅ 에이전트별 + 30일 이력 + savings_x | ❌ | ❌ |
| 디자인 내장 | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
| 가격 | 무료 (LLM 제공자 비용은 본인 부담) | $500/월 | $20/월 |
| 설정 | `npx great-cto init` | 가입 | CLI 설치 |

great_cto는 또 하나의 코딩 에이전트 루프가 **아닙니다** — 이미 사용 중인 코딩 에이전트 **위의 오케스트레이션 계층**입니다. "코드를 타이핑하는 또 다른 어시스턴트"가 아니라 "작업을 검토하고 게이트하는 전문가 팀"이라고 생각하세요.

## 관할권 감지

`npx great-cto init`은 세 가지 신호 소스 — README 키워드, 인프라 리전 문자열(Terraform, `.env`의 `AWS_REGION=`, docker-compose의 `TZ=`), `package.json` homepage TLD — 를 스캔하여 **12개 관할권** 중 어떤 것이 적용되는지 자동으로 감지합니다:

| 관할권 | 신호 (README + 인프라) | 프레임워크 | 리뷰어 |
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

단어 경계 매칭이 오탐을 방지합니다(`"india"`는 `"indiana"`와 매칭되지 않음). 감지된 관할권은 `PROJECT.md`에 `jurisdiction: [eu, us-ca]`로 기록되며, 모든 기능에서 적절한 리뷰어를 게이트합니다. 수동으로 재정의:

```yaml
jurisdiction: [eu, us-ca]
```

## 매일 사용하는 세 가지 명령어

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

추가로: `/audit` (기존 코드베이스 스캔), `/cost` (LLM 라우터 절감), `/sec` (보안 종합), `/oncall`, `/release`, `/rfc`. 전체 목록: 설치 후 `~/.claude/commands/`.

## 비용

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| 파이프라인 | 실행당 비용 | 월 실행 횟수 | 합계 |
|---|---|---|---|
| quick (설정 / 오타) | $0.10 | 10 | $1 |
| quick (새 엔드포인트) | $1 | 6 | $6 |
| standard (기능) | $5 | 3 | $15 |
| deep (횡단 관심사) | $12 | 1 | $12 |
| | | | **~$34** |

자신의 Anthropic API 토큰 비용은 본인이 부담합니다. **시트당 요금 없음. SaaS 종속 없음.** 일상적인 트리아지는 Kimi K2(약 5배 저렴한 Sonnet 등가)로 자동 라우팅됩니다 → 로그 클러스터링에서 60–80% 절감.

## 빌드 아키타입

모든 제품은 그 파이프라인을 결정하는 **빌드 아키타입**에 매핑됩니다 — 스택 템플릿,
데이터 형태, 시그니처 통합. 6개의 제품 빌더 아키타입(약 40개의 제품이 이들로
수렴됩니다):

| 아키타입 | 형태 | 스택 | 통합 |
|---|---|---|---|
| `vertical-saas` | entities · roles · workflow · records UI | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | calendar · availability · reminders · payments | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | contacts · pipeline · automated sequences | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | ingest · metrics · visualization · alerts | Next.js · warehouse-lite · charts | source connectors |
| `marketplace` | two-sided listings · matching · payments | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | catalog · access tiers · delivery · monetization | Next.js · object storage · CDN | Stripe · media pipeline |

여기에 더해, 엔진이 빌드를 튜닝하기 위해 자동 감지하는 기저 소프트웨어 종류 아키타입(`web-service`, `mobile-app`, `cli-tool`,
`library`, …)이 있습니다. [6개 파이프라인](https://greatcto.systems/pipelines) 참조.

전체 표(26개 아키타입) + 감지 작동 방식: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**깊은 미국 커버리지** — GDPR/PCI/HIPAA를 넘어, great_cto는 이제 SEC 사이버 공시(8-K Item 1.05), 방위 산업체를 위한 CMMC 2.0 / NIST 800-171, 미국 AI 거버넌스(NIST AI RMF · Colorado SB 205 · Utah/Texas AI), 웹 추적 소송(VPPA · CIPA · Washington MHMDA), 그리고 대출을 위한 HMDA / SR 11-7 모델 리스크에 대해서도 검토합니다.

## 도메인 오버레이 (선택 사항)

빌드 아키타입을 넘어, 엔진은 도메인 고유 신호(의존성, README 용어)를 감지하면
선택적 **도메인 오버레이**를 자동으로 부착할 수 있습니다 — 음성/텔레포니, 프라이버시(GDPR/CCPA),
AI 거버넌스 같은 것들을 위한 전문 리뷰어와 몇 가지 추가 체크를 더합니다. 이들은
옵트인이며 빌드 파이프라인과 직교합니다; 대부분의 제품에는 필요하지 않습니다.

## 실제 실행 한 건, 완전 추적

대표적인 영수증: **실제 기능 하나**가 전체 파이프라인을 통과해 **1h 26m
실시간으로 $3.40의 LLM 비용**에 출시되었습니다 — architect → plan → implementation → review → human gate →
머지된 PR. 동일 기능의 전통적 경로: ~170시간, ~$42K. 모든 단계가
타임스탬프되고, 모든 아티팩트가 공개 GitHub PR로 링크됩니다.

이전에 Python CLI 기능에서 실행한 사례($2.39 vs ~$5,460 인력 환산)는 리뷰 모델이 작동함을 보여주었습니다: 보안이 QA가 통과시킨 실제 결함 두 개를 잡아냈습니다(`list(stream_csv())`가 스트리밍을 무력화 → 13 MB 입력에서 14.5 MB 피크 RSS).

전체 추적 + 아티팩트: [greatcto.systems/proof](https://greatcto.systems/proof) · 원본: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## CI 통합

어떤 GitHub Actions 워크플로에든 추가하세요:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci`는 `$GITHUB_ACTIONS`를 자동 감지하여 PR diff에 인라인으로 `::error file=...,line=N::` 주석을 내보냅니다. 종료 코드: 0 정상 / 1 발견 / 2 설정 오류.

## 테스트 피라미드

계층형 테스트 스위트 — **구조 + 상태 머신 티어는 $0로 2분 미만 실행**(`node --test tests/*.test.mjs`); 실제 LLM 티어(26개 아키타입 × 4-8단계 + 14개 팩 + 13개 리뷰어)는 OpenRouter를 통해 약 $5–10로 온디맨드 실행. 전체 분류: [docs/testing/](../testing/).

## MCP

네이티브 [MCP](https://modelcontextprotocol.io/) 서버 — Claude Desktop, Codex, 또는 모든 MCP 호스트에서 호출 가능한 **7개 도구**. 로컬(보드 불필요): `detect_archetype` · `estimate_cost` · `query_decisions`. 보드 기반: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

전체 설정 + 내부 MCP(Grafana, LLM 라우터, Beads): [docs/MCP.md](../MCP.md).

## 이메일 알림 (설정 불필요)

2시간 이내에 당신의 조치가 필요한 다섯 가지가 자동으로 이메일로 전송됩니다 — 보드에서 떨어져 있을 때조차도:

| 트리거 | 시점 |
|---|---|
| 🚨 **P0 인시던트** | 어떤 프로젝트에서든 P0 작업이 열릴 때 |
| ⏸️ **게이트 2시간 초과 정체** | `gate:ship`이 몇 시간째 당신을 기다리고 있을 때 |
| 🛡️ **보안 BLOCKED** | `security-officer`가 머지를 거부했을 때 |
| 💸 **예산 경고** | 월 LLM 지출이 예산의 80% / 100%를 넘을 때 |
| 📊 **주간 다이제스트** | 금요일 09:00 — 출시, 지출, 절감, QA |

**설정**: 보드 → **Notifications** 탭 → 이메일 입력 → 발송된 6자리 코드 입력 → 트리거 선택. Resend 가입 불필요, API 키 불필요 — 전송은 `greatcto.systems/notify`를 통해 라우팅됩니다(무료, 인증된 이메일당 24시간에 100통).

## 한계 및 비목표

- **멀티 개발자 엔지니어링 팀을 위한 것이 아닙니다** — 한 명의 빌더가 제품입니다; 파이프라인을 공유하는 엔지니어가 2명 이상이면 이미 졸업한 것입니다.
- **시니어 엔지니어를 대체하지 않습니다** — 프로세스를 코드화할 뿐, 시니어 없이 아키텍처 판단을 내리지 않습니다.
- **CI/CD 시스템이 아닙니다** — 게이트는 로컬 / 세션 내에서 실행됩니다. 실제 머지에는 여전히 GitHub Actions가 필요합니다.
- **인증 감사를 받지 않았습니다** — PCI/HIPAA/SOC2 아키타입 스캐폴드는 출발점이지 인증이 아닙니다.
- **결정론적이지 않습니다** — LLM이 생성한 출력입니다. 모든 게이트 판정은 합리성을 점검해야 합니다.

## FAQ (상위 5개)

**내 소스 코드가 모델 학습에 사용되나요?** 아니요. Claude API는 유료 고객에 대해 기본적으로 무보존(zero-retention)입니다. great_cto는 아무것도 추가하지 않습니다.

**토큰 비용은 어떻게 낮추나요?** 기본 Haiku + 트리아지용 Kimi K2 라우터(60–80% 절감) + 비용 가드 훅.

**훅을 비활성화할 수 있나요?** 모든 훅은 `GREAT_CTO_DISABLE_<NAME>=1`을 준수합니다. 파일별 시크릿 스캔 옵트아웃: `// great_cto:allow-secrets`.

**솔로가 아니면 어떡하죠?** GreatCTO의 빌드 파이프라인은 한 명의 엔지니어를 위해 만들어졌습니다 — 공유 빌더 보드와 동시 파이프라인이 필요한 엔지니어가 2명 이상이라면, 이미 졸업한 것입니다.

전체 FAQ: [docs/FAQ.md](../FAQ.md).

## 문서

📚 **[전체 문서 허브 →](../README.md)** — [Diátaxis](https://diataxis.fr/) 기준으로 구성:
**[시작하기](../tutorials/getting-started.md)** · How-to 가이드 ·
[에이전트](../reference/agents.md) & [명령어](../reference/commands.md) 레퍼런스 · [아키텍처](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## 아키텍처

플러그인은 Claude Code(또는 MCP를 지원하는 모든 호스트) 안에서 실행됩니다; 46개 에이전트는 마크다운 명세이고; 작업은 Beads(dolt, git 네이티브)에 저장되며; 메모리는 일반 마크다운입니다(벡터 스토어 없음). 다이어그램 + 스택 표: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## 새로운 소식

**v2.74+** (2026년 6월) — **제품 빌더 피벗**: GreatCTO가 *AI 제품 빌더*가 됩니다 — 소프트웨어 제품을 설명하고, 단일 CTO 게이트에서 사양을 승인하면, 파이프라인이 이를 출시합니다(spec → build → test → deploy). 10개 미국 산업군, ~40개 제품, 6개 재사용 가능한 파이프라인. 빌드 게이트는 위험 등급화되어 있습니다(`change_tier`); 규제 대상 런타임 표면은 [avelikiy/operate](https://github.com/avelikiy/operate)로 분리되었습니다. 이야기: [전략](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [6개 파이프라인](https://greatcto.systems/pipelines)

**v2.40–v2.62** (2026년 6월) — **오토파일럿 피벗**: GreatCTO가 *비즈니스를 위한 AI 오토파일럿*이 됩니다 — 25개 서비스 오토파일럿 버티컬, 각각은 측정된 품질 스코어카드, 책임 있는 소유자, 그리고 **되돌릴 수 없는 작업은 사람의 서명 없이는 절대 실행되지 않는다**는 런타임 불변식을 갖춘 플로우입니다. 22개의 라이브 커넥터가 모든 버티컬을 실제 데이터로 실행합니다. 이야기: [우리는 피벗했습니다 →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63** (2026년 6월) — **오퍼레이터 콘솔**: 영속적 실행이 사람 게이트에서 멈추고 인박스에서 지정된 면허 보유자를 기다립니다; 서명이 쓰기를 실행합니다. 역할 기반 접근, 범위 지정 초대, 증거가 첨부된 AI 작성 판정, QA 샘플링, SLA 시계, Ops 탭(미터링 · 커넥터 상태 · 데드레터 재큐잉), WCAG 2.2 AA, 라이트/다크. 이야기: [오퍼레이터 콘솔 →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65** (2026년 6월) — **내부 구조**: 개발 보드가 *pult*가 됩니다 — 게이트 승인이 라이브 스트리밍되는 에이전트 실행을 생성할 수 있습니다; 홀드아웃 eval에 게이트된 프롬프트 자기 개선(SIA 영감); $0 컨텍스트 압축(CI 로그 31,475 → 155자, FATAL 보존); Fable 5 지원. 이야기: [6월 내부 구조 →](https://greatcto.systems/blog/june-under-the-hood)

[전체 변경 이력 →](../../CHANGELOG.md)

## 로드맵

- **제품 아키타입 감지** — 스택만이 아니라 제품 브리프에서 빌드 아키타입을 선택
- **산업별 빌드 템플릿** — 6개 파이프라인 각각을 통해 레퍼런스 제품을 처음부터 끝까지 출시
- **티어 인식 저지** — T0/T1 eval에는 저렴한 파인튜닝 저지, T2에는 프런티어 + 사람(ADR-004)
- **헤드리스 태스크 러너** — 제품 빌드를 큐에 넣고 VPS에서 무인으로 실행

[다음 기능에 투표하기 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 저자

[avelikiy](https://github.com/avelikiy) — AI 네이티브 트레이딩 및 핀테크 플랫폼을 구축하는 CTO(0→1, 1→N). great_cto는 내 자신의 루프를 한 번에 에이전트 하나씩 자동화한 결과물입니다. 모든 규칙은 실제 프로덕션 시스템의 실제 문제에 대응하여 등장했습니다.

## 커뮤니티

| 채널 | 내용 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | 버그, 기능 요청, 아키타입 제안 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 질문, 패턴, 자랑하기 |
| 📝 [Blog](https://greatcto.systems/blog/) | 영수증, 비용 분석, 아키텍처 심층 분석 |
| 🔒 [SECURITY.md](../../SECURITY.md) | 책임 있는 취약점 공개 |

## 기여 및 라이선스

풀 리퀘스트를 환영합니다 — [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참조하세요. 첫 기여하기 좋은 이슈: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT — [LICENSE](../../LICENSE) 참조.

great_cto가 시간을 아껴 주었다면, 리포지토리에 별을 눌러 주세요 — 다른 솔로 CTO들이 이를 찾는 데 도움이 됩니다.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Built by [@avelikiy](https://github.com/avelikiy)**
*Stop being the only person who can ship.*

</div>
