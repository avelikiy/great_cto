<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**すでに使っているコーディングエージェントで、プロダクトを出荷。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[サイト](https://greatcto.systems) · [実走行の記録 →](https://greatcto.systems/proof) · [ブログ](https://greatcto.systems/blog/) · [変更履歴](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 英語版 [README](../../README.md) **v3.47.0**（2026-10-02）の翻訳です。
> 内容が異なる場合は英語版が正となります。

---

**コーディングエージェントはコードを出荷する。これはそれを検証する。**

プロダクトや機能を説明してください。役割を絞った **71 agents** が、ブリーフ、
アーキテクチャ、ビルド、レビュー、セキュリティまで進め、別ファミリーの第二のモデルが
同じ diff を読みます。何を作るか、どう作るか、出荷するか — 3 つの判断はあなたに残り、
成果物は**あなたのリポジトリ**と**動く URL** です。LLM プロバイダーへの支払いは
ご自身で行い、great_cto は MIT で一切課金しません。

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

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

`localhost:3141` のボードは **Work** から開きます — あなたのタスク、あなたを待つ判断、
すでに出荷されたもの。コスト、エージェント、レビュアーは **Tools** にあります。
欠落を成功に見せることはありません: 判断できなかったチェックは `unverifiable`、
計測されていないコストは `unmeasured`、実行できなかったレビュアーは `unavailable` です。

## OpenAI Codex では

`npx great-cto init --host codex` で Codex にスキル、MCP サーバー、6 つの安全フックが
入ります（一度だけ承認: ターミナルで `codex` を起動し **Trust all and continue** を選択）。
Codex にはスラッシュコマンドやロールエージェントのネイティブなプラグイン面がないため、
パイプラインは CLI で動かします:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Codex はプラグインを自分では更新しません — `great-cto upgrade` が行います。詳細、
Claude + Codex の混在実行、第二のレビュアーとしての Codex:
[Codex ホストガイド](../HOST-CODEX.md)。

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
| プロダクト丸ごと — オープンベンチマークで 7 本 | **$171** · **70/100**, **2026-07-10** — [再現する](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型的な 1 か月、20 回の実行 | **~$34** — LLM プロバイダーへの支払いのみ |

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
