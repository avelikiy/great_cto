<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**개발 워크플로를 실행하고, 근거를 검토하고, 출시할 것을 결정하세요.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다." width="900" />

*합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다. 3.69.0.*

```bash
npx great-cto init
```

[웹사이트](https://greatcto.systems) · [실제 실행 기록 →](https://greatcto.systems/proof) · [블로그](https://greatcto.systems/blog/) · [변경 이력](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 영어 [README](../../README.md) **v3.69.0**(2026-10-23) 번역본입니다.
> 내용이 다를 경우 영어판이 기준입니다.

---

great_cto는 명시적인 단계, 리뷰, 게이트를 통해 Claude Code의 네이티브 워크플로와 실험적인 제어형 Codex 실행을 조정합니다. 로컬 보드는 작업, 기록된 실행, 프로젝트 문서, 사용량을 연결합니다. 공개 카탈로그에는 **72**개 에이전트가 있지만 등록 자체가 실행이나 전문성을 입증하지는 않습니다. 근거가 없으면 미확인으로 남습니다. 병합, 릴리스, 배포에는 각각 증거와 승인이 필요합니다. 비용은 사용하는 제공자에 지불하며 MIT 라이선스의 great_cto 자체는 청구하지 않습니다.

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

Execution은 기록된 시도를 보여 주며 인과 그래프나 실시간 터미널이 아닙니다. 다이어그램은 선언된 아키텍처를 설명합니다. 토큰과 비용은 품질 지표가 아닙니다. 문서는 원래 언어를 유지하고 UI는 영어입니다.

<details>
<summary>실행, 근거, 프로젝트 문서와 결과 보기</summary>

![Execution: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/execution.png)

![Evidence: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/evidence.png)

![Knowledge: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/knowledge.png)

![Insights: 합성 데이터를 사용한 예제 프로젝트이며 실제 모델 벤치마크가 아닙니다.](../screenshots/insights.png)

[캡처 계약](../reference/public-showcase.md).

</details>

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
