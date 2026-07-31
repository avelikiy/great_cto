<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**描述产品。批准两次。交付软件。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[官网](https://greatcto.systems) · [一次真实运行 →](https://greatcto.systems/proof) · [在线演示](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [博客](https://greatcto.systems/blog/) · [更新日志](../../CHANGELOG.md)

</div>

> 本文是英文 [README](../../README.md) 在 **v2.90.0**（2026-07-30）时的翻译。
> 如有出入，以英文版为准。

---

great_cto 是**架在你已有编码代理之上的编排层**。由 **69 个专家代理**组成的流水线 —
architect、design-advisor、senior-dev、code-reviewer、QA、security、devops —
负责规划、构建、评审并部署一个真实的应用：后端、前端、生成的测试、可访问的 URL。

整个过程只会打断你两次：一次问**要造什么**，一次问**是否上线**。两点之间全部
自动运行。

```
   描述产品
        │
   🤖  规格 · 架构 · 数据模型 · 页面
        ▼
   👤  检查点 1 — 批准设计
        │
   🤖  脚手架 → 后端 → 前端 → 测试 → 评审 → 安全
        ▼
   👤  检查点 2 — 批准部署
        │
   🤖  已部署 · 仓库 · 可访问的 URL
```

<p align="center">
  <img src="../screenshots/board.png" alt="构建看板 — 实时流水线、门禁、按代理的成本" width="900" />
</p>

`localhost:3141` 的看板会自动填充 — 流水线状态、待批门禁、按代理的成本、30 天
开销。你不用喂它数据，只需要看。

## 实测数字

| | |
|---|---|
| 一个功能，端到端，完整可追溯 | **1h 26m · $3.40** token 费用 — [凭证](https://greatcto.systems/proof) |
| 完整产品 — 公开基准测试构建了 7 个 | 中位数 **$171** token 费用 · 质量 **70/100**（58–86）— [自行复现](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型月份，20 次流水线运行 | **~$34** — 只付给你自己的 LLM 提供商 |
| 系统会构建的产品 | **60** 个，横跨 15 个美国行业，通过 [6 条可复用流水线](https://greatcto.systems/pipelines) |

质量分是通过运行每个产品自己的测试得出的，不是数文件 — 所以它是 70，而不是
一个更圆更好看的数字。

## 快速开始

```bash
npx great-cto init            # Claude Code（默认）· OpenAI Codex 加 --host codex
```

重启 AI 宿主，然后：

```bash
/start "为 HVAC 企业构建一个调度排班应用"
```

之后由流水线接管。日常你只碰三样东西：

| | |
|---|---|
| `/start "…"` | 描述产品或功能 — 流水线执行 |
| `/inbox` | 需要你处理的：待批门禁、P0、被阻塞的任务 |
| `/digest` | 每周 DORA 指标 + 单功能成本汇总 |

需要 Node ≥ 18.17。伴生插件（Superpowers、Beads）自动安装。init 之后请确认宿主
真的加载了插件：`claude plugin list --json` 里 `great_cto` 的 `errors` 应为空。

## 什么时候会问你

`.great_cto/PROJECT.md` 里的一个设置决定流水线在哪里停下：

| `approval-level` | 停在 | 每个功能 |
|---|---|---|
| `product-only` | 造什么 · 是否上线 | 2 |
| `gates-only` *(默认)* | 设计 · 部署 | 2 |
| `strict` | + 代码评审 | 3 |
| `auto` | 不停 | 0 |

受监管的原型 — 金融、医疗、政务 — 在**任何级别（包括 `auto`）**都保留安全、
合规和上线门禁。更轻的级别是委托判断，绝不是绕过合规。完整表格：
[docs/GATES.md](../GATES.md)。

## 不同之处

- **专家而非通才** — 69 个职责单一、各带评审门禁的代理，而不是一个打字比思考
  快的助手。[名册 →](../reference/agents.md)
- **写代码之前先有批评者** — 架构、规格、schema 三个批评者在规划前运行，此时
  纠错的成本还是小时而不是天。
- **写入时强制边界** — 代理物理上无法触碰任务范围外的文件。不是评审时标记，
  而是写入时拒绝。
- **不信任自己的 QA** — 关键路径先写成 Gherkin 再写测试代码，然后用变异测试问
  一句：这套测试到底能不能抓住任何问题。
- **跨会话记忆** — 决策、经验、晋升的模式按项目和全局持久化；中断的构建恢复时
  知道哪些阶段已经跑过。
- **看得见的成本** — 按代理的开销、预算与实际的偏差、每次被接受变更的成本，
  都在看板上，而不是在表格里。

一切本地运行，MIT 许可，用你自己的密钥。代码留在你的机器上；prompt 只发给你的
LLM 提供商，别处不去。遥测**默认关闭**（[docs/PRIVACY.md](../PRIVACY.md)）。

## 局限

- **面向单人构建者** — 独立创始人或 CTO。两名以上工程师共用流水线就超出它的
  设计了。
- **不是 CI/CD** — 门禁在本地运行；合并仍然走 GitHub Actions。
- **不是认证审计** — PCI/HIPAA/SOC2 脚手架是起点，不是认证。
- **不是确定性的** — LLM 输出。门禁裁决值得人工复核。

## 文档

**[文档中心 →](../README.md)** ·
[入门](../tutorials/getting-started.md) ·
[门禁与批准级别](../GATES.md) ·
[代理](../reference/agents.md) · [命令](../reference/commands.md) ·
[原型](../ARCHETYPES.md) · [架构](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[其余一切](../DETAILS.md) — 批评者、司法辖区、成本明细、CI、告警

## 社区

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[博客](https://greatcto.systems/blog/) ·
[安全政策](../../SECURITY.md) · [贡献指南](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE)。作者 [@avelikiy](https://github.com/avelikiy)：
构建 AI-native 交易与金融平台的 CTO；great_cto 是我自己的工作循环，一次一个
代理地自动化而成。

如果它帮你省了时间，一颗星能帮其他独立构建者找到它。

<div align="center">

*别再做唯一会上线的人。*

</div>
