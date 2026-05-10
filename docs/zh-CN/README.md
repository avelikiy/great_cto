<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**别再做唯一能发布版本的人了。**

你是 CTO，也是瓶颈。**GreatCTO 是 30 个专业代理**，负责架构、代码审查、QA、安全和部署 — 而你只需要做出**每个特性两个决定**。

> **v2.7.0** · 34 代理 · 25 项目类型 · 24 安全规则 · 9 钩子 · 在 **Claude Code · Cursor · Codex · Aider · Continue** 中工作 · MCP 服务器 · webhooks · CI gate · 每项目 ~$34/月 · MIT

> ⚠️ 此翻译为机器翻译,需要本地化审核。如发现问题请提交 PR。 [English original](../../README.md).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[官方网站](https://greatcto.systems) · [演示](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [讨论](https://github.com/avelikiy/great_cto/discussions) · [博客](https://velikiy.hashnode.dev)

**语言:** [English](../../README.md) · [Русский](../ru/README.md) · **简体中文** · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português (BR)](../pt-BR/README.md)

</div>

## 更新日志

### v2.7.0 — 代理提示一致性 + 模型层级策略 (2026 年 5 月)
- 3 条新 lint 规则: `CONS-MODEL` (代理模型与角色匹配) · `CONS-OUTPUT` (reviewers 声明输出文件) · `CONS-SIGNOFF` (sign-off / gate 语义)
- ADR-002 — 统一的模型层级选择策略 (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet)
- Bug 修复: SessionEnd 自动捕获日志现在能正确渲染到 board 管理界面
- Lint 基准: 34 个代理 · 0 错误 · 0 警告


[完整变更日志 →](../../CHANGELOG.md)

## 什么是 great_cto?

