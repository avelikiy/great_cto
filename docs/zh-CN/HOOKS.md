# 钩子 (Hooks)

> **语言:** [English](../HOOKS.md) · [Русский](../ru/HOOKS.md) · **简体中文** · [繁體中文](../zh-TW/HOOKS.md) · [日本語](../ja/HOOKS.md) · [한국어](../ko/HOOKS.md) · [Español](../es/HOOKS.md) · [Português (BR)](../pt-BR/HOOKS.md)
>
> ⚠️ 此为机器翻译摘要。完整详情和 ADR 链接请参见 [English original](../HOOKS.md).

great_cto 使用 [Claude Code 钩子](https://docs.anthropic.com/en/docs/claude-code/hooks) 来自动执行策略并捕获状态。

## 已连接的钩子

| 事件 | Matcher | 钩子 | 作用 |
|---|---|---|---|
| `SessionStart` | — | inline | 加载 PROJECT.md, 同步 agents/commands |
| `SessionEnd` | — | `session-end.mjs` | 写入会话快照到 `.great_cto/logs/` |
| `PreToolUse` | `Bash` | inline | 阻止危险 bash (rm -rf, force push, DROP TABLE) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | 阻止包含硬编码 API 密钥的写入 |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `format-check.mjs` | 按扩展名自动格式化 |
| `UserPromptSubmit` | — | `cost-guard.mjs` | 在昂贵 prompt 前警告 |
| `PreCompact` | — | inline | 在上下文压缩前保存 HANDOFF.md |
| `SubagentStart` | — | inline | 向子代理注入项目上下文 |
| `PermissionDenied` | — | inline | 记录拒绝以便诊断 |

## 关键钩子

### `secret-scan.mjs`
扫描 AWS / Stripe / GitHub PAT / OpenAI / Anthropic / PEM / JWT 密钥。检测到则**阻止** tool 调用 (exit 2)。
- 跳过路径: `tests/`, `fixtures/`, `*.test.*`, `.example`, etc.
- Opt-out: `export GREAT_CTO_DISABLE_SECRET_SCAN=1` 或文件中加 `// great_cto:allow-secrets` 注释

### `format-check.mjs`
使用 prettier (JS/TS/MD/YAML/JSON), ruff/black (Python), gofmt (Go), rustfmt (Rust) 自动格式化。失败不阻塞。
- Opt-out: `export GREAT_CTO_DISABLE_FORMAT=1`

### `cost-guard.mjs`
在触发昂贵操作 (`/start`, `/audit`, 大型重构) 时打印成本估算到 stderr。读取 `PROJECT.md` 中的 `cost-cap-usd-month` 和 `cost-history.log`。仅信息性 — 不阻塞。
- Opt-out: `export GREAT_CTO_DISABLE_COST_GUARD=1`

### `session-end.mjs`
会话结束时捕获快照: git 状态, Beads 任务, 最近成本日志。Phase 2 (v1.2.0) 还会触发 continuous-learner 代理。
- Opt-out: `export GREAT_CTO_DISABLE_SESSION_LEARNING=1`

## 全局禁用

```bash
# 在 Claude Code 中:
/plugin disable great_cto

# 或主开关 (所有 .mjs 钩子尊重此变量):
export GREAT_CTO_DISABLE_HOOKS=1
```

## 测试

```bash
node --test tests/hooks/*.test.mjs

# 测试单个钩子:
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"..."}}' \
  | node scripts/hooks/secret-scan.mjs
```

## 架构

- **ADR-013** — 钩子执行模型
- **ADR-014** — 密钥检测模式

完整文档 (添加自定义钩子, 约定, 高级测试) 请参见 [English HOOKS.md](../HOOKS.md)。
