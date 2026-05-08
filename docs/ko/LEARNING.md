# 지속 학습 (Continuous Learning)

> **언어:** [English](../LEARNING.md) · [Русский](../ru/LEARNING.md) · [简体中文](../zh-CN/LEARNING.md) · [日本語](../ja/LEARNING.md) · **한국어** · [Español](../es/LEARNING.md)
>
> ⚠️ 기계 번역 요약입니다. 전체 세부 정보 및 ADR 링크는 [English original](../LEARNING.md) 참조.

great_cto v1.2.0은 각 세션에서 패턴을 자동 추출하고 미래 세션에서 재사용하는 **2계층 학습 루프**를 추가했습니다.

## 파이프라인

```
세션 종료 → SessionEnd 훅이 스냅샷 + 프로젝트 등록
        → continuous-learner 에이전트가 transcript + git + verdicts 읽기
        → 세션당 ≤3 레슨 추출 → .great_cto/lessons.md (프로젝트 로컬)
        → lessons-merge.mjs: ≥3 프로젝트의 패턴 → ~/.great_cto/decisions.md (크로스 프로젝트)
        → 다음 세션: architect, pm, senior-dev가 시작 시 두 파일 읽음
```

## 2계층 메모리

| 파일 | 범위 | 승격 기준 | 읽는 사람 |
|---|---|---|---|
| `.great_cto/lessons.md` | 프로젝트 로컬 | continuous-learner의 품질 게이트 | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | 이 머신의 모든 프로젝트 | ≥3개의 다른 프로젝트의 패턴 | architect, pm, senior-dev |

## 캡처 대상

5가지 패턴 형태, 각각 엄격한 품질 게이트:

| 형태 | 소스 신호 | 예 |
|---|---|---|
| **A. 리뷰어가 발견** | agent-verdicts의 Critical/High 발견 | "PCI 리뷰어가 3개 fintech 프로젝트에서 webhook 서명 누락 발견" |
| **B. 비용 이상치** | 에이전트 호출이 평균 대비 2x+ | "Architect는 solo fintech에서 3x 비쌈 — $8 사전 할당" |
| **C. 반복 실수** | 동일 fix가 ≥2 commits | "3개 컴포넌트에서 `useEffect` cleanup 리팩토링" |
| **D. Discovery 누락** | 구현 중 아키텍트 가정이 뒤집힘 | "US-only로 가정; 실제로는 EU-required" |
| **E. 도구/라이브러리 결정** | 측정 가능한 결과를 가진 ADR | "mlops에 Prisma 대신 Drizzle 선택 — 40% 번들 감소" |

continuous-learner는 이러한 형태에 맞지 않는 것을 **거부** — 침묵 > 잡음.

## 품질 게이트

다음 중 하나라도 참이면 후보 레슨이 **거부**됨:
- 1개 프로젝트의 1개 특정 파일에만 적용 (너무 좁음)
- 사용자 선호 캡처, 전송 가능한 패턴 아님
- 명백한 모범 사례 재진술
- 구체적인 증거 없음 (sha, file:line, 비용 숫자)
- PII, 시크릿, 비즈니스 기밀 용어 포함
- Pattern slug가 이미 lessons.md에 있음 (중복 제거)
- 측정 가능한 결과가 없는 주관적인 것

## 개인정보 보호

**기본 로컬, 옵트인 글로벌.** Learner는 당신의 머신에서 실행; lessons.md 및 decisions.md는 디스크를 떠나지 않습니다.

Learner가 캡처하지 **말아야 할** 것 (agent prompt로 강제):
- API 키, 토큰, 비밀번호, JWT
- 이메일, 전화, 이름
- 내부 코드네임, 비즈니스 기밀 용어
- 고객/사용자 ID 또는 `.env*` 데이터
- 소스 코드 내용 (file:line 참조만)

전체 개인정보 규칙은 **ADR-016** 참조.

## 구성

```bash
# 세션 종료 캡처 완전 비활성화
export GREAT_CTO_DISABLE_SESSION_LEARNING=1

# 수동 트리거
/learn              # 현재 세션에서 레슨 추출
/learn cost         # 비용 이상치에 집중 (shape B)
/learn security     # 리뷰어 발견에 집중 (shape A)
/learn architecture # 도구/라이브러리 결정에 집중 (shape E)

# 상태 검사
cat .great_cto/lessons.md
cat ~/.great_cto/decisions.md
ls ~/.great_cto/projects/

# 강제 재집계
node scripts/lessons-merge.mjs
node scripts/lessons-merge.mjs --dry-run
node scripts/lessons-merge.mjs --force

# 리셋
rm .great_cto/lessons.md
rm -rf ~/.great_cto/{decisions.md,projects/}
```

## 에이전트의 레슨 사용

3개 에이전트가 세션 시작 시 lessons.md + decisions.md 읽음:
- **Architect** — 아키텍처 결정 전 과거 레슨 상담; 현재 아키타입으로 필터링
- **PM** — 추정 전 비용 이상치 레슨에 대해 보정 (shape B)
- **Senior-dev** — 작업 청구 전 알려진 반패턴 스캔; commit에 인용

## 로드맵

- **v1.2.0** — continuous-learner + lessons-merge + 에이전트 통합
- **v1.3.0** — Telemetry: 에이전트가 실제 인용 vs 무시하는 레슨 추적
- **v1.4.0** — 자동 승격: 고영향 결정 → 재사용 가능한 스킬

## 참조

- **ADR-015** — 학습 루프 아키텍처
- **ADR-016** — 개인정보 보호
- **ADR-017** — 스킬 후보 승격 기준
- `agents/continuous-learner.md` — 에이전트 자체
- `scripts/lessons-merge.mjs` — 크로스 프로젝트 승격 스크립트
- `commands/learn.md` — 수동 트리거

전체 문서는 [English LEARNING.md](../LEARNING.md) 참조.
