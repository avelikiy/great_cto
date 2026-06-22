<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**AI 产品构建器 —— 描述产品、批准规格、交付软件。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## 构建产品，而不只是代码

**你描述产品，great_cto 把它交付出来。** 不是一段代码片段，也不是一个脚手架——而是一个真实、
已部署的应用，带有后端、前端、生成的测试，以及一个上线 URL。你只做**唯一一个决策：批准规格。**
其后的一切——架构、数据模型、构建、评审、部署——都无人值守地运行。

它是一个 **AI 产品构建器（AI Product Builder）**，而不是又一个编码智能体循环。它是你已在使用的
编码智能体*之上*的编排层：一支由专家智能体组成的团队，负责规划、构建、评审并把关工作——
让一个人也能像一整支工程组织那样交付。

> **一个真实功能：从想法到合并的 PR，仅用 `1h 26m`、`$3.40` 的 LLM 成本。** 同一功能的传统路径
> 约需 6 周、约 $42K。[查看完整追踪 →](https://greatcto.systems/proof)

它横跨美国头部服务行业进行构建——家政与现场服务、专业服务、餐饮酒店、零售/电商、房产科技、
健身、营销与创作者、人力资源/招聘、建筑、物流——这些都收敛为 **6 条可复用的构建流水线**
（CRUD 垂直 SaaS、预订、CRM、仪表盘、市场、内容/媒体）。一套命令即可交付约 **40 种产品**中的任意一种。
参见 [docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md)。

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

CI 和生成的测试就是质量闸门——你签下的是**方向**，而非每一行代码。

## 内部原理（写给运行它的 CTO）

→ *面向构建者讲述这一界面的故事：[greatcto.systems/build](https://greatcto.systems/build)*

每个产品都由一条专家智能体流水线构建——架构师、design-advisor、senior-dev、
QA、security-officer、devops——它运行 spec → scaffold → backend → frontend → tests → deploy。
**你只做一个决策：批准规格。** 其后的一切都是自动化的。这条流水线是
按风险分级的——一次维护修复不会开启任何闸门（CI 就是闸门），一个可逆功能只开启
plan 闸门，而一个不可逆的变更则强制开启全套闸门——因此仪式感随影响半径而扩展，
而非随文书工作而扩展。CI 和构建自身生成的测试是质量闸门，正是它让流水线一路跑到部署变得安全。

**一道闸门，恰在要紧之处。** 构建步骤按风险分级：一次可逆变更会在 CI 背后构建并交付；
一次不可逆变更——一次生产部署、一次 schema 迁移、一个新的可写集成——会在运行之前
升级到 CTO 闸门和前沿模型。你签下规格
和高影响半径的调用；其余则一路直通。`change-tier` + `effectiveGates`
在代码中强制保证这一不变式。

## 用数据说话

| | |
|---|---|
| 一个功能，端到端（真实运行，完整追踪） | **1h 26m · $3.40 LLM** 对比传统 ~$42K / ~6 周 |
| 一次更早的 CLI 功能运行，同一条流水线 | $2.39 LLM 对比 ~$5,460 人力等价；安全环节抓出 2 个 QA 已放行的缺陷 |
| 月度成本（20 次流水线运行） | **~$34** |
| 目标美国行业 | **10**（家政服务 · 零售 · 房产科技 · 健身 · 人力资源 · …） |
| 可构建的产品 | 横跨 10 个行业的 **~40** 种 |
| 可复用的构建流水线 | **6**（CRUD · 预订 · CRM · 仪表盘 · 市场 · 内容） |
| 专家智能体 | **46** |

→ [包含全部产物的完整追踪](https://greatcto.systems/proof) · [这 6 条流水线](https://greatcto.systems/pipelines)

## 它如何运作

**`npx great-cto init`** —— 扫描你的技术栈，并将适用于你产品的流水线写入 `.great_cto/FLOW.md`：智能体、构建原型，以及那唯一的 CTO 闸门。

**`/start "describe the product"`** —— 架构师和 design-advisor 起草规格、数据模型和界面。你在**那一道闸门** `gate:plan` 处审阅并批准它。

**流水线把它交付出去** —— senior-dev 以 TDD 搭建并构建，QA 运行生成的测试，devops 部署。一次可逆构建无需进一步批准。

## 三个产品——同一条流水线

同一条命令，不同的产品。构建原型塑造技术栈和集成：

| | **派单应用** | **课程预订应用** | **盈利能力仪表盘** |
|---|---|---|---|
| 原型 | CRUD 垂直 SaaS | 预订 / 排程 | 仪表盘 / 分析 |
| 技术栈 | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| 集成 | Auth · RBAC | Stripe · Twilio | source connectors |
| 人类闸门 | `gate:plan`（CTO 闸门） | `gate:plan` | `gate:plan` |

→ 查看这 6 条流水线：[greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## 你真正会去看的仪表盘

`great-cto board` 在 `http://localhost:3141` 打开——构建看板：实时 SSE、带 change_tier 徽章的实时流水线（一道 CTO 闸门 · 廉价裁判）、每个智能体的成本、30 天 LLM 支出对比人力等价基线。

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>Metrics</b> —— 已交付的任务、AI 支出、对比人类团队的成本节省、每日消耗</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Memory</b> —— 可浏览的项目记忆层：PROJECT.md、原型、技能、经验教训</sub></td>
</tr>
</table>

**为单人工程组织而打造。** GreatCTO 面向那些想要无需团队就交付真实产品的独立开发者、单人创始人或技术型 CTO——在 Claude Code 或 OpenAI Codex 上运行流水线、批准一份规格、交付到一个上线 URL。*不适合多开发者的工程团队*——参见 [FAQ](../FAQ.md#is-great_cto-for-teams)。

## 安装

```bash
npx great-cto init
```

init 之后请重启你的 AI 宿主（host）。**要求：** Node 18.17+，并具备以下之一：

| 宿主 | 安装标志 | 状态 |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(默认)_ | ✅ 完整支持 |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + 智能体 |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Superpowers 与 Beads 配套插件会自动安装——无需手动设置。

---

<details>
<summary>📖 完整文档 —— 一道 CTO 闸门 · 风险分级 · 评审员 · 46 个智能体 · 构建原型 · 看板 · 成本 · MCP</summary>

## 每个功能一个决策

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

这条流水线是按风险分级的（`change_tier`）：一次维护修复**不**开启任何闸门（CI 就是闸门），一个可逆功能**只**开启 `gate:plan`，而一个不可逆的变更则强制开启全套闸门 + 前沿模型。闸门与部署之间的一切都自动运行。**记忆在会话之间持久保存**：每一个闸门裁定都追加到 `~/.great_cto/decisions.md`，每一次复盘都追加到各项目的 `lessons.md`，而 `/crystallize` 会把高影响力的模式提升到一个全局库中，供智能体在重新求解之前查询。

## 计划之前先有评审员

最昂贵的 bug 不在代码里——而在编码开始之前所做的决策里。三个评审员智能体在 Plan（计划）阶段之前运行，正位于一个错误代价最高的三个位置：

| 评审员 | 抓什么 |
|---|---|
| **架构评审员（Architecture critic）** | 那种日后排除掉多租户可能性的耦合 · 真实规模数据上"看似无害"的 O(n²) · 受限上下文（bounded context）之间的循环依赖 |
| **规格评审员（Spec critic）** | "我们解决了错误的问题"——最糟糕的一类 bug，因为没有任何单元测试会抓到它 · 不一致的验收标准 · 从未达成共识的范围 |
| **Schema 评审员（Schema critic）** | 在一张 5000 万行的表上加 `NOT NULL` 却没有默认值（部署后 10 分钟内死锁） · 建索引时缺少 `CONCURRENTLY` · 没有回滚路径的不可逆迁移 |

此前评审员只从 Plan 阶段开始激活。现在流水线会在实现开始之前就抓住架构级和规格级的错误——此时回退只需数小时，而非数天。

## great_cto 横向对比

|  | **great_cto** | Devin | Claude Code（单独使用） |
|---|---|---|---|
| 开源 | ✅ MIT | ❌ 闭源 | ❌ 闭源插件模式 |
| 自托管 | ✅ 本地运行 | ❌ Cognition 云 | ✅ |
| 宿主 | ✅ Claude Code + Codex | ❌ Cognition 云 | ✅ Claude Code |
| BYOK / 多模型 | ✅ Claude Code · Codex | ❌ 专有 | ❌ 仅 Anthropic |
| 专家智能体 | **46**（架构师 · design-advisor · senior-dev · QA · 安全 · devops · 原型评审员） | 1 个通用智能体 | 1 个通用智能体 |
| 构建流水线 | spec → CTO 闸门 → scaffold → build → test → deploy | 一次性自主 | 编辑循环 |
| 人类闸门 | ✅ 一道——你批准规格（按风险分级） | ❌ 无 | ❌ |
| 跨会话记忆 | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ 仅线程内 | ⚠️ 仅线程内 |
| 成本追踪 | ✅ 每个智能体 + 30 天历史 + savings_x | ❌ | ❌ |
| 内置设计 | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
| 定价 | 免费（你向自己的 LLM 提供方付费） | $500/月 | $20/月 |
| 安装 | `npx great-cto init` | 注册 | 安装 CLI |

great_cto **不是**又一个编码智能体循环——它是你已在使用的编码智能体**之上的编排层**。可以理解为"一支审查并把关工作的专家团队"，而非"又一个替你敲代码的助手"。

## 司法辖区检测

`npx great-cto init` 扫描三类信号源——README 关键词、基础设施区域字符串（Terraform、`.env` 中的 `AWS_REGION=`、docker-compose 中的 `TZ=`）以及 `package.json` 的 homepage 顶级域名——并自动检测**12 个司法辖区**中哪些适用：

| 司法辖区 | 信号（README + 基础设施） | 框架 | 审查员 |
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

词边界匹配可防止误报（`"india"` 不会匹配 `"indiana"`）。检测到的司法辖区会以 `jurisdiction: [eu, us-ca]` 的形式写入 `PROJECT.md`，并在每个功能上为相应审查员设置闸门。也可手动覆盖：

```yaml
jurisdiction: [eu, us-ca]
```

## 你每天都会用到的三条命令

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

此外还有：`/audit`（已有代码库扫描）、`/cost`（LLM 路由节省）、`/sec`（安全总览）、`/oncall`、`/release`、`/rfc`。完整列表：安装后查看 `~/.claude/commands/`。

## 成本

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| 流水线 | 每次成本 | 每月次数 | 合计 |
|---|---|---|---|
| quick（配置 / 错别字） | $0.10 | 10 | $1 |
| quick（新端点） | $1 | 6 | $6 |
| standard（功能） | $5 | 3 | $15 |
| deep（横切关注点） | $12 | 1 | $12 |
| | | | **~$34** |

支付你自己的 Anthropic API token。**没有按席位收费。没有 SaaS 锁定。** 常规分诊会自动路由到 Kimi K2（Sonnet 同等能力，成本约低 5 倍）→ 日志聚类成本降低 60–80%。

## 构建原型

每个产品都映射到一种**构建原型**，由它塑造其流水线——技术栈模板、
数据形态、标志性集成。这 6 种产品构建器原型（约 40 种产品都收敛到这些之中）：

| 原型 | 形态 | 技术栈 | 集成 |
|---|---|---|---|
| `vertical-saas` | 实体 · 角色 · 工作流 · 记录 UI | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | 日历 · 可用性 · 提醒 · 支付 | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | 联系人 · 管线 · 自动化序列 | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | 摄取 · 指标 · 可视化 · 告警 | Next.js · warehouse-lite · charts | source connectors |
| `marketplace` | 双边挂牌 · 撮合 · 支付 | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | 目录 · 访问层级 · 投递 · 变现 | Next.js · object storage · CDN | Stripe · media pipeline |

此外还有底层的软件种类原型（`web-service`、`mobile-app`、`cli-tool`、
`library`、…），引擎会自动检测它们以微调构建。参见 [这 6 条流水线](https://greatcto.systems/pipelines)。

完整表格（26 个原型）+ 检测如何运作：[docs/ARCHETYPES.md](../ARCHETYPES.md)。

**深度覆盖美国法规** —— 除 GDPR/PCI/HIPAA 之外，great_cto 现在还会针对 SEC 网络安全披露（8-K Item 1.05）、面向国防承包商的 CMMC 2.0 / NIST 800-171、美国 AI 治理（NIST AI RMF · Colorado SB 205 · Utah/Texas AI）、网络追踪相关诉讼（VPPA · CIPA · Washington MHMDA），以及面向放贷的 HMDA / SR 11-7 模型风险进行审查。

## 领域叠加层（可选）

在构建原型之外，当引擎检测到领域专属信号（依赖、README 术语）时，它可以
自动挂载一个可选的**领域叠加层（domain overlay）**——为诸如语音/电话、隐私
（GDPR/CCPA）或 AI 治理之类的事项添加一个专家审查员和若干额外检查。它们
是选择性加入的，且与构建流水线正交；大多数产品都不需要任何叠加层。

## 一次真实运行，完整追踪

权威凭据：**一个真实功能**经由完整流水线交付，**墙钟时间 1h 26m、
LLM 成本 $3.40**——architect → plan → 实现 → review → 人类闸门 →
合并的 PR。同一功能的传统路径：~170 小时、~$42K。每一个阶段都打了
时间戳，每一个产物都链接到一个公开的 GitHub PR。

一次更早的 Python CLI 功能运行（$2.39 对比 ~$5,460 人力等价）展示了审查模型的运作：安全环节抓出了两个 QA 已放行的真实缺陷（`list(stream_csv())` 让流式处理失效 → 在 13 MB 输入上峰值 RSS 达 14.5 MB）。

完整追踪 + 产物：[greatcto.systems/proof](https://greatcto.systems/proof) · 原始数据：[`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md)。

## CI 集成

放入任意 GitHub Actions 工作流：

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` 会自动检测 `$GITHUB_ACTIONS` 并在 PR diff 上内联输出 `::error file=...,line=N::` 注释。退出码：0 干净 / 1 有发现 / 2 设置错误。

## 测试金字塔

分层测试套件——**结构 + 状态机层在 <2 分钟内以 $0 成本运行**（`node --test tests/*.test.mjs`）；真实 LLM 层（26 个原型 × 4-8 个阶段 + 14 个扩展包 + 13 个审查员）按需通过 OpenRouter 运行，约 $5–10。完整拆解：[docs/testing/](../testing/)。

## MCP

原生 [MCP](https://modelcontextprotocol.io/) 服务器——**7 个工具**，可从 Claude Desktop、Codex 或任意 MCP 宿主调用。本地（无需看板）：`detect_archetype` · `estimate_cost` · `query_decisions`。看板支撑：`project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`。

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

完整设置 + 内部 MCP（Grafana、LLM 路由、Beads）：[docs/MCP.md](../MCP.md)。

## 邮件告警（零设置）

五类需要你在 <2 小时内采取行动的事项会被自动邮件通知——即使你不在看板前：

| 触发器 | 何时 |
|---|---|
| 🚨 **P0 事故** | 任意项目中开了一个 P0 任务 |
| ⏸️ **闸门停滞 > 2h** | 某个 `gate:ship` 已等你数小时 |
| 🛡️ **安全 BLOCKED** | `security-officer` 拒绝了一次合并 |
| 💸 **预算告警** | 月度 LLM 支出越过预算的 80% / 100% |
| 📊 **每周摘要** | 周五 09:00——已交付、已花费、节省、QA |

**设置**：看板 → **Notifications** 标签 → 输入邮箱 → 输入我们发送的 6 位验证码 → 选择触发器。无需 Resend 注册，无需 API 密钥——投递通过 `greatcto.systems/notify` 路由（免费，每个已验证邮箱 100 封/24 小时）。

## 局限与非目标

- **不适合多开发者的工程团队** —— 单个构建者才是本产品；2 名以上工程师共享流水线已经超出它的适用范围了。
- **不能替代资深工程师** —— 它把流程固化下来；没有资深工程师在场，它不会替你做架构判断。
- **不是 CI/CD 系统** —— 闸门在本地 / 会话内运行。你仍然需要 GitHub Actions 来完成真正的合并。
- **未经认证审计** —— PCI/HIPAA/SOC2 原型脚手架是起点，而非认证。
- **非确定性** —— 输出由 LLM 生成。每一个闸门裁定都应做一次合理性检查。

## FAQ（前 5）

**我的源代码会被用来训练模型吗？** 不会。Claude API 对付费客户默认零留存。great_cto 不会增加任何留存。

**你们如何把 token 成本压下来？** 默认使用 Haiku + 用 Kimi K2 路由做分诊（节省 60–80%）+ cost-guard hook。

**我能禁用 hooks 吗？** 每个 hook 都遵循 `GREAT_CTO_DISABLE_<NAME>=1`。按文件退出密钥扫描：`// great_cto:allow-secrets`。

**如果我不是单人怎么办？** GreatCTO 的构建流水线是为单个工程师打造的——如果你有 2 名以上工程师、需要共享的构建看板和并发流水线，那你已经超出它的适用范围了。

完整 FAQ：[docs/FAQ.md](../FAQ.md)。

## 文档

📚 **[完整文档中心 →](../README.md)** —— 按 [Diátaxis](https://diataxis.fr/) 组织：
**[Getting Started](../tutorials/getting-started.md)** · How-to 指南 ·
[Agents](../reference/agents.md) 与 [Commands](../reference/commands.md) 参考 · [Architecture](../ARCHITECTURE.md) · [FAQ](../FAQ.md)。

## 架构

该插件运行在 Claude Code（或任意支持 MCP 的宿主）内部；46 个智能体是 markdown 规格说明；任务存放在 Beads（dolt，git 原生）中；记忆是纯 markdown（无向量存储）。图示 + 技术栈表：[docs/ARCHITECTURE.md](../ARCHITECTURE.md)。

## 新动态

**v2.74+**（2026 年 6 月）—— **产品构建器转向**：GreatCTO 成为一个 *AI 产品构建器*——描述一个软件产品、在一道 CTO 闸门处批准规格，流水线便将其交付（spec → build → test → deploy）。10 个美国行业、~40 种产品、6 条可复用流水线。构建闸门按风险分级（`change_tier`）；受监管的运行时界面已迁出到 [avelikiy/operate](https://github.com/avelikiy/operate)。故事：[策略](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [这 6 条流水线](https://greatcto.systems/pipelines)

**v2.40–v2.62**（2026 年 6 月）—— **自动驾驶转向**：GreatCTO 成为 *面向业务的 AI 自动驾驶*——25 个服务自动驾驶垂直领域，每一个都是一个流程，配有可度量的质量记分卡、一位负责的所有者，以及那条运行时不变式——**任何不可逆的动作绝不会在没有人类签字的情况下执行**。22 个真实连接器让每个垂直领域跑在真实数据上。故事：[我们转向了 →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63**（2026 年 6 月）—— **操作员控制台**：持久化运行在人类闸门处暂停，并在收件箱中等待一位具名的持证人类；签字即执行写入操作。基于角色的访问、限定范围的邀请、附证据的 AI 起草裁定、QA 抽样、SLA 计时、Ops 标签（计量 · 连接器健康 · 死信重排队）、WCAG 2.2 AA、明/暗主题。故事：[操作员控制台 →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65**（2026 年 6 月）—— **内部原理**：开发看板变成一个 *控制台（pult）*——批准一道闸门可以衍生出一次实时流式的智能体运行；提示词自我改进以留出集（held-out evals）为闸门（受 SIA 启发）；$0 上下文压缩（CI 日志 31,475 → 155 字符且保留 FATAL）；Fable 5 支持。故事：[六月内部原理 →](https://greatcto.systems/blog/june-under-the-hood)

[完整更新日志 →](../../CHANGELOG.md)

## 路线图

- **产品原型检测** —— 从产品简介中挑选构建原型，而不只是从技术栈
- **按行业的构建模板** —— 为这 6 条流水线中的每一条端到端交付一个参考产品
- **分级感知裁判** —— 在 T0/T1 evals 上使用一个廉价的微调裁判，在 T2 上使用前沿模型 + 人类（ADR-004）
- **无头任务运行器** —— 把产品构建排入队列并在 VPS 上无人值守地运行

[为下一个功能投票 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 作者

[avelikiy](https://github.com/avelikiy) —— 一位构建 AI 原生交易与金融科技平台（0→1、1→N）的 CTO。great_cto 是我把自己的工作循环逐个智能体地自动化后的成果。每一条规则都是为应对真实生产系统中的真实问题而出现的。

## 社区

| 渠道 | 内容 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bug、功能请求、原型提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 问题、模式、成果展示 |
| 📝 [Blog](https://greatcto.systems/blog/) | 凭据、成本拆解、架构深度剖析 |
| 🔒 [SECURITY.md](../../SECURITY.md) | 负责任的漏洞披露 |

## 贡献与许可

欢迎提交 Pull Request——参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。适合新手的 issue：[`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue)。

MIT —— 参见 [LICENSE](../../LICENSE)。

如果 great_cto 为你节省了时间，请为本仓库点 star——这能帮助其他单人 CTO 发现它。

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Built by [@avelikiy](https://github.com/avelikiy)**
*Stop being the only person who can ship.*

</div>
