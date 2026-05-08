<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**別再做唯一能發布版本的人了。**

你是 CTO,也是瓶頸。**GreatCTO 是 30 個專業代理**,負責架構、程式碼審查、QA、安全和部署 — 而你只需要做出**每個功能兩個決定**。

> **v2.2.0** · 33 代理 · 25 專案類型 · 24 安全規則 · 9 鉤子 · 每專案 ~$34/月 · 47 分鐘出 PoC · MIT

> ⚠️ 此為機器翻譯,需要本地化審核。如發現問題請提交 PR。 [English original](../../README.md).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[官方網站](https://greatcto.systems) · [展示](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [討論](https://github.com/avelikiy/great_cto/discussions) · [部落格](https://velikiy.hashnode.dev)

**語言:** [English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · **繁體中文** · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português (BR)](../pt-BR/README.md)

</div>

## 更新日誌

### v2.1.0 — 內建安全掃描 (2026 年 5 月)
- `npx great-cto scan ./` — OWASP LLM Top 10 + 24 條規則 + 用於 GitHub Code Scanning 的 SARIF
- 5 個掃描器: prompt-injection · secrets-in-prompts · SSRF-in-tools · RAG poisoning · cost-runaway
- 從獨立的 `@great-cto/agentshield` 套件合併 — 一次安裝,一個版本

### v1.2.0 — 持續學習迴圈 (2026 年 5 月)
- 新的 `continuous-learner` 代理 (Haiku, ~$0.05/次) 自動從會話中提取模式
- 雙層記憶體: 專案級 `lessons.md` → 跨專案 `~/.great_cto/decisions.md`
- 品質閘門: 每會話最多 3 個課題, 按專案類型標記, 基於閾值的提升 (≥3 個不同專案)

### v1.1.0 — Claude Code 鉤子 (2026 年 5 月)
- 4 個新鉤子: `secret-scan` (PreToolUse) · `format-check` (PostToolUse) · `cost-guard` (UserPromptSubmit) · `session-end`
- 13 種金鑰偵測模式 (AWS, Stripe, GitHub, OpenAI, Anthropic, PEM, JWT)
- 所有鉤子都支援透過 `GREAT_CTO_DISABLE_<NAME>=1` 退出

[完整變更日誌 →](../../CHANGELOG.md)

## 什麼是 great_cto?

great_cto 是一個 [Claude Code 外掛](https://claude.com/plugins),它將完整的 SDLC 流程作為 **33 個專業代理** 執行 — 架構師、規劃、實作、12 角度審查、QA、安全、部署、支援 — 透過你真正會檢視的看板進行協調。每個功能你做兩個決定;其餘的都自動完成。

| 層級 | 作用 |
|------|------|
| **33 個專業代理** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 專案類型** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **自動偵測** | 掃描 `package.json`, `pyproject.toml`, `Cargo.toml`, README, 程式碼結構 → 在 2 秒內選擇專案類型 + 合規閘門。當信心度低時,Anthropic Haiku 提供二次意見 (~$0.001)。 |
| **合規** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — 按專案類型自動附加。 |
| **記憶體** | 4 層 — `PROJECT.md` (專案類型) · `lessons.md` (專案回顧) · `~/.great_cto/decisions.md` (每個閘門核准,可跨專案查詢) · `verdicts/` (每個代理判定)。 |
| **看板** | `great-cto board` 在 `localhost:3141` 開啟 6 個檢視 — Inbox · Kanban · Metrics · Agents · Memory · Public report。透過 SSE 即時更新。 |

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 欄, 內聯閘門核准, 即時 SSE" width="900" />
  <br/>
  <em>Kanban — 5 欄, 內聯狀態編輯, 來自 <code>bd</code> CLI 的 SSE 即時更新。</em>
</p>

## 每個功能兩個決定

```
你:  /start "新增 Stripe 訂閱 — 月度和年度方案"

great_cto:
  → 專案類型: commerce | 規模: standard | ~45 分鐘
  → 合規: pci-dss + gdpr (自動附加)
  → ARCH-stripe-subscriptions.md 已就緒  →  決定 1: 核准架構?

你: "核准"

  → senior-dev → 12 角度審查 → qa-engineer → security-officer → devops
  → 412 個測試通過 · 0 高危 · canary 就緒
  → 決定 2: 發布?

你: "發布"  →  canary 5% → 20% → 100%  →  RELEASE 文件已寫入
```

## 快速安裝

```bash
npx great-cto init
```

CLI 掃描你的儲存庫,選擇正確的專案類型,自動連線合規閘門。適用於新專案或現有專案。之後重新啟動 Claude Code。

**前置需求:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## 你真的會檢視的看板

```bash
great-cto board   # localhost:3141
```

6 個檢視,真實截圖 — 見 [greatcto.systems#board](https://greatcto.systems#board)。

| 檢視 | 內容 |
|------|------|
| **Inbox** | 復原卡片 (從上次離開的地方繼續) · 待定決定 · 開放的 P0 · 阻塞 · 停滯 (in-progress > 48h) |
| **Kanban** | 5 欄 · 內聯閘門核准/拒絕 · 過濾欄 (代理 / 優先順序 / 標籤) · ⌘K 搜尋 · `j`/`k` 導覽 |
| **Metrics** | 主卡片 (速度, 成本, MTTR) · 30 天 LLM 支出圖,帶預算告警 |
| **Agents** | 每個代理的時間, LLM 成本, 按 $150/小時折算的人力等價 · 活動串流 (最近 20 個判定) |
| **Memory** | 4 層瀏覽器: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Public report** | 切換開啟 → 不可猜測的 URL,包含已發布任務、AI vs 人工成本對比。無程式碼,無憑證。 |

多專案切換器 — 一個看板,所有客戶。

## 每天使用的三個指令

| 指令 | 作用 |
|------|------|
| `/start "描述"` | 執行完整 SDLC 流程 — 偵測專案類型、生成架構文件、用 TDD 實作、審查、QA、安全、部署 |
| `/review` | 在目前分支上進行 12 個獨立角度的程式碼審查 |
| `/inbox` | 開放的閘門、阻塞的任務、P0 事件、安全告警 — 所有需要你立即決定的東西 |

其餘 (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) 自動執行或僅在需要時執行。完整參考見 [`docs/COMMANDS.md`](../COMMANDS.md)。

## 25 個自動偵測的專案類型

每種專案類型都會啟動其專業代理和合規清單。

| 專案類型 | 預設等級 | 自動載入的專業代理 | 合規 |
|---------|---------|--------------------|------|
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

隨時覆寫: `npx great-cto init --archetype <name>` 或編輯 `.great_cto/PROJECT.md`。當啟發式信心度低時, CLI 還提供 Anthropic Haiku 二次意見 (~$0.001) — 設定 `ANTHROPIC_API_KEY` 啟用,透過 `--no-llm` 退出。

## 這有何不同?

我們不是編輯器 — 我們圍繞你的編輯器編排流程。如果你願意,在迴圈中使用 Cursor、Copilot 或 Claude Code。

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| 多代理 SDLC 流程 | ✓ 33 個專家 | ✕ | ✕ | ✕ |
| 自動專案類型偵測 | ✓ 25 種 | ✕ | ✕ | ✕ |
| 合規閘門 (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| 持久記憶體 | ✓ decisions.md + verdicts | ⚠ 僅聊天 | ✕ | ✓ 聊天範圍 |
| 多專案檢視 | ✓ | ✕ | ✕ | ⚠ |
| 12 角度程式碼審查 | ✓ | ⚠ 單次 | ⚠ 單次 | ✕ |
| 公開可分享報告 | ✓ | ✕ | ✕ | ✕ |
| 開源 | ✓ MIT | ✕ | ✕ | ✕ |
| 本地執行 | ✓ | ⚠ 部分 | ✕ | ✕ |
| 用你自己的 API | ✓ | ✕ | ✕ | ✕ |
| **價格** | **$0 + 你的 API** | $20/月 | $39/月 | $20/月 |

## 成本

```
~$34/月 — 典型產品團隊,每月 20 次流程執行,僅供參考。
```

| 流程 | 每次成本 | 每月次數 | 總計 |
|------|---------|---------|------|
| quick (組態 / typo) | $0.10 | 10 | $1 |
| quick (新端點) | $1 | 6 | $6 |
| standard (功能) | $5 | 3 | $15 |
| deep (跨切面) | $12 | 1 | $12 |
| | | | **~$34** |

支付你自己的 Anthropic API token。**無人頭費。無 SaaS 鎖定。** 例行 triage 自動路由到 Kimi K2 (Sonnet 等價,成本約低 5 倍) → 在日誌叢集和雜訊堆疊追蹤上節省 60–80% 成本。

## FAQ

**沒有網際網路連線能用嗎?**
代理本身作為 Claude Code 子代理在本地執行。只有 Claude API 呼叫到達 Anthropic。沒有程式碼、遙測或記憶體傳送到其他任何地方。

**我的原始碼會被用於訓練模型嗎?**
不會。Claude API 對付費客戶預設零保留。great_cto 不新增任何東西 — 你的程式碼仍是你的。

**如果我已經有 CI/CD 怎麼辦?**
great_cto 在 CI *之前*執行。在架構、審查和預合併階段擷取問題。兩者都用 — 它們互補,不競爭。

**支援 Cursor / Copilot / Aider 嗎?**
目前僅 Claude Code。基於 `AGENTS.md` 的跨工具支援在 v2.x roadmap 中。

**如果鉤子妨礙我,我能停用它們嗎?**
每個鉤子都尊重 `GREAT_CTO_DISABLE_<NAME>=1` 環境變數 (例如 `GREAT_CTO_DISABLE_SECRET_SCAN=1`)。安全掃描可透過 `// agentshield:ignore` 按檔案退出。

**如何保持 token 成本低?**
3 層 — (1) 預設 Haiku 用於便宜代理, (2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) 用於 triage (節省 60–80%), (3) `cost-guard` 鉤子在昂貴 prompt 前警告。`/cost` 檢視即時支出。

**解除安裝時我的資料會怎樣?**
外掛狀態在 `~/.great_cto/` (全域決定) 和 `.great_cto/` (按專案)。兩者都是純 markdown — `rm -rf` 清除一切。無外部服務需要取消授權。

**為什麼不全自動? 為什麼"每個功能兩個決定"?**
LLM 強大但在模糊規範上失去產品判斷。在 gate:plan 和 gate:ship 保留人類擷取那 5% 佔 95% 成本的壞決定。見 [ADR-015 — 學習迴圈架構](../architecture/ADR-015-learning-loop-architecture.md)。

## 作者

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder。建構 AI-native 交易和 fintech 平台 (0→1, 1→N) 的 CTO。專注於技術直接影響 PnL、風險和單位經濟的高負載金融系統。

## ⭐ 為該儲存庫加星標

如果 great_cto 在某個專案上為你節省了時間,請為該儲存庫加星標 — 這能幫助其他獨立創辦人和小團隊找到它。

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 社群與支援

| 通道 | 內容 |
|------|------|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | bug, 功能請求, 專案類型提議 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 提問, 分享模式, show & tell |
| 📝 [部落格](https://velikiy.hashnode.dev) | 架構、學習迴圈、成本校準的深度解析 |
| 🐦 [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) | 發布說明, 文章, AI-CTO 系列 |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | 套件登錄 |
| 🔒 [Security](../../SECURITY.md) | hook/scanner CVE 的負責任揭露 |

## Roadmap

- **v2.2** — 課題品質遙測 (追蹤代理實際引用 vs 忽略哪些課題)
- **v2.3** — 自動提升: 高影響決定 → 可重用 skill (`~/.great_cto/global-skills/`)
- **v3.0** — 跨工具支援 (`AGENTS.md` 用於 Cursor / Codex / OpenCode / Gemini)

[投票下一個功能 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

## 貢獻

歡迎 pull request — 見 [CONTRIBUTING.md](../../CONTRIBUTING.md)。Good first issues 標有 [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue)。

特別需要:
- 新的專案類型骨架 (透過 Discussions 提議)
- 翻譯: `docs/<lang>/README.md` 用於非英語受眾
- 真實案例研究 — 如果 great_cto 讓你發布了什麼,分享數字

## 授權

MIT — 見 [LICENSE](../../LICENSE)。

---

<div align="center">

**由 [@avelikiy](https://github.com/avelikiy) · [@Greatcto](https://hashnode.com/@Greatcto) on Hashnode 建構**
*別再做唯一能發布版本的人了。*

</div>
