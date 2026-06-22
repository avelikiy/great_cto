<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**AI 產品建構器 —— 描述產品、核准規格、交付軟體。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[官網](https://greatcto.systems) · [一次真實執行 →](https://greatcto.systems/proof) · [線上示範](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [討論區](https://github.com/avelikiy/great_cto/discussions) · [更新日誌](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## 打造產品，而不只是程式碼

**你描述產品，great_cto 把它交付出去。**不是程式碼片段，不是專案骨架——而是一個真實、
已部署的應用程式，具備後端、前端、生成的測試，以及一個線上 URL。你只需做**唯一一個決定：
核准規格。**在那之後的一切——架構、資料模型、建構、評審、部署——都會無人值守地自動運行。

它是一個 **AI 產品建構器**，而不是又一個寫程式代理人的迴圈。它是位於你已在使用的寫程式代理人
*之上*的編排層：一支會規劃、建構、評審並把關工作的專家代理人團隊——讓一個人也能像一整個
工程組織那樣出貨。

> **一項真實功能：從構想到已合併的 PR，僅花 `1h 26m`、LLM 成本 `$3.40`。**同一項功能的
> 傳統路徑約需 6 週、約 $42K。[查看完整追蹤 →](https://greatcto.systems/proof)

它所建構的橫跨美國頂尖服務業——居家與外勤服務、專業服務、餐旅、零售／電商、地產科技、
健身、行銷與創作者、人資／招募、營建、物流——這些可收斂為 **6 條可重複使用的建構流水線**
（CRUD 垂直 SaaS、預約、CRM、儀表板、市集、內容／媒體）。一套指令就能交付約 **40 種產品**
中的任何一種。詳見 [docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md)。

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

CI 與生成的測試就是品質關卡——你簽署的是**方向**，而不是每一行程式碼。

## 引擎蓋之下（給負責運營的 CTO）

→ *此介面面向建構者的故事：[greatcto.systems/build](https://greatcto.systems/build)*

每項產品都由一條專家代理人流水線打造——架構師、design-advisor、senior-dev、QA、
security-officer、devops——它會跑 spec → scaffold → backend → frontend → tests → deploy。
**你只需做一個決定：核准規格。**在那之後的一切都自動運行。流水線採風險分級——維護性修復
不開任何關卡（CI 就是關卡），可逆功能只開計畫關卡，不可逆變更則強制啟用完整關卡——因此
儀式感隨爆炸半徑而調整，而非隨文書作業而調整。CI 與建構自身生成的測試構成品質關卡，使得
放手讓流水線一路跑到部署成為安全之舉。

**一道關卡，落在最關鍵之處。**建構步驟採風險分級：可逆變更在 CI 把關下建構並交付；不可逆
變更——正式環境部署、結構描述遷移、新增可寫入的整合——會在執行前升級到 CTO 關卡與前沿
模型。你簽署規格與高爆炸半徑的呼叫；其餘則直接放行。`change-tier` + `effectiveGates` 在程式碼中
落實此不變式。

## 用數字說話

| | |
|---|---|
| 一項功能，端到端（真實執行，完整追蹤） | **1h 26m · $3.40 LLM** 對比傳統的 ~$42K / ~6 週 |
| 較早的一次 CLI 功能執行，同一條流水線 | $2.39 LLM 對比約 $5,460 的同等人力；安全揪出 2 個 QA 已放行的缺陷 |
| 每月成本（20 次流水線執行） | **~$34** |
| 目標美國產業 | **10**（居家服務 · 零售 · 地產科技 · 健身 · 人資 · …） |
| 可建構的產品 | **~40** 種，橫跨 10 個產業 |
| 可重複使用的建構流水線 | **6**（CRUD · 預約 · CRM · 儀表板 · 市集 · 內容） |
| 專家代理人 | **46** |

→ [包含所有產物的完整追蹤](https://greatcto.systems/proof) · [這 6 條流水線](https://greatcto.systems/pipelines)

## 運作方式

**`npx great-cto init`** ——掃描你的技術堆疊，並將你產品所需的流水線寫入 `.great_cto/FLOW.md`：代理人、建構原型，以及唯一的 CTO 關卡。

**`/start "描述產品"`** ——架構師與 design-advisor 草擬規格、資料模型與畫面。你在**唯一的關卡** `gate:plan` 審查並核准它。

**流水線把它交付出去** ——senior-dev 以 TDD 搭建並建構，QA 跑生成的測試，devops 部署。可逆建構無需進一步核准。

## 三種產品——一條流水線

同一條指令，不同產品。建構原型形塑技術堆疊與整合：

| | **派工 App** | **課程預約 App** | **獲利能力儀表板** |
|---|---|---|---|
| 原型 | CRUD 垂直 SaaS | 預約 / 排程 | 儀表板 / 分析 |
| 技術堆疊 | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| 整合 | Auth · RBAC | Stripe · Twilio | source connectors |
| 人類關卡 | `gate:plan`（CTO 關卡） | `gate:plan` | `gate:plan` |

→ 查看這 6 條流水線：[greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## 你真的會去看的儀表板

`great-cto board` 在 `http://localhost:3141` 開啟——建構看板：即時 SSE、附帶 change_tier 徽章的即時流水線（一道 CTO 關卡 · 便宜的評審）、每個代理人的成本、30 天 LLM 花費對比同等人力的基準。

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>指標</b> — 已出貨任務、AI 花費、對比人類團隊的成本節省、每日燒錢率</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>記憶</b> — 可瀏覽的專案記憶層：PROJECT.md、原型、技能、經驗教訓</sub></td>
</tr>
</table>

**為一人工程組織打造。**GreatCTO 是給想在沒有團隊的情況下交付真實產品的獨立開發者、單人創辦人或技術型 CTO——在 Claude Code 或 OpenAI Codex 上運行流水線、核准一份規格、交付到一個線上 URL。*不適合多人開發的工程團隊*——詳見 [FAQ](../FAQ.md#is-great_cto-for-teams)。

## 安裝

```bash
npx great-cto init
```

init 後請重啟你的 AI 主機。**需要：**Node 18.17+ 以及下列之一：

| 主機 | 安裝旗標 | 狀態 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _（預設）_ | ✅ 完整支援 |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + agents |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Superpowers 與 Beads 隨附外掛會自動安裝——無需手動設定。

---

<details>
<summary>📖 完整文件——一道 CTO 關卡 · 風險分級 · 評論者 · 46 個代理人 · 建構原型 · 看板 · 成本 · MCP</summary>

## 每項功能一個決定

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

流水線採風險分級（`change_tier`）：維護性修復**不**開任何關卡（CI 就是關卡），可逆功能**只**開 `gate:plan`，而不可逆變更則強制啟用完整關卡 + 前沿模型。關卡到部署之間的一切都自動運行。**記憶會在工作階段之間持續保留**：每一次關卡裁決都會追加到 `~/.great_cto/decisions.md`，每一次回顧都會追加到各專案的 `lessons.md`，而 `/crystallize` 會把高影響力的模式提升到一個全域函式庫，供代理人在重新解題前查詢。

## 計畫之前的評論者

最昂貴的錯誤不在程式碼裡——而在開始寫程式之前所做的決策裡。三個評論者代理人在 Plan 階段之前運行，正好位於錯誤代價最高的三個位置：

| 評論者 | 揪出什麼 |
|---|---|
| **架構評論者** | 日後排除多租戶可能性的耦合 · 在真實規模資料上「顯而易見」的 O(n²) · 受限上下文（bounded context）之間的循環相依 |
| **規格評論者** | 「我們解錯了問題」——最糟的一類錯誤，因為沒有單元測試會抓到它 · 不一致的驗收標準 · 從未達成共識的範圍 |
| **結構描述評論者** | 在 5000 萬列的表上加 `NOT NULL` 卻沒有預設值（部署 10 分鐘後死鎖） · 建立索引時缺少 `CONCURRENTLY` · 無回滾路徑的不可逆遷移 |

過去評論者只從 Plan 階段才開始啟用。現在流水線會在實作開始之前就攔下架構與規格層級的錯誤——此時撤回只花幾小時，而非幾天。

## great_cto 的比較

|  | **great_cto** | Devin | Claude Code（單獨使用） |
|---|---|---|---|
| 開源 | ✅ MIT | ❌ 閉源 | ❌ 閉源外掛模式 |
| 自架 | ✅ 本機運行 | ❌ Cognition 雲端 | ✅ |
| 主機 | ✅ Claude Code + Codex | ❌ Cognition 雲端 | ✅ Claude Code |
| BYOK / 多模型 | ✅ Claude Code · Codex | ❌ 專有 | ❌ 僅 Anthropic |
| 專家代理人 | **46**（架構師 · design-advisor · senior-dev · QA · 安全 · devops · 原型審查者） | 1 位通才 | 1 位通才 |
| 建構流水線 | spec → CTO 關卡 → scaffold → build → test → deploy | 一次性自主 | 編輯迴圈 |
| 人類關卡 | ✅ 一道——你核准規格（風險分級） | ❌ 無 | ❌ |
| 跨工作階段記憶 | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ 僅執行緒 | ⚠️ 僅執行緒 |
| 成本追蹤 | ✅ 每個代理人 + 30 天歷史 + savings_x | ❌ | ❌ |
| 內建設計 | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
| 定價 | 免費（你支付自己的 LLM 提供者） | $500/月 | $20/月 |
| 設定 | `npx great-cto init` | 註冊 | 安裝 CLI |

great_cto **不是**又一個寫程式代理人的迴圈——它是位於你已在使用的寫程式代理人**之上的編排層**。可以把它想成「一支審查並把關工作的專家團隊」，而非「又一個替你打字寫程式的助理」。

## 司法轄區偵測

`npx great-cto init` 掃描三種訊號來源——README 關鍵字、基礎設施區域字串（Terraform、`.env` 的 `AWS_REGION=`、docker-compose 的 `TZ=`），以及 `package.json` 的 homepage 頂層網域——並自動偵測 **12 個司法轄區**中哪些適用：

| 司法轄區 | 訊號（README + 基礎設施） | 框架 | 審查者 |
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

詞界比對可防止誤判（`"india"` 不會比對到 `"indiana"`）。偵測到的司法轄區會以 `jurisdiction: [eu, us-ca]` 的形式寫入 `PROJECT.md`，並在每項功能上把關對應的審查者。可手動覆寫：

```yaml
jurisdiction: [eu, us-ca]
```

## 你每天會用到的三條指令

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

此外還有：`/audit`（既有程式碼庫掃描）、`/cost`（LLM 路由器節省）、`/sec`（安全總管）、`/oncall`、`/release`、`/rfc`。完整清單：安裝後的 `~/.claude/commands/`。

## 成本

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| 流水線 | 每次成本 | 每月次數 | 總計 |
|---|---|---|---|
| quick（設定 / 錯字） | $0.10 | 10 | $1 |
| quick（新端點） | $1 | 6 | $6 |
| standard（功能） | $5 | 3 | $15 |
| deep（橫切關注） | $12 | 1 | $12 |
| | | | **~$34** |

支付你自己的 Anthropic API token。**無按席位收費。無 SaaS 綁定。**例行的分流會自動路由到 Kimi K2（與 Sonnet 同等、成本約低 5 倍）→ 日誌叢集化減少 60–80%。

## 建構原型

每項產品都會對應到一種**建構原型**，由它形塑流水線——技術堆疊範本、資料形狀、招牌整合。
6 種產品建構器原型（約 40 種產品收斂為以下幾種）：

| 原型 | 形狀 | 技術堆疊 | 整合 |
|---|---|---|---|
| `vertical-saas` | 實體 · 角色 · 工作流程 · 記錄 UI | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | 行事曆 · 可用時段 · 提醒 · 付款 | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | 聯絡人 · 流程管線 · 自動化序列 | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | 擷取 · 指標 · 視覺化 · 警示 | Next.js · warehouse-lite · charts | source connectors |
| `marketplace` | 雙邊刊登 · 媒合 · 付款 | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | 目錄 · 存取層級 · 投遞 · 變現 | Next.js · object storage · CDN | Stripe · media pipeline |

此外還有引擎自動偵測以調校建構的底層軟體種類原型（`web-service`、`mobile-app`、`cli-tool`、
`library`、…）。詳見 [這 6 條流水線](https://greatcto.systems/pipelines)。

完整表格（26 種原型）+ 偵測如何運作：[docs/ARCHETYPES.md](../ARCHETYPES.md)。

**深度美國覆蓋** ——除了 GDPR/PCI/HIPAA，great_cto 現在還會針對 SEC 網路揭露（8-K Item 1.05）、給國防承包商的 CMMC 2.0 / NIST 800-171、美國 AI 治理（NIST AI RMF · Colorado SB 205 · Utah/Texas AI）、網路追蹤訴訟（VPPA · CIPA · Washington MHMDA），以及放貸的 HMDA / SR 11-7 模型風險進行審查。

## 領域疊加層（可選）

除了建構原型之外，當引擎偵測到領域特有的訊號（相依套件、README 術語）時，可自動掛載一個
可選的**領域疊加層**——為語音／電信、隱私（GDPR/CCPA）或 AI 治理之類的事項加上一名專家
審查者與少數額外檢查。它們採選擇加入制，並與建構流水線正交；多數產品都不需要。

## 一次真實執行，完整追蹤

標準收據：**一項真實功能**跑完整條流水線出貨，**牆鐘時間 1h 26m、LLM 成本 $3.40**——
architect → plan → implementation → review → 人類關卡 → 已合併的 PR。同一功能的傳統路徑：
約 170 小時、約 $42K。每個階段都有時間戳記，每件產物都連結到一個公開的 GitHub PR。

較早的一次 Python CLI 功能執行（$2.39 對比約 $5,460 的同等人力）展示了審查模式的運作：安全揪出兩個 QA 已放行的真實缺陷（`list(stream_csv())` 破壞了串流 → 13 MB 輸入導致 14.5 MB 的峰值 RSS）。

完整追蹤 + 產物：[greatcto.systems/proof](https://greatcto.systems/proof) · 原始檔：[`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md)。

## CI 整合

放進任何 GitHub Actions 工作流程：

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` 會自動偵測 `$GITHUB_ACTIONS`，並在 PR 差異上直接內嵌發出 `::error file=...,line=N::` 註解。結束代碼：0 乾淨 / 1 有發現 / 2 設定錯誤。

## 測試金字塔

分層的測試套組——**結構 + 狀態機層在 <2 分鐘內以 $0 完成**（`node --test tests/*.test.mjs`）；真實 LLM 層（26 種原型 × 4-8 階段 + 14 個套件 + 13 位審查者）透過 OpenRouter 按需執行，約 $5–10。完整細項：[docs/testing/](../testing/)。

## MCP

原生 [MCP](https://modelcontextprotocol.io/) 伺服器——**7 個工具**可從 Claude Desktop、Codex 或任何 MCP 主機呼叫。本機（不需看板）：`detect_archetype` · `estimate_cost` · `query_decisions`。看板後端支援：`project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`。

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

完整設定 + 內部 MCP（Grafana、LLM 路由器、Beads）：[docs/MCP.md](../MCP.md)。

## 電子郵件警示（零設定）

五件需要你在 <2 小時內處理的事會自動寄送電子郵件——即使你離開看板也一樣：

| 觸發條件 | 何時 |
|---|---|
| 🚨 **P0 事故** | 任一專案開出 P0 任務 |
| ⏸️ **關卡停滯 > 2 小時** | 某個 `gate:ship` 等你好幾個小時了 |
| 🛡️ **安全 BLOCKED** | `security-officer` 駁回了一次合併 |
| 💸 **預算警示** | 每月 LLM 花費跨越預算的 80% / 100% |
| 📊 **每週摘要** | 週五 09:00 ——已出貨、已花費、節省、QA |

**設定**：看板 → **Notifications** 分頁 → 輸入電子郵件 → 輸入我們寄出的 6 位數代碼 → 挑選觸發條件。無需 Resend 註冊、無需 API 金鑰——投遞經由 `greatcto.systems/notify`（免費，每個已驗證電子郵件每 24 小時 100 封）。

## 限制與非目標

- **不適合多人開發的工程團隊** ——單一建構者就是這個產品；2 人以上共用同一條流水線的工程師已經超出它的適用範圍了。
- **不能取代資深工程師** ——它把流程編成規範；少了資深工程師，它不會替你做架構判斷。
- **不是 CI/CD 系統** ——關卡在本機 / 工作階段中運行。實際合併你仍需要 GitHub Actions。
- **未經認證稽核** ——PCI/HIPAA/SOC2 的原型骨架是起點，不是認證。
- **非確定性** ——LLM 生成的輸出。每一次關卡裁決都應做合理性檢查。

## FAQ（前 5 名）

**我的原始碼會被用來訓練模型嗎？** 不會。Claude API 對付費客戶預設零保留。great_cto 不會多加任何東西。

**你們如何壓低 token 成本？** 預設 Haiku + 用於分流的 Kimi K2 路由器（節省 60–80%）+ cost-guard hook。

**我可以停用 hooks 嗎？** 每個 hook 都遵循 `GREAT_CTO_DISABLE_<NAME>=1`。逐檔停用機密掃描：`// great_cto:allow-secrets`。

**如果我不是單人怎麼辦？** GreatCTO 的建構流水線是為一名工程師打造的——如果你有 2 位以上的工程師、並需要共享的建構看板與並行的流水線，你已經超出它的適用範圍了。

完整 FAQ：[docs/FAQ.md](../FAQ.md)。

## 文件

📚 **[完整文件中心 →](../README.md)** ——依 [Diátaxis](https://diataxis.fr/) 組織：
**[入門](../tutorials/getting-started.md)** · 操作指南 ·
[代理人](../reference/agents.md) 與 [指令](../reference/commands.md) 參考 · [架構](../ARCHITECTURE.md) · [FAQ](../FAQ.md)。

## 架構

此外掛在 Claude Code（或任何具 MCP 能力的主機）內運行；46 個代理人是 markdown 規格；任務存放在 Beads（dolt，git 原生）中；記憶是純 markdown（無向量儲存）。圖表 + 技術堆疊表：[docs/ARCHITECTURE.md](../ARCHITECTURE.md)。

## 有什麼新功能

**v2.74+**（2026 年 6 月）—— **產品建構器轉向**：GreatCTO 成為一個 *AI 產品建構器*——描述一項軟體產品，在一道 CTO 關卡核准規格，流水線就會把它交付出去（spec → build → test → deploy）。10 個美國產業、約 40 種產品、6 條可重複使用的流水線。建構關卡採風險分級（`change_tier`）；受監管的執行期介面已移出至 [avelikiy/operate](https://github.com/avelikiy/operate)。故事：[策略](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [這 6 條流水線](https://greatcto.systems/pipelines)

**v2.40–v2.62**（2026 年 6 月）—— **自動駕駛轉向**：GreatCTO 成為 *面向企業的 AI 自動駕駛*——25 個服務自動駕駛垂直領域，每一個都是一條附帶可量測品質計分卡、可問責負責人，以及「**不可逆的動作絕不在沒有人類簽署的情況下執行**」此一執行期不變式的流程。22 個即時連接器讓每條垂直領域在真實資料上運行。故事：[我們轉向了 →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63**（2026 年 6 月）—— **操作員主控台**：持久化的執行在人類關卡暫停，並在收件匣中等待一位具名的持照人類；簽署即執行寫入。角色式存取、範圍化邀請、附帶證據的 AI 草擬裁定、QA 抽樣、SLA 計時、Ops 分頁（計量 · 連接器健康度 · 死信重新排入佇列）、WCAG 2.2 AA、淺色/深色。故事：[操作員主控台 →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65**（2026 年 6 月）—— **引擎蓋之下**：開發看板成為一個 *pult*——核准一道關卡可以衍生出一次即時串流的代理人執行；prompt 自我改進以保留集 eval 為關卡（受 SIA 啟發）；$0 上下文壓縮（CI 日誌 31,475 → 155 字元，並保留 FATAL）；Fable 5 支援。故事：[六月引擎蓋之下 →](https://greatcto.systems/blog/june-under-the-hood)

[完整更新日誌 →](../../CHANGELOG.md)

## 路線圖

- **產品原型偵測** ——從產品簡介挑選建構原型，而不只是從技術堆疊
- **各產業建構範本** ——透過這 6 條流水線各自端到端交付一項參考產品
- **分級感知評審** ——在 T0/T1 eval 上用便宜的微調評審，T2 則用前沿 + 人類（ADR-004）
- **無頭任務執行器** ——把產品建構排入佇列、無人值守地在 VPS 上執行

[為下一個功能投票 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 作者

[avelikiy](https://github.com/avelikiy) ——打造 AI 原生交易與金融科技平台（0→1、1→N）的 CTO。great_cto 是我一次一個代理人地自動化自己工作迴圈的成果。每一條規則，都是為了回應某個真實生產系統中的真實問題而出現的。

## 社群

| 管道 | 內容 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | 錯誤、功能請求、原型提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 問題、模式、成果分享 |
| 📝 [Blog](https://greatcto.systems/blog/) | 收據、成本拆解、架構深度剖析 |
| 🔒 [SECURITY.md](../../SECURITY.md) | 負責任的漏洞揭露 |

## 貢獻與授權

歡迎提交 Pull Request——詳見 [CONTRIBUTING.md](../../CONTRIBUTING.md)。適合新手的 issue：[`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue)。

MIT——詳見 [LICENSE](../../LICENSE)。

如果 great_cto 為你省下了時間，請為這個 repo 點星——這能幫助其他單人 CTO 找到它。

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**由 [@avelikiy](https://github.com/avelikiy) 打造**
*別再當那個唯一能出貨的人。*

</div>
