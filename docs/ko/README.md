> ⚠️ **This translation is being updated.** GreatCTO has repositioned to an **AI Product Builder** — describe a product, approve the spec, ship the software (one CTO gate, maximum automation). For the current positioning see the [English README](../../README.md). The text below reflects the previous "AI autopilots" direction.

<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**비즈니스를 위한 AI 오토파일럿 — 소프트웨어만이 아니라, 일을 끝까지 처리합니다.**

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

[웹사이트](https://greatcto.systems) · [실제 실행 한 건 →](https://greatcto.systems/proof) · [라이브 데모](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [토론](https://github.com/avelikiy/great_cto/discussions) · [변경 이력](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## 서비스가 곧 새로운 소프트웨어다

다음 물결은 전문가를 위한 도구가 아니라, **서비스의 결과물 자체를 파는 오토파일럿**입니다.
오토파일럿은 비즈니스 기능 하나를 처음부터 끝까지(접수 → 처리 → 판단 → 전달) 실행하며,
판단이 필요한 사안만 자격을 갖춘 사람에게 에스컬레이션합니다. 모델이 개선될 때마다 서비스는
더 빠르고 저렴해집니다.

GreatCTO는 이러한 오토파일럿을 제공합니다 — 각각은 **위험한 단계에 사람이 개입하는 에이전트 + 도구의
플로우**이며, 내장된 컴플라이언스 리뷰어와, 각 플로우를 실제 데이터로 실행하는 **라이브 커넥터**를 갖추고 있습니다.

## 오토파일럿들

| 오토파일럿 | 하는 일 | 시장 | 누가 만들고 있나 |
|---|---|---|---|
| 🩺 **[Medical-coding](https://greatcto.systems/autopilots/rcm.html)** | 임상 노트 → 정확하고 컴플라이언트한 청구서; 위험한 건은 공인 코더가 서명 | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[Managed-IT](https://greatcto.systems/autopilots/msp.html)** | 전체 장비군에 걸친 패치, 설정, 접근 권한 — 단계적이고 되돌릴 수 있으며, 큰 변경에는 사람이 개입 | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[Legal-document](https://greatcto.systems/autopilots/legaltech.html)** | 계약서와 NDA를 작성하고 레드라인; 자문에 해당하는 것은 면허를 가진 변호사가 서명 | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[Bookkeeping & close](https://greatcto.systems/autopilots/accounting.html)** | 장부 기록, 대사, 월 마감; 마감은 컨트롤러가 서명 | $50–80B | Rillet · Basis · Digits |
| 🧾 **[Tax-prep](https://greatcto.systems/autopilots/tax.html)** | 신고서를 준비하고 포지션을 분류; 제출 전 자격을 갖춘 세무 담당자가 서명 | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[Source-to-pay](https://greatcto.systems/autopilots/procurement.html)** | 공급업체 온보딩, 인보이스 매칭, 지급 실행 — 제재 및 사기 여부를 스크리닝 | $200B+ | Tacto · Zip · AskLio |

→ [모든 오토파일럿](https://greatcto.systems/autopilots.html) · 터미널에서 어떤 플로우든 보려면 `/flow <vertical>` 실행

**각 오토파일럿은 판단이 필요한 사안에 사람을 둡니다** — 공인 코더, 면허 변호사, 컨트롤러,
자격을 갖춘 세무 담당자. 오토파일럿은 물량을 처리하고, 사람은 책임이 따르는 판단을 담당합니다.
**9개의 라이브 커넥터가 6개 오토파일럿 전반에 걸쳐 실행됩니다** — FHIR, ICD-10 (NLM),
NCCI/MUE, X12 837P, DocuSign, Plaid, OFAC, 단계적 롤아웃, 그리고 미국 연방 세금 엔진. 이들은
기본적으로 키가 필요 없으며(공개 소스 또는 결정론적 실제 생성), 자격 증명을 추가하는 순간 실제
제공자에게 POST합니다.

## 내부 구조 (이를 운영하는 CTO를 위해)

각 오토파일럿은 전문가 에이전트로 구성된 게이트형 파이프라인 — 아키텍트, 12각도
리뷰어, QA, 보안 책임자, 데브옵스 — 이 만들고 운영하며, 당신의 스택과 관할권에 맞게 튜닝됩니다.
**기능마다 당신은 두 번 결정하고, 나머지는 전부 자동으로 실행됩니다.** 컴플라이언스 리뷰어, 사람이
서명하는 게이트, 감사 추적, 라이브 커넥터는 오토파일럿이 안전하게 실행되도록 만드는 신뢰
계층입니다.

## 숫자로 보기

| | |
|---|---|
| LLM 비용 (실제 기능 한 건, 추적됨) | **$2.39** |
| 동일 작업의 인력 환산 비용 | **~$5,460** |
| QA가 놓친 결함을 잡아낸 건수 | **2** |
| 월 비용 (파이프라인 20회 실행) | **~$34** |
| 전문가 에이전트 | **61** |
| 자동 감지 아키타입 | **26** |
| 관할권 | **12** (GDPR · HIPAA · PCI-DSS · SOX · 외 다수) |

→ [모든 아티팩트를 포함한 전체 추적](https://greatcto.systems/proof)

## 작동 방식

**`npx great-cto init`** — 당신의 스택과 README를 스캔하고, 관할권(GDPR? HIPAA? PCI?)을 감지하여, 프로젝트에 맞는 정확한 에이전트, 게이트, 컴플라이언스 프레임워크를 `.great_cto/FLOW.md`에 기록합니다.

**`/start "기능을 설명하세요"`** — 코드가 작성되기 전에 크리틱들이 아키텍처와 명세를 검토합니다. 당신은 `gate:plan`에서 계획을 검토합니다.

**에이전트가 자동으로 실행됩니다** — 시니어 개발자가 TDD로 구현하고, 12각도 리뷰, QA, 보안, 데브옵스가 이어집니다. 당신은 `gate:ship`에서 출시를 승인합니다.

## 세 가지 프로젝트 — 세 가지 다른 파이프라인

같은 명령어. 출력은 당신이 무엇을 만드는지, 어디에서 실행되는지에 따라 달라집니다:

| | **핀테크 스타트업 · EU** | **헬스케어 포털 · US** | **CLI 도구** |
|---|---|---|---|
| 전문가 에이전트 | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| 사람 게이트 | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| 컴플라이언스 | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| 사이클당 비용 | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ 인터랙티브 선택기를 사용해 보세요: [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## 실제로 확인하게 될 대시보드

`great-cto board`는 `http://localhost:3141`에서 열립니다 — 실시간 SSE 칸반, 에이전트별 비용 타일, 파이프라인 상태, 30일 LLM 지출 대 인력 환산 기준선.

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>메트릭</b> — LLM 비용, 인력 환산 기준선, savings_x 비율</sub></td>
<td width="50%"><a href="../screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>인박스</b> — 대기 중인 게이트, P0 인시던트, 차단된 작업, 정체된 진행 중 작업</sub></td>
</tr>
<tr>
<td width="50%"><a href="../screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>에이전트</b> — 마지막 사용 시점 + 실행 횟수가 표시된 61명의 전문가</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>메모리</b> — 11개 계층 + 결정화된 인시던트 패턴</sub></td>
</tr>
</table>

**1인 엔지니어링 조직을 위해 만들어졌습니다.** 모든 것을 혼자 운영하는 인디 해커, 솔로 창업자, 기술 CTO를 위한 것입니다 — Claude Code 또는 OpenAI Codex 위에서. *팀을 위한 것은 아닙니다* — [FAQ](../FAQ.md#is-great_cto-for-teams) 참조.

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
# Claude Code (기본값)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Superpowers 및 Beads 동반 플러그인은 자동으로 설치됩니다 — 수동 설정이 필요 없습니다.

---

<details>
<summary>📖 전체 문서 — 두 개의 게이트 · 크리틱 · 61개 에이전트 · 26개 아키타입 · 12개 관할권 · 45개 이상 컴플라이언스 프레임워크 · 보드 · 비용 · MCP</summary>

## 기능당 두 번의 결정

```
🟡 gate:plan   ←  여기서 당신이 결정합니다 (아키텍처 + 작업 + 비용)
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  여기서 당신이 결정합니다 (PR 준비 완료, 보안 승인됨)
```

아키텍트, 플래너, 리뷰어, QA, 보안, 데브옵스는 이 두 개의 사람 체크포인트 사이에서 자동으로 실행됩니다. **메모리는 세션 간에 유지됩니다**: 모든 게이트 판정은 `~/.great_cto/decisions.md`에 추가되고, 모든 회고는 프로젝트별 `lessons.md`에 추가되며, `/crystallize`는 영향력이 큰 패턴을 에이전트가 재해결 전에 조회하는 전역 라이브러리로 승격시킵니다.

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
| 전문가 에이전트 | **57** (아키텍트 · PM · 12각도 리뷰 · QA · 보안 · 데브옵스 · 아키타입·팩·관할권 전반의 42개 리뷰어) | 1개 제너럴리스트 | 1개 제너럴리스트 |
| SDLC 오케스트레이션 | architect → plan → impl → review → QA → security → devops | 원샷 자율 실행 | 편집 루프 |
| 사람 게이트 | ✅ 기능당 2개 (plan + ship) | ❌ 없음 | ❌ |
| 세션 간 메모리 | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ 스레드만 | ⚠️ 스레드만 |
| 비용 추적 | ✅ 에이전트별 + 30일 이력 + savings_x | ❌ | ❌ |
| 컴플라이언스 프레임워크 | ✅ 33개 이상 (PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …) | ❌ | ❌ |
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

추가로: `/audit` (기존 코드베이스 스캔), `/cost` (LLM 라우터 절감), `/sec` (보안 종합), `/oncall`, `/release`, `/rfc`. 전체 목록: 설치 후 `~/.claude/commands/`.

## 비용

```
일반적인 솔로 CTO 프로젝트 기준 ~$34/월 — 월 20회 파이프라인 실행, 참고치.
```

| 파이프라인 | 실행당 비용 | 월 실행 횟수 | 합계 |
|---|---|---|---|
| quick (설정 / 오타) | $0.10 | 10 | $1 |
| quick (새 엔드포인트) | $1 | 6 | $6 |
| standard (기능) | $5 | 3 | $15 |
| deep (횡단 관심사) | $12 | 1 | $12 |
| | | | **~$34** |

자신의 Anthropic API 토큰 비용은 본인이 부담합니다. **시트당 요금 없음. SaaS 종속 없음.** 일상적인 트리아지는 Kimi K2(약 5배 저렴한 Sonnet 등가)로 자동 라우팅됩니다 → 로그 클러스터링에서 60–80% 절감.

## 26개 아키타입 자동 감지

각 아키타입은 자체 전문가 에이전트와 컴플라이언스 체크리스트를 활성화합니다. 상위 7개:

| 아키타입 | 티어 | 전문가 에이전트 | 컴플라이언스 |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

전체 표(26개 아키타입) + 감지 작동 방식: [docs/ARCHETYPES.md](ARCHETYPES.md).

**깊은 미국 커버리지** — GDPR/PCI/HIPAA를 넘어, great_cto는 이제 SEC 사이버 공시(8-K Item 1.05), 방위 산업체를 위한 CMMC 2.0 / NIST 800-171, 미국 AI 거버넌스(NIST AI RMF · Colorado SB 205 · Utah/Texas AI), 웹 추적 소송(VPPA · CIPA · Washington MHMDA), 그리고 대출을 위한 HMDA / SR 11-7 모델 리스크에 대해서도 검토합니다.

## 14개 도메인 팩 — 오버레이 리뷰어

도메인 팩은 아키타입 **위에** 올라탑니다. CLI가 팩 고유의 신호(의존성, README 용어)를 감지하면 자동으로 부착됩니다. 각 팩은 기본 아키타입과 독립적으로 자체 리뷰어, 위협 모델 템플릿, EVAL 스위트, 사람 게이트를 추가합니다.

| 카테고리 | 팩 |
|---|---|
| **AI 버티컬** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **디지털 헬스** | `digital-health-pack` _(웨어러블 텔레메트리 · 정신 건강 AI · 영양 AI · 의사 HITL)_ |
| **핀테크 / 규제** | `lending-pack` · `em-fintech-pack` |
| **고컴플라이언스** | `clinical-trials-pack` · `climate-pack` |
| **엔지니어링** | `api-platform-pack` · `robotics-pack` |
| **미국 시장** | `sec-cyber-pack` _(SEC 8-K 공시)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28개 사람 게이트 유형** + 53개 참조 EVAL 스위트 + 15개 TM 템플릿. **4계층 여정 시각화**(아키타입 → 팩 → 리뷰어 → 게이트)로 14개 팩 모두 둘러보기: [greatcto.systems/packs.html](https://greatcto.systems/packs.html).

## 실제 실행 한 건, 완전 추적

Python CLI 기능 하나가 전체 파이프라인을 통과해 출시되었습니다: ~$5,460 인력 환산 대비 **$2.39 LLM 지출**. 보안이 QA가 통과시킨 실제 결함 두 개를 잡아냈습니다(`list(stream_csv())`가 스트리밍을 무력화 → 13 MB 입력에서 14.5 MB 피크 RSS). 멀티 리뷰어 모델이 단일 에이전트가 놓치는 것을 머지 전에 잡아냅니다.

전체 추적 + 아티팩트: [greatcto.systems/proof](https://greatcto.systems/proof) · 원본: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

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

계층형 테스트 스위트 — **구조 + 상태 머신 티어는 $0로 2분 미만 실행**(`node --test tests/*.test.mjs`); 실제 LLM 티어(26개 아키타입 × 4-8단계 + 14개 팩 + 13개 리뷰어)는 OpenRouter를 통해 약 $5–10로 온디맨드 실행. 전체 분류: [docs/testing/](testing/).

## MCP

네이티브 [MCP](https://modelcontextprotocol.io/) 서버 — Claude Desktop, Codex, 또는 모든 MCP 호스트에서 호출 가능한 **7개 도구**. 로컬(보드 불필요): `detect_archetype` · `estimate_cost` · `query_decisions`. 보드 기반: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

전체 설정 + 내부 MCP(Grafana, LLM 라우터, Beads): [docs/MCP.md](MCP.md).

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

- **팀을 위한 것이 아닙니다** — 솔로 CTO가 제품입니다. 엔지니어가 2명 이상? 이미 졸업한 것입니다.
- **시니어 엔지니어를 대체하지 않습니다** — 프로세스를 코드화할 뿐, 시니어 없이 아키텍처 판단을 내리지 않습니다.
- **CI/CD 시스템이 아닙니다** — 게이트는 로컬 / 세션 내에서 실행됩니다. 실제 머지에는 여전히 GitHub Actions가 필요합니다.
- **인증 감사를 받지 않았습니다** — PCI/HIPAA/SOC2 아키타입 스캐폴드는 출발점이지 인증이 아닙니다.
- **결정론적이지 않습니다** — LLM이 생성한 출력입니다. 모든 게이트 판정은 합리성을 점검해야 합니다.

## FAQ (상위 5개)

**내 소스 코드가 모델 학습에 사용되나요?** 아니요. Claude API는 유료 고객에 대해 기본적으로 무보존(zero-retention)입니다. great_cto는 아무것도 추가하지 않습니다.

**토큰 비용은 어떻게 낮추나요?** 기본 Haiku + 트리아지용 Kimi K2 라우터(60–80% 절감) + 비용 가드 훅.

**훅을 비활성화할 수 있나요?** 모든 훅은 `GREAT_CTO_DISABLE_<NAME>=1`을 준수합니다. 파일별 시크릿 스캔 옵트아웃: `// great_cto:allow-secrets`.

**솔로가 아니면 어떡하죠?** great_cto는 1인 엔지니어링 조직을 위해 만들어졌습니다. 엔지니어가 2명 이상이고 공유 보드 / 멀티 시트 인증이 필요하다면, 이미 졸업한 것입니다.

전체 FAQ: [docs/FAQ.md](FAQ.md).

## 문서

📚 **[전체 문서 허브 →](README.md)** — [Diátaxis](https://diataxis.fr/) 기준으로 구성:
**[시작하기](tutorials/getting-started.md)** · How-to 가이드 ·
[에이전트](reference/agents.md) & [명령어](reference/commands.md) 레퍼런스 · [아키텍처](ARCHITECTURE.md) · [FAQ](FAQ.md).

## 아키텍처

플러그인은 Claude Code(또는 MCP를 지원하는 모든 호스트) 안에서 실행됩니다; 61개 에이전트는 마크다운 명세이고; 작업은 Beads(dolt, git 네이티브)에 저장되며; 메모리는 일반 마크다운입니다(벡터 스토어 없음). 다이어그램 + 스택 표: [docs/ARCHITECTURE.md](ARCHITECTURE.md).

## 새로운 소식

**v2.21.0** (2026년 5월) — **Flow Compiler UX**: `npx great-cto init`이 이제 기능 사이클마다 에이전트, 게이트, 컴플라이언스, 비용 추정치를 담은 **Compiled flow**를 출력합니다. `.great_cto/FLOW.md`를 작성합니다 — 에이전트는 이를 읽고 당신의 SDLC를 정확히 어떻게 오케스트레이션할지 파악합니다.

**v2.20.0** (2026년 5월) — **Detection v2**: **12개 관할권 커버리지**(CA · JP · CN · KR 추가, 완전한 법적 프레임워크 + 사람 게이트 포함) · **인프라 신호 감지**(Terraform 리전 문자열, `.env`의 `AWS_REGION=`, docker-compose의 `TZ=`, `package.json` homepage TLD) · **단어 경계 매칭**("india" → "indiana" 오탐 제거) · 틈새 아키타입을 위한 **팩 힌트**(`suggestedPacks`가 신뢰도가 낮을 때 robotics/climate/clinical-trials/hr-ai/em-fintech 팩을 노출). 토큰 절감: 파이프라인 실행당 –87.7%(v2.19.0 컨텍스트 아키텍처 재설계).

**v2.19.0** (2026년 5월) — **토큰 이코노미 Phase 1+2**: 아티팩트 요약(≤250 토큰, 자동 생성) + 작업 인식 메모리 필터(작업당 상위 k개 관련 항목). 파이프라인 실행당 –87.7% 토큰.

**v2.17.0** (2026년 5월) — **동반 플러그인 자동 설치** · Plan 단계 이전 **아키텍처 / 명세 / 스키마 크리틱**.

[전체 변경 이력 →](../../CHANGELOG.md)

## 로드맵

- **CI의 Evals 러너** — 모든 PR에서 골든셋 eval 스위트를 실행해 프롬프트 회귀를 자동으로 잡아냄
- **자기 개선 루프** — 판정으로부터 학습하고 시간이 지나며 자신의 프롬프트를 개선하는 에이전트
- **결정 스코어링** — 어떤 게이트 결정이 옳았는지 추적; 패턴을 드러냄
- **/crystallize** — 영향력이 큰 교훈을 전체 파이프라인이 조회할 수 있는 재사용 가능한 스킬로 승격

[다음 기능에 투표하기 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 저자

[avelikiy](https://github.com/avelikiy) — AI 네이티브 트레이딩 및 핀테크 플랫폼을 구축하는 CTO(0→1, 1→N). great_cto는 내 자신의 루프를 한 번에 에이전트 하나씩 자동화한 결과물입니다. 모든 규칙은 실제 프로덕션 시스템의 실제 문제에 대응하여 등장했습니다.

## 커뮤니티

| 채널 | 내용 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | 버그, 기능 요청, 아키타입 제안 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 질문, 패턴, 자랑하기 |
| 📝 [Blog](https://velikiy.hashnode.dev) | 아키텍처 심층 분석 |
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