great_cto 是一个 [Claude Code 插件](https://claude.com/plugins),它将完整的 SDLC 流程作为 **33 个专业代理** 运行 — 架构师、规划、实现、12 角度审查、QA、安全、部署、支持 — 通过你真正会查看的看板进行协调。每个特性你做两个决定;其余的都自动完成。

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 列, 内联门审批, 实时 SSE" width="900" />
  <br/>
  <em>Kanban — 5 列, 内联状态编辑, 来自 <code>bd</code> CLI 的 SSE 实时更新。</em>
</p>

| 层级 | 作用 |
|------|------|
| **33 个专业代理** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 项目类型** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **自动检测** | 扫描 `package.json`, `pyproject.toml`, `Cargo.toml`, README, 代码结构 → 在 2 秒内选择项目类型 + 合规门。当置信度低时,Anthropic Haiku 提供二次意见 (~$0.001)。 |
| **合规** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — 按项目类型自动附加。 |
| **内存** | 4 层 — `PROJECT.md` (项目类型) · `lessons.md` (项目复盘) · `~/.great_cto/decisions.md` (每个门审批,可跨项目查询) · `verdicts/` (每个代理判定)。 |
| **看板** | `great-cto board` 在 `localhost:3141` 打开 6 个视图 — Inbox · Kanban · Metrics · Agents · Memory · Public report。通过 SSE 实时更新。 |

## 每个特性两个决定

```
你:  /start "添加 Stripe 订阅 — 月度和年度计划"

great_cto:
  → 项目类型: commerce | 规模: standard | ~45 分钟
  → 合规: pci-dss + gdpr (自动附加)
  → ARCH-stripe-subscriptions.md 已就绪  →  决定 1: 批准架构?

你: "批准"

  → senior-dev → 12 角度审查 → qa-engineer → security-officer → devops
  → 412 个测试通过 · 0 高危 · canary 就绪
  → 决定 2: 发布?

你: "发布"  →  canary 5% → 20% → 100%  →  RELEASE 文档已写入
```

## 快速安装

```bash
npx great-cto init
```

CLI 扫描你的仓库,选择正确的项目类型,自动连接合规门。适用于新项目或已有项目。之后重启 Claude Code。

**前置要求:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## 你真的会查看的看板

```bash
great-cto board   # localhost:3141
```

6 个视图,真实截图 — 见 [greatcto.systems#board](https://greatcto.systems#board)。

| 视图 | 内容 |
|------|------|
| **Inbox** | 恢复卡片 (从上次离开的地方继续) · 待定决定 · 开放的 P0 · 阻塞 · 停滞 (in-progress > 48h) |
| **Kanban** | 5 列 · 内联门审批/拒绝 · 过滤栏 (代理 / 优先级 / 标签) · ⌘K 搜索 · `j`/`k` 导航 |
| **Metrics** | 主卡片 (速度, 成本, MTTR) · 30 天 LLM 支出图,带预算告警 |
| **Agents** | 每个代理的时间, LLM 成本, 按 $150/小时折算的人力等价 · 活动流 (最近 20 个判定) |
| **Memory** | 4 层浏览器: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Public report** | 切换打开 → 不可猜测的 URL,包含已发布任务、AI vs 人工成本对比。无代码,无凭据。 |

多项目切换器 — 一个看板,所有客户。跨项目决定日志能在你所有仓库中找到 *"我们以前解决过这个吗?"*

## 每天使用的三个命令

| 命令 | 作用 |
|------|------|
| `/start "描述"` | 运行完整 SDLC 流程 — 检测项目类型、生成架构文档、用 TDD 实现、审查、QA、安全、部署 |
| `/review` | 在当前分支上进行 12 个独立角度的代码审查 |
| `/inbox` | 开放的门、阻塞的任务、P0 事件、安全告警 — 所有需要你立即决定的东西 |

其余 (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) 自动运行或仅在需要时运行。完整参考见 [`docs/COMMANDS.md`](../COMMANDS.md)。

## 25 个自动检测的项目类型

每种项目类型都会激活其专业代理和合规清单。

| 项目类型 | 默认级别 | 自动加载的专业代理 | 合规 |
|---------|---------|--------------------|------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |

随时覆盖: `npx great-cto init --archetype <name>` 或编辑 `.great_cto/PROJECT.md`。当启发式置信度低时, CLI 还提供 Anthropic Haiku 二次意见 (~$0.001) — 设置 `ANTHROPIC_API_KEY` 启用,通过 `--no-llm` 退出。

专门的 landing 页面: [agent-product](https://greatcto.systems/for/agent-product) · [fintech](https://greatcto.systems/for/fintech) · [healthcare](https://greatcto.systems/for/healthcare)。

## 这有何不同?

我们不是编辑器 — 我们围绕你的编辑器编排流程。如果你愿意,在循环中使用 Cursor、Copilot 或 Claude Code。

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| 多代理 SDLC 流程 | ✓ 33 个专家 | ✕ | ✕ | ✕ |
| 自动项目类型检测 | ✓ 25 种 | ✕ | ✕ | ✕ |
| 合规门 (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| 持久内存 | ✓ decisions.md + verdicts | ⚠ 仅聊天 | ✕ | ✓ 聊天范围 |
| 多项目视图 | ✓ | ✕ | ✕ | ⚠ |
| 12 角度代码审查 | ✓ | ⚠ 单次 | ⚠ 单次 | ✕ |
| 公开可分享报告 | ✓ | ✕ | ✕ | ✕ |
| 开源 | ✓ MIT | ✕ | ✕ | ✕ |
| 本地运行 | ✓ | ⚠ 部分 | ✕ | ✕ |
| 用你自己的 API | ✓ | ✕ | ✕ | ✕ |
| **价格** | **$0 + 你的 API** | $20/月 | $39/月 | $20/月 |

## 成本

```
~$34/月 — 典型产品团队,每月 20 次流程运行,仅供参考。
```

| 流程 | 每次成本 | 每月次数 | 总计 |
|------|---------|---------|------|
| quick (配置 / typo) | $0.10 | 10 | $1 |
| quick (新端点) | $1 | 6 | $6 |
| standard (特性) | $5 | 3 | $15 |
| deep (跨切面) | $12 | 1 | $12 |
| | | | **~$34** |

支付你自己的 Anthropic API token。**无人头费。无 SaaS 锁定。** 例行 triage 自动路由到 Kimi K2 (Sonnet 等价,成本约低 5 倍) → 在日志聚类和噪声堆栈跟踪上节省 60–80% 成本。

## 流程根据工作量自动伸缩

```
architect → pm → senior-dev → [/review ×12] → qa-engineer → security-officer → devops → l3-support
```

| 规模 | 代理 | 时间 | 何时使用 |
|------|------|------|---------|
| `quick` | 1–3 | 5–20 分钟 | 热修复、typo、新端点、小特性 |
| `standard` | 5 | ~45 分钟 | **默认** — 标准特性、新服务 |
| `deep` | 7+ | 90+ 分钟 | 跨切面、受监管领域、架构迁移 |

`/start` 自动检测规模。随时覆盖: `"做成 deep"`, `"这只是 quick fix"`。

## 内存与跨项目学习

我们综合,而不是记录。每个项目本地内存总计 ~10–50 KB,会话开始时索引。

| 层级 | 文件 | 记什么 | 综合触发 |
|------|------|--------|---------|
| L1 | `.great_cto/PROJECT.md` | 项目类型、规模、合规、负责人 | `/start` |
| L2 | `.great_cto/lessons.md` | 项目复盘,什么失败了,什么有效 | 每周 `/digest` + 每次事后分析 |
| L3 | `~/.great_cto/decisions.md` | 跨所有项目的每个门 approve/reject (append-only ADR 日志) | 每次门操作自动 |
| L4 | `~/.great_cto/verdicts/` | 每个代理判定 (APPROVED / DONE / BLOCKED / FAIL) 及理由 | 每次代理运行自动 |

代理在读取源文件**之前**查询内存 — 已解决的问题保持已解决。跨项目: 项目 A 的 "JWT auth" 决定在项目 B 相关时浮现。在 P0 事件后,代理提取结构化模式,`/crystallize` 将其全局推广 — **第二次出现时 MTTR 减少 94%**。

## 隐私与遥测

匿名 opt-in 安装 ping (每次 `npx great-cto init` 一次):

- 随机 UUID install_id, CLI 版本, 项目类型, Node 版本, OS。
- **无路径、代码、仓库名或 PII。**
- 存储在 `~/.great_cto/config.json`,这样同一安装不会被重复计数。
- 随时禁用: `--no-telemetry`, `GREATCTO_NO_TELEMETRY=1`, 或在配置中 `{ "telemetry": false }`。

驱动 [greatcto.systems](https://greatcto.systems) 上的实时计数器。

## MCP 集成

原生支持 [Model Context Protocol](https://modelcontextprotocol.io/) 服务器。可选 — 流程没有它们也能运行。

| MCP | 谁用 | 启用什么 |
|-----|------|---------|
| Grafana | `l3-support` | LogQL 通过 `query_loki`, `search_alerts`, `query_tempo`, `get_panel`。Pre-P0 告警检测 |
| LLM router | `l3-support`, `qa-engineer` | 将例行 triage 路由到 Kimi K2。日志聚类**节省 60–80% LLM 成本** |
| Beads | 所有代理 | Git 原生任务跟踪器。会话重启后保留依赖 + 阻塞 |
| 你自己的 | 任何代理 | 添加到 `.claude-plugin/plugin.json` → `mcpServers` |

来自 [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) 的专业子代理 (419 个代理 + 336 个命令) 可通过 `Agent` 工具调用。安装: `/template install <name>`。

## 完全自动的触发器

| 触发器 | 发生什么 |
|--------|---------|
| 会话开始 | 加载 PROJECT.md + lessons.md + decisions.md + verdicts |
| 门 approve/reject | 记录到 `~/.great_cto/decisions.md` (append-only ADR) + 通过 SSE 广播到实时看板 |
| `bd create / update / close` | 通过 dolt-DB watcher 检测,看板在 <1s 更新 |
| 上下文压缩 | 写入 HANDOFF.md → 下个会话从精确的流程状态恢复 |
| P0 或迭代 > 3 | 代理写入 KE 文件 → 运行 `/crystallize` 提升为全局模式 |
| 周一 9:00 | `/digest` — DORA 指标 + brain 更新 + 模式库统计 |
| 周日 23:00 | `/audit` — 依赖 + 密钥扫描 |
| 每次 Bash 调用 | 安全检查: 阻止 `rm -rf`, `git push --force`, `DROP TABLE` |

## 限制与非目标

- **不是高级工程师的替代** — 编码流程;没有他们就不做架构判断。
- **不是 IDE** — 在 Claude Code 内运行。如果你不用 Claude Code,这个不适合你。
- **不是 CI/CD 系统** — 门在本地 / 会话内运行。实际合并流程仍需要 GitHub Actions。
- **不是 secrets 管理器 / 可观测性平台** — 与它们集成,不托管数据。
- **不是确定性的** — LLM 生成的输出。每个门判定都应该 sanity check;`/inbox` 显示橡皮图章漂移。
- **未经认证审计** — PCI/HIPAA/SOC2 项目类型脚手架是起点,不是认证。

## FAQ

**没有互联网连接能用吗?**
代理本身作为 Claude Code 子代理在本地运行。只有 Claude API 调用到达 Anthropic。没有代码、遥测或内存发送到其他任何地方。

**我的源代码会被用于训练模型吗?**
不会。Claude API 对付费客户默认零保留。great_cto 不添加任何东西 — 你的代码仍是你的。

**如果我已经有 CI/CD 怎么办?**
great_cto 在 CI *之前*运行。在架构、审查和预合并阶段捕获问题。两者都用 — 它们互补,不竞争。

**支持 Cursor / Copilot / Aider 吗?**
目前仅 Claude Code。基于 `AGENTS.md` 的跨工具支持在 v2.x roadmap 中。

**如果钩子妨碍我,我能禁用它们吗?**
每个钩子都尊重 `GREAT_CTO_DISABLE_<NAME>=1` 环境变量 (例如 `GREAT_CTO_DISABLE_SECRET_SCAN=1`)。安全扫描可通过 `// agentshield:ignore` 按文件退出。

**如何保持 token 成本低?**
三层 — (1) 默认 Haiku 用于便宜代理, (2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) 用于 triage (节省 60–80%), (3) `cost-guard` 钩子在昂贵 prompt 前警告。`/cost` 查看实时支出。

**卸载时我的数据会怎样?**
插件状态在 `~/.great_cto/` (全局决定) 和 `.great_cto/` (按项目)。两者都是纯 markdown — `rm -rf` 清除一切。无外部服务需要取消授权。

**为什么不全自动? 为什么"每个特性两个决定"?**
LLM 强大但在模糊规范上失去产品判断。在 gate:plan 和 gate:ship 保留人类捕获那 5% 占 95% 成本的坏决定。见 [ADR-015 — 学习循环架构](../architecture/ADR-015-learning-loop-architecture.md)。

## 架构

```
┌──────────────────────────┐    ┌──────────────────┐
│   Claude Code 会话       │───→│  great_cto       │
│   (你在此运行 /start)    │    │  流程 +          │
└──────────────────────────┘    │  33 代理         │
              │                 └────────┬─────────┘
              ↓                          ↓
┌──────────────────────────┐    ┌──────────────────┐
│   .great_cto/            │    │  Beads (dolt)    │
│   PROJECT · lessons ·    │←──→│  task DB         │
│   decisions · verdicts   │    └──────────────────┘
└──────────────────────────┘
              │
              ↓
┌──────────────────────────┐
│   great-cto board        │
│   localhost:3141         │
│   (vanilla HTML, 0 deps) │
└──────────────────────────┘
```

## 作者

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder。构建 AI-native 交易和 fintech 平台 (0→1, 1→N) 的 CTO。专注于技术直接影响 PnL、风险和单位经济的高负载金融系统。

**为什么 great_cto 存在。** 同样的代码审查、同样的架构问题、同样的安全审计 — 跨多家公司,同样的循环。委托有帮助。流程有帮助。但瓶颈一直是高级工程师做出决定。Claude Code 推出后,我开始一次自动化一个代理。great_cto 是结果 — 该系统中的每条规则都是对真实生产系统中真实问题的响应。

## ⭐ 为该仓库点星

如果 great_cto 在某个项目上为你节省了时间,请为该仓库点星 — 这能帮助其他独立创始人和小团队找到它。

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 社区与支持

| 渠道 | 内容 |
|------|------|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | bug, 功能请求, 项目类型提议 |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | 提问, 分享模式, show & tell |
| 📝 [博客](https://velikiy.hashnode.dev) | 架构、学习循环、成本校准的深度解析 |
| 🐦 [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) | 发布说明, 文章, AI-CTO 系列 |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | 包注册表 |
| 🔒 [Security](../../SECURITY.md) | hook/scanner CVE 的负责任披露 |

## Roadmap

- **v2.2** — 课程质量遥测 (跟踪代理实际引用 vs 忽略哪些课程)
- **v2.3** — 自动提升: 高影响力决定 → 可重用 skill (`~/.great_cto/global-skills/`)
- **v3.0** — 跨工具支持 (`AGENTS.md` 用于 Cursor / Codex / OpenCode / Gemini)

[投票下一个功能 →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

## 贡献

欢迎 pull request — 见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。Good first issues 标有 [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue)。

特别需要:
- 新的项目类型脚手架 (通过 Discussions 提议)
- 翻译: `docs/<lang>/README.md` 用于非英语受众
- 真实案例研究 — 如果 great_cto 让你发布了什么,分享数字

## 许可证

MIT — 见 [LICENSE](../../LICENSE)。

---

<div align="center">

**由 [@avelikiy](https://github.com/avelikiy) · [@Greatcto](https://hashnode.com/@Greatcto) on Hashnode 构建**
*别再做唯一能发布版本的人了。*

</div>
