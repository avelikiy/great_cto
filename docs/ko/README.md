<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**제품을 설명하세요. 세 가지를 승인하세요. URL을 여세요.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[웹사이트](https://greatcto.systems) · [실제 실행 기록 →](https://greatcto.systems/proof) · [라이브 데모](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [블로그](https://greatcto.systems/blog/) · [변경 이력](../../CHANGELOG.md)

</div>

> 이 문서는 영어 [README](../../README.md)의 **v2.90.0**(2026-07-30) 시점 번역입니다.
> 차이가 있을 경우 영어판이 기준입니다.

---

great_cto는 **이미 사용 중인 코딩 에이전트 위에 놓이는 오케스트레이션 레이어**입니다.
**69개의 전문 에이전트** — architect, design-advisor, senior-dev, code-reviewer,
QA, security, devops — 로 이루어진 파이프라인이 실제 애플리케이션을 계획·구축·
리뷰·배포합니다: 백엔드, 프런트엔드, 생성된 테스트, 라이브 URL까지.

당신을 멈춰 세우는 것은 정확히 두 번입니다. **무엇을 만들지**에서 한 번,
**배포할지**에서 한 번. 그 사이의 모든 것은 무인으로 진행됩니다.

```
   제품을 설명
        │
   🤖  스펙 · 아키텍처 · 데이터 모델 · 화면
        ▼
   👤  체크포인트 1 — 무엇을 만들지 승인
        │
   🤖  architecture · data model · screens
        ▼
   👤  체크포인트 2 — 어떻게 만들지 승인
        │
   🤖  스캐폴드 → 백엔드 → 프런트엔드 → 테스트 → 리뷰 → 보안
        ▼
   👤  체크포인트 3 — 배포 승인
        │
   🤖  배포 완료 · 저장소 · 라이브 URL
```

<p align="center">
  <img src="../screenshots/board.png" alt="빌드 보드 — 라이브 파이프라인, 게이트, 에이전트별 비용" width="900" />
</p>

`localhost:3141`의 보드는 스스로 채워집니다 — 파이프라인 상태, 대기 중인 게이트,
에이전트별 비용, 30일 지출. 먹이를 줄 필요 없이 확인만 하면 됩니다.

## 측정된 숫자

| | |
|---|---|
| 기능 1건, 엔드투엔드, 전체 추적 가능 | **1h 26m · $3.40** 토큰 비용 — [영수증](https://greatcto.systems/proof) |
| 완제품 — 공개 벤치마크에서 7개 구축 | 중앙값 **$171** 토큰 비용 · 품질 **70/100**(58–86) — [직접 재현](../benchmarks/BENCH-2026-07-batch1.md) |
| 일반적인 한 달, 파이프라인 20회 실행 | **~$34** — 지불 대상은 본인의 LLM 제공사뿐 |
| 구축 가능한 제품 | **60**종, 미국 15개 산업, [재사용 가능한 6개 파이프라인](https://greatcto.systems/pipelines) 경유 |

품질 점수는 각 제품 자체의 테스트를 실행해 산출합니다. 파일 개수를 세는 것이
아니라 — 그래서 더 둥글고 예쁜 숫자가 아니라 70인 것입니다.

## 빠른 시작

```bash
npx great-cto init            # Claude Code(기본값) · OpenAI Codex는 --host codex
```

AI 호스트를 재시작한 뒤:

```bash
/start "HVAC 업체용 배차·예약 앱을 만들어 줘"
```

이후는 파이프라인이 이어받습니다. 일상적으로 만지는 것은 세 가지뿐입니다:

| | |
|---|---|
| `/start "…"` | 제품이나 기능을 설명 — 파이프라인이 실행 |
| `/inbox` | 당신을 기다리는 것: 게이트, P0, 블로킹된 작업 |
| `/digest` | 주간 DORA 지표 + 기능당 비용 요약 |

Node ≥ 18.17 필요. 동반 플러그인(Superpowers, Beads)은 자동 설치됩니다. init
후 호스트가 플러그인을 실제로 로드했는지 확인하세요: `claude plugin list
--json`에서 `great_cto`의 `errors`가 비어 있어야 합니다.

## 언제 물어보는가

`.great_cto/PROJECT.md`의 설정 하나가 파이프라인이 멈추는 위치를 결정합니다:

| `approval-level` | 멈추는 곳 | 기능당 |
|---|---|---|
| `product-only` | 무엇을 만들지 · 배포할지 | 2 |
| `gates-only` *(기본값)* | 설계 · 배포 | 2 |
| `strict` | + 코드 리뷰 | 3 |
| `auto` | 없음 | 0 |

규제 대상 아키타입 — 핀테크, 헬스케어, 공공 — 은 **`auto`를 포함한 모든
레벨에서** 보안·컴플라이언스·배포 게이트를 유지합니다. 가벼운 레벨은 판단의
위임이지 컴플라이언스 우회가 아닙니다. 전체 표: [docs/GATES.md](../GATES.md).

## 무엇이 다른가

- **제너럴리스트가 아닌 스페셜리스트** — 좁은 역할과 자체 리뷰 게이트를 가진
  69개 에이전트. 생각보다 타이핑이 빠른 어시스턴트 하나가 아니라.
  [명단 →](../reference/agents.md)
- **코드 전에 비평가** — 아키텍처·스펙·스키마 비평가가 계획 전에 실행됩니다.
  실수의 수정 비용이 아직 며칠이 아니라 몇 시간일 때.
- **쓰기 시점에 범위 강제** — 에이전트는 담당 밖의 파일을 물리적으로 건드릴 수
  없습니다. 리뷰에서 지적이 아니라 쓰기에서 거부.
- **자신을 의심하는 QA** — 핵심 경로를 먼저 Gherkin으로 쓰고 그다음 테스트
  코드를 작성한 뒤, 뮤테이션 테스트가 묻습니다: 이 스위트가 뭐라도 잡아낼 수
  있는가.
- **세션을 넘는 기억** — 결정·교훈·승격된 패턴이 프로젝트별·전역으로 유지되고,
  중단된 빌드는 어떤 단계가 끝났는지 알고 재개합니다.
- **보이는 비용** — 에이전트별 지출, 견적 대비 실제의 편차, 승인된 변경당
  비용이 스프레드시트가 아닌 보드에 있습니다.

모든 것이 로컬에서, MIT 라이선스로, 본인의 키로 동작합니다. 코드는 당신의
머신에 남고, 프롬프트는 당신의 LLM 제공사에게만 갑니다. 텔레메트리는
**기본적으로 꺼져 있습니다**([docs/PRIVACY.md](../PRIVACY.md)).

## 한계

- **1인 빌더용** — 솔로 창업자나 CTO. 엔지니어 둘 이상이 파이프라인을 공유하면
  이 도구를 벗어난 것입니다.
- **CI/CD가 아님** — 게이트는 로컬 실행. 머지는 여전히 GitHub Actions.
- **인증 감사가 아님** — PCI/HIPAA/SOC2 스캐폴드는 출발점이지 인증이 아닙니다.
- **결정적이지 않음** — LLM 출력. 게이트 판정은 사람의 확인을 받을 가치가
  있습니다.

## 문서

**[문서 허브 →](../README.md)** ·
[시작하기](../tutorials/getting-started.md) ·
[게이트와 승인 레벨](../GATES.md) ·
[에이전트](../reference/agents.md) · [커맨드](../reference/commands.md) ·
[아키타입](../ARCHETYPES.md) · [아키텍처](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[그 밖의 모든 것](../DETAILS.md) — 비평가, 관할권, 비용 내역, CI, 알림

## 커뮤니티

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[블로그](https://greatcto.systems/blog/) ·
[보안 정책](../../SECURITY.md) · [기여하기](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE). 만든 이 [@avelikiy](https://github.com/avelikiy):
AI 네이티브 트레이딩·핀테크 플랫폼을 만드는 CTO. great_cto는 제 자신의 루프를
에이전트 하나씩 자동화한 결과물입니다.

시간을 아꼈다면, 별 하나가 다른 솔로 빌더들이 이 도구를 찾는 데 도움이 됩니다.

<div align="center">

*배포할 줄 아는 유일한 사람이기를 그만두세요.*

</div>
