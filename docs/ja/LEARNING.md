# 継続学習 (Continuous Learning)

> **言語:** [English](../LEARNING.md) · [Русский](../ru/LEARNING.md) · [简体中文](../zh-CN/LEARNING.md) · [繁體中文](../zh-TW/LEARNING.md) · **日本語** · [한국어](../ko/LEARNING.md) · [Español](../es/LEARNING.md) · [Português (BR)](../pt-BR/LEARNING.md)
>
> ⚠️ 機械翻訳の要約です。完全な詳細と ADR リンクは [English original](../LEARNING.md) を参照。

great_cto v1.2.0 は、各セッションからパターンを自動抽出し、将来のセッションで再利用する**二層学習ループ**を追加しました。

## パイプライン

```
セッション終了 → SessionEnd フックがスナップショット + プロジェクト登録
            → continuous-learner エージェントが transcript + git + verdicts を読み取り
            → セッションあたり ≤3 レッスン抽出 → .great_cto/lessons.md (プロジェクトローカル)
            → lessons-merge.mjs: ≥3 プロジェクトのパターン → ~/.great_cto/decisions.md (クロスプロジェクト)
            → 次のセッション: architect, pm, senior-dev が両ファイルを起動時に読む
```

## 二層メモリ

| ファイル | スコープ | 昇格基準 | 読み取り |
|---|---|---|---|
| `.great_cto/lessons.md` | プロジェクトローカル | continuous-learner の品質ゲート | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | このマシンの全プロジェクト | ≥3 異なるプロジェクトのパターン | architect, pm, senior-dev |

## 捕獲対象

5 種類のパターン形態、それぞれ厳格な品質ゲート付き:

| 形態 | ソースシグナル | 例 |
|---|---|---|
| **A. レビュアーが検出** | agent-verdicts の Critical/High 発見 | "PCI レビュアーが 3 fintech プロジェクトで webhook 署名欠落を検出" |
| **B. コスト外れ値** | エージェント呼び出しが平均の 2x+ | "Architect は solo fintech で 3x 高い — $8 を事前割り当て" |
| **C. 繰り返しミス** | 同じ修正が ≥2 commits | "3 コンポーネントで `useEffect` cleanup をリファクタ" |
| **D. Discovery missed** | 実装中にアーキテクト前提が覆される | "US-only と仮定; 実際は EU-required" |
| **E. ツール/ライブラリ決定** | 測定可能な結果を持つ ADR | "mlops 用に Drizzle を Prisma 上に選択 — 40% バンドル削減" |

continuous-learner はこれらの形態に合わないものを**拒否** — 沈黙 > ノイズ。

## 品質ゲート

候補レッスンは、以下のいずれかが真の場合**拒否**:
- 1 プロジェクトの 1 ファイルにのみ適用 (狭すぎ)
- ユーザー設定を捕獲、転送可能なパターンではない
- 明白なベストプラクティスを再述
- 具体的な証拠なし (sha, file:line, コスト数値)
- PII、シークレット、機密用語を含む
- Pattern slug が既に lessons.md にある (重複排除)
- 測定可能な結果のない主観的なもの

## プライバシー

**デフォルトローカル、オプトイングローバル。** Learner はあなたのマシンで実行; lessons.md と decisions.md はディスクから出ない。

Learner が捕獲してはいけないもの (agent prompt で強制):
- API キー、トークン、パスワード、JWT
- メール、電話、名前
- 内部コードネーム、機密用語
- 顧客/ユーザー ID または `.env*` データ
- ソースコード内容 (file:line 参照のみ)

完全なプライバシー規則は **ADR-016** を参照。

## 設定

```bash
# セッション終了キャプチャを完全無効化
export GREAT_CTO_DISABLE_SESSION_LEARNING=1

# 手動トリガー
/learn              # 現在のセッションからレッスン抽出
/learn cost         # コスト外れ値に集中 (shape B)
/learn security     # レビュアー発見に集中 (shape A)
/learn architecture # ツール/ライブラリ決定に集中 (shape E)

# 状態確認
cat .great_cto/lessons.md
cat ~/.great_cto/decisions.md
ls ~/.great_cto/projects/

# 強制再集約
node scripts/lessons-merge.mjs
node scripts/lessons-merge.mjs --dry-run
node scripts/lessons-merge.mjs --force

# リセット
rm .great_cto/lessons.md
rm -rf ~/.great_cto/{decisions.md,projects/}
```

## エージェントによるレッスン使用

3 エージェントがセッション開始時に lessons.md + decisions.md を読む:
- **Architect** — アーキテクチャ決定前に過去のレッスンを参照; 現在のアーキタイプでフィルタ
- **PM** — 見積前にコスト外れ値レッスンと校正 (shape B)
- **Senior-dev** — タスク取得前に既知の反パターンをスキャン; commit で引用

## ロードマップ

- **v1.2.0** — continuous-learner + lessons-merge + エージェント統合
- **v1.3.0** — テレメトリ: エージェントが実際に引用する vs 無視するレッスンを追跡
- **v1.4.0** — 自動昇格: 高インパクト決定 → 再利用可能なスキル

## 参照

- **ADR-015** — 学習ループアーキテクチャ
- **ADR-016** — プライバシー保護
- **ADR-017** — スキル候補昇格基準
- `agents/continuous-learner.md` — エージェント本体
- `scripts/lessons-merge.mjs` — クロスプロジェクト昇格スクリプト
- `commands/learn.md` — 手動トリガー

完全なドキュメントは [English LEARNING.md](../LEARNING.md) を参照。
