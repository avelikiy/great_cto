<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**用你已有的编码 agent 交付产品。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[官网](https://greatcto.systems) · [一次真实运行 →](https://greatcto.systems/proof) · [博客](https://greatcto.systems/blog/) · [更新日志](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · **简体中文** · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 本文译自英文 [README](../../README.md) **v3.47.0**（2026-10-02）。
> 如有出入，以英文版为准。

---

**你的编码代理负责交付代码。它负责检查。**

描述一个产品或功能。**71 agents** 各司其职，带它走完简报、架构、构建、评审和安全；
另一家族的第二个模型阅读同一份 diff。三个决定始终由你做出——做什么、怎么做、是否
发布——最终交付的是**属于你的仓库**和**可用的 URL**。LLM 费用由你直接付给提供商；
great_cto 采用 MIT 许可，不收取任何费用。

## 快速开始

```bash
npx great-cto init
```

重启 Claude Code。日常只需要三件事：

| | 在 Claude Code 中 | 在终端中 |
|---|---|---|
| **开始工作** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **等待你处理的事** | `/inbox` | `great-cto status` |
| **继续** | `/resume` | `great-cto resume` |

`/start` 接受新产品，也接受现有项目中的任务，并自行选择流程。`/resume` 只继续你已
批准的内容；待定的决定仍会等你。其余的——`/review`、`/spec`、`/save`、`/digest`
等——需要时随时可用：[全部命令](../COMMANDS.md)。

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

`localhost:3141` 上的面板默认打开 **Work**——你的任务、等你决定的事项，以及已经
发布的内容。成本、代理和评审者位于 **Tools**。它从不把缺失显示为成功：无法判断的
检查显示 `unverifiable`，无人计量的成本显示 `unmeasured`，无法运行的评审者显示
`unavailable`。

## 在 OpenAI Codex 上

`npx great-cto init --host codex` 为 Codex 提供技能、MCP 服务器和六个安全钩子（只需
批准一次：在终端运行 `codex`，选择 **Trust all and continue**）。Codex 没有用于斜杠
命令或角色代理的原生插件界面，因此流水线通过 CLI 运行：

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Codex 不会自行更新插件——由 `great-cto upgrade` 完成。详情、Claude + Codex 混合
运行以及将 Codex 作为第二评审者：[Codex host 指南](../HOST-CODEX.md)。

## 何时会停下来

`.great_cto/PROJECT.md` 中的一行：

| `approval-level` | 停在 | 次数 |
|---|---|---|
| **`ship-only`** | **部署——并向你简报要构建的内容** | **1** |
| `product-only` | 做什么 · 是否发布 | 2 |
| `gates-only` *(默认)* | 做什么 · 设计 · 部署 | 3 |
| `strict` | 设计 · 代码评审 · 部署 | 3 |
| `auto` | 流水线中不停 | 0 |

受监管的产品——金融科技、医疗、政务——在任何级别都保留安全、合规和发布关口。
[关口如何运作](../GATES.md)。

## 实测数字

| | |
|---|---|
| 一个功能端到端，完整追踪 | **1h 26m · $3.40** — [凭证](https://greatcto.systems/proof) |
| 一个完整产品——开放基准中构建了 7 个 | **$171** · **70/100**, **2026-07-10** — [复现](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型月份，20 次运行 | **~$34** — 只付给你自己的 LLM 提供商 |

## 局限

面向单人开发者，而非团队；不是托管式应用构建器——需要你的编码代理；不是 CI/CD
系统；合规模板是起点，不是认证；LLM 输出不具确定性。每一项的如实说明以及它拒绝
声称的内容：[docs/DETAILS.md](../DETAILS.md)。

## 了解更多

[文档](../README.md) · [入门](../tutorials/getting-started.md) ·
[命令](../COMMANDS.md) · [关口](../GATES.md) · [代理](../reference/agents.md) ·
[FAQ](../FAQ.md) · [其他一切](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [安全](../../SECURITY.md) ·
[贡献](../../CONTRIBUTING.md) · [隐私——遥测默认关闭](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE)。作者 [@avelikiy](https://github.com/avelikiy)。
如果它为你节省了时间，一颗星能帮助其他独立开发者找到它。
