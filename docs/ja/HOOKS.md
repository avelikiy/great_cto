# フック (Hooks)

> **言語:** [English](../HOOKS.md) · [Русский](../ru/HOOKS.md) · [简体中文](../zh-CN/HOOKS.md) · **日本語** · [한국어](../ko/HOOKS.md) · [Español](../es/HOOKS.md)
>
> ⚠️ 機械翻訳の要約です。完全な詳細と ADR リンクは [English original](../HOOKS.md) を参照。

great_cto は [Claude Code フック](https://docs.anthropic.com/en/docs/claude-code/hooks) を使用してポリシーを自動的に適用し、状態をキャプチャします。

## 接続されているフック

| イベント | Matcher | フック | 役割 |
|---|---|---|---|
| `SessionStart` | — | inline | PROJECT.md ロード、agents/commands 同期 |
| `SessionEnd` | — | `session-end.mjs` | セッションスナップショットを `.great_cto/logs/` に書き込み |
| `PreToolUse` | `Bash` | inline | 危険な bash をブロック (rm -rf, force push, DROP TABLE) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | ハードコード API キーの書き込みをブロック |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `format-check.mjs` | 拡張子別自動フォーマット |
| `UserPromptSubmit` | — | `cost-guard.mjs` | 高コストプロンプト前に警告 |
| `PreCompact` | — | inline | コンテキスト圧縮前に HANDOFF.md 保存 |
| `SubagentStart` | — | inline | サブエージェントにプロジェクトコンテキスト注入 |
| `PermissionDenied` | — | inline | 拒否のログ |

## 主要フック

### `secret-scan.mjs`
AWS / Stripe / GitHub PAT / OpenAI / Anthropic / PEM / JWT を検出。検出時は tool 呼び出しを**ブロック** (exit 2)。
- スキップパス: `tests/`, `fixtures/`, `*.test.*`, `.example` など
- Opt-out: `export GREAT_CTO_DISABLE_SECRET_SCAN=1` またはファイルに `// great_cto:allow-secrets` コメント

### `format-check.mjs`
prettier (JS/TS/MD/YAML/JSON), ruff/black (Python), gofmt (Go), rustfmt (Rust) で自動フォーマット。失敗してもブロックしない。
- Opt-out: `export GREAT_CTO_DISABLE_FORMAT=1`

### `cost-guard.mjs`
高コスト操作 (`/start`, `/audit`, 大規模リファクタ) のトリガー時に stderr へコスト見積もりを出力。`PROJECT.md` の `cost-cap-usd-month` と `cost-history.log` を読み取り。情報のみ — ブロックしない。
- Opt-out: `export GREAT_CTO_DISABLE_COST_GUARD=1`

### `session-end.mjs`
セッション終了時にスナップショットをキャプチャ: git 状態、Beads タスク、最近のコストログ。Phase 2 (v1.2.0) では continuous-learner エージェントもトリガー。
- Opt-out: `export GREAT_CTO_DISABLE_SESSION_LEARNING=1`

## 全体無効化

```bash
# Claude Code 内で:
/plugin disable great_cto

# またはマスタースイッチ (すべての .mjs フックが尊重):
export GREAT_CTO_DISABLE_HOOKS=1
```

## テスト

```bash
node --test tests/hooks/*.test.mjs

# 単一フックのテスト:
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"..."}}' \
  | node scripts/hooks/secret-scan.mjs
```

## アーキテクチャ

- **ADR-013** — フック実行モデル
- **ADR-014** — シークレット検出パターン

完全なドキュメント (カスタムフック追加、規約、高度なテスト) は [English HOOKS.md](../HOOKS.md) を参照。
