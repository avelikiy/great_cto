<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**用你已有的編碼 agent 交付產品。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[官網](https://greatcto.systems) · [一次真實執行 →](https://greatcto.systems/proof) · [線上展示](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [部落格](https://greatcto.systems/blog/) · [更新日誌](../../CHANGELOG.md)

</div>

> 本文是英文 [README](../../README.md) 於 **v2.90.0**（2026-07-30）時的翻譯。
> 如有出入，以英文版為準。

---

great_cto 是**架在你既有編碼代理之上的編排層**。由 **69 個專家代理**組成的流水線 —
architect、design-advisor、senior-dev、code-reviewer、QA、security、devops —
負責規劃、建置、審查並部署一個真實的應用程式：後端、前端、生成的測試、可存取的 URL。

整個過程只會打斷你兩次：一次問**要做什麼**，一次問**是否上線**。兩點之間全部
自動執行。

```
   描述產品
        │
   🤖  規格 · 架構 · 資料模型 · 畫面
        ▼
   👤  檢查點 1 — 批准要建置什麼
        │
   🤖  architecture · data model · screens
        ▼
   👤  檢查點 2 — 批准如何建置
        │
   🤖  鷹架 → 後端 → 前端 → 測試 → 審查 → 資安
        ▼
   👤  檢查點 3 — 批准部署
        │
   🤖  已部署 · 儲存庫 · 可存取的 URL
```

<p align="center">
  <img src="../screenshots/board.png" alt="建置看板 — 即時流水線、閘門、按代理的成本" width="900" />
</p>

`localhost:3141` 的看板會自動填入 — 流水線狀態、待批閘門、按代理的成本、30 天
開銷。你不用餵它資料，只需要看。

## 實測數字

| | |
|---|---|
| 一個功能，端到端，完整可追溯 | **1h 26m · $3.40** token 費用 — [憑證](https://greatcto.systems/proof) |
| 完整產品 — 公開基準測試建置了 7 個 | 中位數 **$171** token 費用 · 品質 **70/100**（58–86）— [自行重現](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型月份，20 次流水線執行 | **~$34** — 只付給你自己的 LLM 供應商 |
| 系統會建置的產品 | **60** 個，橫跨 15 個美國產業，透過 [6 條可重用流水線](https://greatcto.systems/pipelines) |

品質分數是執行每個產品自己的測試得出的，不是數檔案 — 所以它是 70，而不是一個
更圓更好看的數字。

## 快速開始

```bash
npx great-cto init            # Claude Code（預設）· OpenAI Codex 加 --host codex
```

重新啟動 AI 宿主，然後：

```bash
/start "為 HVAC 業者建置一個派工排程應用"
```

之後由流水線接手。日常你只碰三樣東西：

| | |
|---|---|
| `/start "…"` | 描述產品或功能 — 流水線執行 |
| `/inbox` | 等你處理的：待批閘門、P0、被阻塞的任務 |
| `/digest` | 每週 DORA 指標 + 單功能成本彙總 |

需要 Node ≥ 18.17。附屬外掛（Superpowers、Beads）自動安裝。init 之後請確認宿主
真的載入了外掛：`claude plugin list --json` 裡 `great_cto` 的 `errors` 應為空。

## 什麼時候會問你

`.great_cto/PROJECT.md` 裡的一個設定決定流水線在哪裡停下：

| `approval-level` | 停在 | 每個功能 |
|---|---|---|
| `product-only` | 做什麼 · 是否上線 | 2 |
| `gates-only` *(預設)* | 設計 · 部署 | 2 |
| `strict` | + 程式碼審查 | 3 |
| `auto` | 不停 | 0 |

受監管的原型 — 金融、醫療、政府 — 在**任何層級（包括 `auto`）**都保留資安、
法遵與上線閘門。較輕的層級是委託判斷，絕不是繞過法遵。完整表格：
[docs/GATES.md](../GATES.md)。

## 不同之處

- **專家而非通才** — 69 個職責單一、各帶審查閘門的代理，而不是一個打字比思考
  快的助手。[名冊 →](../reference/agents.md)
- **寫程式之前先有批評者** — 架構、規格、schema 三個批評者在規劃前執行，此時
  修正錯誤的成本還是小時而不是天。
- **寫入時強制範圍** — 代理實體上無法碰觸任務範圍外的檔案。不是審查時標記，
  而是寫入時拒絕。
- **不信任自己的 QA** — 關鍵路徑先寫成 Gherkin 再寫測試程式碼，然後用突變測試
  問一句：這套測試到底能不能抓到任何問題。
- **跨工作階段的記憶** — 決策、經驗、晉升的模式按專案與全域持久化；中斷的建置
  恢復時知道哪些階段已經跑過。
- **看得見的成本** — 按代理的開銷、預估與實際的偏差、每次被接受變更的成本，
  都在看板上，而不是在試算表裡。

一切在本機執行，MIT 授權，用你自己的金鑰。程式碼留在你的機器上；prompt 只送到
你的 LLM 供應商，別處不去。遙測**預設關閉**（[docs/PRIVACY.md](../PRIVACY.md)）。

## 侷限

- **給單人建造者** — 獨立創辦人或 CTO。兩名以上工程師共用流水線就超出它的
  設計了。
- **不是 CI/CD** — 閘門在本機執行；合併仍然走 GitHub Actions。
- **不是認證稽核** — PCI/HIPAA/SOC2 鷹架是起點，不是認證。
- **不是決定性的** — LLM 輸出。閘門裁決值得人工複核。

## 文件

**[文件中心 →](../README.md)** ·
[入門](../tutorials/getting-started.md) ·
[閘門與批准層級](../GATES.md) ·
[代理](../reference/agents.md) · [指令](../reference/commands.md) ·
[原型](../ARCHETYPES.md) · [架構](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[其餘一切](../DETAILS.md) — 批評者、司法管轄區、成本明細、CI、警示

## 社群

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[部落格](https://greatcto.systems/blog/) ·
[資安政策](../../SECURITY.md) · [貢獻指南](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE)。作者 [@avelikiy](https://github.com/avelikiy)：
打造 AI-native 交易與金融平台的 CTO；great_cto 是我自己的工作迴圈，一次一個
代理地自動化而成。

如果它幫你省了時間，一顆星能幫其他獨立建造者找到它。

<div align="center">

*別再當唯一會上線的人。*

</div>
