<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**用你已有的編碼 agent 交付產品。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-skills_·_MCP_·_second_opinion-blueviolet)](https://github.com/openai/codex)

```bash
npx great-cto init
```

[官網](https://greatcto.systems) · [一次真實執行 →](https://greatcto.systems/proof) · [線上展示](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [部落格](https://greatcto.systems/blog/) · [更新日誌](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 本文是英文 [README](../../README.md) 於 **v3.28.0**（2026-09-09）時的翻譯。
> 如有出入，以英文版為準。

---

great_cto 是**架在你已經在跑的那個編碼 agent 之外的一層**。它驅動你的
Claude Code 走完整趟建置，交給你一個**你自己擁有的儲存庫**和一個
**已經能用的 URL**：架構、資料模型、後端、前端、生成的測試，還有部署，
全部完成。不是計畫。不是原型。

它做、而一包 prompt 不做的那一件事：**它告訴你 agent 沒有做什麼。**
被跳過的階段、從未執行的審查、沒有任何人量到的成本 —— 每一項都以它本來的
樣子呈現，絕不被算成通過。證據是減法：v3.27.0 和 v3.27.1 刪掉了本專案自己
有利的數字 ——「相對 FTE 的成本節省」、與人類團隊的開銷比較、一個推估的
月份 —— 因為沒有一個能被證明為真。

在 Codex 上這條流水線不會執行：在那裡跑的是技能套件和一個 MCP server。
Codex 的另一個工作是當**第二意見** —— 從 Claude Code 內部讀同一份 diff，
每一行審查都帶著它所讀那棵樹的 `sha`，所以「已審查」是能對*這份* diff
被證明的，而不是被斷言的。目前日誌裡有 **4 行，其中 1 行帶 sha**；
不從這裡宣稱任何抓錯率，也不該宣稱。

它不是託管式的 app builder，也不取代你的 agent；沒有 agent，它就沒有東西
可以編排。

公開基準測試中端到端建成的七個產品，token 費用**中位數 $171**，量測於
2026-07。你付錢給你自己的 LLM 供應商；great_cto 不向你收費，並且是 MIT。

它會攔你**三次** —— 一次問*要建什麼*、一次問*怎麼建*、一次問*是否上線*。
這三次之間全部無人值守地執行，而流水線的職責就是值得被放著不管：
職責狹窄的專家（architect、design-advisor、senior-dev、code-reviewer、
QA、security、devops），加上一個獨立模型在下一階段接手之前檢查上一階段的
產出。完整名冊在 [docs/reference/agents.md](../reference/agents.md)。

```
   描述一個產品
        │
   🤖  框定問題 · 權衡選項 · 寫出 brief
        ▼
   👤  檢查點 1 — 批准要建置什麼
        │
   🤖  架構 · 資料模型 · 畫面 · 計畫
        ▼
   👤  檢查點 2 — 批准如何建置
        │
   🤖  鷹架 → 後端 → 前端 → 測試 → 審查 → 資安
        ▼
   👤  檢查點 3 — 批准部署
        │
   🤖  已部署 · 儲存庫 · 可存取的 URL
```

三個檢查點是**預設值**，不是下限。`PROJECT.md` 裡一行就能把它降到一個 ——
你只批准部署，檢查點 1 和 2 變成一個你讀過去的畫面，而不是一張你要填的
表單：

```
approval-level: ship-only
```

見[什麼時候會問你](#什麼時候會問你)。

<p align="center">
  <img src="../screenshots/board.png" alt="看板的 Decisions 畫面 —— 每一個等待中的閘門就是一列：它的撤銷成本、兩位審查者的裁決，以及一個在撤銷代價高昂時會要求你輸入閘門名稱的 Approve" width="900" />
</p>

<p align="center">
  <img src="../tapes/ci.gif" alt="終端機：npx great-cto register 把專案加進看板的切換器，接著 npx great-cto ci 拿宣告的原型去核對程式碼與每月預算，並通過" width="900" />
</p>

`localhost:3141` 的看板會自己填滿 —— 流水線狀態、待批閘門、按代理的成本、
30 天開銷。你不用餵它，你只需要看它。四個畫面，每個回答一個問題：
**Decisions**（什麼需要你 —— 每個閘門連同兩位審查者的裁決，按撤銷成本
排序）、**Ledger**（花了多少、正在跑什麼）、**Fleet**（該停止信任哪個
代理 —— 它的工具授權、它的執行紀錄、它的開銷）、**Harness**（誰是宿主、
誰給第二意見，以及它實際做了什麼）。設定在齒輪後面；`⌘K` 可以按名字找到
任何代理、文件、工作階段、記憶或決策。看板上沒有任何東西會把「缺席」
呈現成「通過」—— 從未執行的掃描是 `n/a`，絕不是一個綠色的零。

## 實測數字

| | |
|---|---|
| 一個功能，端到端，完整可追溯 | **1h 26m · $3.40** token 費用 — [憑證](https://greatcto.systems/proof) |
| 完整產品 — 公開基準測試建置了 7 個 | 中位數 **$171** token 費用 · 品質 **70/100**（58–86），量測於 **2026-07-10** — [自行重現](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型月份，20 次流水線執行 | **~$34** — 只付給你自己的 LLM 供應商，別無其他 |
| 它知道怎麼建的產品 | **60** 個，橫跨 15 個美國產業，透過 [6 條可重用流水線](https://greatcto.systems/pipelines) |

品質分數是執行每個產品自己的測試得出的，不是數檔案 —— 所以它是 70，
而不是一個更圓、更好看的數字。

## 快速開始

```bash
npx great-cto init
```

重新啟動 Claude Code，然後：

```bash
/start "build a dispatch & scheduling app for an HVAC business"
```

之後由流水線接手。日常你只碰三樣東西：

| | |
|---|---|
| `/start "…"` | 描述一個產品或功能 — 流水線執行它 |
| `/inbox` | 等你處理的：待批閘門、P0、被阻塞的任務 |
| `/digest` | 每週 DORA 指標 + 單功能成本彙總 |

需要 Node ≥ 18.17。附屬外掛（Superpowers、Beads）自動安裝。init 之後請確認
宿主真的載入了外掛 —— `claude plugin list --json` 裡 `great-cto` 的 `errors`
應該是空的。

**在 OpenAI Codex 上**（`npx great-cto init --host codex`）你得到的是**技能與
MCP server** —— 不是上面那條流水線。Codex 沒有給 hooks、斜線指令或角色代理的
外掛介面，所以 `/start`、`/inbox`、閘門鏈和 `secret-scan` 在那裡不會執行。
這是宿主的限制，不是一個設定：外掛 manifest 裡的 `hooks` 永遠不會被讀取
（[openai/codex#16430](https://github.com/openai/codex/issues/16430)、
[#39895](https://github.com/openai/codex/issues/39895)）。安裝程式在動手之前
就會印出同一份切分。

**兩個 harness，一次審查。** 從 3.26.0 起 Codex *確實*參與流水線 —— 從
Claude Code 內部，作為第二位審查者。宣告一次即可：

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

之後每一次高風險變更，Claude 的 `code-reviewer` 和 **`codex exec`**
（唯讀沙箱、你自己的 Codex 登入、不需要 API key）會**同時審查同一份 diff**。
發現會合併；任一邊的 P0 都會擋下；意見不一致時，兩邊的結果都會送到閘門前的
人類手上 —— 較嚴格的一方決定裁決，沒有人做平均。看板的 **Harness** 畫面會
偵測 Codex、保存這個選擇，並在旁邊顯示第二意見*做了什麼*：每一次執行，
包含被跳過的，來自 `.great_cto/cross-review.log`。四種狀態，而第四種才是
重點 —— *已宣告但無法使用*絕不會被顯示成*關閉*。

它到底幫上多少忙，是在那裡被量測的，不是在這裡被斷言的。目前日誌裡有的：
第一次真實的 Codex 審查 —— 對象正是把 Codex 接上去的那個 commit —— 找到一個
作者和測試套件都漏掉的 P1；對修正的審查則什麼都沒找到。兩次執行是機制的
證據，不是一個比率。比率是那張卡片的工作。

## 什麼時候會問你

`.great_cto/PROJECT.md` 裡的一個設定決定流水線在哪裡停下：

| `approval-level` | 攔你在 | 次數 |
|---|---|---|
| **`ship-only`** | **部署 —— 並且就要建什麼向你做一次簡報** | **1** |
| `product-only` | 建什麼 · 是否上線 | 2 |
| `gates-only` *(預設)* | 建什麼 · 設計 · 部署 | 3 |
| `strict` | 設計 · 程式碼審查 · 部署 | 3 |
| `auto` | 流水線裡什麼都不停 | 0 |

計數指的是流水線的停點。每個層級另外都帶一道不屬於流程選擇的護欄：
把資料匯入覆蓋既有紀錄，在**每一個**層級都會攔你，`auto` 也不例外，
因為那一個會摧毀原本存在的東西。

**`ship-only` 是仍然誠實的最低限度。** 一個停點 —— 部署，唯一一個後果會離開
你機器的決定。*要建什麼*這個決定並沒有消失，因為一條流水線花一整天做錯的
東西才是昂貴的失敗：它會以一個畫面出現在你的 console 裡，在建置開始之前
印一次。

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

沉默即同意，而畫面本身就這麼說。如果那份 brief 讀不到，閘門會回來 ——
「我沒能讓你看到」絕不會被當成「你看過了而且沒說話」送出去。

`gates-only` 是在 v3.0.0 拿到產品閘門的。它以前只停在*怎麼建*和*要不要
發布*，從不停在*要建什麼* —— 而那正是會錯上六個階段才有人發現的決定。
它的代價是每個**產品**暫停一次，不是每個功能一次：`product-owner` 是入口，
只從 `/start` 執行。

受監管的原型 —— 金融、醫療、政府 —— 在**任何層級（包括 `auto`）**都保留
它的資安、法遵與上線閘門。較輕的層級是委託判斷，絕不是跳過法遵。
完整表格：[docs/GATES.md](../GATES.md)。

## 它拒絕說的四件事

同一條規則，在四個守住它要付出代價的地方：**沒有發生的事，絕不可以看起來
像發生過的事。**

| 情況 | 容易顯示的 | 它改為顯示的 |
|---|---|---|
| 宣告了第二意見，但它的 harness 不存在 | *關閉* | **`unavailable`** —— 已宣告卻搆不著，不是你做的選擇 |
| 檢查跑了，但無法判定 | *通過* | **`unverifiable`** —— 而且該階段不會據此往前 |
| 某次執行的成本從未被量測 | **`$0.00`** | **`unmeasured`** —— 而且預算不會據此觸發 |
| 某個階段沒有任何人評估過 | *0* | **`null`** —— 通過率的分母是真正被評估過的數量 |

這每一項，誠實的答案都比自信的答案更長、更醜、更難做。那就是整個產品。

## 值得有的三個疑慮

**「我不能信任我沒看著它被寫出來的程式碼。」**
我們也不信，所以沒有任何東西是憑代理對自己的說法而被採信的。每個階段都拿它
實際產出的東西來核對 —— 被點名的檔案是否存在、被凍結的驗收條件在執行時是否
通過，然後才會請一個獨立模型判斷每項需求是否被處理。當那個檢查無法判定時，
它回傳 `unverifiable`，那**不是**通過。

**「它會趁我睡覺的時候花錢。」**
按代理的預算會在超過上限時拒絕派工，並把數字說出來。成本無法被量測的執行
顯示 `unmeasured`，而且什麼都不會擋 —— 一個依據沒人量過的數字觸發的上限，
比沒有上限更糟，而給未量測的工作一個自信的 `$0.00`，正是開銷被忽略的方式。

**「然後我就被綁死了。」**
一道指令安裝、MIT、在你自己的機器上用你自己的 LLM 帳號執行。刪掉
great_cto，它建出來的儲存庫仍然是你的 —— 就是任何工程師都能接手的普通
Next.js、Postgres 和 Stripe。

## 不同之處

- **專家，而不是通才** —— 70 個職責狹窄、各自帶審查閘門的代理，而不是
  一個打字比思考快的助手。[名冊 →](../reference/agents.md)
- **批評者先於程式碼** —— 架構、規格與 schema 批評者在規劃之前執行，
  此時一個錯誤還只值幾小時，而不是幾天。
- **範圍在寫入時強制** —— 代理在實體上就碰不到任務範圍外的檔案。
  不是審查時被標記，而是寫入時被拒絕。
- **不信任自己的 QA** —— 關鍵路徑在寫測試程式碼之前先寫成 Gherkin，
  然後用突變測試問一句：這套測試到底抓不抓得到任何東西。
- **跨工作階段的記憶** —— 決策、教訓與被晉升的模式按專案與全域持久化；
  被中斷的執行恢復時知道哪些階段已經跑過。
- **看得見的成本** —— 按代理的開銷、預估與實際的偏差、每次被接受變更的
  成本，都在看板上，而不是在試算表裡。
- **會拒絕的花費上限** —— PROJECT.md 裡的 `agent-budgets:` 限制一個階段
  可以花多少；流水線會拒絕派工超過它，並把數字說出來。一個預估永遠不會
  拒絕 —— 見上面那張表。
- **一個階段在下一個接手之前先被檢查** —— 裁決點名的檔案必須存在、
  被凍結的 `## ACCEPTANCE` 條件在執行時必須通過，然後才會請第二個模型判斷
  每項需求是否被處理。最便宜的問題先問，而且是三個答案而不是兩個：
  `verified`、`rework` 或 `unverifiable`。一個什麼都不宣稱、也不凍結任何
  條件的代理會被回報 —— 否則最便宜的通過方式就是什麼都不宣稱。
- **工作會被退回，而退回有上限** —— 失敗的階段回傳 `REWORK`，附上被引用的
  發現，由同一個代理修正；`BLOCKED` 表示必須由人來決定。三輪之後它就變成
  人類的問題，因為兩台機器互相把工作丟來丟去是不會覺得膩的。
- **品質與發生了什麼分開** —— 裁決說一次執行做了什麼，*分數*說做得多好，
  存在它自己的僅可追加儲存裡，由不同的行為者在不同的時間寫入。評分者可以
  彼此不同意，而每個分數都會標明是誰給的。
- **沉默會被記錄** —— 派工器把它決定的事寫進
  `.great_cto/pipeline-runs.jsonl`，*包含它決定什麼都不做的時候*，以及為什麼。
  今年找到的每一個流水線缺陷，都藏在「不應該發生任何事」與「不可能發生任何
  事」之間的縫隙裡。

一切在本機執行，MIT 授權，用你自己的金鑰。你的程式碼留在你的機器上；
prompt 只送到你的 LLM 供應商，別處不去。遙測**預設關閉**
（[docs/PRIVACY.md](../PRIVACY.md)）。

## 侷限

- **給單人建造者** —— 獨立創辦人或 CTO。兩名以上工程師共用同一條流水線，
  就已經超出它了。
- **不是 CI/CD 系統** —— 閘門在本機執行；合併仍然走 GitHub Actions。
- **不是認證稽核** —— PCI/HIPAA/SOC2 鷹架是起點，不是認證。
- **不是決定性的** —— LLM 輸出。閘門裁決值得人工複核。
- **開銷有量測，但歸屬還不是按代理的** —— 成本是從宿主自己的工作階段
  transcript 讀出來的，不是從代理的自述，所以 token 是真的。但交給 hook 的
  transcript 涵蓋的是整個工作階段，不是單一子代理，所以一次執行的成本可能
  被歸到最後結束的那個階段 —— 誇大好幾個數量級。在這點修好之前，請把按代理
  的數字當成上限。完全沒有量測的階段仍然顯示 `unmeasured`，而不是一個自信的
  `$0.00`，而且預算不會為它觸發。

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
打造 AI-native 交易與金融平台的 CTO；great_cto 是我自己的工作迴圈，
一次一個代理地自動化而成。

如果它幫你省了時間，一顆星能幫其他獨立建造者找到它。

<div align="center">

*別再當唯一會上線的人。*

</div>
