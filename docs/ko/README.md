<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**개발 워크플로를 실행하고, 근거를 검토하고, 출시할 것을 결정하세요.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다." width="900" />

*합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다. 3.70.1.*

```bash
npx great-cto init
```

[웹사이트](https://greatcto.systems) · [실제 실행 기록 →](https://greatcto.systems/proof) · [블로그](https://greatcto.systems/blog/) · [변경 이력](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 영어 [README](../../README.md) **v3.70.1**(2026-10-25) 번역본입니다.
> 내용이 다를 경우 영어판이 기준입니다.

---

great_cto는 명시적인 단계, 리뷰, 게이트를 통해 Claude Code의 네이티브 워크플로와 실험적인 제어형 Codex 실행을 조정합니다. 로컬 보드는 작업, 기록된 실행, 프로젝트 문서, 사용량을 연결합니다. 공개 카탈로그에는 **72**개 에이전트가 있지만 등록 자체가 실행이나 전문성을 입증하지는 않습니다. 근거가 없으면 미확인으로 남습니다. 병합, 릴리스, 배포에는 각각 증거와 승인이 필요합니다. 비용은 사용하는 제공자에 지불하며 MIT 라이선스의 great_cto 자체는 청구하지 않습니다.

**검증된 배포의 지원 범위(ADR-045):** 활성화하기 전에 서명된 아티팩트를 검증합니다. 일반적인 전역 npm 설치의 자체 업데이트는 독립적으로 진위를 확인하고 별도로 설정한 검증 도구와 해당 릴리스의 서명된 아티팩트 전체가 있을 때만 지원됩니다. 승인된 로컬 패키지는 오프라인에서 수명 주기 스크립트를 비활성화한 상태로 설치합니다. 소스 체크아웃이나 기존 플러그인 세션만으로는 검증된 업데이트를 입증할 수 없습니다.

현재 `init`, 네이티브 플러그인 업데이트, 추가 구성 요소의 자동 설치는 활성화를 거부합니다. `adapt`의 Codex 설정은 주석만 생성하며, 다운로드하거나 hooks 또는 MCP 실행 경로를 활성화하지 않습니다. macOS 업데이트 타이머를 새로 활성화하는 작업도 지원하지 않습니다. 기존 타이머는 명시적으로 승인된 마이그레이션이 이루어질 때까지 이전 캐시를 계속 실행합니다.

아래의 설치, 플러그인, 타이머 예제는 **LEGACY 3.70.1**의 절차입니다. 현재 사용할 수 있는 활성화 경로를 보장하지 않습니다. 자세한 내용은 [검증된 업데이트](../reference/verified-updates.md)를 참고하세요.

## 빠른 시작

```bash
npx great-cto init
```

Claude Code를 다시 시작하세요. 매일 쓰는 것은 세 가지입니다:

| | Claude Code에서 | 터미널에서 |
|---|---|---|
| **작업 시작** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **나를 기다리는 것** | `/inbox` | `great-cto status` |
| **계속하기** | `/resume` | `great-cto resume` |

`/start`는 새 제품이나 기존 프로젝트의 작업을 받아 워크플로를 스스로 고릅니다.
`/resume`은 이미 승인한 것만 이어 가며, 대기 중인 결정은 계속 당신을 기다립니다.
나머지 — `/review`, `/spec`, `/save`, `/digest` 등 — 는 필요할 때 쓰면 됩니다:
[전체 명령어](../COMMANDS.md).

## 프로젝트 하나, 화면 다섯 개

`great-cto board`로 로컬 보드를 엽니다. 기본 주소는 `localhost:3141`입니다.

| 화면 | 확인할 수 있는 내용 |
|---|---|
| **Work** | 작업, 인수 조건, 다음 지원 작업과 Overview, Execution, Evidence 탭 |
| **Decisions** | 대기 중인 결정과 기존 게이트 제어. 권한을 확대하지 않습니다 |
| **Knowledge** | 프로젝트 Markdown, ADR, Mermaid 소스 대체 표시를 지원하는 제한된 다이어그램 뷰어. 읽기 전용 |
| **Insights** | 기록된 결과, 프로젝트별 토큰, 추정치와 별도 예산 |
| **Settings** | Executors, Runtime, Capabilities, General |

`unverifiable`, `unmeasured`, `unavailable`은 검증 성공을 의미하지 않습니다.

Execution은 컨트롤러가 기록한 인과 그래프를 표시합니다. 네이티브 및 이전 세션은 부분적이거나 사용할 수 없는 상태로 남습니다. 누락된 연결은 추측하지 않습니다. 예제는 오프라인 스텁 응답이며 실제 모델 실행이 아닙니다. 다이어그램은 선언된 아키텍처를 설명합니다. 토큰과 비용은 품질 지표가 아닙니다. 문서는 원래 언어를 유지하고 UI는 영어입니다.

<details>
<summary>실행, 근거, 프로젝트 문서와 결과 보기</summary>

![Execution: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/execution.png)

![Evidence: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/evidence.png)

![Knowledge: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/knowledge.png)

![Insights: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/insights.png)

[캡처 계약](../reference/public-showcase.md).

</details>

## 핵심 역할 8개와 작업에 따른 전문가

| 책임 | 역할 |
|---|---|
| 문제와 인수 기준 | `product-owner` |
| 시스템 설계와 트레이드오프 | `architect` |
| 계획과 의존성 | `pm` |
| 구현 | `senior-dev` |
| 독립적인 코드 리뷰 | `code-reviewer` |
| 검증과 회귀 확인 | `qa-engineer` |
| 위험과 릴리스 게이트 | `security-officer` |
| 승인된 배포 | `devops` |

이는 책임 계약이며, 필수 모델 호출 8회나 에이전트 8개의 동시 실행을 뜻하지 않습니다. Project focus는 표시용 뷰입니다. 전문가를 제거하거나 디스패치를 바꾸거나 필수 검사를 면제하지 않습니다. 위험별 필수 리뷰어에는 여전히 프로젝트 정책이 적용됩니다.

## 집중된 엔지니어링 컨텍스트

버전이 관리되고 명시적으로 활성화하는 domain pack 후보 5개가 중점 영역 4개를 다룹니다.

| 영역 | 엔지니어링 불변 조건 | 경계 |
|---|---|---|
| **자금과 암호자산 실행** | 결제 멱등성, 결과가 불명확한 전송, 제한된 권한; 서명 경계, paper/live 분리, 체인 완결성 | 기술적으로 pack 2개이며 투자 수익률을 주장하지 않습니다 |
| **원격의료 워크플로** | 의료진 권한, 처방 상태 전이, 증거 무결성 | 임상적 유효성이나 인증을 주장하지 않습니다 |
| **벤처 증거** | 주장의 출처, 엔터티 계보, 미검증 주장 격리 | 투자 성과를 주장하지 않습니다 |
| **정신적 웰빙 안전성** | 대상자별 상태 격리, 위기 에스컬레이션 우선순위, 임상적 주장 경계 | 진단, 치료, 임상 검증과 별개의 범위입니다 |

Pack은 엔지니어링 컨텍스트를 추가합니다. 권한을 확대하거나 필수 리뷰어 라우팅을 바꾸지 않습니다. 존재 자체가 호출, 전문성, 더 나은 결과를 증명하지는 않습니다. 조건을 맞춘 core 단독과 core + pack 비교 실험에서 품질 향상은 입증되지 않았습니다. 프로젝트의 비공개 overlay는 공개 소개에 포함되지 않습니다.

## OpenAI Codex에서

| 모드 | 실행과 권한 |
|---|---|
| Claude Code native | 네이티브 명령, 전문 역할, hooks. 결정은 해당 호스트에 남습니다 |
| Controlled Codex / mixed-host (experimental) | 컨트롤러가 라우팅, 텍스트 제안, verifier, 명시적 게이트를 관리합니다 |
| Codex plugin session | Skills, MCP, 안전 hooks. 설치만으로 제어형 파이프라인이 자동 시작되지는 않습니다 |

`npx great-cto init --host codex`는 Codex에 스킬, MCP 서버, 여섯 개의 안전 훅을
제공합니다(한 번 승인: 터미널에서 `codex`를 실행하고 **Trust all and continue** 선택).
Codex에는 슬래시 명령이나 역할 에이전트를 위한 네이티브 플러그인 표면이 없으므로
파이프라인은 CLI로 실행합니다:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

업데이트는 기본적으로 명시적 작업입니다(`great-cto upgrade codex`). macOS에서 `sh scripts/codex-auto-update.sh enable`은 선택적 사용자 타이머를 활성화해 6시간마다 갱신합니다. `status`는 타이머를 확인하고 `disable`은 제거합니다. 매번 Git 원격 주소를 검증하며 npm 릴리스가 아닌 설정된 Git ref를 따릅니다. 변경된 훅은 새 세션에서 호스트의 승인이 필요합니다. 자세한 내용과 혼합 실행:
[Codex 호스트 가이드](../HOST-CODEX.md).

## 멈추는 시점

`.great_cto/PROJECT.md`의 한 줄로 정합니다:

| `approval-level` | 멈추는 곳 | 횟수 |
|---|---|---|
| **`ship-only`** | **배포 — 무엇을 만드는지 브리프와 함께** | **1** |
| `product-only` | 무엇을 만들지 · 출시할지 | 2 |
| `gates-only` *(기본값)* | 무엇을 만들지 · 설계 · 배포 | 3 |
| `strict` | 설계 · 코드 리뷰 · 배포 | 3 |
| `auto` | 파이프라인에서 멈추지 않음 | 0 |

규제 대상 제품 — 핀테크, 의료, 공공 — 은 모든 단계에서 보안, 컴플라이언스, 출시
게이트를 유지합니다. [게이트 작동 방식](../GATES.md).

## 측정된 숫자

| | |
|---|---|
| 기능 하나를 처음부터 끝까지, 전체 추적 | **1h 26m · $3.40** — [증빙](https://greatcto.systems/proof) |
| 제품 하나 전체 — 공개 벤치마크에서 7개 구축 | 중앙값 **$171** · **70/100**, **2026-07-10** — [재현하기](../benchmarks/BENCH-2026-07-batch1.md) |

이 수치는 과거 관측이며 현재의 두 호스트 파이프라인이나 domain packs 벤치마크가 아닙니다. 품질 향상 비율은 입증되지 않았습니다. Domain packs는 계속 opt-in이며 존재 자체가 전문성이나 더 나은 결과를 입증하지 않습니다.

## 한계

한 명의 빌더용이며 팀용이 아닙니다; 호스팅형 앱 빌더가 아닙니다 — 당신의 코딩
에이전트가 필요합니다; CI/CD 시스템이 아닙니다; 컴플라이언스 템플릿은 출발점이지
인증이 아닙니다; LLM 출력은 결정적이지 않습니다. 각 항목의 정직한 설명과 주장하지
않는 것: [docs/DETAILS.md](../DETAILS.md).

## 더 알아보기

[문서](../README.md) · [시작하기](../tutorials/getting-started.md) ·
[명령어](../COMMANDS.md) · [게이트](../GATES.md) · [에이전트](../reference/agents.md) ·
[FAQ](../FAQ.md) · [그 밖의 모든 것](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [보안](../../SECURITY.md) ·
[기여하기](../../CONTRIBUTING.md) · [개인정보 — 텔레메트리는 기본적으로 꺼져 있음](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE). 만든 사람 [@avelikiy](https://github.com/avelikiy).
시간을 아껴 주었다면, 별 하나가 다른 1인 개발자들이 찾는 데 도움이 됩니다.
