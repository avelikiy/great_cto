<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**运行开发工作流，检查证据，决定发布什么。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="使用合成数据的示例项目，不是实际模型运行的基准测试。" width="900" />

*使用合成数据的示例项目，不是实际模型运行的基准测试。 3.70.1.*

```bash
npx great-cto init
```

[官网](https://greatcto.systems) · [一次真实运行 →](https://greatcto.systems/proof) · [博客](https://greatcto.systems/blog/) · [更新日志](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · **简体中文** · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 本文译自英文 [README](../../README.md) **v3.70.1**（2026-10-25）。
> 如有出入，以英文版为准。

---

great_cto 通过明确的阶段、评审和 gate，协调 Claude Code 原生工作流及实验性的受控 Codex 运行。本地面板连接任务、执行记录、项目文档和使用量。公开目录包含 **72** 个代理；目录中存在并不证明实际执行或专业能力。缺少证据时保持未知。合并、发布和部署都需要各自的证据及授权。费用直接支付给你的提供商；great_cto 采用 MIT 许可，本身不收费。

**已验证分发的支持边界（ADR-045）：** 激活前必须验证签名制品。普通全局 npm 安装的自更新仅在具备独立认证、单独配置的验证工具以及该版本完整的签名制品集时受支持。通过准入检查的本地包会以离线方式安装，并禁用生命周期脚本。源代码检出或现有插件会话本身不能证明更新已经通过验证。

目前，`init`、原生插件更新和附加组件自动安装都会拒绝激活。Codex 的 `adapt` 适配仅生成注释，不下载内容，也不启用 hooks 或 MCP 执行路径。目前也不支持启用 macOS 更新定时器。已有定时器会继续运行旧缓存，直到另行明确授权的迁移对其进行更改。

下方的安装、插件和定时器示例描述的是 **LEGACY 3.70.1** 流程，并不承诺当前可用的激活路径。详见[已验证更新](../reference/verified-updates.md)。

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

## 一个项目，五个视图

运行 `great-cto board` 打开本地面板，默认地址为 `localhost:3141`。

| 视图 | 可检查的内容 |
|---|---|
| **Work** | 任务、验收条件、下一步支持的操作及 Overview、Execution、Evidence 标签 |
| **Decisions** | 待处理决策和现有 gate 控件，不扩大权限 |
| **Knowledge** | 只读项目 Markdown、ADR 和有限的图表查看器，支持 Mermaid 源码回退 |
| **Insights** | 执行结果记录、项目范围的 token、估算及独立预算 |
| **Settings** | Executors、Runtime、Capabilities 和 General |

`unverifiable`、`unmeasured` 和 `unavailable` 不代表检查通过。

Execution 显示控制器记录的因果图。原生和旧会话仍为部分可用或不可用，不推断缺失的依赖关系。示例使用离线桩响应，不是实际模型执行。图表描述声明的架构。token 和费用不是质量指标。文档保留原语言，界面使用英语。

<details>
<summary>查看执行、证据、项目文档和结果</summary>

![Execution: 使用合成数据的示例项目，不是实际模型运行的基准测试。](../screenshots/execution.png)

![Evidence: 使用合成数据的示例项目，不是实际模型运行的基准测试。](../screenshots/evidence.png)

![Knowledge: 使用合成数据的示例项目，不是实际模型运行的基准测试。](../screenshots/knowledge.png)

![Insights: 使用合成数据的示例项目，不是实际模型运行的基准测试。](../screenshots/insights.png)

[截图约定](../reference/public-showcase.md).

</details>

## 八个核心角色，按任务选择专家

| 职责 | 角色 |
|---|---|
| 问题与验收标准 | `product-owner` |
| 系统设计与权衡 | `architect` |
| 计划与依赖 | `pm` |
| 实现 | `senior-dev` |
| 独立代码评审 | `code-reviewer` |
| 验证与回归检查 | `qa-engineer` |
| 风险与发布关卡 | `security-officer` |
| 经授权的部署 | `devops` |

这些是职责契约，不代表必须调用模型八次，也不代表八个代理并发执行。Project focus 只是展示视图：不会移除专家、改变调度或免除必需检查。针对具体风险的必需评审者仍由项目策略决定。

## 聚焦的工程上下文

五个经过版本管理、需要显式启用的 domain pack 候选包，覆盖四个重点方向：

| 方向 | 工程不变量 | 边界 |
|---|---|---|
| **资金与加密资产执行** | 支付幂等性、发送结果不确定、受限权限；签名边界、paper/live 分离与链上最终性 | 两个技术包；不声称投资表现 |
| **远程医疗工作流** | 临床人员权限、处方状态迁移与证据完整性 | 不声称临床有效性或认证 |
| **创投证据** | 主张来源、实体沿革与未验证断言的隔离 | 不声称投资结果 |
| **心理健康福祉安全** | 每位主体的状态隔离、危机升级的优先级与临床主张边界 | 与诊断、治疗和临床验证分开 |

包只补充工程上下文，不扩大权限，也不改变必需评审者的路由。包的存在并不能证明调用、专业能力或更好的结果。尚未通过条件匹配的核心系统与核心加包对照试验证实质量提升。项目私有 overlay 不属于公开展示内容。

## 在 OpenAI Codex 上

| 模式 | 执行及权限 |
|---|---|
| Claude Code native | 原生命令、专门角色和 hooks；决策保留在相应宿主中 |
| Controlled Codex / mixed-host (experimental) | 控制器管理路由、文本提案、verifier 和明确的 gate |
| Codex plugin session | Skills、MCP 和安全 hooks；安装本身不会自动启动受控 pipeline |

`npx great-cto init --host codex` 为 Codex 提供技能、MCP 服务器和六个安全钩子（只需
批准一次：在终端运行 `codex`，选择 **Trust all and continue**）。Codex 没有用于斜杠
命令或角色代理的原生插件界面，因此流水线通过 CLI 运行：

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

默认需要显式更新（`great-cto upgrade codex`）。在 macOS 上，`sh scripts/codex-auto-update.sh enable` 启用可选的用户定时器，每六小时刷新一次；`status` 查看定时器，`disable` 将其移除。每次运行前都会验证 Git 来源。它跟随配置的 Git ref，而非 npm 发布；更改的钩子仍需在新会话中获得主机批准。详情与混合运行：
[Codex host 指南](../HOST-CODEX.md).

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
| 一个完整产品——开放基准中构建了 7 个 | 中位数 **$171** · **70/100**, **2026-07-10** — [复现](../benchmarks/BENCH-2026-07-batch1.md) |

这些是历史观察，不是当前双宿主 pipeline 或 domain packs 的基准测试。尚未确定质量提升百分比。Domain packs 仍需主动启用；其存在并不证明专业能力或更好的结果。

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
