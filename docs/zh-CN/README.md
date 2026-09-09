<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**用你已有的编码 agent 交付产品。**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-skills_·_MCP_·_second_opinion-blueviolet)](https://github.com/openai/codex)

```bash
npx great-cto init
```

[官网](https://greatcto.systems) · [一次真实运行 →](https://greatcto.systems/proof) · [在线演示](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [博客](https://greatcto.systems/blog/) · [更新日志](../../CHANGELOG.md)

[English](../../README.md) · [Русский](../ru/README.md) · **简体中文** · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> 本文翻译自英文 [README](../../README.md) 的 **v3.28.0**（2026-09-09）版本。
> 两者如有出入，以英文版为准。

---

great_cto 是**围绕你已经在跑的编码 agent** 的那一层。它驱动你的 Claude Code
走完整个构建，交给你一个**属于你的仓库**和一个**已经能用的 URL**：架构、数据
模型、后端、前端、生成的测试和部署，全部完成。不是计划。不是原型。

它做而 prompt 合集不做的那一件事：**它会告诉你 agent 没有做什么。**被跳过的
阶段、从未运行的评审、没有任何东西测量过的成本 —— 每一项都按其本来的样子呈现，
永远不会被算作通过。证据是做减法：v3.27.0 和 v3.27.1 删掉了本项目自己那些好看
的数字 ——「相比全职员工节省的成本」、与人类团队的开销对比、一个预测出来的月度
数字 —— 因为它们都无法被证明为真。

在 Codex 上流水线不运行：跑在那里的是 skills 合集和一个 MCP 服务器。Codex 的
另一份工作是充当**第二意见** —— 从 Claude Code 内部，它读同一份 diff，每一行
评审都带着它所读那棵树的 `sha`，所以「已评审」可以针对*这一份* diff 被证明，
而不只是被断言。日志目前有 **4 条记录，其中 1 条带 sha**；不会据此宣称任何捕获
率，也不该有。

它不是托管式的应用生成器，也不替代你的 agent；没有 agent，它就没有可编排的对象。

公开基准测试里端到端构建的七个产品，token 成本**中位数 $171**，测量于 2026-07。
你付给自己的 LLM 提供商；great_cto 不向你收一分钱，且是 MIT。

你会被拦下**三次** —— 在*造什么*、*怎么造*、以及*是否上线*上。这三次之间的
一切都无人值守地运行，而流水线的职责就是值得你放手：职责狭窄的专家（architect、
design-advisor、senior-dev、code-reviewer、QA、security、devops），以及一个独立
模型，在下一个阶段接着往上盖之前检查上一个阶段的产出。完整名册见
[docs/reference/agents.md](../reference/agents.md)。

```
   描述一个产品
        │
   🤖  界定问题 · 权衡方案 · 写出简报
        ▼
   👤  检查点 1 —— 批准要构建什么
        │
   🤖  架构 · 数据模型 · 页面 · 计划
        ▼
   👤  检查点 2 —— 批准如何构建
        │
   🤖  脚手架 → 后端 → 前端 → 测试 → 评审 → 安全
        ▼
   👤  检查点 3 —— 批准部署
        │
   🤖  已部署 · 仓库 · 可访问的 URL
```

三个检查点是**默认值**，不是下限。`PROJECT.md` 里的一行就能把它降到一个 ——
你只批准部署，检查点 1 和 2 变成一屏你读的内容，而不是一张你填的表：

```
approval-level: ship-only
```

见[什么时候会问你](#什么时候会问你)。

<p align="center">
  <img src="../screenshots/board.png" alt="看板的 Decisions 屏 —— 每个等待中的门禁都是一行：它的撤销成本、两位评审者的裁决，以及一个在撤销代价高昂时会要求你输入门禁名称的 Approve" width="900" />
</p>

<p align="center">
  <img src="../tapes/ci.gif" alt="终端：npx great-cto register 把项目加入看板的切换器，然后 npx great-cto ci 用代码和月度预算核对声明的原型，并通过" width="900" />
</p>

`localhost:3141` 上的看板会自己填满 —— 流水线状态、待批门禁、按 agent 的成本、
30 天开销。你不用喂它数据，你只需要看。四块屏，各回答一个问题：**Decisions**
（什么需要你 —— 每个门禁连同两位评审者的裁决，按撤销成本排序）、**Ledger**
（花了多少、正在跑什么）、**Fleet**（该停止信任哪个 agent —— 它的工具授权、
它的运行、它的开销）、**Harness**（谁是宿主、谁给第二意见、以及它到底做了
什么）。设置藏在齿轮后面；`⌘K` 按名字找到任何 agent、文档、会话、记忆或决策。
上面没有任何东西会把「缺失」呈现成「通过」—— 从未运行的扫描是 `n/a`，绝不是
一个绿色的零。

## 实测数字

| | |
|---|---|
| 一个功能，端到端，完整可追溯 | **1h 26m · $3.40** token 费用 —— [凭证](https://greatcto.systems/proof) |
| 一个完整产品 —— 公开基准测试里构建了 7 个 | 中位数 **$171** token 费用 · 质量 **70/100**（58–86），测量于 **2026-07-10** —— [自行复现](../benchmarks/BENCH-2026-07-batch1.md) |
| 典型月份，20 次流水线运行 | **~$34** —— 你只付给自己的 LLM 提供商，别无其他 |
| 它知道怎么构建的产品 | **60** 个，横跨 15 个美国行业，通过 [6 条可复用流水线](https://greatcto.systems/pipelines) |

质量分是通过运行每个产品自己的测试得出的，不是数文件 —— 所以它写的是 70，
而不是一个更圆、更好看的数字。

## 快速开始

```bash
npx great-cto init
```

重启 Claude Code，然后：

```bash
/start "build a dispatch & scheduling app for an HVAC business"
```

之后由流水线接管。日常你只碰三样东西：

| | |
|---|---|
| `/start "…"` | 描述一个产品或功能 —— 流水线把它跑完 |
| `/inbox` | 需要你处理的：待批门禁、P0、被阻塞的任务 |
| `/digest` | 每周 DORA 指标 + 单功能成本汇总 |

需要 Node ≥ 18.17。伴生插件（Superpowers、Beads）自动安装。init 之后，确认宿主
真的加载了插件 —— `claude plugin list --json` 里 `great-cto` 的 `errors` 应为空。

**在 OpenAI Codex 上**（`npx great-cto init --host codex`）你得到的是 **skills 和
MCP 服务器** —— 不是上面那条流水线。Codex 没有承载钩子、斜杠命令或角色 agent 的
插件面，所以 `/start`、`/inbox`、门禁链和 `secret-scan` 在那里不运行。这是宿主
的限制，不是一个设置：插件清单里的 `hooks` 根本不会被读取
（[openai/codex#16430](https://github.com/openai/codex/issues/16430)、
[#39895](https://github.com/openai/codex/issues/39895)）。安装器在动手之前就会
打印同样的分野。

**两个宿主，一次评审。**从 3.26.0 起，Codex *确实*参与流水线 —— 从 Claude Code
内部，作为第二位评审者。只需声明一次：

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

之后每一次高风险改动，Claude 的 `code-reviewer` 和 **`codex exec`**（只读沙箱、
用你自己的 Codex 登录、不需要 API key）会**同时评审同一份 diff**。发现会合并；
任何一边的 P0 都会阻塞；两边不一致时，两套结论都会在门禁处送到人面前 —— 更严格
的那一方决定裁决，没有人取平均。看板的 **Harness** 屏检测 Codex、保存这个选择，
并在旁边展示第二意见*做了什么*：来自 `.great_cto/cross-review.log` 的每一次运行，
包括被跳过的那些。四种状态，而第四种才是关键 —— *已声明但不可用*绝不会被显示成
*关闭*。

它到底有多大帮助，是在那里被测量的，不是在这里被断言的。日志目前记下的是：第一次
真实的 Codex 评审 —— 评审的正是把 Codex 接进来的那个提交 —— 发现了一个作者和
测试套件都漏掉的 P1；对修复的评审则一无所获。两次运行是机制存在的证据，不是一个
比率。比率是那张卡片的活。

## 什么时候会问你

`.great_cto/PROJECT.md` 里的一个设置决定流水线在哪里停下：

| `approval-level` | 在哪里拦下你 | 拦下次数 |
|---|---|---|
| **`ship-only`** | **部署 —— 并就要构建什么向你做一次简报** | **1** |
| `product-only` | 造什么 · 是否上线 | 2 |
| `gates-only` *(默认)* | 造什么 · 设计 · 部署 | 3 |
| `strict` | 设计 · 代码评审 · 部署 | 3 |
| `auto` | 流水线里什么都不拦 | 0 |

计数指的是流水线里的停顿。每一个级别还都带着一道不属于流程选择的护栏：把数据
导入覆盖已有记录，在**每一个**级别都会拦下你，`auto` 也不例外 —— 因为那一个会
毁掉原本存在的东西。

**`ship-only` 是仍然诚实的最小值。**一次停顿 —— 部署，唯一一个后果会离开你机器
的决定。*造什么*这个决定并没有消失，因为一条流水线花一整天做错的东西才是那种
昂贵的失败：它以一屏的形式出现在你的控制台里，在构建开始之前打印一次。

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

沉默即同意，而这屏话把这一点说明白了。如果简报读不出来，门禁会回来 ——
「我没能给你看」绝不会被当作「已经给你看过，而你没说话」交付。

`gates-only` 在 v3.0.0 里获得了产品门禁。它过去只在*怎么构建*和*是否发布*上
停下，从不在*造什么*上停 —— 而那正是那种错了六个阶段之后才有人发现的决定。它
的代价是每个**产品**一次暂停，不是每个功能一次：`product-owner` 是一个入口点，
只从 `/start` 运行。

受监管的原型 —— 金融、医疗、政务 —— 在**每一个级别，包括 `auto`**，都保留它
的安全、合规和上线门禁。更轻的级别是委托判断；它绝不跳过合规。完整表格：
[docs/GATES.md](../GATES.md)。

## 它拒绝说的四件事

同一条规则，在四个坚持起来有代价的地方：**没有发生过的事，绝不能看起来像发生
过的事。**

| 什么时候 | 什么最容易被显示出来 | 它实际显示什么 |
|---|---|---|
| 声明了第二意见，但它的宿主不在 | *关闭* | **`unavailable`** —— 已声明且连不上，不是你做出的选择 |
| 一项检查跑过了，但无法判定 | *通过* | **`unverifiable`** —— 而且阶段不会据此往下走 |
| 一次运行的成本从未被测量 | **`$0.00`** | **`unmeasured`** —— 而且预算不会据此触发 |
| 一个阶段没有被任何人评估过 | *0* | **`null`** —— 通过率只除以真正被评估过的部分 |

这每一处，诚实的答案都更长、更难看，也比那个自信的答案更难做出来。这就是整个
产品。

## 值得有的三个疑虑

**「我没法信任我没有亲眼看着写出来的代码。」**
我们也不信，所以没有任何东西是听 agent 自我陈述就算数的。每个阶段都拿它实际
产出的东西来核对 —— 点名的文件是否存在、冻结的验收标准运行时是否通过，只有到
这一步之后，才会请一个独立的模型判断每条需求是否被处理。当这项检查无法判断时，
它返回 `unverifiable`，那**不是**通过。

**「它会在我睡觉的时候花钱。」**
按 agent 的预算会拒绝在超出上限后派发，并报出那个数字。一次成本无法被测量的
运行显示为 `unmeasured`，并且不拦住任何东西 —— 一个基于没人测量过的数字触发的
限额，比没有限额更糟；而给未测量的工作一个自信的 `$0.00`，正是开销无声溜走的
方式。

**「然后我就被锁死了。」**
一条命令安装，MIT，跑在你自己的机器上、用你自己的 LLM 账号。删掉 great_cto，
它构建出来的仓库仍然是你的 —— 普通的 Next.js、Postgres 和 Stripe，任何工程师
都能接手。

## 不同之处

- **专家，而不是通才** —— 70 个职责狭窄、各带自己评审门禁的 agent，而不是一个
  打字比思考快的助手。[名册 →](../reference/agents.md)
- **批评者先于代码** —— 架构、规格和 schema 三个批评者在规划之前运行，那时候
  错误的代价还是几小时，而不是几天。
- **写入时强制边界** —— agent 在物理上就无法碰它任务范围之外的文件。不是评审时
  标记；是写入时拒绝。
- **不信任自己的 QA** —— 关键路径先写成 Gherkin，再写测试代码，然后用变异测试
  追问一句：这套测试到底能不能抓住任何东西。
- **跨会话的记忆** —— 决策、经验和被晋升的模式按项目和全局持久化；被中断的运行
  恢复时知道哪些阶段已经跑过。
- **看得见的成本** —— 按 agent 的开销、估算与实际的偏差、每次被接受变更的成本，
  都在看板上，而不是在某张表格里。
- **会拒绝的支出上限** —— PROJECT.md 里的 `agent-budgets:` 限定一个阶段能花
  多少；流水线拒绝在超出之后派发，并报出那个数字。估算永远不会拒绝 —— 见上面
  那张表。
- **一个阶段在下一个往上盖之前先被核对** —— 裁决点名的文件必须存在，冻结的
  `## ACCEPTANCE` 标准运行时必须通过，只有在这之后才会请第二个模型判断每条需求
  是否被处理。最便宜的问题问在最前面，而且是三个答案而不是两个：`verified`、
  `rework`、或 `unverifiable`。一个什么都不声称、也不冻结任何标准的 agent 会被
  报出来 —— 否则最便宜的通过方式就是什么都不声称。
- **工作会被退回，而退回有次数上限** —— 失败的阶段返回 `REWORK`，findings 原文
  附上，由同一个 agent 修；`BLOCKED` 意味着必须由人来决定。三轮之后它变成人的
  问题，因为两台机器把活儿推来推去是不会觉得腻的。
- **质量与发生了什么分开记** —— 裁决说一次运行做了什么，*评分*说做得多好，记在
  它自己的只追加存储里，由不同的执行者在不同的时间给出。评分者之间可以不一致，
  而每个分数都写明是谁给的。
- **沉默会被记录** —— 派发器把它决定了什么写进
  `.great_cto/pipeline-runs.jsonl`，*包括它决定什么都不做的时候*，以及为什么。
  今年发现的每一个流水线缺陷，都藏在「本来什么都不该发生」和「本来什么都发生
  不了」之间的缝里。

一切都在本地运行，MIT 许可，用你自己的密钥。你的代码留在你的机器上；prompt 只
发给你的 LLM 提供商，别处不去。遥测**默认关闭**（[docs/PRIVACY.md](../PRIVACY.md)）。

## 局限

- **面向单人构建者** —— 独立创始人或 CTO。两名以上工程师共用同一条流水线，就已经
  超出了它。
- **不是 CI/CD 系统** —— 门禁在本地运行；你仍然通过 GitHub Actions 合并。
- **不是认证审计** —— PCI/HIPAA/SOC2 脚手架是起点，不是认证。
- **不是确定性的** —— LLM 输出。门禁裁决值得人工复核一下。
- **开销被测量了，但归因还没有细到 agent** —— 成本是从宿主自己的会话记录里读出来
  的，而不是从某个 agent 的自我汇报里，所以 token 是真的。但钩子拿到的那份记录
  覆盖的是整个会话，而不是某一个子 agent，所以一次运行的成本可能被归到最后结束的
  那个阶段头上 —— 高出几个数量级。在这一点修好之前，把按 agent 的数字当成上限。
  完全没有测量到的阶段仍然显示 `unmeasured`，而不是一个自信的 `$0.00`，并且预算
  不会为它触发。

## 文档

**[文档中心 →](../README.md)** ·
[入门](../tutorials/getting-started.md) ·
[门禁与批准级别](../GATES.md) ·
[Agents](../reference/agents.md) · [命令](../reference/commands.md) ·
[原型](../ARCHETYPES.md) · [架构](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[其余一切](../DETAILS.md) —— 批评者、司法辖区、成本明细、CI、告警

## 社区

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[博客](https://greatcto.systems/blog/) ·
[安全政策](../../SECURITY.md) · [贡献指南](../../CONTRIBUTING.md)

MIT —— [LICENSE](../../LICENSE)。由 [@avelikiy](https://github.com/avelikiy)
构建：一名构建 AI-native 交易与金融平台的 CTO；great_cto 是我自己的工作循环，
一次一个 agent 地自动化而成。

如果它帮你省下了时间，一颗星能帮其他独立构建者找到它。

<div align="center">

*别再做唯一一个能上线的人。*

</div>
