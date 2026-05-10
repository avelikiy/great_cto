# 鉤子 (Hooks)

> **語言:** [English](../HOOKS.md) · [Русский](../ru/HOOKS.md) · [简体中文](../zh-CN/HOOKS.md) · **繁體中文** · [日本語](../ja/HOOKS.md) · [한국어](../ko/HOOKS.md) · [Español](../es/HOOKS.md) · [Português (BR)](../pt-BR/HOOKS.md)
>
> ⚠️ 此為機器翻譯摘要。完整詳情和 ADR 連結請參見 [English original](../HOOKS.md).

great_cto 使用 [Claude Code 鉤子](https://docs.anthropic.com/en/docs/claude-code/hooks) 來自動執行政策並擷取狀態。

## 已連線的鉤子

| 事件 | Matcher | 鉤子 | 作用 |
|---|---|---|---|
| `SessionStart` | — | inline | 載入 PROJECT.md, 同步 agents/commands |
| `SessionEnd` | — | `session-end.mjs` | 寫入會話快照到 `.great_cto/logs/` |
| `PreToolUse` | `Bash` | inline | 阻擋危險 bash (rm -rf, force push, DROP TABLE) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | 阻擋包含硬編碼 API 金鑰的寫入 |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `format-check.mjs` | 按副檔名自動格式化 |
| `UserPromptSubmit` | — | `cost-guard.mjs` | 在昂貴 prompt 前警告 |
| `PreCompact` | — | inline | 在上下文壓縮前儲存 HANDOFF.md |
| `SubagentStart` | — | inline | 向子代理注入專案上下文 |
| `PermissionDenied` | — | inline | 記錄拒絕以便診斷 |

## 關鍵鉤子

### `secret-scan.mjs`
掃描 AWS / Stripe / GitHub PAT / OpenAI / Anthropic / PEM / JWT 金鑰。偵測到則**阻擋** tool 呼叫 (exit 2)。
- 跳過路徑: `tests/`, `fixtures/`, `*.test.*`, `.example`, etc.
- Opt-out: `export GREAT_CTO_DISABLE_SECRET_SCAN=1` 或檔案中加 `// great_cto:allow-secrets` 註解

### `format-check.mjs`
使用 prettier (JS/TS/MD/YAML/JSON), ruff/black (Python), gofmt (Go), rustfmt (Rust) 自動格式化。失敗不阻塞。
- Opt-out: `export GREAT_CTO_DISABLE_FORMAT=1`

### `cost-guard.mjs`
在觸發昂貴操作 (`/start`, `/audit`, 大型重構) 時列印成本估算到 stderr。讀取 `PROJECT.md` 中的 `cost-cap-usd-month` 和 `cost-history.log`。僅資訊性 — 不阻塞。
- Opt-out: `export GREAT_CTO_DISABLE_COST_GUARD=1`

### `session-end.mjs`
會話結束時擷取快照: git 狀態, Beads 任務, 最近成本日誌。Phase 2 (v1.2.0) 還會觸發 continuous-learner 代理。
- Opt-out: `export GREAT_CTO_DISABLE_SESSION_LEARNING=1`

## 全域停用

```bash
# 在 Claude Code 中:
/plugin disable great_cto

# 或主開關 (所有 .mjs 鉤子尊重此變數):
export GREAT_CTO_DISABLE_HOOKS=1
```

## 測試

```bash
node --test tests/hooks/*.test.mjs

# 測試單個鉤子:
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"..."}}' \
  | node scripts/hooks/secret-scan.mjs
```

## 架構

- **ADR-013** — 鉤子執行模型
- **ADR-014** — 金鑰偵測模式

完整文件 (新增自訂鉤子, 約定, 高級測試) 請參見 [English HOOKS.md](../HOOKS.md)。
