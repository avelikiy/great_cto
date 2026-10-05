<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**用你已有的編碼 agent 交付產品。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[官網](https://greatcto.systems) · [一次真實執行 →](https://greatcto.systems/proof) · [部落格](https://greatcto.systems/blog/) · [更新日誌](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 本文譯自英文 [README](../../README.md) **v3.48.0**（2026-10-02）。
> 如有出入，以英文版為準。

---

**你的程式代理負責交付程式碼。它負責檢查。**

描述一個產品或功能。**72 agents** 各司其職，帶它走完簡報、架構、建置、審查與安全；
另一家族的第二個模型閱讀同一份 diff。三個決定始終由你做出——做什麼、怎麼做、是否
發布——最終交付的是**屬於你的儲存庫**與**可用的 URL**。LLM 費用由你直接付給提供商；
great_cto 採用 MIT 授權，不收取任何費用。

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

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

`localhost:3141` 上的面板預設開啟 **Work**——你的任務、等你決定的事項，以及已經
發布的內容。成本、代理與審查者位於 **Tools**。它從不把缺失顯示為成功：無法判斷的
檢查顯示 `unverifiable`，無人計量的成本顯示 `unmeasured`，無法執行的審查者顯示
`unavailable`。

## 在 OpenAI Codex 上

`npx great-cto init --host codex` 為 Codex 提供技能、MCP 伺服器與六個安全掛鉤（只需
核准一次：在終端機執行 `codex`，選擇 **Trust all and continue**）。Codex 沒有用於斜線
指令或角色代理的原生外掛介面，因此流水線透過 CLI 執行：

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Codex 不會自行更新外掛——由 `great-cto upgrade` 完成。詳情、Claude + Codex 混合
執行以及將 Codex 作為第二審查者：[Codex host 指南](../HOST-CODEX.md)。

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
| 一個完整產品——開放基準中建置了 7 個 | **$171** · **70/100**, **2026-07-10** — [重現](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型月份，20 次執行 | **~$34** — 只付給你自己的 LLM 提供商 |

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
