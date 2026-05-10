<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**リリースできる唯一の人間でいるのをやめよう。**

あなたは CTO で、ボトルネックでもある。**GreatCTO は 30 のスペシャリスト・エージェント**が、アーキテクチャ・レビュー・QA・セキュリティ・デプロイを担当 — あなたは**機能ごとに 2 つの決定**だけを下す。

> **v2.7.0** · 34 エージェント · 25 アーキタイプ · 24 セキュリティルール · 9 フック · **Claude Code · Cursor · Codex · Aider · Continue** で動作 · MCP サーバー · webhooks · CI gate · プロジェクトあたり ~$34/月 · MIT

> ⚠️ この翻訳は機械翻訳です。ローカルレビューが必要です。問題があれば PR を送ってください。 [English original](../../README.md).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Web サイト](https://greatcto.systems) · [デモ](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [ブログ](https://velikiy.hashnode.dev)

**言語:** [English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · **日本語** · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português (BR)](../pt-BR/README.md)

</div>

## 新着情報

### v2.7.0 — エージェントプロンプトの一貫性 + モデルティアポリシー (2026 年 5 月)
- 3 つの新しいリンタールール: `CONS-MODEL` (エージェントのモデルが役割に一致) · `CONS-OUTPUT` (reviewer は出力ファイルを宣言) · `CONS-SIGNOFF` (sign-off / gate セマンティクス)
- ADR-002 — モデルティア選択の統一ポリシー (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet)
- バグ修正: SessionEnd 自動キャプチャログがボード管理画面に正しくレンダリングされるように
- リント基準: 34 エージェント · 0 エラー · 0 警告


[フル変更ログ →](../../CHANGELOG.md)

## great_cto とは?

great_cto は [Claude Code プラグイン](https://claude.com/plugins) で、完全な SDLC パイプラインを **30 のスペシャリスト・エージェント**として実行します — アーキテクト、計画、実装、12 角度レビュー、QA、セキュリティ、デプロイ、サポート — あなたが実際に確認するボードを通じて連携。機能ごとに 2 つの決定を下し、それ以外はすべて自動化。

| レイヤー | 役割 |
|---------|------|
| **33 のスペシャリスト** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 アーキタイプ** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **自動検出** | `package.json`、`pyproject.toml`、`Cargo.toml`、README、コード構造をスキャン → 2 秒でアーキタイプ + コンプライアンスゲートを選択。信頼度が低い場合は Anthropic Haiku セカンドオピニオン (~$0.001)。 |
| **コンプライアンス** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — アーキタイプごとに自動添付。 |
| **メモリ** | 4 層 — `PROJECT.md` (アーキタイプ) · `lessons.md` (プロジェクトレトロ) · `~/.great_cto/decisions.md` (すべてのゲート承認、プロジェクト横断クエリ可能) · `verdicts/` (すべてのエージェント判定)。 |
| **ボード** | `great-cto board` で `localhost:3141` に 6 ビュー — Inbox · Kanban · Metrics · Agents · Memory · Public report。SSE によるライブ更新。 |

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 列、インラインゲート承認、ライブ SSE" width="900" />
</p>

## 機能ごとに 2 つの決定

```
あなた:  /start "Stripe サブスクリプションを追加 — 月額と年額"

great_cto:
  → アーキタイプ: commerce | スケール: standard | ~45 分
  → コンプライアンス: pci-dss + gdpr (自動添付)
  → ARCH-stripe-subscriptions.md 準備完了  →  決定 1: アーキテクチャを承認しますか?

あなた: "承認"

  → senior-dev → 12 角度レビュー → qa-engineer → security-officer → devops
  → 412 テスト合格 · 0 high · canary 準備完了
  → 決定 2: リリースしますか?

あなた: "リリース"  →  canary 5% → 20% → 100%  →  RELEASE ドキュメント作成済み
```

## クイックインストール

```bash
npx great-cto init
```

CLI がリポジトリをスキャンし、適切なアーキタイプを選択し、コンプライアンスゲートを自動的に配線します。新規・既存プロジェクト両方で動作。後で Claude Code を再起動してください。

**必要環境:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## 実際に確認するボード

```bash
great-cto board   # localhost:3141
```

6 ビュー、実際のスクリーンショット — [greatcto.systems#board](https://greatcto.systems#board) を参照。

| ビュー | 内容 |
|-------|------|
| **Inbox** | 再開カード · 保留中の決定 · オープンな P0 · ブロック · 停滞 (進行中 > 48h) |
| **Kanban** | 5 列 · インラインゲート承認/拒否 · フィルタバー · ⌘K 検索 · `j`/`k` ナビゲーション |
| **Metrics** | ヒーローカード (速度、コスト、MTTR) · 30 日 LLM 支出チャート (予算アラート付き) |
| **Agents** | エージェントごとの時間、LLM コスト、$150/時間での人間換算 · アクティビティフィード |
| **Memory** | 4 層ブラウザ: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Public report** | トグルオン → 推測不可能な URL (リリース済みタスク、AI vs 人間コスト比較)。コードなし、認証情報なし。 |

マルチプロジェクトスイッチャー — 1 つのボード、すべてのクライアント。

## 毎日使う 3 つのコマンド

| コマンド | 役割 |
|---------|------|
| `/start "説明"` | 完全な SDLC パイプラインを実行 — アーキタイプ検出、アーキテクチャドキュメント生成、TDD で実装、レビュー、QA、セキュリティ、デプロイ |
| `/review` | 現在のブランチで 12 の独立したコードレビュー視点 |
| `/inbox` | オープンなゲート、ブロックされたタスク、P0 インシデント、セキュリティアラート — 今あなたの決定が必要なすべて |

その他 (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) は自動または必要時のみ実行。完全リファレンスは [`docs/COMMANDS.md`](../COMMANDS.md) を参照。

## 25 アーキタイプ自動検出

各アーキタイプは独自のスペシャリスト・エージェントとコンプライアンスチェックリストを起動します。

| アーキタイプ | デフォルトティア | 自動ロードされるスペシャリスト | コンプライアンス |
|-------------|----------------|-------------------------------|----------------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |

いつでもオーバーライド可能: `npx great-cto init --archetype <name>` または `.great_cto/PROJECT.md` を編集。CLI はヒューリスティック信頼度が低い場合に Anthropic Haiku セカンドオピニオン (~$0.001) も提供 — `ANTHROPIC_API_KEY` を設定して有効化、`--no-llm` でオプトアウト。

## 何が違うのか?

私たちはエディタではない — エディタの周りでプロセスをオーケストレーションします。Cursor、Copilot、Claude Code をループ内で使用してください。

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| マルチエージェント SDLC パイプライン | ✓ 33 スペシャリスト | ✕ | ✕ | ✕ |
| 自動アーキタイプ検出 | ✓ 25 タイプ | ✕ | ✕ | ✕ |
| コンプライアンスゲート (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| 永続メモリ | ✓ decisions.md + verdicts | ⚠ チャットのみ | ✕ | ✓ チャットスコープ |
| マルチプロジェクトビュー | ✓ | ✕ | ✕ | ⚠ |
| 12 角度コードレビュー | ✓ | ⚠ シングルパス | ⚠ シングルパス | ✕ |
| 公開可能なレポート | ✓ | ✕ | ✕ | ✕ |
| オープンソース | ✓ MIT | ✕ | ✕ | ✕ |
| ローカル実行 | ✓ | ⚠ 部分的 | ✕ | ✕ |
| 自分の API で支払い | ✓ | ✕ | ✕ | ✕ |
| **価格** | **$0 + あなたの API** | $20/月 | $39/月 | $20/月 |

## コスト

```
~$34/月 — 典型的な製品チームで月 20 回のパイプライン実行、参考値。
```

| パイプライン | コスト/実行 | 月実行数 | 合計 |
|-------------|-----------|---------|------|
| quick (設定 / typo) | $0.10 | 10 | $1 |
| quick (新エンドポイント) | $1 | 6 | $6 |
| standard (機能) | $5 | 3 | $15 |
| deep (横断的) | $12 | 1 | $12 |
| | | | **~$34** |

自分の Anthropic API トークンで支払い。**席ごとの料金なし。SaaS ロックインなし。** ルーティン triage は Kimi K2 (Sonnet 同等で約 5 倍安い) に自動ルーティング → ログクラスタリングとノイジースタックトレースで 60–80% コスト削減。

## FAQ

**インターネット接続なしで動作しますか?**
エージェントは Claude Code サブエージェントとしてローカルで実行されます。Claude API 呼び出しのみが Anthropic に届きます。コード、テレメトリ、メモリは他のどこにも送信されません。

**ソースコードはモデルのトレーニングに使用されますか?**
いいえ。Claude API は有料顧客に対してデフォルトでゼロ保持です。great_cto は何も追加しません — あなたのコードはあなたのものです。

**すでに CI/CD がある場合は?**
great_cto は CI の*前*に動作します。アーキテクチャ、レビュー、プリマージ段階で問題をキャッチします。両方使用 — 補完的で競合しません。

**Cursor / Copilot / Aider のサポートは?**
現在は Claude Code のみ。`AGENTS.md` ベースのクロスハーネスサポートは v2.x ロードマップにあります。

**フックが邪魔な場合、無効化できますか?**
すべてのフックは `GREAT_CTO_DISABLE_<NAME>=1` 環境変数を尊重します (例: `GREAT_CTO_DISABLE_SECRET_SCAN=1`)。セキュリティスキャンは `// agentshield:ignore` でファイルごとにオプトアウト可能。

**トークンコストを低く保つ方法は?**
3 層 — (1) デフォルトで Haiku を安いエージェントに、(2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) で triage (60-80% 節約)、(3) `cost-guard` フックが高価なプロンプトの前に警告。`/cost` でライブ支出を確認。

**アンインストール時にデータはどうなりますか?**
プラグイン状態は `~/.great_cto/` (グローバル決定) と `.great_cto/` (プロジェクトごと) に存在。両方とも単純な markdown — `rm -rf` ですべてクリア。認証解除する外部サービスはありません。

**なぜ自動操縦ではない? なぜ「機能ごとに 2 つの決定」?**
LLM は強力だが、曖昧な仕様で製品判断を失います。gate:plan と gate:ship に人間を保つことで、95% のコストの原因となる 5% の悪い判断をキャッチします。[ADR-015 — 学習ループアーキテクチャ](../architecture/ADR-015-learning-loop-architecture.md) を参照。

## 作者

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder。AI ネイティブな取引・fintech プラットフォームを構築する CTO (0→1, 1→N)。テクノロジーが PnL、リスク、ユニットエコノミクスに直接影響する高負荷金融システムを専門。

## ⭐ このリポジトリにスター

great_cto がプロジェクトの時間を節約したなら、リポジトリにスターを — 他のソロファウンダーや小規模チームが見つけるのに役立ちます。

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 コミュニティ・サポート

| チャネル | 内容 |
|---------|------|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | バグ、機能リクエスト、アーキタイプ提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 質問、パターン共有、ショー & テル |
| 📝 [ブログ](https://velikiy.hashnode.dev) | アーキテクチャ、学習ループ、コスト較正の深堀り |
| 🐦 [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) | リリースノート、記事、AI-CTO シリーズ |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | パッケージレジストリ |
| 🔒 [Security](../../SECURITY.md) | フック/スキャナー CVE の責任ある開示 |

## ロードマップ

- **v2.2** — レッスン品質テレメトリ
- **v2.3** — 自動昇格: 高インパクト決定 → 再利用可能なスキル
- **v3.0** — クロスハーネスサポート (Cursor / Codex / OpenCode / Gemini 用 `AGENTS.md`)

## ライセンス

MIT — [LICENSE](../../LICENSE) を参照。

---

<div align="center">

**[@avelikiy](https://github.com/avelikiy) · [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) によって構築**
*リリースできる唯一の人間でいるのをやめよう。*

</div>
