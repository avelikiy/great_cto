<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**유일하게 배포할 수 있는 사람이 되는 것을 그만두세요.**

당신은 CTO이자 병목입니다. **GreatCTO는 30개의 전문가 에이전트**가 아키텍처, 리뷰, QA, 보안, 배포를 처리합니다 — 당신은 **기능당 두 가지 결정**만 내리면 됩니다.

> **v2.7.0** · 34 에이전트 · 25 아키타입 · 24 보안 규칙 · 9 훅 · **Claude Code · Cursor · Codex · Aider · Continue** 에서 작동 · MCP 서버 · webhooks · CI gate · 프로젝트당 ~$34/월 · MIT

> ⚠️ 이 번역은 기계 번역입니다. 현지화 검토가 필요합니다. 문제가 있으면 PR을 보내주세요. [English original](../../README.md).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[웹사이트](https://greatcto.systems) · [데모](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [블로그](https://velikiy.hashnode.dev)

**언어:** [English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · **한국어** · [Español](../es/README.md) · [Português (BR)](../pt-BR/README.md)

</div>

## 새로운 소식

### v2.7.0 — 에이전트 프롬프트 일관성 + 모델 티어 정책 (2026년 5월)
- 3개의 새 린터 규칙: `CONS-MODEL` (에이전트 모델이 역할에 맞음) · `CONS-OUTPUT` (reviewer는 출력 파일 선언) · `CONS-SIGNOFF` (sign-off / gate 시맨틱)
- ADR-002 — 통합된 모델 티어 선택 정책 (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet)
- 버그 수정: SessionEnd 자동 캡처 로그가 이제 보드 관리 화면에 올바르게 렌더링됨
- 린트 기준선: 34 에이전트 · 0 오류 · 0 경고

### v2.6.0 — 에이전트 프롬프트 구조 린터 (2026년 5월)
- `scripts/agent-prompt-lint.mjs` — `agents/` 의 34개 markdown 파일 모두에 대한 14개 규칙
- 탐지: frontmatter 드리프트 (model/tools), 누락된 phase-task 섹션, 오래된 메모리 경로, 파일 크기 폭증
- L1 파이프라인 테스트에서 실행: 릴리즈 전 0 오류

### v2.5.x 패치 시리즈 — 프로덕션 강화 (2026년 5월)
- **v2.5.10**: 의존 작업의 `bd close --force` 를 통한 phase-task 종료
- **v2.5.9**: 정직한 비용 경제학 — $0.30/AI-시간 · $150/사람-시간 · 500× 비율 (7638× 를 보여주던 버그 수정)
- **v2.5.8**: QA 통과 — 10개 버그 종료; 비용 파이프라인이 실제 LLM 지출을 반영
- **v2.5.7**: per-stage Beads 작업 라이프사이클 — 각 에이전트가 `scripts/phase-task.sh` 로 자체 작업을 생성+종료
- **v2.5.6**: Cursor dogfooding 후 6개 UX 수정
- **v2.5.5**: 크리티컬 수정 — `/inbox` 와 `/digest` 의 "Prompt is too long"
- **v2.5.4**: env-var-first 호스트 감지 (`$CLAUDECODE` / `$CODEX_SESSION` / `$CURSOR_TRACE_ID` / …)
- **v2.5.1**: 크리티컬 수정 — `scan`/`ci` 가 상대 경로에서 결과를 놓치는 문제

### v2.5.0 — 프로덕션 webhooks + MCP SSE + 리포트 + Cursor extension (2026년 5월)
- HMAC 검증 webhook 수신기: GitHub / Sentry / generic (`great-cto serve`)
- 지수 백오프 + DLQ 가 있는 아웃바운드 디스패처 → Slack / Discord / PagerDuty
- 멀티 클라이언트 / 원격 사용을 위한 MCP SSE 모드
- HTML/JSON 비용+컴플라이언스 리포트 (`great-cto report cost --period 30d`)
- `packages/cursor-ext/` 의 Cursor extension scaffold — vsce-ready

### v2.4.0 — 멀티플랫폼 지원: Codex, Cursor, Aider, Continue (2026년 5월)
- `great-cto adapt --platform [claude|codex|cursor|aider|continue|all]` — 단일 진실의 원천 → 플랫폼 네이티브 설정
- `great-cto mcp` — MCP 서버 (stdio + SSE) 가 5개 도구를 모든 MCP 호스트에 노출
- `great-cto ci` — 단일 명령 CI gate (scan + archetype check + GitHub Actions annotations + SARIF + JUnit XML)
- `great-cto serve` — webhook receiver scaffolding

### v2.3.0 — 에이전트 워크포스 관리 (2026년 5월)
- `/agent-review [name]` — LLM 에이전트의 성능 스코어카드 (verdicts, cost, failure modes, 프롬프트 튜닝 제안)
- `/agent-retire <name>` — 에이전트의 우아한 폐기 (프롬프트 아카이브, sync list 제거, 감사용 verdicts 보존)
- `/cost feature <slug>` — 출시된 기능의 ROI (per-agent 분석 + 인간과 비교)
- 새로운 포지셔닝: GreatCTO 는 당신과 AI 에이전트 함대 사이의 관리 레이어

### v2.2.0 — 3개의 새 아키타입: edtech, gov-public, insurance (2026년 5월)
- `edtech` + `edtech-reviewer` — COPPA/FERPA/GDPR-K + WCAG 2.2 AA + 미국 주별 학생 프라이버시 법
- `gov-public` + `gov-reviewer` — FedRAMP, NIST 800-53, Section 508, PIA, CJIS, StateRAMP
- `insurance` + `insurance-reviewer` — NAIC 50주 신고, Solvency II, IFRS 17, ACORD, ASOP 41/56

### v2.1.0 — 내장 보안 스캐너 (2026년 5월)
- `npx great-cto scan ./` — OWASP LLM Top 10 + 24 규칙 + GitHub Code Scanning용 SARIF
- 5개 스캐너: prompt-injection · secrets-in-prompts · SSRF-in-tools · RAG poisoning · cost-runaway
- 독립 패키지 `@great-cto/agentshield`에서 통합 — 한 번 설치, 한 버전

### v1.2.0 — 지속 학습 루프 (2026년 5월)
- 새로운 `continuous-learner` 에이전트 (Haiku, ~$0.05/실행) 가 세션에서 패턴을 자동 추출
- 2계층 메모리: 프로젝트 로컬 `lessons.md` → 크로스 프로젝트 `~/.great_cto/decisions.md`
- 품질 게이트: 세션당 최대 3개 레슨, 아키타입 태그, 임계값 기반 승격 (≥3개의 다른 프로젝트)

### v1.1.0 — Claude Code 훅 (2026년 5월)
- 4개의 새 훅: `secret-scan` (PreToolUse) · `format-check` (PostToolUse) · `cost-guard` (UserPromptSubmit) · `session-end`
- 13개 패턴 시크릿 탐지 카탈로그 (AWS, Stripe, GitHub, OpenAI, Anthropic, PEM, JWT)
- 모든 훅은 `GREAT_CTO_DISABLE_<NAME>=1` 옵트아웃을 지원

[전체 변경 로그 →](../../CHANGELOG.md)

## great_cto란?

great_cto는 [Claude Code 플러그인](https://claude.com/plugins) 으로, 전체 SDLC 파이프라인을 **30개의 전문가 에이전트**로 실행합니다 — 아키텍트, 계획, 구현, 12각도 리뷰, QA, 보안, 배포, 지원 — 당신이 실제로 확인하는 보드를 통해 조율됩니다. 기능당 두 가지 결정만 내리고; 나머지는 모두 자동.

| 레이어 | 역할 |
|-------|------|
| **33개 전문가** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 아키타입** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **자동 감지** | `package.json`, `pyproject.toml`, `Cargo.toml`, README, 코드 구조 스캔 → 2초 안에 아키타입 + 컴플라이언스 게이트 선택. 신뢰도가 낮을 때 Anthropic Haiku 2차 의견 (~$0.001). |
| **컴플라이언스** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — 아키타입별로 자동 첨부. |
| **메모리** | 4개 레이어 — `PROJECT.md` (아키타입) · `lessons.md` (프로젝트별 회고) · `~/.great_cto/decisions.md` (모든 게이트 승인, 프로젝트 간 쿼리 가능) · `verdicts/` (모든 에이전트 판결). |
| **보드** | `great-cto board` 가 `localhost:3141` 에서 6개 뷰 열기 — Inbox · Kanban · Metrics · Agents · Memory · Public report. SSE 실시간 업데이트. |

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 컬럼, 인라인 게이트 승인, 실시간 SSE" width="900" />
</p>

## 기능당 두 가지 결정

```
당신:  /start "Stripe 구독 추가 — 월간 및 연간"

great_cto:
  → 아키타입: commerce | 규모: standard | ~45분
  → 컴플라이언스: pci-dss + gdpr (자동 첨부)
  → ARCH-stripe-subscriptions.md 준비됨  →  결정 1: 아키텍처 승인하시겠습니까?

당신: "승인"

  → senior-dev → 12각도 리뷰 → qa-engineer → security-officer → devops
  → 412 테스트 통과 · 0 high · canary 준비됨
  → 결정 2: 배포하시겠습니까?

당신: "배포"  →  canary 5% → 20% → 100%  →  RELEASE 문서 작성됨
```

## 빠른 설치

```bash
npx great-cto init
```

CLI가 저장소를 스캔하고, 올바른 아키타입을 선택하고, 컴플라이언스 게이트를 자동으로 연결합니다. 신규 또는 기존 프로젝트에서 작동. 이후 Claude Code를 재시작하세요.

**필요사항:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## 실제로 확인하는 보드

```bash
great-cto board   # localhost:3141
```

6개 뷰, 실제 스크린샷 — [greatcto.systems#board](https://greatcto.systems#board) 참조.

| 뷰 | 내용 |
|----|------|
| **Inbox** | 재개 카드 · 보류 결정 · 오픈 P0 · 차단 · 정체 (진행 중 > 48h) |
| **Kanban** | 5 컬럼 · 인라인 게이트 승인/거부 · 필터 바 · ⌘K 검색 · `j`/`k` 네비게이션 |
| **Metrics** | 히어로 카드 (속도, 비용, MTTR) · 30일 LLM 지출 차트 (예산 알림 포함) |
| **Agents** | 에이전트별 시간, LLM 비용, $150/시간 인간 등가 · 활동 피드 |
| **Memory** | 4 레이어 브라우저: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Public report** | 토글 → 추측 불가능한 URL (배포된 작업, AI vs 인간 비용 비교). 코드 없음, 자격 증명 없음. |

다중 프로젝트 스위처 — 하나의 보드, 모든 클라이언트.

## 매일 사용하는 세 가지 명령

| 명령 | 역할 |
|------|------|
| `/start "설명"` | 전체 SDLC 파이프라인 실행 — 아키타입 감지, 아키텍처 문서 생성, TDD로 구현, 리뷰, QA, 보안, 배포 |
| `/review` | 현재 브랜치에서 12개 독립 코드 리뷰 각도 |
| `/inbox` | 오픈 게이트, 차단된 작업, P0 인시던트, 보안 알림 — 지금 당신의 결정이 필요한 모든 것 |

나머지 (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) 는 자동 또는 필요시에만 실행. 전체 참조는 [`docs/COMMANDS.md`](../COMMANDS.md) 참조.

## 25 아키타입 자동 감지

각 아키타입은 자체 전문가 에이전트와 컴플라이언스 체크리스트를 활성화합니다.

| 아키타입 | 기본 티어 | 자동 로드되는 전문가 | 컴플라이언스 |
|---------|----------|---------------------|------------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |

언제든지 재정의: `npx great-cto init --archetype <name>` 또는 `.great_cto/PROJECT.md` 편집. 휴리스틱 신뢰도가 낮을 때 CLI는 Anthropic Haiku 2차 의견 (~$0.001)도 제공 — `ANTHROPIC_API_KEY` 설정으로 활성화, `--no-llm`으로 옵트아웃.

## 무엇이 다른가?

저희는 에디터가 아닙니다 — 에디터 주변에서 프로세스를 조율합니다. 원하시면 루프 내에서 Cursor, Copilot, Claude Code를 사용하세요.

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| 다중 에이전트 SDLC 파이프라인 | ✓ 33 전문가 | ✕ | ✕ | ✕ |
| 자동 아키타입 감지 | ✓ 25 타입 | ✕ | ✕ | ✕ |
| 컴플라이언스 게이트 (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| 영구 메모리 | ✓ decisions.md + verdicts | ⚠ 채팅만 | ✕ | ✓ 채팅 범위 |
| 다중 프로젝트 뷰 | ✓ | ✕ | ✕ | ⚠ |
| 12각도 코드 리뷰 | ✓ | ⚠ 단일 패스 | ⚠ 단일 패스 | ✕ |
| 공개 공유 리포트 | ✓ | ✕ | ✕ | ✕ |
| 오픈소스 | ✓ MIT | ✕ | ✕ | ✕ |
| 로컬 실행 | ✓ | ⚠ 부분 | ✕ | ✕ |
| 자체 API 결제 | ✓ | ✕ | ✕ | ✕ |
| **가격** | **$0 + 자체 API** | $20/월 | $39/월 | $20/월 |

## 비용

```
~$34/월 — 일반적인 제품 팀, 월 20회 파이프라인 실행, 참고용.
```

| 파이프라인 | 실행당 비용 | 월 실행 | 합계 |
|-----------|-----------|---------|------|
| quick (설정 / typo) | $0.10 | 10 | $1 |
| quick (새 엔드포인트) | $1 | 6 | $6 |
| standard (기능) | $5 | 3 | $15 |
| deep (횡단) | $12 | 1 | $12 |
| | | | **~$34** |

자체 Anthropic API 토큰으로 결제. **좌석당 비용 없음. SaaS 락인 없음.** 일상 triage는 Kimi K2 (Sonnet 동등, 약 5배 저렴)로 자동 라우팅 → 로그 클러스터링과 노이즈 스택 트레이스에서 60-80% 비용 절감.

## FAQ

**인터넷 연결 없이 작동합니까?**
에이전트 자체는 Claude Code 서브에이전트로 로컬에서 실행됩니다. Claude API 호출만 Anthropic에 도달합니다. 코드, 텔레메트리, 메모리는 다른 곳으로 전송되지 않습니다.

**제 소스 코드가 모델 학습에 사용됩니까?**
아닙니다. Claude API는 유료 고객에 대해 기본적으로 제로 보존입니다. great_cto는 아무것도 추가하지 않습니다 — 당신의 코드는 당신의 것입니다.

**이미 CI/CD가 있다면?**
great_cto는 CI *전*에 실행됩니다. 아키텍처, 리뷰, 사전 병합 단계에서 문제를 잡습니다. 둘 다 사용 — 보완적이며 경쟁하지 않습니다.

**Cursor / Copilot / Aider 지원?**
현재는 Claude Code만. `AGENTS.md` 기반 크로스 하네스 지원은 v2.x 로드맵에 있습니다.

**훅이 방해된다면 비활성화할 수 있나요?**
모든 훅은 `GREAT_CTO_DISABLE_<NAME>=1` 환경 변수를 존중합니다 (예: `GREAT_CTO_DISABLE_SECRET_SCAN=1`). 보안 스캔의 경우 `// agentshield:ignore`로 파일별 옵트아웃.

**토큰 비용을 어떻게 낮게 유지하나요?**
3 레이어 — (1) 저렴한 에이전트에 기본 Haiku, (2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md)로 triage (60-80% 절감), (3) `cost-guard` 훅이 비싼 프롬프트 전에 경고. `/cost`에서 실시간 지출 확인.

**제거 시 데이터는 어떻게 됩니까?**
플러그인 상태는 `~/.great_cto/` (전역 결정) 및 `.great_cto/` (프로젝트별)에 있습니다. 둘 다 일반 markdown — `rm -rf`로 모두 삭제. 인증 해제할 외부 서비스 없음.

**왜 자동 조종이 아닌가? 왜 "기능당 두 가지 결정"인가?**
LLM은 강력하지만 모호한 사양에서 제품 판단력을 잃습니다. gate:plan과 gate:ship에 인간을 두면 95% 비용을 차지하는 5%의 잘못된 결정을 잡습니다. [ADR-015 — 학습 루프 아키텍처](../architecture/ADR-015-learning-loop-architecture.md) 참조.

## 작성자

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder. AI 네이티브 트레이딩 및 fintech 플랫폼을 구축하는 CTO (0→1, 1→N). 기술이 PnL, 위험, 단위 경제에 직접 영향을 미치는 고부하 금융 시스템 전문.

## ⭐ 이 저장소에 별표

great_cto가 프로젝트에서 시간을 절약했다면 저장소에 별표를 — 다른 솔로 파운더와 소규모 팀이 찾는 데 도움이 됩니다.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 커뮤니티 및 지원

| 채널 | 내용 |
|------|------|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | 버그, 기능 요청, 아키타입 제안 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 질문, 패턴 공유, 쇼 & 텔 |
| 📝 [블로그](https://velikiy.hashnode.dev) | 아키텍처, 학습 루프, 비용 보정 심층 분석 |
| 🐦 [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) | 릴리스 노트, 기사, AI-CTO 시리즈 |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | 패키지 레지스트리 |
| 🔒 [Security](../../SECURITY.md) | 훅/스캐너 CVE의 책임 있는 공개 |

## 로드맵

- **v2.2** — 레슨 품질 텔레메트리
- **v2.3** — 자동 승격: 고영향 결정 → 재사용 가능한 스킬
- **v3.0** — 크로스 하네스 지원 (Cursor / Codex / OpenCode / Gemini용 `AGENTS.md`)

## 라이선스

MIT — [LICENSE](../../LICENSE) 참조.

---

<div align="center">

**[@avelikiy](https://github.com/avelikiy) · [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) 가 만들었습니다**
*유일하게 배포할 수 있는 사람이 되는 것을 그만두세요.*

</div>
