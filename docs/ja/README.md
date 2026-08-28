<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**プロダクトを説明する。3つを承認する。URL を開く。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[サイト](https://greatcto.systems) · [実走行の記録 →](https://greatcto.systems/proof) · [ライブデモ](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [ブログ](https://greatcto.systems/blog/) · [変更履歴](../../CHANGELOG.md)

</div>

> 本文書は英語版 [README](../../README.md)（**v2.90.0**、2026-07-30 時点）の翻訳です。
> 相違がある場合は英語版が正となります。

---

great_cto は、**すでに使っているコーディングエージェントの上に載るオーケストレーション層**です。
**69 の専門エージェント** — architect、design-advisor、senior-dev、code-reviewer、
QA、security、devops — のパイプラインが、実際のアプリケーションを計画・構築・
レビュー・デプロイします：バックエンド、フロントエンド、生成されたテスト、
公開 URL まで。

あなたが止められるのはちょうど 2 回。**何を作るか**で 1 回、**リリースするか**で
1 回。その間はすべて無人で進みます。

```
   プロダクトを説明
        │
   🤖  仕様 · アーキテクチャ · データモデル · 画面
        ▼
   👤  チェックポイント 1 — 何を作るかを承認
        │
   🤖  architecture · data model · screens
        ▼
   👤  チェックポイント 2 — どう作るかを承認
        │
   🤖  雛形 → バックエンド → フロントエンド → テスト → レビュー → セキュリティ
        ▼
   👤  チェックポイント 3 — デプロイを承認
        │
   🤖  デプロイ済み · リポジトリ · 公開 URL
```

<p align="center">
  <img src="../screenshots/board.png" alt="ビルドボード — ライブパイプライン、ゲート、エージェント別コスト" width="900" />
</p>

`localhost:3141` のボードは自動で埋まります — パイプラインの状態、承認待ちの
ゲート、エージェント別コスト、30 日間の支出。餌をやる必要はなく、見るだけです。

## 実測の数字

| | |
|---|---|
| 機能 1 件、エンドツーエンド、完全トレース付き | **1h 26m · $3.40**（トークン費）— [証跡](https://greatcto.systems/proof) |
| プロダクト丸ごと — 公開ベンチマークで 7 本構築 | 中央値 **$171**（トークン費）· 品質 **70/100**（58–86）— [再現する](../benchmarks/BENCH-2026-07-batch1.md) |
| 標準的な月（パイプライン 20 回） | **~$34** — 支払先は自分の LLM プロバイダのみ |
| 構築できるプロダクト | **60** 種、米国 15 業種、[再利用可能な 6 本のパイプライン](https://greatcto.systems/pipelines)経由 |

品質スコアは各プロダクト自身のテストを実行して算出します。ファイル数を数える
のではなく — だから 70 という、丸くも綺麗でもない数字なのです。

## クイックスタート

```bash
npx great-cto init            # Claude Code（デフォルト）· OpenAI Codex は --host codex
```

AI ホストを再起動して：

```bash
/start "HVAC 事業者向けの配車・予約アプリを作って"
```

あとはパイプラインが引き継ぎます。日常的に触るのは 3 つだけ：

| | |
|---|---|
| `/start "…"` | プロダクトや機能を説明 — パイプラインが実行 |
| `/inbox` | あなた待ちのもの：ゲート、P0、ブロック中タスク |
| `/digest` | 週次 DORA メトリクス + 機能あたりコスト |

Node ≥ 18.17 が必要。コンパニオンプラグイン（Superpowers、Beads）は自動で
入ります。init 後、ホストが本当にプラグインを読み込んだか確認してください：
`claude plugin list --json` で `great_cto` の `errors` が空であること。

## いつ聞かれるか

`.great_cto/PROJECT.md` の設定ひとつで、パイプラインの停止位置が決まります：

| `approval-level` | 停止位置 | 機能あたり |
|---|---|---|
| `product-only` | 何を作るか · リリースするか | 2 |
| `gates-only` *(デフォルト)* | 設計 · デプロイ | 2 |
| `strict` | + コードレビュー | 3 |
| `auto` | なし | 0 |

規制対象のアーキタイプ — フィンテック、医療、行政 — は、セキュリティ・
コンプライアンス・リリースのゲートを **`auto` を含む全レベルで**保持します。
軽いレベルは判断の委任であって、コンプライアンスの回避ではありません。
全表：[docs/GATES.md](../GATES.md)。

## 何が違うか

- **ゼネラリストではなくスペシャリスト** — 役割の狭い 69 エージェントが各自の
  レビューゲートを持つ。考えるより速くタイプするアシスタント 1 体ではなく。
  [名簿 →](../reference/agents.md)
- **コードの前に批評家** — アーキテクチャ・仕様・スキーマの批評家が計画前に
  走る。誤りの修正コストがまだ日単位ではなく時間単位のうちに。
- **書き込み時点でスコープを強制** — エージェントは担当外のファイルに物理的に
  触れない。レビューで指摘ではなく、書き込みで拒否。
- **自分を疑う QA** — クリティカルパスをまず Gherkin で書き、それからテスト
  コード。さらにミューテーションテストが問う：このスイートは何か捕まえられる
  のか。
- **セッションを跨ぐ記憶** — 決定・教訓・昇格したパターンがプロジェクト別と
  グローバルに永続化。中断したビルドは、どのステージが済んだか知った上で再開。
- **見えるコスト** — エージェント別支出、見積と実績の乖離、承認された変更
  あたりのコスト。ボード上に、スプレッドシートではなく。

すべてローカルで動作、MIT ライセンス、鍵は自分のもの。コードはあなたのマシンに
留まり、プロンプトはあなたの LLM プロバイダにのみ送られます。テレメトリは
**デフォルトで無効**（[docs/PRIVACY.md](../PRIVACY.md)）。

## 制約

- **単独ビルダー向け** — ソロ創業者か CTO。エンジニア 2 名以上での共用は想定外。
- **CI/CD ではない** — ゲートはローカル実行。マージは引き続き GitHub Actions。
- **認証監査ではない** — PCI/HIPAA/SOC2 の雛形は出発点であって認証ではない。
- **決定的ではない** — LLM の出力。ゲートの判定は目視確認に値します。

## ドキュメント

**[ドキュメントハブ →](../README.md)** ·
[はじめに](../tutorials/getting-started.md) ·
[ゲートと承認レベル](../GATES.md) ·
[エージェント](../reference/agents.md) · [コマンド](../reference/commands.md) ·
[アーキタイプ](../ARCHETYPES.md) · [アーキテクチャ](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[その他すべて](../DETAILS.md) — 批評家、法域、コスト内訳、CI、アラート

## コミュニティ

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[ブログ](https://greatcto.systems/blog/) ·
[セキュリティポリシー](../../SECURITY.md) · [コントリビュート](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE)。作者 [@avelikiy](https://github.com/avelikiy)：
AI ネイティブなトレーディング・フィンテック基盤を作る CTO。great_cto は自分の
ループを、エージェント 1 体ずつ自動化したものです。

時間の節約になったら、スターが他のソロビルダーの発見を助けます。

<div align="center">

*リリースできる唯一の人間でいるのは、もうやめよう。*

</div>
