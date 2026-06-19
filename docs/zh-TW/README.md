> ⚠️ **This translation is being updated.** GreatCTO has repositioned to an **AI Product Builder** — describe a product, approve the spec, ship the software (one CTO gate, maximum automation). For the current positioning see the [English README](../../README.md). The text below reflects the previous "AI autopilots" direction.

<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**面向企業的 AI 自動駕駛（autopilot）——交付完成的工作，而不只是軟體。**

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

[官網](https://greatcto.systems) · [一次真實執行 →](https://greatcto.systems/proof) · [線上示範](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [討論區](https://github.com/avelikiy/great_cto/discussions) · [更新日誌](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## 服務就是新的軟體

下一波浪潮不是給專家用的工具——而是**販售一項服務成果的自動駕駛**。
一個自動駕駛端到端地執行整個業務職能（接收 → 處理 → 決策 → 交付），
只將需要判斷的關鍵環節升級交給合格的人。每一次模型改進，都讓這項服務
更快、更便宜。

GreatCTO 交付的正是這些自動駕駛——每一個都是**由代理人 + 工具組成、並在高風險
步驟上保留人類的流程**，內建合規審查者，以及讓每條流程在真實資料上運行的**即時連接器**。

## 各個自動駕駛

| 自動駕駛 | 它做什麼 | 市場規模 | 誰在打造它 |
|---|---|---|---|
| 🩺 **[醫療編碼（Medical-coding）](https://greatcto.systems/autopilots/rcm.html)** | 臨床記錄 → 乾淨、合規的理賠申請；由認證編碼師簽署高風險項目 | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[託管 IT（Managed-IT）](https://greatcto.systems/autopilots/msp.html)** | 跨整個機群的修補、設定與存取——分階段、可回復，重大變更由人把關 | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[法律文件（Legal-document）](https://greatcto.systems/autopilots/legaltech.html)** | 起草與紅線標註合約與 NDA；任何屬於法律意見的內容由執業律師簽署 | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[記帳與結帳（Bookkeeping & close）](https://greatcto.systems/autopilots/accounting.html)** | 記帳、對帳並完成月結；由財務主管簽署結帳 | $50–80B | Rillet · Basis · Digits |
| 🧾 **[報稅（Tax-prep）](https://greatcto.systems/autopilots/tax.html)** | 準備報稅表並分類稅務立場；由具資格的報稅員在申報前簽署 | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[採購到付款（Source-to-pay）](https://greatcto.systems/autopilots/procurement.html)** | 導入供應商、比對發票、放款付款——並篩查制裁與詐欺 | $200B+ | Tacto · Zip · AskLio |

→ [所有自動駕駛](https://greatcto.systems/autopilots.html) · 執行 `/flow <vertical>` 即可在你的終端機中查看任一流程

**每個自動駕駛都在需要判斷的環節上保留一名人類**——認證編碼師、執業律師、財務
主管、具資格的報稅員。自動駕駛處理大量工作；由人類負責承擔法律責任的那個決定。**9 個即時
連接器橫跨全部六個自動駕駛運行**——FHIR、ICD-10（NLM）、
NCCI/MUE、X12 837P、DocuSign、Plaid、OFAC、分階段推出，以及一個美國聯邦稅務引擎。它們
預設免金鑰（採用公開資料來源或確定性的真實生成），並在你加入憑證的那一刻就向真實提供者
發送 POST 請求。

## 引擎蓋之下（給負責運營的 CTO）

每個自動駕駛都由一條設有關卡（gate）的專家代理人流水線打造與運營——架構師、12 個角度的
審查者、QA、安全官、devops——並針對你的技術堆疊與司法轄區進行調校。**每項功能你只需做兩個
決定；其餘一切自動運行。**合規審查者、由人類簽署的關卡、稽核軌跡與即時連接器，構成了讓
自動駕駛得以安全運行的信任層。

## 用數字說話

| | |
|---|---|
| LLM 成本（一項真實功能，已追蹤） | **$2.39** |
| 同等人力完成相同工作 | **~$5,460** |
| 揪出 QA 漏掉的缺陷 | **2** |
| 每月成本（20 次流水線執行） | **~$34** |
| 專家代理人 | **61** |
| 自動偵測的原型（archetype） | **26** |
| 司法轄區 | **12**（GDPR · HIPAA · PCI-DSS · SOX · 以及更多） |

→ [包含所有產物的完整追蹤](https://greatcto.systems/proof)

## 運作方式

**`npx great-cto init`** ——掃描你的技術堆疊與 README，偵測司法轄區（GDPR？HIPAA？PCI？），並將你專案所需的確切代理人、關卡與合規框架寫入 `.great_cto/FLOW.md`。

**`/start "描述功能"`** ——在寫下任何程式碼之前，評論者會先審查架構與規格。你在 `gate:plan` 審查計畫。

**代理人自動運行** ——senior-dev 以 TDD 實作，接著 12 個角度審查、QA、安全、devops。你在 `gate:ship` 核准出貨。

## 三個專案——三條不同的流水線

同一條指令。產出取決於你在打造什麼、以及它在哪裡運行：

| | **金融科技新創 · 歐盟** | **醫療入口網站 · 美國** | **CLI 工具** |
|---|---|---|---|
| 專家代理人 | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| 人類關卡 | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| 合規 | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| 每週期成本 | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ 試試互動式選擇器：[greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## 你真的會去看的儀表板

`great-cto board` 在 `http://localhost:3141` 開啟——具備即時 SSE 的看板、每個代理人的成本磚塊、流水線狀態，以及 30 天 LLM 花費對比同等人力的基準。

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>指標</b> — LLM 成本、同等人力基準、savings_x 比率</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>收件匣</b> — 待處理關卡、P0 事故、受阻任務、停滯的進行中項目</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>代理人</b> — 61 位專家，附最近使用時間與執行次數</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>記憶</b> — 11 層 + 已結晶化的事故模式</sub></td>
</tr>
</table>

**為一人工程組織打造。**獨立開發者、單人創辦人、親力親為一手包辦的技術型 CTO——在 Claude Code 或 OpenAI Codex 上運行。*不適合團隊*——詳見 [FAQ](../FAQ.md#is-great_cto-for-teams)。

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
<summary>📖 完整文件——兩道關卡 · 評論者 · 61 個代理人 · 26 種原型 · 12 個司法轄區 · 45+ 合規框架 · 看板 · 成本 · MCP</summary>

## 每項功能兩個決定

```
🟡 gate:plan   ←  你在此決定（架構 + 任務 + 成本）
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  你在此決定（PR 就緒，安全已簽核）
```

架構師、規劃者、審查者、QA、安全、DevOps 在這兩個人類檢查點之間自動運行。**記憶會在工作階段之間持續保留**：每一次關卡裁決都會追加到 `~/.great_cto/decisions.md`，每一次回顧都會追加到各專案的 `lessons.md`，而 `/crystallize` 會把高影響力的模式提升到一個全域函式庫，供代理人在重新解題前查詢。

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
| 專家代理人 | **57**（架構師 · PM · 12 角度審查 · QA · 安全 · devops · 跨原型、套件與司法轄區的 42 位審查者） | 1 位通才 | 1 位通才 |
| SDLC 編排 | architect → plan → impl → review → QA → security → devops | 一次性自主 | 編輯迴圈 |
| 人類關卡 | ✅ 每項功能 2 道（plan + ship） | ❌ 無 | ❌ |
| 跨工作階段記憶 | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ 僅執行緒 | ⚠️ 僅執行緒 |
| 成本追蹤 | ✅ 每個代理人 + 30 天歷史 + savings_x | ❌ | ❌ |
| 合規框架 | ✅ 33+（PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …） | ❌ | ❌ |
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

此外還有：`/audit`（既有程式碼庫掃描）、`/cost`（LLM 路由器節省）、`/sec`（安全總管）、`/oncall`、`/release`、`/rfc`。完整清單：安裝後的 `~/.claude/commands/`。

## 成本

```
典型的單人 CTO 專案每月約 $34 ——每月 20 次流水線執行，僅供參考。
```

| 流水線 | 每次成本 | 每月次數 | 總計 |
|---|---|---|---|
| quick（設定 / 錯字） | $0.10 | 10 | $1 |
| quick（新端點） | $1 | 6 | $6 |
| standard（功能） | $5 | 3 | $15 |
| deep（橫切關注） | $12 | 1 | $12 |
| | | | **~$34** |

支付你自己的 Anthropic API token。**無按席位收費。無 SaaS 綁定。**例行的分流會自動路由到 Kimi K2（與 Sonnet 同等、成本約低 5 倍）→ 日誌叢集化減少 60–80%。

## 自動偵測的 26 種原型

每種原型都會啟用它自己的專家代理人與合規檢查清單。前 7 名：

| 原型 | 等級 | 專家代理人 | 合規 |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

完整表格（26 種原型）+ 偵測如何運作：[docs/ARCHETYPES.md](../ARCHETYPES.md)。

**深度美國覆蓋** ——除了 GDPR/PCI/HIPAA，great_cto 現在還會針對 SEC 網路揭露（8-K Item 1.05）、給國防承包商的 CMMC 2.0 / NIST 800-171、美國 AI 治理（NIST AI RMF · Colorado SB 205 · Utah/Texas AI）、網路追蹤訴訟（VPPA · CIPA · Washington MHMDA），以及放貸的 HMDA / SR 11-7 模型風險進行審查。

## 14 個領域套件——疊加式審查者

領域套件會疊加在原型**之上**。當 CLI 偵測到套件特有的訊號（相依套件、README 術語）時會自動掛載。每個套件都會加入自己的審查者、威脅模型範本、EVAL 套組與人類關卡——獨立於基礎原型之外。

| 類別 | 套件 |
|---|---|
| **AI 垂直領域** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **數位健康** | `digital-health-pack` _(穿戴式遙測 · 心理健康 AI · 營養 AI · 醫師 HITL)_ |
| **金融科技 / 受監管** | `lending-pack` · `em-fintech-pack` |
| **高合規** | `clinical-trials-pack` · `climate-pack` |
| **工程** | `api-platform-pack` · `robotics-pack` |
| **美國市場** | `sec-cyber-pack` _(SEC 8-K 揭露)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 種人類關卡類型** + 53 套參考 EVAL 套組 + 15 套 TM 範本。以**4 層旅程視覺化**（原型 → 套件 → 審查者 → 關卡）瀏覽全部 14 個套件：[greatcto.systems/packs.html](https://greatcto.systems/packs.html)。

## 一次真實執行，完整追蹤

一項 Python CLI 功能跑完整條流水線出貨：**LLM 花費 $2.39** 對比約 $5,460 的同等人力。安全揪出兩個 QA 已放行的真實缺陷（`list(stream_csv())` 破壞了串流 → 13 MB 輸入導致 14.5 MB 的峰值 RSS）。多審查者模式在合併前抓到單一代理人會漏掉的問題。

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

- **不適合團隊** ——單人 CTO 就是這個產品。2 人以上的工程師？你已經超出它的適用範圍了。
- **不能取代資深工程師** ——它把流程編成規範；少了資深工程師，它不會替你做架構判斷。
- **不是 CI/CD 系統** ——關卡在本機 / 工作階段中運行。實際合併你仍需要 GitHub Actions。
- **未經認證稽核** ——PCI/HIPAA/SOC2 的原型骨架是起點，不是認證。
- **非確定性** ——LLM 生成的輸出。每一次關卡裁決都應做合理性檢查。

## FAQ（前 5 名）

**我的原始碼會被用來訓練模型嗎？** 不會。Claude API 對付費客戶預設零保留。great_cto 不會多加任何東西。

**你們如何壓低 token 成本？** 預設 Haiku + 用於分流的 Kimi K2 路由器（節省 60–80%）+ cost-guard hook。

**我可以停用 hooks 嗎？** 每個 hook 都遵循 `GREAT_CTO_DISABLE_<NAME>=1`。逐檔停用機密掃描：`// great_cto:allow-secrets`。

**如果我不是單人怎麼辦？** great_cto 是為一人工程組織打造的。如果你有 2 位以上的工程師、並需要共享看板 / 多席位驗證，你已經超出它的適用範圍了。

完整 FAQ：[docs/FAQ.md](../FAQ.md)。

## 文件

📚 **[完整文件中心 →](../README.md)** ——依 [Diátaxis](https://diataxis.fr/) 組織：
**[入門](../tutorials/getting-started.md)** · 操作指南 ·
[代理人](../reference/agents.md) 與 [指令](../reference/commands.md) 參考 · [架構](../ARCHITECTURE.md) · [FAQ](../FAQ.md)。

## 架構

此外掛在 Claude Code（或任何具 MCP 能力的主機）內運行；61 個代理人是 markdown 規格；任務存放在 Beads（dolt，git 原生）中；記憶是純 markdown（無向量儲存）。圖表 + 技術堆疊表：[docs/ARCHITECTURE.md](../ARCHITECTURE.md)。

## 有什麼新功能

**v2.21.0**（2026 年 5 月）—— **Flow Compiler UX**：`npx great-cto init` 現在會印出一個 **Compiled flow**，列出每個功能週期的代理人、關卡、合規與成本估算。它會寫入 `.great_cto/FLOW.md` ——代理人讀取它，便能確切知道如何編排你的 SDLC。

**v2.20.0**（2026 年 5 月）—— **Detection v2**：**12 個司法轄區的覆蓋**（新增 CA · JP · CN · KR，附完整法律框架 + 人類關卡） · **基礎設施訊號偵測**（Terraform 區域字串、`.env` 的 `AWS_REGION=`、docker-compose 的 `TZ=`、`package.json` 的 homepage TLD） · **詞界比對**（不再有 "india" → "indiana" 的誤判） · 給冷門原型的 **套件提示**（信心較低時 `suggestedPacks` 會浮現 robotics/climate/clinical-trials/hr-ai/em-fintech 套件）。Token 節省：每次流水線執行 –87.7%（v2.19.0 的上下文架構重新設計）。

**v2.19.0**（2026 年 5 月）—— **Token economy Phase 1+2**：產物摘要（≤250 token，自動生成）+ 任務感知記憶過濾器（每個任務取最相關的前 k 筆項目）。每次流水線執行 –87.7% token。

**v2.17.0**（2026 年 5 月）—— **隨附外掛自動安裝** · Plan 階段之前的 **Architecture / Spec / Schema 評論者**。

[完整更新日誌 →](../../CHANGELOG.md)

## 路線圖

- **CI 中的 Evals 執行器** ——在每個 PR 上執行黃金集 eval 套組，自動攔下 prompt 退化
- **自我改進迴圈** ——從裁決中學習、並隨時間改進自身 prompt 的代理人
- **決策評分** ——追蹤哪些關卡決策事後證明是對的；浮現其中的模式
- **/crystallize** ——把高影響力的經驗教訓提升為整條流水線都能查詢的可重用技能

[為下一個功能投票 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 作者

[avelikiy](https://github.com/avelikiy) ——打造 AI 原生交易與金融科技平台（0→1、1→N）的 CTO。great_cto 是我一次一個代理人地自動化自己工作迴圈的成果。每一條規則，都是為了回應某個真實生產系統中的真實問題而出現的。

## 社群

| 管道 | 內容 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | 錯誤、功能請求、原型提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 問題、模式、成果分享 |
| 📝 [Blog](https://velikiy.hashnode.dev) | 架構深度剖析 |
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
