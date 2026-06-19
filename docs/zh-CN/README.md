> ⚠️ **This translation is being updated.** GreatCTO has repositioned to an **AI Product Builder** — describe a product, approve the spec, ship the software (one CTO gate, maximum automation). For the current positioning see the [English README](../../README.md). The text below reflects the previous "AI autopilots" direction.

<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**面向业务的 AI 自动驾驶（autopilot）—— 交付工作成果，而不只是软件。**

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

[Website](https://greatcto.systems) · [One real run →](https://greatcto.systems/proof) · [Live demo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## 服务即新一代软件

下一波浪潮不再是面向专家的工具——而是**售卖某项服务最终成果的自动驾驶**。
一个自动驾驶端到端地运行整个业务职能（接入 → 处理 → 决策 → 交付），
只把需要判断力的关键决策上报给合格的人类。每一次模型的改进，都让这项服务
更快、更省。

GreatCTO 交付的正是这些自动驾驶——每一个都是**带有人类把关高风险环节的智能体 + 工具的流程（flow）**，
内置合规审查员，并配有**真实连接器（live connector）**，让每个流程跑在真实数据上。

## 这些自动驾驶

| 自动驾驶 | 它做什么 | 市场规模 | 谁在做 |
|---|---|---|---|
| 🩺 **[Medical-coding](https://greatcto.systems/autopilots/rcm.html)** | 临床记录 → 干净、合规的理赔单据；由持证编码员对高风险项签字确认 | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[Managed-IT](https://greatcto.systems/autopilots/msp.html)** | 在整个设备群中管理补丁、配置与访问权限——分阶段、可回滚、重大变更由人类把关 | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[Legal-document](https://greatcto.systems/autopilots/legaltech.html)** | 起草并批注合同与保密协议（NDA）；凡涉及法律意见的内容由持照律师签字 | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[Bookkeeping & close](https://greatcto.systems/autopilots/accounting.html)** | 记账、对账并完成月度结账；由财务主管对结账签字 | $50–80B | Rillet · Basis · Digits |
| 🧾 **[Tax-prep](https://greatcto.systems/autopilots/tax.html)** | 准备纳税申报并对税务处理立场分类；由持证报税员在申报前签字 | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[Source-to-pay](https://greatcto.systems/autopilots/procurement.html)** | 供应商入驻、发票匹配、放款付款——经过制裁与欺诈筛查 | $200B+ | Tacto · Zip · AskLio |

→ [全部自动驾驶](https://greatcto.systems/autopilots.html) · 运行 `/flow <vertical>` 即可在终端中查看任意流程

**每个自动驾驶都让人类把关需要判断力的决策**——持证编码员、持照律师、
财务主管、持证报税员。自动驾驶处理大量工作；人类负责那个承担法律责任的决策。**9 个真实连接器在全部六个自动驾驶中运行**——FHIR、ICD-10（NLM）、
NCCI/MUE、X12 837P、DocuSign、Plaid、OFAC、分阶段发布（staged-rollout），以及一个美国联邦税务引擎。它们
默认无需密钥（使用公开数据源或确定性的真实生成），并在你添加凭据的那一刻就向真实的服务提供方发起 POST 请求。

## 内部原理（写给运行它的 CTO）

每个自动驾驶都由一条带闸门（gated）的专家智能体流水线构建并运营——架构师、12 角度
审查员、QA、安全官、devops——并针对你的技术栈和司法辖区进行调优。**你每个功能只需做两个
决策；其余一切自动运行。** 合规审查员、签字的人类闸门、审计轨迹与真实连接器，构成了让自动驾驶
安全运行的信任层。

## 用数据说话

| | |
|---|---|
| LLM 成本（一个真实功能，带完整追踪） | **$2.39** |
| 同等工作量的人力成本 | **~$5,460** |
| 抓出的、QA 漏掉的缺陷 | **2** |
| 月度成本（20 次流水线运行） | **~$34** |
| 专家智能体 | **61** |
| 自动识别的原型（archetype） | **26** |
| 司法辖区 | **12**（GDPR · HIPAA · PCI-DSS · SOX · 等等） |

→ [包含全部产物的完整追踪](https://greatcto.systems/proof)

## 它如何运作

**`npx great-cto init`** —— 扫描你的技术栈与 README，检测司法辖区（GDPR？HIPAA？PCI？），并将适用于你项目的具体智能体、闸门与合规框架写入 `.great_cto/FLOW.md`。

**`/start "describe the feature"`** —— 在任何代码写出之前，评审员会先审查架构与规格说明。你在 `gate:plan` 处审阅计划。

**智能体自动运行** —— senior-dev 以 TDD 实现，配合 12 角度审查、QA、安全、devops。你在 `gate:ship` 处批准发布。

## 三个项目——三条不同的流水线

同一条命令。产出取决于你在构建什么、以及它在哪里运行：

| | **金融科技初创 · 欧盟** | **医疗门户 · 美国** | **CLI 工具** |
|---|---|---|---|
| 专家智能体 | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| 人类闸门 | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| 合规 | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| 每周期成本 | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ 试试交互式选择器：[greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## 你真正会去看的仪表盘

`great-cto board` 在 `http://localhost:3141` 打开——支持实时 SSE 的看板（Kanban）、每个智能体的成本卡片、流水线状态、30 天 LLM 支出对比人力等价基线。

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Metrics</b> — LLM 成本、人力等价基线、savings_x 比率</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Inbox</b> — 待处理闸门、P0 事故、被阻塞的任务、停滞的进行中任务</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>Agents</b> — 61 个专家，附最近使用时间 + 运行次数</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Memory</b> — 11 层 + 结晶化的事故模式</sub></td>
</tr>
</table>

**为单人工程组织而打造。** 独立开发者、单人创始人、亲力亲为的技术型 CTO——运行在 Claude Code 或 OpenAI Codex 上。*不适合团队*——参见 [FAQ](../FAQ.md#is-great_cto-for-teams)。

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
<summary>📖 完整文档 —— 两个闸门 · 评审员 · 61 个智能体 · 26 个原型 · 12 个司法辖区 · 45+ 合规框架 · 看板 · 成本 · MCP</summary>

## 每个功能两个决策

```
🟡 gate:plan   ←  你在这里决策（架构 + 任务 + 成本）
   ↓
🤖 senior-dev → 12-angle review → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  你在这里决策（PR 就绪，安全已签字）
```

架构师、规划者、审查员、QA、安全、DevOps 在这两个人类检查点之间自动运行。**记忆在会话之间持久保存**：每一个闸门裁定都追加到 `~/.great_cto/decisions.md`，每一次复盘都追加到各项目的 `lessons.md`，而 `/crystallize` 会把高影响力的模式提升到一个全局库中，供智能体在重新求解之前查询。

## 计划之前先有评审员

最昂贵的 bug 不在代码里——而在编码开始之前所做的决策里。三个评审员智能体在 Plan（计划）阶段之前运行，正位于一个错误代价最高的三个位置：

| 评审员 | 抓什么 |
|---|---|
| **架构评审员（Architecture critic）** | 那种日后排除掉多租户可能性的耦合 · 真实规模数据上“看似无害”的 O(n²) · 受限上下文（bounded context）之间的循环依赖 |
| **规格评审员（Spec critic）** | “我们解决了错误的问题”——最糟糕的一类 bug，因为没有任何单元测试会抓到它 · 不一致的验收标准 · 从未达成共识的范围 |
| **Schema 评审员（Schema critic）** | 在一张 5000 万行的表上加 `NOT NULL` 却没有默认值（部署后 10 分钟内死锁） · 建索引时缺少 `CONCURRENTLY` · 没有回滚路径的不可逆迁移 |

此前评审员只从 Plan 阶段开始激活。现在流水线会在实现开始之前就抓住架构级和规格级的错误——此时回退只需数小时，而非数天。

## great_cto 横向对比

|  | **great_cto** | Devin | Claude Code（单独使用） |
|---|---|---|---|
| 开源 | ✅ MIT | ❌ 闭源 | ❌ 闭源插件模式 |
| 自托管 | ✅ 本地运行 | ❌ Cognition 云 | ✅ |
| 宿主 | ✅ Claude Code + Codex | ❌ Cognition 云 | ✅ Claude Code |
| BYOK / 多模型 | ✅ Claude Code · Codex | ❌ 专有 | ❌ 仅 Anthropic |
| 专家智能体 | **57**（架构师 · PM · 12 角度审查 · QA · 安全 · devops · 跨原型、扩展包与司法辖区的 42 个审查员） | 1 个通用智能体 | 1 个通用智能体 |
| SDLC 编排 | 架构 → 计划 → 实现 → 审查 → QA → 安全 → devops | 一次性自主 | 编辑循环 |
| 人类闸门 | ✅ 每个功能 2 个（plan + ship） | ❌ 无 | ❌ |
| 跨会话记忆 | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ 仅线程内 | ⚠️ 仅线程内 |
| 成本追踪 | ✅ 每个智能体 + 30 天历史 + savings_x | ❌ | ❌ |
| 合规框架 | ✅ 33+（PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …） | ❌ | ❌ |
| 定价 | 免费（你向自己的 LLM 提供方付费） | $500/月 | $20/月 |
| 安装 | `npx great-cto init` | 注册 | 安装 CLI |

great_cto **不是**又一个编码智能体循环——它是你已在使用的编码智能体**之上的编排层**。可以理解为“一支审查并把关工作的专家团队”，而非“又一个替你敲代码的助手”。

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

## 自动识别的 26 个原型

每个原型都会激活其专属的专家智能体与合规检查清单。前 7 名：

| 原型 | 层级 | 专家智能体 | 合规 |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

完整表格（26 个原型）+ 检测如何运作：[docs/ARCHETYPES.md](../ARCHETYPES.md)。

**深度覆盖美国法规** —— 除 GDPR/PCI/HIPAA 之外，great_cto 现在还会针对 SEC 网络安全披露（8-K Item 1.05）、面向国防承包商的 CMMC 2.0 / NIST 800-171、美国 AI 治理（NIST AI RMF · Colorado SB 205 · Utah/Texas AI）、网络追踪相关诉讼（VPPA · CIPA · Washington MHMDA），以及面向放贷的 HMDA / SR 11-7 模型风险进行审查。

## 14 个领域扩展包——叠加式审查员

领域扩展包**叠加于**原型**之上**。当 CLI 检测到扩展包专属信号（依赖、README 术语）时自动挂载。每个扩展包都会添加它自己的审查员、威胁模型模板、EVAL 套件和人类闸门——独立于基础原型。

| 类别 | 扩展包 |
|---|---|
| **AI 垂直领域** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **数字健康** | `digital-health-pack` _(可穿戴遥测 · 心理健康 AI · 营养 AI · 医生 HITL)_ |
| **金融科技 / 受监管** | `lending-pack` · `em-fintech-pack` |
| **高合规** | `clinical-trials-pack` · `climate-pack` |
| **工程** | `api-platform-pack` · `robotics-pack` |
| **美国市场** | `sec-cyber-pack` _(SEC 8-K 披露)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 种人类闸门类型** + 53 个参考 EVAL 套件 + 15 个 TM 模板。通过**4 层旅程可视化**（原型 → 扩展包 → 审查员 → 闸门）浏览全部 14 个扩展包：[greatcto.systems/packs.html](https://greatcto.systems/packs.html)。

## 一次真实运行，完整追踪

一个 Python CLI 功能经由完整流水线交付：**$2.39 LLM 支出** 对比 ~$5,460 的人力等价成本。安全环节抓出了两个 QA 已放行的真实缺陷（`list(stream_csv())` 让流式处理失效 → 在 13 MB 输入上峰值 RSS 达 14.5 MB）。多审查员模型在合并之前抓住了单个智能体会遗漏的问题。

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

- **不适合团队** —— solo-CTO 才是本产品。2 人以上？你已经超出它的适用范围了。
- **不能替代资深工程师** —— 它把流程固化下来；没有资深工程师在场，它不会替你做架构判断。
- **不是 CI/CD 系统** —— 闸门在本地 / 会话内运行。你仍然需要 GitHub Actions 来完成真正的合并。
- **未经认证审计** —— PCI/HIPAA/SOC2 原型脚手架是起点，而非认证。
- **非确定性** —— 输出由 LLM 生成。每一个闸门裁定都应做一次合理性检查。

## FAQ（前 5）

**我的源代码会被用来训练模型吗？** 不会。Claude API 对付费客户默认零留存。great_cto 不会增加任何留存。

**你们如何把 token 成本压下来？** 默认使用 Haiku + 用 Kimi K2 路由做分诊（节省 60–80%）+ cost-guard hook。

**我能禁用 hooks 吗？** 每个 hook 都遵循 `GREAT_CTO_DISABLE_<NAME>=1`。按文件退出密钥扫描：`// great_cto:allow-secrets`。

**如果我不是单人怎么办？** great_cto 是为单人工程组织打造的。如果你有 2 名以上工程师、需要共享看板 / 多席位认证，那你已经超出它的适用范围了。

完整 FAQ：[docs/FAQ.md](../FAQ.md)。

## 文档

📚 **[完整文档中心 →](../README.md)** —— 按 [Diátaxis](https://diataxis.fr/) 组织：
**[Getting Started](../tutorials/getting-started.md)** · How-to 指南 ·
[Agents](../reference/agents.md) 与 [Commands](../reference/commands.md) 参考 · [Architecture](../ARCHITECTURE.md) · [FAQ](../FAQ.md)。

## 架构

该插件运行在 Claude Code（或任意支持 MCP 的宿主）内部；61 个智能体是 markdown 规格说明；任务存放在 Beads（dolt，git 原生）中；记忆是纯 markdown（无向量存储）。图示 + 技术栈表：[docs/ARCHITECTURE.md](../ARCHITECTURE.md)。

## 新动态

**v2.21.0**（2026 年 5 月）—— **Flow Compiler 体验**：`npx great-cto init` 现在会打印一份**编译后的流程（Compiled flow）**，包含每个功能周期的智能体、闸门、合规与成本估算。它写入 `.great_cto/FLOW.md`——智能体读取该文件，从而精确知道如何编排你的 SDLC。

**v2.20.0**（2026 年 5 月）—— **Detection v2**：**12 个司法辖区覆盖**（新增 CA · JP · CN · KR，含完整法律框架 + 人类闸门） · **基础设施信号检测**（Terraform 区域字符串、`.env` 中的 `AWS_REGION=`、docker-compose 中的 `TZ=`、`package.json` homepage 顶级域名） · **词边界匹配**（不再出现 "india" → "indiana" 的误报） · 面向小众原型的**扩展包提示**（当置信度较低时，`suggestedPacks` 会浮现 robotics/climate/clinical-trials/hr-ai/em-fintech 等扩展包）。Token 节省：每次流水线运行 –87.7%（v2.19.0 上下文架构重设计）。

**v2.19.0**（2026 年 5 月）—— **Token 经济 阶段 1+2**：产物摘要（≤250 token，自动生成）+ 任务感知记忆过滤器（每个任务取最相关的前 k 条）。每次流水线运行 –87.7% token。

**v2.17.0**（2026 年 5 月）—— **配套插件自动安装** · 在 Plan 阶段之前的**架构 / 规格 / Schema 评审员**。

[完整更新日志 →](../../CHANGELOG.md)

## 路线图

- **CI 中的 Evals runner** —— 在每个 PR 上运行黄金集 eval 套件，自动捕获提示词回归
- **自我改进循环** —— 智能体从裁定中学习，随时间改进自己的提示词
- **决策评分** —— 追踪哪些闸门决策最终被证明是对的；浮现其中的模式
- **/crystallize** —— 把高影响力的经验提升为整条流水线都可查询的可复用技能

[为下一个功能投票 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## 作者

[avelikiy](https://github.com/avelikiy) —— 一位构建 AI 原生交易与金融科技平台（0→1、1→N）的 CTO。great_cto 是我把自己的工作循环逐个智能体地自动化后的成果。每一条规则都是为应对真实生产系统中的真实问题而出现的。

## 社区

| 渠道 | 内容 |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bug、功能请求、原型提案 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 问题、模式、成果展示 |
| 📝 [Blog](https://velikiy.hashnode.dev) | 架构深度剖析 |
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
