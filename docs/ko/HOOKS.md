# 훅 (Hooks)

> **언어:** [English](../HOOKS.md) · [Русский](../ru/HOOKS.md) · [简体中文](../zh-CN/HOOKS.md) · [日本語](../ja/HOOKS.md) · **한국어** · [Español](../es/HOOKS.md)
>
> ⚠️ 기계 번역 요약입니다. 전체 세부 정보 및 ADR 링크는 [English original](../HOOKS.md) 참조.

great_cto는 [Claude Code 훅](https://docs.anthropic.com/en/docs/claude-code/hooks)을 사용하여 정책을 자동으로 적용하고 상태를 캡처합니다.

## 연결된 훅

| 이벤트 | Matcher | 훅 | 역할 |
|---|---|---|---|
| `SessionStart` | — | inline | PROJECT.md 로드, agents/commands 동기화 |
| `SessionEnd` | — | `session-end.mjs` | 세션 스냅샷을 `.great_cto/logs/`에 작성 |
| `PreToolUse` | `Bash` | inline | 위험한 bash 차단 (rm -rf, force push, DROP TABLE) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | 하드코딩된 API 키가 포함된 쓰기 차단 |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `format-check.mjs` | 확장자별 자동 포맷팅 |
| `UserPromptSubmit` | — | `cost-guard.mjs` | 비싼 프롬프트 전 경고 |
| `PreCompact` | — | inline | 컨텍스트 압축 전 HANDOFF.md 저장 |
| `SubagentStart` | — | inline | 서브에이전트에 프로젝트 컨텍스트 주입 |
| `PermissionDenied` | — | inline | 거부 로그 |

## 주요 훅

### `secret-scan.mjs`
AWS / Stripe / GitHub PAT / OpenAI / Anthropic / PEM / JWT 키 탐지. 탐지 시 tool 호출을 **차단** (exit 2).
- 스킵 경로: `tests/`, `fixtures/`, `*.test.*`, `.example` 등
- Opt-out: `export GREAT_CTO_DISABLE_SECRET_SCAN=1` 또는 파일에 `// great_cto:allow-secrets` 주석

### `format-check.mjs`
prettier (JS/TS/MD/YAML/JSON), ruff/black (Python), gofmt (Go), rustfmt (Rust)로 자동 포맷팅. 실패해도 차단하지 않음.
- Opt-out: `export GREAT_CTO_DISABLE_FORMAT=1`

### `cost-guard.mjs`
비싼 작업 (`/start`, `/audit`, 큰 리팩토링) 트리거 시 stderr에 비용 추정치 출력. `PROJECT.md`의 `cost-cap-usd-month`와 `cost-history.log`를 읽음. 정보용 — 차단하지 않음.
- Opt-out: `export GREAT_CTO_DISABLE_COST_GUARD=1`

### `session-end.mjs`
세션 종료 시 스냅샷 캡처: git 상태, Beads 작업, 최근 비용 로그. Phase 2 (v1.2.0)에서는 continuous-learner 에이전트도 트리거.
- Opt-out: `export GREAT_CTO_DISABLE_SESSION_LEARNING=1`

## 전체 비활성화

```bash
# Claude Code 내:
/plugin disable great_cto

# 또는 마스터 스위치 (모든 .mjs 훅 존중):
export GREAT_CTO_DISABLE_HOOKS=1
```

## 테스트

```bash
node --test tests/hooks/*.test.mjs

# 단일 훅 테스트:
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"..."}}' \
  | node scripts/hooks/secret-scan.mjs
```

## 아키텍처

- **ADR-013** — 훅 실행 모델
- **ADR-014** — 시크릿 탐지 패턴

전체 문서 (커스텀 훅 추가, 규칙, 고급 테스트)는 [English HOOKS.md](../HOOKS.md) 참조.
