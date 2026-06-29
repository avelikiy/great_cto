<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**AI プロダクトビルダー — プロダクトを記述し、仕様を承認し、ソフトウェアを出荷する。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## コードだけでなく、プロダクトを構築する

**あなたはプロダクトを記述する。great_cto がそれを出荷する。** スニペットでもなければ、足場でもない —
バックエンド、フロントエンド、生成されたテスト、そしてライブURLを備えた、本物のデプロイ済み
アプリケーションだ。あなたが下す判断はただ1つ — **仕様を承認すること**。それ以降はすべて —
アーキテクチャ、データモデル、ビルド、レビュー、デプロイ — が無人で実行される。

これは **AI プロダクトビルダー**であって、もう1つのコーディングエージェントのループではない。すでに
使っているコーディングエージェントの*上位にある*オーケストレーションレイヤーだ: 専門エージェントの
チームが、計画し、構築し、レビューし、作業をゲートする — だから一人がエンジニアリング組織のように
出荷できる。

> **1つの実機能: アイデア → マージされたPR まで `1h 26m`、LLMコスト `$3.40`。** 同じ機能の従来の
> 経路は約6週間と約 $42K だった。[完全なトレースを見る →](https://greatcto.systems/proof)

great_cto が構築する米国の主要サービス産業 — ホーム＆フィールドサービス、専門サービス、
ホスピタリティ、小売 / Eコマース、プロップテック、フィットネス、マーケティング＆クリエイター、
HR / リクルーティング、建設、物流 — は、**6つの再利用可能なビルドパイプライン**（CRUD バーティカル SaaS、
予約、CRM、ダッシュボード、マーケットプレイス、コンテンツ / メディア）に集約される。1つのコマンドが
約40のプロダクトのいずれをも出荷する。[docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md) を参照。

```
   describe a product
        │
   spec synthesis  ── architecture · data model · screens          (automated)
        ▼
   👤  CTO gate — approve the spec        ← the one human checkpoint
        │
   scaffold → backend → frontend → integrate → test → deploy        (automated)
        ▼
   shipped product · repo · live URL
```

CI と生成されたテストが品質ゲートだ — あなたは**方向性**に署名するのであって、1行ごとにではない。

## 内部の仕組み（運用するCTOのために）

→ *このサーフェスのビルダー向けストーリー: [greatcto.systems/build](https://greatcto.systems/build)*

すべてのプロダクトは、専門エージェントのパイプライン — アーキテクト、design-advisor、senior-dev、
QA、security-officer、devops — によって構築され、spec → scaffold → backend → frontend → tests → deploy
を実行する。**あなたが下す判断は1つ: 仕様を承認すること。** それ以降はすべて自動だ。パイプラインは
リスク階層化されている — メンテナンス修正はゲートを開かず（CIがゲート）、可逆な機能はプランゲートだけを
開き、不可逆な変更はフルセットを強制する — ので、儀式は手続きの量ではなく影響範囲に応じてスケールする。
CI とビルド自身が生成したテストが、パイプラインをデプロイまで走らせても安全だと保証する品質ゲートだ。

**1つのゲートを、それが重要な場所に。** ビルドステップはリスク階層化されている: 可逆な変更は
CI の背後でビルド・出荷され、不可逆なもの — 本番デプロイ、スキーマ移行、新しい書き込み可能な
インテグレーション — は、実行前に CTO ゲートとフロンティアモデルへエスカレートする。あなたは仕様と
影響範囲の大きい呼び出しに署名し、残りはそのまま流れる。`change-tier` + `effectiveGates` が、この
不変条件をコードで強制する。

## 数字で見る

| | |
|---|---|
| 1機能、エンドツーエンド（実機実行、完全トレース済み） | **1h 26m · $3.40 LLM** 対 従来手法の約 $42K / 約6週間 |
| 同一パイプラインでの以前のCLI機能実行 | $2.39 LLM 対 約 $5,460 の人間換算。セキュリティが QA を通過していた欠陥2件を捕捉 |
| 月額コスト（パイプライン20回実行） | **約 $34** |
| 対象の米国産業 | **10**（ホームサービス · 小売 · プロップテック · フィットネス · HR · …） |
| 構築可能なプロダクト | 10産業にまたがる**約40** |
| 再利用可能なビルドパイプライン | **6**（CRUD · 予約 · CRM · ダッシュボード · マーケットプレイス · コンテンツ） |
| 専門エージェント | **61** |

→ [すべての成果物を含む完全なトレース](https://greatcto.systems/proof) · [6つのパイプライン](https://greatcto.systems/pipelines)

## 仕組み

**`npx great-cto init`** — スタックをスキャンし、プロダクト向けのパイプライン（エージェント、ビルドアーキタイプ、唯一のCTOゲート）を記した `.great_cto/FLOW.md` を書き出す。

**`/start "describe the product"`** — architect と design-advisor が仕様、データモデル、画面をドラフトする。あなたは**唯一のゲート** — `gate:plan` — でそれをレビューし承認する。

**パイプラインが出荷する** — senior-dev が TDD で足場を組み、ビルドし、QA が生成されたテストを実行し、devops がデプロイする。可逆なビルドには、これ以上の承認は不要だ。

## 3つのプロダクト — 1つのパイプライン

同じコマンド、異なるプロダクト。ビルドアーキタイプがスタックとインテグレーションを形作る:

| | **配車アプリ** | **クラス予約アプリ** | **収益性ダッシュボード** |
|---|---|---|---|
| アーキタイプ | CRUD バーティカル SaaS | 予約 / スケジューリング | ダッシュボード / 分析 |
| スタック | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| インテグレーション | Auth · RBAC | Stripe · Twilio | ソースコネクター |
| 人間ゲート | `gate:plan`（CTOゲート） | `gate:plan` | `gate:plan` |

→ 6つのパイプラインを見る: [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## あなたが実際にチェックするダッシュボード

`great-cto board` は `http://localhost:3141` で開く — ビルドボード: リアルタイムSSE、change_tier バッジ付きのライブパイプライン（CTOゲート1つ · 安価なジャッジ）、エージェント別コスト、30日間のLLM支出と人間換算ベースラインの比較。

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>メトリクス</b> — 出荷したタスク、AI支出、人間チームに対するコスト削減、日次バーン</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>メモリ</b> — 閲覧可能なプロジェクトメモリレイヤー: PROJECT.md、アーキタイプ、スキル、レッスン</sub></td>
</tr>
</table>

**一人エンジニアリング組織のために構築。** GreatCTO は、チームなしで本物のプロダクトを出荷したいインディーハッカー、ソロファウンダー、技術系CTO のためのものだ — Claude Code または OpenAI Codex 上でパイプラインを回し、1つの仕様を承認し、ライブURLへ出荷する。*複数開発者のエンジニアリングチーム向けではない* — [FAQ](../FAQ.md#is-great_cto-for-teams) を参照。

## インストール

```bash
npx great-cto init
```

init後はAIホストを再起動すること。**必要要件:** Node 18.17+ と、以下のいずれか:

| ホスト | インストールフラグ | ステータス |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(デフォルト)_ | ✅ フルサポート |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + agents |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

SuperpowersとBeadsのコンパニオンプラグインは自動でインストールされる — 手動セットアップは不要。

---

<details>
<summary>📖 完全なドキュメント — 1つのCTOゲート · リスク階層化 · クリティック · 46エージェント · ビルドアーキタイプ · ボード · コスト · MCP</summary>

## 機能ごとに1つの判断

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

パイプラインはリスク階層化されている（`change_tier`）: メンテナンス修正はゲートを**開かず**（CIがゲート）、可逆な機能は `gate:plan` **だけ**を開き、不可逆な変更はフルセット + フロンティアモデルを強制する。ゲートとデプロイの間はすべて自動的に実行される。**メモリはセッション間で永続化される**: すべてのゲート判定は `~/.great_cto/decisions.md` に追記され、すべてのレトロスペクティブはプロジェクトごとの `lessons.md` に追記される。そして `/crystallize` は影響度の高いパターンを、エージェントが再解決の前に参照するグローバルライブラリへと昇格させる。

## プランの前にクリティック

最も高くつくバグはコード内にあるのではなく、コーディングが始まる前の意思決定の中にある。3つのクリティックエージェントが、ミスのコストが最も大きい3つのポジションで、Planステージの前に実行される:

| クリティック | 何を捕まえるか |
|---|---|
| **アーキテクチャクリティック** | 後でマルチテナンシーを不可能にする結合 · 実スケールデータでの「明白な」O(n²) · 境界づけられたコンテキスト間の循環依存 |
| **仕様クリティック** | 「間違った問題を解いてしまった」— 最悪の種類のバグ。なぜならどのユニットテストも捕まえられないから · ずれた受け入れ基準 · 合意されたことのないスコープ |
| **スキーマクリティック** | 5000万行のテーブルでデフォルトなしの `NOT NULL`（デプロイ10分後にデッドロック）· インデックス作成時の `CONCURRENTLY` の欠落 · ロールバック経路のない不可逆なマイグレーション |

以前はクリティックはPlanからしか起動しなかった。今ではパイプラインが、実装が始まる前に — 巻き戻しが数日ではなく数時間で済むうちに — アーキテクチャレベルおよび仕様レベルのミスを捕まえる。

## great_cto の比較

|  | **great_cto** | Devin | Claude Code（単体） |
|---|---|---|---|
| オープンソース | ✅ MIT | ❌ クローズド | ❌ クローズドなプラグインモデル |
| セルフホスト | ✅ ローカルで動作 | ❌ Cognitionクラウド | ✅ |
| ホスト | ✅ Claude Code + Codex | ❌ Cognitionクラウド | ✅ Claude Code |
| BYOK / マルチモデル | ✅ Claude Code · Codex | ❌ プロプライエタリ | ❌ Anthropicのみ |
| 専門エージェント | **61**（architect · design-advisor · senior-dev · QA · security · devops · アーキタイプレビュアー） | 1名のジェネラリスト | 1名のジェネラリスト |
| ビルドパイプライン | spec → CTOゲート → scaffold → build → test → deploy | ワンショット自律 | 編集ループ |
| 人間ゲート | ✅ 1つ — あなたが仕様を承認する（リスク階層化） | ❌ なし | ❌ |
| セッション間メモリ | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ スレッドのみ | ⚠️ スレッドのみ |
| コストトラッキング | ✅ エージェント別 + 30日履歴 + savings_x | ❌ | ❌ |
| デザイン内蔵 | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
| 料金 | 無料（LLMプロバイダーには支払う） | $500/mo | $20/mo |
| セットアップ | `npx great-cto init` | サインアップ | CLIをインストール |

great_cto は単なるコーディングエージェントのループ**ではない** — すでに使っているコーディングエージェントの**上位にあるオーケストレーションレイヤー**だ。「もう一人コードを打つアシスタント」ではなく、「作業をレビューしてゲートする専門チーム」と考えてほしい。

## 管轄区域の検出

`npx great-cto init` は3つのシグナルソース — READMEのキーワード、インフラのリージョン文字列（Terraform、`.env` の `AWS_REGION=`、docker-compose の `TZ=`）、`package.json` の homepage TLD — をスキャンし、**12の管轄区域**のうちどれが該当するかを自動検出する:

| 管轄区域 | シグナル（README + インフラ） | フレームワーク | レビュアー |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · `.de` TLD | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · california residents · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · information commissioner · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi data localisation | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic · notifiable data breach | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas guidelines · singpass | PDPA · MAS TRM | `us-privacy-reviewer` |
| `ca` | pipeda · quebec law 25 · casl · canadian users · `ca-central-*` | PIPEDA · Quebec Law 25 · CASL · OSFI B-10 | `us-privacy-reviewer` |
| `jp` | appi · japan users · my number · `ap-northeast-1` · `japaneast` | APPI 2022 · PPC Guidelines · FISC | `us-privacy-reviewer` |
| `cn` | pipl · mlps · china users · `cn-north-*` · `cn-east-*` | PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT | `gdpr-reviewer` |
| `kr` | pipa korea · isms-p · kisa · korea users · `ap-northeast-2` | PIPA · ISMS-P · FSC regulations | `us-privacy-reviewer` |
| `us` | ftc · us users · virginia cdpa · texas tdpsa | FTC Act · US state privacy laws | `us-privacy-reviewer` |

単語境界マッチングにより誤検出を防ぐ（`"india"` は `"indiana"` にマッチしない）。検出された管轄区域は `PROJECT.md` に `jurisdiction: [eu, us-ca]` として書き込まれ、すべての機能で適切なレビュアーをゲートする。手動で上書きも可能:

```yaml
jurisdiction: [eu, us-ca]
```

## 毎日使う3つのコマンド

```bash
/start "build a dispatch & scheduling app for an HVAC business"
# → architect + design-advisor → spec, data model, screens
# → pm → Beads tasks → gate:plan (you approve the spec — the one gate)
# → senior-dev → review → qa → devops → built · tested · deployed

/inbox
# Pending gate · P0 incidents · blocked tasks · stale in-progress

/digest
# Weekly DORA + delta vs last week + cost-per-feature roll-up
```

加えて: `/audit`（既存コードベースのスキャン）、`/cost`（LLMルーターの節約）、`/sec`（セキュリティ統括）、`/oncall`、`/release`、`/rfc`。完全な一覧はインストール後に `~/.claude/commands/` で確認できる。

## コスト

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| パイプライン | 実行あたりコスト | 月あたり実行回数 | 合計 |
|---|---|---|---|
| quick（設定 / タイポ） | $0.10 | 10 | $1 |
| quick（新規エンドポイント） | $1 | 6 | $6 |
| standard（機能） | $5 | 3 | $15 |
| deep（横断的） | $12 | 1 | $12 |
| | | | **約 $34** |

自分のAnthropic APIトークンを支払う。**シートごとの料金なし。SaaSのロックインなし。** ルーチンのトリアージは Kimi K2（約5分の1のコストでSonnet相当）へ自動ルーティングされる → ログクラスタリングで60〜80%削減。

## ビルドアーキタイプ

すべてのプロダクトは、そのパイプラインを形作る**ビルドアーキタイプ** — スタックテンプレート、
データ形状、特徴的なインテグレーション — にマッピングされる。6つのプロダクトビルダーアーキタイプ
（約40のプロダクトはこれらに集約される）:

| アーキタイプ | 形状 | スタック | インテグレーション |
|---|---|---|---|
| `vertical-saas` | エンティティ · ロール · ワークフロー · レコードUI | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | カレンダー · 空き状況 · リマインダー · 決済 | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | コンタクト · パイプライン · 自動シーケンス | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | 取り込み · メトリクス · 可視化 · アラート | Next.js · warehouse-lite · charts | ソースコネクター |
| `marketplace` | 二面性のリスティング · マッチング · 決済 | Next.js · Postgres · Stripe Connect | Stripe Connect / エスクロー |
| `content` | カタログ · アクセスティア · 配信 · 収益化 | Next.js · オブジェクトストレージ · CDN | Stripe · メディアパイプライン |

加えて、エンジンがビルドをチューニングするために自動検出する、基盤となるソフトウェア種別の
アーキタイプ（`web-service`、`mobile-app`、`cli-tool`、`library`、…）。[6つのパイプライン](https://greatcto.systems/pipelines) を参照。

完全な表（26アーキタイプ）と検出の仕組み: [docs/ARCHETYPES.md](../ARCHETYPES.md)。

**米国の深いカバレッジ** — GDPR/PCI/HIPAAにとどまらず、great_cto は今や SEC のサイバー開示（8-K Item 1.05）、防衛請負業者向けの CMMC 2.0 / NIST 800-171、米国のAIガバナンス（NIST AI RMF · Colorado SB 205 · Utah/Texas AI）、ウェブトラッキング訴訟（VPPA · CIPA · Washington MHMDA）、そして融資のための HMDA / SR 11-7 モデルリスクに対してもレビューを行う。

## ドメインオーバーレイ（任意）

ビルドアーキタイプを超えて、エンジンはドメイン固有のシグナル（依存関係、READMEの用語）を検出すると、
任意の**ドメインオーバーレイ**を自動でアタッチできる — 音声 / テレフォニー、プライバシー（GDPR/CCPA）、
AIガバナンスといったもののために、専門レビュアーといくつかの追加チェックを加える。これらはオプトイン
であり、ビルドパイプラインとは直交している。ほとんどのプロダクトには不要だ。

## 完全にトレースされた実機の1回の実行

正典のレシート: **1つの実機能**がフルパイプラインを通って **1h 26m の実時間で $3.40 の
LLMコスト**で出荷された — architect → plan → 実装 → review → 人間ゲート → マージされたPR。
同じ機能の従来の経路: 約170時間と約 $42K。すべてのステージにタイムスタンプが付き、すべての
成果物が公開のGitHub PRにリンクする。

Python CLI機能での以前の実行（$2.39 対 約 $5,460 の人間換算）は、レビューモデルが機能していることを
示した: セキュリティが、QAが通していた2つの実欠陥を捕まえた（`list(stream_csv())` がストリーミングを
台無しにし → 13 MB入力に対しピークRSSが14.5 MBに）。

完全なトレース + 成果物: [greatcto.systems/proof](https://greatcto.systems/proof) · 生データ: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md)。

## CI統合

任意のGitHub Actionsワークフローに組み込む:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` は `$GITHUB_ACTIONS` を自動検出し、`::error file=...,line=N::` アノテーションをPR diff上にインラインで出力する。終了コード: 0 クリーン / 1 検出あり / 2 セットアップエラー。

## テストピラミッド

レイヤー化されたテストスイート — **構造 + ステートマシン層は<2分・$0で実行**（`node --test tests/*.test.mjs`）。実LLM層（26アーキタイプ × 4〜8ステージ + 14パック + 13レビュアー）は OpenRouter 経由でオンデマンドに約 $5〜10 で実行。完全な内訳: [docs/testing/](../testing/)。

## MCP

ネイティブ [MCP](https://modelcontextprotocol.io/) サーバー — Claude Desktop、Codex、または任意のMCPホストから呼び出せる**7つのツール**。ローカル（ボード不要）: `detect_archetype` · `estimate_cost` · `query_decisions`。ボード連携: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`。

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

完全なセットアップ + 内部MCP（Grafana、LLMルーター、Beads）: [docs/MCP.md](../MCP.md)。

## メールアラート（セットアップ不要）

2時間以内に対応が必要な5つの事項が、ボードから離れているときでも自動でメールされる:

| トリガー | いつ |
|---|---|
| 🚨 **P0インシデント** | いずれかのプロジェクトでP0タスクが発生したとき |
| ⏸️ **ゲートが2時間超停滞** | `gate:ship` が何時間もあなたを待っているとき |
| 🛡️ **セキュリティがBLOCKED** | `security-officer` がマージを却下したとき |
| 💸 **予算アラート** | 月間LLM支出が予算の80% / 100%を超えたとき |
| 📊 **週次ダイジェスト** | 金曜09:00 — 出荷、支出、節約、QA |

**セットアップ**: ボード → **Notifications** タブ → メールを入力 → 送られてくる6桁のコードを入力 → トリガーを選択。Resendのサインアップ不要、APIキー不要 — 配信は `greatcto.systems/notify` 経由でルーティングされる（無料、検証済みメールあたり24時間で100通）。

## 制限と非目標

- **複数開発者のエンジニアリングチーム向けではない** — 一人のビルダーが製品。パイプラインを共有する2人以上のエンジニアは、もう卒業している。
- **シニアエンジニアの代替ではない** — プロセスを成文化するもので、シニアなしでアーキテクチャ上の判断は下さない。
- **CI/CDシステムではない** — ゲートはローカル / セッション内で実行される。実際のマージにはGitHub Actionsが依然必要。
- **認証監査済みではない** — PCI/HIPAA/SOC2のアーキタイプ用足場は出発点であって、認証ではない。
- **決定論的ではない** — LLM生成の出力。すべてのゲート判定は妥当性を確認すべき。

## FAQ（上位5）

**私のソースコードはモデルの学習に使われますか?** いいえ。Claude APIは有料顧客に対してデフォルトでゼロ保持。great_cto は何も追加しない。

**トークンコストはどう抑えていますか?** デフォルトHaiku + トリアージ用のKimi K2ルーター（60〜80%の節約）+ cost-guardフック。

**フックを無効化できますか?** すべてのフックは `GREAT_CTO_DISABLE_<NAME>=1` を尊重する。ファイル単位のシークレットスキャンのオプトアウト: `// great_cto:allow-secrets`。

**ソロでない場合は?** GreatCTO のビルドパイプラインは一人のエンジニアのために作られている。共有のビルダーボードと並行パイプラインを必要とする2人以上のエンジニアがいるなら、もう卒業している。

完全なFAQ: [docs/FAQ.md](../FAQ.md)。

## ドキュメント

📚 **[完全なドキュメントハブ →](../README.md)** — [Diátaxis](https://diataxis.fr/) で整理:
**[Getting Started](../tutorials/getting-started.md)** · ハウツーガイド ·
[Agents](../reference/agents.md) & [Commands](../reference/commands.md) リファレンス · [Architecture](../ARCHITECTURE.md) · [FAQ](../FAQ.md)。

## アーキテクチャ

プラグインはClaude Code（または任意のMCP対応ホスト）内で動作する。46のエージェントはmarkdownの仕様であり、タスクはBeads（dolt、git-native）に格納され、メモリはプレーンなmarkdown（ベクターストアなし）だ。図 + スタック表: [docs/ARCHITECTURE.md](../ARCHITECTURE.md)。

## 新着情報

**v2.74+**（2026年6月）— **プロダクトビルダーへのピボット**: GreatCTO は *AI プロダクトビルダー* になる — ソフトウェアプロダクトを記述し、1つのCTOゲートで仕様を承認すれば、パイプラインがそれを出荷する（spec → build → test → deploy）。10の米国産業、約40のプロダクト、6つの再利用可能なパイプライン。ビルドゲートはリスク階層化されている（`change_tier`）。規制対象のランタイムサーフェスは [avelikiy/operate](https://github.com/avelikiy/operate) へ切り出された。ストーリー: [戦略](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [6つのパイプライン](https://greatcto.systems/pipelines)

**v2.40–v2.62**（2026年6月）— **オートパイロットへのピボット**: GreatCTO は *ビジネスのためのAIオートパイロット* になる — 25のサービスオートパイロットバーティカル、それぞれが測定された品質スコアカード、説明責任を負うオーナー、そして**不可逆なアクションは人間の署名なしには決して実行されない**というランタイム不変条件を備えたフローだ。22のライブコネクターが、すべてのバーティカルを実データ上で動かす。ストーリー: [私たちはピボットした →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63**（2026年6月）— **オペレーターコンソール**: 永続的な実行は人間ゲートで一時停止し、指名された有資格の人間をインボックスで待つ。署名が書き込みを実行する。ロールベースのアクセス、スコープ付き招待、証拠付きのAIドラフト判定、QAサンプリング、SLAクロック、Opsタブ（メータリング · コネクターヘルス · デッドレター再キュー）、WCAG 2.2 AA、ライト / ダーク。ストーリー: [オペレーターコンソール →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65**（2026年6月）— **内部の仕組み**: dev ボードが *pult* になる — ゲートの承認がライブストリーミングのエージェント実行を起動できる。ホールドアウト評価でゲートされたプロンプトの自己改善（SIA着想）。$0 のコンテキスト圧縮（CIログ 31,475 → 155 文字、FATALを保持）。Fable 5 サポート。ストーリー: [6月の内部の仕組み →](https://greatcto.systems/blog/june-under-the-hood)

[完全な変更履歴 →](../../CHANGELOG.md)

## ロードマップ

- **プロダクトアーキタイプ検出** — スタックだけでなく、プロダクトブリーフからビルドアーキタイプを選ぶ
- **産業別ビルドテンプレート** — 6つのパイプラインそれぞれを通して、リファレンスプロダクトをエンドツーエンドで出荷する
- **ティア認識ジャッジ** — T0/T1 評価では安価なファインチューニング済みジャッジ、T2 ではフロンティア + 人間（ADR-004）
- **ヘッドレスタスクランナー** — プロダクトビルドをキューに入れ、VPS上で無人実行する

[次の機能に投票する →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 作者

[avelikiy](https://github.com/avelikiy) — AIネイティブなトレーディング・フィンテックプラットフォームを構築するCTO（0→1、1→N）。great_cto は、自分自身のループを一度に1エージェントずつ自動化した結果だ。すべてのルールは、実際の本番システムの実際の問題への応答として生まれた。

## コミュニティ

| チャンネル | 内容 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | バグ、機能リクエスト、アーキタイプ提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 質問、パターン、ショー&テル |
| 📝 [Blog](https://greatcto.systems/blog/) | レシート、コストの内訳、アーキテクチャの深掘り |
| 🔒 [SECURITY.md](../../SECURITY.md) | 責任ある開示 |

## コントリビューション & ライセンス

プルリクエスト歓迎 — [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照。良い最初のissue: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue)。

MIT — [LICENSE](../../LICENSE) を参照。

great_cto が時間を節約してくれたなら、リポジトリにスターを — 他のソロCTOが見つけるのを助けます。

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Built by [@avelikiy](https://github.com/avelikiy)**
*Stop being the only person who can ship.*

</div>
