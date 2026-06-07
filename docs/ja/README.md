<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**ビジネスのためのAIオートパイロット — ソフトウェアだけでなく、仕事そのものを片付ける。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-$2.39_vs_$5460_human-darkgreen)](https://greatcto.systems/proof)

<img src="../screenshots/pipeline.svg" alt="great_cto pipeline: Flow Compiler → gate:plan → 61 agents → gate:ship → Deployed" width="900" />

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## サービスこそが新しいソフトウェアである

次の波は、専門家向けのツールではなく、**サービスの成果そのものを売るオートパイロット**だ。
オートパイロットはビジネス機能を丸ごとエンドツーエンドで遂行し（受付 → 処理 → 判断 → 提供）、
判断を要する局面だけを有資格の人間にエスカレーションする。モデルが改善するたびに、サービスは
速く、安くなっていく。

GreatCTOはそうしたオートパイロットを提供する — それぞれが**エージェント + ツールのフローで、
リスクのあるステップには人間を配置**し、コンプライアンスレビュアーを内蔵し、各フローを実データ上で
動かす**ライブコネクター**を備える。

## オートパイロット一覧

| オートパイロット | 何をするか | 市場規模 | 構築している企業 |
|---|---|---|---|
| 🩺 **[Medical-coding](https://greatcto.systems/autopilots/rcm.html)** | 診療記録 → クリーンで準拠したクレームへ。リスクの高いものは認定コーダーが署名 | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[Managed-IT](https://greatcto.systems/autopilots/msp.html)** | 全端末のパッチ・設定・アクセスを管理 — 段階的・可逆的で、大きな変更には人間を配置 | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[Legal-document](https://greatcto.systems/autopilots/legaltech.html)** | 契約書やNDAを起草・レッドライン。助言にあたるものは有資格の弁護士が署名 | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[Bookkeeping & close](https://greatcto.systems/autopilots/accounting.html)** | 記帳・照合・月次締めを実施。締めはコントローラーが署名 | $50–80B | Rillet · Basis · Digits |
| 🧾 **[Tax-prep](https://greatcto.systems/autopilots/tax.html)** | 申告書を作成しポジションを分類。申告前に有資格の作成者が署名 | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[Source-to-pay](https://greatcto.systems/autopilots/procurement.html)** | サプライヤーのオンボーディング、請求書の突合、支払いの実行 — 制裁・不正をスクリーニング | $200B+ | Tacto · Zip · AskLio |

→ [すべてのオートパイロット](https://greatcto.systems/autopilots.html) · `/flow <vertical>` を実行すれば任意のフローをターミナルで確認できる

**各オートパイロットは判断を要する局面に必ず人間を配置する** — 認定コーダー、有資格の弁護士、
コントローラー、有資格の申告作成者。オートパイロットがボリュームをこなし、人間が責任を伴う判断を
担う。**9つのライブコネクターが6つのオートパイロットすべてにまたがって稼働する** — FHIR、ICD-10（NLM）、
NCCI/MUE、X12 837P、DocuSign、Plaid、OFAC、段階的ロールアウト、そして米国連邦税エンジン。これらは
デフォルトでキー不要（公開ソースまたは決定論的な実生成）であり、認証情報を追加した瞬間に実際の
プロバイダーへPOSTする。

## 内部の仕組み（運用するCTOのために）

各オートパイロットは、専門エージェントのゲート付きパイプライン — アーキテクト、12アングルレビュアー、
QA、セキュリティオフィサー、devops — によって構築・運用され、あなたのスタックと管轄区域に合わせて
チューニングされる。**機能ごとに下す判断は2つだけ。残りはすべて自動で進む。** コンプライアンス
レビュアー、署名付きの人間ゲート、監査証跡、ライブコネクターが、オートパイロットを安全に走らせる
ための信頼レイヤーとなる。

## 数字で見る

| | |
|---|---|
| LLMコスト（実機能1件、トレース済み） | **$2.39** |
| 同じ作業の人間換算コスト | **約 $5,460** |
| QAが見逃していた検出済み欠陥 | **2件** |
| 月額コスト（パイプライン20回実行） | **約 $34** |
| 専門エージェント | **61** |
| 自動検出されるアーキタイプ | **26** |
| 管轄区域 | **12**（GDPR · HIPAA · PCI-DSS · SOX · ほか） |

→ [すべての成果物を含む完全なトレース](https://greatcto.systems/proof)

## 仕組み

**`npx great-cto init`** — スタックとREADMEをスキャンし、管轄区域を検出し（GDPR? HIPAA? PCI?）、プロジェクトに正確なエージェント・ゲート・コンプライアンスフレームワークを記した `.great_cto/FLOW.md` を書き出す。

**`/start "describe the feature"`** — コードを書く前に、クリティックがアーキテクチャと仕様をレビューする。あなたは `gate:plan` でプランをレビューする。

**エージェントが自動で実行** — senior-devがTDDで実装し、12アングルレビュー、QA、セキュリティ、devopsが続く。あなたは `gate:ship` で出荷を承認する。

## 3つのプロジェクト — 3つの異なるパイプライン

同じコマンド。出力は何を作り、どこで動かすかによって変わる:

| | **フィンテックスタートアップ · EU** | **ヘルスケアポータル · 米国** | **CLIツール** |
|---|---|---|---|
| 専門エージェント | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| 人間ゲート | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| コンプライアンス | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| サイクルあたりコスト | 約 $8–18 | 約 $8–18 | 約 $0.5–3 |

→ インタラクティブなピッカーを試す: [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## あなたが実際にチェックするダッシュボード

`great-cto board` は `http://localhost:3141` で開く — リアルタイムSSE付きのカンバン、エージェント別コストタイル、パイプラインステータス、30日間のLLM支出と人間換算ベースラインの比較。

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>メトリクス</b> — LLMコスト、人間換算ベースライン、savings_x 比率</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>インボックス</b> — 保留中のゲート、P0インシデント、ブロックされたタスク、停滞中の作業</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>エージェント</b> — 61名の専門家、最終使用日 + 実行回数つき</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>メモリ</b> — 11レイヤー + 結晶化されたインシデントパターン</sub></td>
</tr>
</table>

**一人エンジニアリング組織のために構築。** Claude CodeまたはOpenAI Codex上で、すべてを自分で回すインディーハッカー、ソロファウンダー、技術系CTOのために。*チーム向けではない* — [FAQ](../FAQ.md#is-great_cto-for-teams) を参照。

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
<summary>📖 完全なドキュメント — 2つのゲート · クリティック · 61エージェント · 26アーキタイプ · 12管轄区域 · 45以上のコンプライアンスフレームワーク · ボード · コスト · MCP</summary>

## 機能ごとに2つの判断

```
🟡 gate:plan   ←  ここであなたが判断する（アーキテクチャ + タスク + コスト）
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  ここであなたが判断する（PR準備完了、セキュリティ承認済み）
```

アーキテクト、プランナー、レビュアー、QA、セキュリティ、DevOpsは、この2つの人間チェックポイントの間で自動的に実行される。**メモリはセッション間で永続化される**: すべてのゲート判定は `~/.great_cto/decisions.md` に追記され、すべてのレトロスペクティブはプロジェクトごとの `lessons.md` に追記される。そして `/crystallize` は影響度の高いパターンを、エージェントが再解決の前に参照するグローバルライブラリへと昇格させる。

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
| 専門エージェント | **57**（architect · PM · 12アングルレビュー · QA · security · devops · アーキタイプ・パック・管轄区域にまたがる42のレビュアー） | 1名のジェネラリスト | 1名のジェネラリスト |
| SDLCオーケストレーション | architect → plan → impl → review → QA → security → devops | ワンショット自律 | 編集ループ |
| 人間ゲート | ✅ 機能ごとに2つ（plan + ship） | ❌ なし | ❌ |
| セッション間メモリ | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ スレッドのみ | ⚠️ スレッドのみ |
| コストトラッキング | ✅ エージェント別 + 30日履歴 + savings_x | ❌ | ❌ |
| コンプライアンスフレームワーク | ✅ 33以上（PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …） | ❌ | ❌ |
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
/start "build a refund endpoint with PCI-DSS scoping"
# → architect → enterprise-saas-reviewer (PCI-DSS auto-loaded)
# → pm → 5 Beads tasks → gate:plan (you approve)
# → senior-dev → 12-angle review → qa → security-officer
# → gate:ship (you approve) → devops → deployed

/inbox
# Pending gates · P0 incidents · blocked tasks · stale in-progress

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

## 自動検出される26のアーキタイプ

各アーキタイプは固有の専門エージェントとコンプライアンスチェックリストを起動する。上位7つ:

| アーキタイプ | ティア | 専門エージェント | コンプライアンス |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

完全な表（26アーキタイプ）と検出の仕組み: [docs/ARCHETYPES.md](../ARCHETYPES.md)。

**米国の深いカバレッジ** — GDPR/PCI/HIPAAにとどまらず、great_cto は今や SEC のサイバー開示（8-K Item 1.05）、防衛請負業者向けの CMMC 2.0 / NIST 800-171、米国のAIガバナンス（NIST AI RMF · Colorado SB 205 · Utah/Texas AI）、ウェブトラッキング訴訟（VPPA · CIPA · Washington MHMDA）、そして融資のための HMDA / SR 11-7 モデルリスクに対してもレビューを行う。

## 14のドメインパック — オーバーレイレビュアー

ドメインパックはアーキタイプの**上に**乗る。CLIがパック固有のシグナル（依存関係、READMEの用語）を検出すると自動でアタッチされる。各パックは固有のレビュアー、脅威モデルテンプレート、EVALスイート、人間ゲートを — ベースのアーキタイプとは独立に — 追加する。

| カテゴリ | パック |
|---|---|
| **AI 垂直分野** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **デジタルヘルス** | `digital-health-pack` _(ウェアラブルテレメトリ · メンタルヘルスAI · 栄養AI · 医師HITL)_ |
| **フィンテック / 規制対象** | `lending-pack` · `em-fintech-pack` |
| **高コンプライアンス** | `clinical-trials-pack` · `climate-pack` |
| **エンジニアリング** | `api-platform-pack` · `robotics-pack` |
| **米国市場** | `sec-cyber-pack` _(SEC 8-K 開示)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28種類の人間ゲート** + 53のリファレンスEVALスイート + 15のTMテンプレート。**4レイヤーのジャーニー可視化**（アーキタイプ → パック → レビュアー → ゲート）で14パックすべてを閲覧: [greatcto.systems/packs.html](https://greatcto.systems/packs.html)。

## 完全にトレースされた実機の1回の実行

Python CLI機能をフルパイプラインで出荷: **$2.39のLLM支出** 対 約 $5,460 の人間換算。セキュリティが、QAが通していた2つの実欠陥を捕まえた（`list(stream_csv())` がストリーミングを台無しにし → 13 MB入力に対しピークRSSが14.5 MBに）。マルチレビュアーモデルが、単一エージェントが見逃すものを、マージ前に捕まえる。

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

- **チーム向けではない** — solo-CTO こそが製品。エンジニアが2人以上? もう卒業している。
- **シニアエンジニアの代替ではない** — プロセスを成文化するもので、シニアなしでアーキテクチャ上の判断は下さない。
- **CI/CDシステムではない** — ゲートはローカル / セッション内で実行される。実際のマージにはGitHub Actionsが依然必要。
- **認証監査済みではない** — PCI/HIPAA/SOC2のアーキタイプ用足場は出発点であって、認証ではない。
- **決定論的ではない** — LLM生成の出力。すべてのゲート判定は妥当性を確認すべき。

## FAQ（上位5）

**私のソースコードはモデルの学習に使われますか?** いいえ。Claude APIは有料顧客に対してデフォルトでゼロ保持。great_cto は何も追加しない。

**トークンコストはどう抑えていますか?** デフォルトHaiku + トリアージ用のKimi K2ルーター（60〜80%の節約）+ cost-guardフック。

**フックを無効化できますか?** すべてのフックは `GREAT_CTO_DISABLE_<NAME>=1` を尊重する。ファイル単位のシークレットスキャンのオプトアウト: `// great_cto:allow-secrets`。

**ソロでない場合は?** great_cto は一人エンジニアリング組織のために作られている。エンジニアが2人以上で、共有ボード / マルチシート認証が必要なら、もう卒業している。

完全なFAQ: [docs/FAQ.md](../FAQ.md)。

## ドキュメント

📚 **[完全なドキュメントハブ →](../README.md)** — [Diátaxis](https://diataxis.fr/) で整理:
**[Getting Started](../tutorials/getting-started.md)** · ハウツーガイド ·
[Agents](../reference/agents.md) & [Commands](../reference/commands.md) リファレンス · [Architecture](../ARCHITECTURE.md) · [FAQ](../FAQ.md)。

## アーキテクチャ

プラグインはClaude Code（または任意のMCP対応ホスト）内で動作する。61のエージェントはmarkdownの仕様であり、タスクはBeads（dolt、git-native）に格納され、メモリはプレーンなmarkdown（ベクターストアなし）だ。図 + スタック表: [docs/ARCHITECTURE.md](../ARCHITECTURE.md)。

## 新着情報

**v2.21.0**（2026年5月）— **Flow Compiler UX**: `npx great-cto init` は今や、機能サイクルごとのエージェント、ゲート、コンプライアンス、コスト見積もりを記した**コンパイル済みフロー**を出力する。`.great_cto/FLOW.md` を書き出し — エージェントはそれを読んで、あなたのSDLCをどうオーケストレーションすべきか正確に把握する。

**v2.20.0**（2026年5月）— **Detection v2**: **12管轄区域のカバレッジ**（CA · JP · CN · KR を完全な法的フレームワーク + 人間ゲートとともに追加）· **インフラシグナル検出**（Terraformのリージョン文字列、`.env` の `AWS_REGION=`、docker-compose の `TZ=`、`package.json` の homepage TLD）· **単語境界マッチング**（「india」→「indiana」の誤検出はもうない）· ニッチなアーキタイプ向けの**パックヒント**（信頼度が低いときに `suggestedPacks` が robotics/climate/clinical-trials/hr-ai/em-fintech のパックを提示）。トークン節約: パイプライン実行あたり –87.7%（v2.19.0のコンテキストアーキテクチャ再設計）。

**v2.19.0**（2026年5月）— **トークンエコノミー フェーズ1+2**: アーティファクトサマリー（≤250トークン、自動生成）+ タスク認識メモリフィルタ（タスクごとに関連性上位kエントリ）。パイプライン実行あたり –87.7% トークン。

**v2.17.0**（2026年5月）— **コンパニオンプラグインの自動インストール** · Planステージ前の **Architecture / Spec / Schema クリティック**。

[完全な変更履歴 →](../../CHANGELOG.md)

## ロードマップ

- **CIでのEvalsランナー** — すべてのPRでゴールデンセットのEvalスイートを実行し、プロンプトのリグレッションを自動で捕まえる
- **自己改善ループ** — 判定から学び、自らのプロンプトを時間とともに改善するエージェント
- **意思決定スコアリング** — どのゲート判定が正しかったかを追跡し、パターンを浮かび上がらせる
- **/crystallize** — 影響度の高い教訓を、パイプライン全体が参照できる再利用可能なスキルへ昇格させる

[次の機能に投票する →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 作者

[avelikiy](https://github.com/avelikiy) — AIネイティブなトレーディング・フィンテックプラットフォームを構築するCTO（0→1、1→N）。great_cto は、自分自身のループを一度に1エージェントずつ自動化した結果だ。すべてのルールは、実際の本番システムの実際の問題への応答として生まれた。

## コミュニティ

| チャンネル | 内容 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | バグ、機能リクエスト、アーキタイプ提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 質問、パターン、ショー&テル |
| 📝 [Blog](https://velikiy.hashnode.dev) | アーキテクチャの深掘り |
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
