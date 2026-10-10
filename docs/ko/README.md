<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**이미 쓰고 있는 코딩 에이전트로 제품을 출시하세요.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[웹사이트](https://greatcto.systems) · [실제 실행 기록 →](https://greatcto.systems/proof) · [블로그](https://greatcto.systems/blog/) · [변경 이력](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 영어 [README](../../README.md) **v3.48.0**(2026-10-02) 번역본입니다.
> 내용이 다를 경우 영어판이 기준입니다.

---

**코딩 에이전트는 코드를 내보냅니다. 이것은 그 코드를 검증합니다.**

제품이나 기능을 설명하세요. 좁은 역할을 맡은 **72 agents**가 브리프, 아키텍처,
빌드, 리뷰, 보안까지 진행하고, 다른 계열의 두 번째 모델이 같은 diff를 읽습니다.
무엇을 만들지, 어떻게 만들지, 출시할지 — 세 가지 결정은 당신에게 남고, 결과물은
**당신 소유의 저장소**와 **작동하는 URL**입니다. LLM 제공자 비용은 직접 지불하며,
great_cto는 MIT이고 아무것도 청구하지 않습니다.

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

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

`localhost:3141`의 보드는 **Work**로 열립니다 — 당신의 작업, 당신을 기다리는 결정,
이미 출시된 것. 비용, 에이전트, 리뷰어는 **Tools**에 있습니다. 부재를 성공처럼
보여 주는 일은 없습니다: 판단하지 못한 검사는 `unverifiable`, 측정되지 않은 비용은
`unmeasured`, 실행되지 못한 리뷰어는 `unavailable`로 표시됩니다.

## OpenAI Codex에서

`npx great-cto init --host codex`는 Codex에 스킬, MCP 서버, 여섯 개의 안전 훅을
제공합니다(한 번 승인: 터미널에서 `codex`를 실행하고 **Trust all and continue** 선택).
Codex에는 슬래시 명령이나 역할 에이전트를 위한 네이티브 플러그인 표면이 없으므로
파이프라인은 CLI로 실행합니다:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Codex는 플러그인을 스스로 업데이트하지 않습니다 — `great-cto upgrade`가 합니다.
자세한 내용, Claude + Codex 혼합 실행, 두 번째 리뷰어로서의 Codex:
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
| 제품 하나 전체 — 공개 벤치마크에서 7개 구축 | **$171** · **70/100**, **2026-07-10** — [재현하기](../benchmarks/BENCH-2026-07-batch1.md) |
| 일반적인 한 달, 20회 실행 | **~$34** — LLM 제공자 비용만 지불 |

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
