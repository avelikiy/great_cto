<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**執行開發工作流程，檢查證據，決定發布什麼。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="使用合成資料的範例專案，不是實際模型執行的基準測試。" width="900" />

*使用合成資料的範例專案，不是實際模型執行的基準測試。 3.69.0.*

```bash
npx great-cto init
```

[官網](https://greatcto.systems) · [一次真實執行 →](https://greatcto.systems/proof) · [部落格](https://greatcto.systems/blog/) · [更新日誌](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 本文譯自英文 [README](../../README.md) **v3.69.0**（2026-10-23）。
> 如有出入，以英文版為準。

---

great_cto 透過明確的階段、審查和 gate，協調 Claude Code 原生工作流程及實驗性的受控 Codex 執行。本機面板連結任務、執行紀錄、專案文件和使用量。公開目錄包含 **72** 個代理；存在於目錄中並不證明實際執行或專業能力。缺少證據時維持未知。合併、發布和部署都需要各自的證據與授權。費用直接支付給你的供應商；great_cto 採用 MIT 授權，本身不收費。

## 快速開始

```bash
npx great-cto init
```

重新啟動 Claude Code。日常只需要三件事：

| | 在 Claude Code 中 | 在終端機中 |
|---|---|---|
| **開始工作** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **等你處理的事** | `/inbox` | `great-cto status` |
| **繼續** | `/resume` | `great-cto resume` |

`/start` 接受新產品，也接受現有專案中的任務，並自行選擇流程。`/resume` 只繼續你已
核准的內容；待定的決定仍會等你。其餘的——`/review`、`/spec`、`/save`、`/digest`
等——需要時隨時可用：[全部指令](../COMMANDS.md)。

## 一個專案，五個檢視

執行 `great-cto board` 開啟本機面板，預設位址為 `localhost:3141`。

| 檢視 | 可檢查的內容 |
|---|---|
| **Work** | 任務、驗收條件、下一步支援的操作與 Overview、Execution、Evidence 分頁 |
| **Decisions** | 待處理決策與現有 gate 控制項，不擴大權限 |
| **Knowledge** | 唯讀專案 Markdown、ADR 與有限的圖表檢視器，支援 Mermaid 原始碼回退 |
| **Insights** | 執行結果紀錄、專案範圍的 token、估算與獨立預算 |
| **Settings** | Executors、Runtime、Capabilities 和 General |

`unverifiable`、`unmeasured` 與 `unavailable` 不代表檢查通過。

Execution 顯示已記錄的嘗試，不是因果圖或即時終端。圖表描述宣告的架構。token 與費用不是品質指標。文件保留原語言，介面使用英語。

<details>
<summary>查看執行、證據、專案文件與結果</summary>

![Execution: 使用合成資料的範例專案，不是實際模型執行的基準測試。](../screenshots/execution.png)

![Evidence: 使用合成資料的範例專案，不是實際模型執行的基準測試。](../screenshots/evidence.png)

![Knowledge: 使用合成資料的範例專案，不是實際模型執行的基準測試。](../screenshots/knowledge.png)

![Insights: 使用合成資料的範例專案，不是實際模型執行的基準測試。](../screenshots/insights.png)

[截圖約定](../reference/public-showcase.md).

</details>

## 在 OpenAI Codex 上

| 模式 | 執行與權限 |
|---|---|
| Claude Code native | 原生命令、專門角色與 hooks；決策保留在對應宿主中 |
| Controlled Codex / mixed-host (experimental) | 控制器管理路由、文字提案、verifier 與明確的 gate |
| Codex plugin session | Skills、MCP 與安全 hooks；安裝本身不會自動啟動受控 pipeline |

`npx great-cto init --host codex` 為 Codex 提供技能、MCP 伺服器與六個安全掛鉤（只需
核准一次：在終端機執行 `codex`，選擇 **Trust all and continue**）。Codex 沒有用於斜線
指令或角色代理的原生外掛介面，因此流水線透過 CLI 執行：

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

預設需要明確更新（`great-cto upgrade codex`）。在 macOS 上，`sh scripts/codex-auto-update.sh enable` 啟用可選的使用者計時器，每六小時重新整理；`status` 查看計時器，`disable` 將其移除。每次執行前都會驗證 Git 來源。它跟隨設定的 Git ref，而非 npm 發布；變更的掛鉤仍需在新工作階段取得主機核准。詳情與混合執行：
[Codex host 指南](../HOST-CODEX.md).

## 何時會停下來

`.great_cto/PROJECT.md` 中的一行：

| `approval-level` | 停在 | 次數 |
|---|---|---|
| **`ship-only`** | **部署——並向你簡報要建置的內容** | **1** |
| `product-only` | 做什麼 · 是否發布 | 2 |
| `gates-only` *(預設)* | 做什麼 · 設計 · 部署 | 3 |
| `strict` | 設計 · 程式碼審查 · 部署 | 3 |
| `auto` | 流水線中不停 | 0 |

受監管的產品——金融科技、醫療、政務——在任何層級都保留安全、合規與發布關卡。
[關卡如何運作](../GATES.md)。

## 實測數字

| | |
|---|---|
| 一個功能端到端，完整追蹤 | **1h 26m · $3.40** — [憑證](https://greatcto.systems/proof) |
| 一個完整產品——開放基準中建置了 7 個 | 中位數 **$171** · **70/100**, **2026-07-10** — [重現](../benchmarks/BENCH-2026-07-batch1.md) |

這些是歷史觀察，不是目前雙宿主 pipeline 或 domain packs 的基準測試。尚未確立品質提升百分比。Domain packs 仍需主動啟用；其存在不證明專業能力或更好的結果。

## 限制

面向單人開發者，而非團隊；不是託管式應用建置器——需要你的程式代理；不是 CI/CD
系統；合規範本是起點，不是認證；LLM 輸出不具確定性。每一項的如實說明以及它拒絕
聲稱的內容：[docs/DETAILS.md](../DETAILS.md)。

## 了解更多

[文件](../README.md) · [入門](../tutorials/getting-started.md) ·
[指令](../COMMANDS.md) · [關卡](../GATES.md) · [代理](../reference/agents.md) ·
[FAQ](../FAQ.md) · [其他一切](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [安全](../../SECURITY.md) ·
[貢獻](../../CONTRIBUTING.md) · [隱私——遙測預設關閉](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE)。作者 [@avelikiy](https://github.com/avelikiy)。
如果它為你節省了時間，一顆星能幫助其他獨立開發者找到它。
