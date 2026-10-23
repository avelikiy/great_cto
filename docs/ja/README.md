<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**開発ワークフローを実行。証拠を確認。何をリリースするか判断。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="合成データを使ったサンプルプロジェクト。実モデルのベンチマークではありません。" width="900" />

*合成データを使ったサンプルプロジェクト。実モデルのベンチマークではありません。 3.69.0.*

```bash
npx great-cto init
```

[サイト](https://greatcto.systems) · [実走行の記録 →](https://greatcto.systems/proof) · [ブログ](https://greatcto.systems/blog/) · [変更履歴](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 英語版 [README](../../README.md) **v3.69.0**（2026-10-23）の翻訳です。
> 内容が異なる場合は英語版が正となります。

---

great_cto は、明示的な段階、レビュー、ゲートを通じて Claude Code のネイティブワークフローと実験的な制御型 Codex 実行を調整します。ローカルボードでタスク、記録された実行、プロジェクト文書、使用量を結びます。公開カタログは **72** エージェントを含みますが、掲載だけでは実行や専門性の証明になりません。証拠がなければ不明のままです。マージ、リリース、デプロイにはそれぞれ証拠と承認が必要です。費用は利用するプロバイダーに支払い、MIT ライセンスの great_cto 自体は課金しません。

## クイックスタート

```bash
npx great-cto init
```

Claude Code を再起動します。日々使うのは 3 つだけです:

| | Claude Code で | ターミナルで |
|---|---|---|
| **作業を始める** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **自分待ちのもの** | `/inbox` | `great-cto status` |
| **続ける** | `/resume` | `great-cto resume` |

`/start` は新しいプロダクトも既存プロジェクトのタスクも受け付け、ワークフローを自分で
選びます。`/resume` は承認済みのものだけを続け、保留中の判断はあなたを待ち続けます。
それ以外 — `/review`、`/spec`、`/save`、`/digest` など — は必要なときに:
[全コマンド](../COMMANDS.md)。

## 1 つのプロジェクト、5 つの画面

`great-cto board` でローカルボードを開きます。通常は `localhost:3141` です。

| 画面 | 確認できる内容 |
|---|---|
| **Work** | タスク、受け入れ条件、次の対応可能な操作と Overview、Execution、Evidence タブ |
| **Decisions** | 承認待ちの判断と既存のゲート操作。権限は拡張しません |
| **Knowledge** | プロジェクトの Markdown、ADR、Mermaid ソースへのフォールバック付きの制限された図表示。読み取り専用 |
| **Insights** | 記録された結果、プロジェクト別トークン、見積もり、個別の予算 |
| **Settings** | Executors、Runtime、Capabilities、General |

`unverifiable`、`unmeasured`、`unavailable` は検証成功を意味しません。

Execution は記録された試行を表示し、因果グラフやライブ端末ではありません。図は宣言されたアーキテクチャを示します。トークンや費用は品質の指標ではありません。文書は元の言語を維持し、UI は英語です。

<details>
<summary>実行、証拠、プロジェクト文書、結果を見る</summary>

![Execution: 合成データを使ったサンプルプロジェクト。実モデルのベンチマークではありません。](../screenshots/execution.png)

![Evidence: 合成データを使ったサンプルプロジェクト。実モデルのベンチマークではありません。](../screenshots/evidence.png)

![Knowledge: 合成データを使ったサンプルプロジェクト。実モデルのベンチマークではありません。](../screenshots/knowledge.png)

![Insights: 合成データを使ったサンプルプロジェクト。実モデルのベンチマークではありません。](../screenshots/insights.png)

[キャプチャの契約](../reference/public-showcase.md).

</details>

## OpenAI Codex では

| モード | 実行と権限 |
|---|---|
| Claude Code native | ネイティブのコマンド、専門ロール、hooks。判断は対応するホストに残ります |
| Controlled Codex / mixed-host (experimental) | コントローラーがルーティング、テキスト提案、verifier、明示的ゲートを管理します |
| Codex plugin session | Skills、MCP、安全用 hooks。インストールだけでは制御型パイプラインは開始されません |

`npx great-cto init --host codex` で Codex にスキル、MCP サーバー、6 つの安全フックが
入ります（一度だけ承認: ターミナルで `codex` を起動し **Trust all and continue** を選択）。
Codex にはスラッシュコマンドやロールエージェントのネイティブなプラグイン面がないため、
パイプラインは CLI で動かします:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

更新は既定では明示的な操作です（`great-cto upgrade codex`）。macOS では `sh scripts/codex-auto-update.sh enable` で任意のユーザータイマーを有効にし、6 時間ごとに更新します。`status` はタイマーを確認し、`disable` は削除します。実行ごとに Git の取得元を検証し、npm リリースではなく設定された Git ref に従います。変更されたフックには新しいセッションでホストの承認が必要です。詳細と混在実行:
[Codex ホストガイド](../HOST-CODEX.md).

## 止まるタイミング

`.great_cto/PROJECT.md` の 1 行で決まります:

| `approval-level` | 止まる場所 | 回数 |
|---|---|---|
| **`ship-only`** | **デプロイ — 何を作るかのブリーフ付き** | **1** |
| `product-only` | 何を作るか · 出荷するか | 2 |
| `gates-only` *(既定)* | 何を作るか · 設計 · デプロイ | 3 |
| `strict` | 設計 · コードレビュー · デプロイ | 3 |
| `auto` | パイプラインでは止まらない | 0 |

規制対象のプロダクト — フィンテック、医療、行政 — はどのレベルでもセキュリティ、
コンプライアンス、出荷のゲートを保持します。[ゲートの仕組み](../GATES.md)。

## 計測された数字

| | |
|---|---|
| 1 機能をエンドツーエンドで完全トレース | **1h 26m · $3.40** — [証跡](https://greatcto.systems/proof) |
| プロダクト丸ごと — オープンベンチマークで 7 本 | 中央値 **$171** · **70/100**, **2026-07-10** — [再現する](../benchmarks/BENCH-2026-07-batch1.md) |

これらは過去の観測であり、現在の 2 ホスト型パイプラインや domain packs のベンチマークではありません。品質向上率は確立されていません。Domain packs は引き続き opt-in で、存在だけでは専門性や成果の向上を証明できません。

## 制限事項

1 人の開発者向けでチーム向けではない; ホスト型アプリビルダーではない — あなたの
コーディングエージェントが必要; CI/CD システムではない; コンプライアンスの雛形は出発点で
あって認証ではない; LLM の出力は決定的ではない。各項目の正直な説明と、主張しないこと:
[docs/DETAILS.md](../DETAILS.md)。

## さらに詳しく

[ドキュメント](../README.md) · [はじめに](../tutorials/getting-started.md) ·
[コマンド](../COMMANDS.md) · [ゲート](../GATES.md) · [エージェント](../reference/agents.md) ·
[FAQ](../FAQ.md) · [その他すべて](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [セキュリティ](../../SECURITY.md) ·
[コントリビュート](../../CONTRIBUTING.md) · [プライバシー — テレメトリは既定でオフ](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE). 作者 [@avelikiy](https://github.com/avelikiy)。
時間の節約になったら、スターが他のソロ開発者に見つけてもらう助けになります。
