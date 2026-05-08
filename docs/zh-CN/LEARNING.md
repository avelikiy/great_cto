# 持续学习 (Continuous Learning)

> **语言:** [English](../LEARNING.md) · [Русский](../ru/LEARNING.md) · **简体中文** · [繁體中文](../zh-TW/LEARNING.md) · [日本語](../ja/LEARNING.md) · [한국어](../ko/LEARNING.md) · [Español](../es/LEARNING.md) · [Português (BR)](../pt-BR/LEARNING.md)
>
> ⚠️ 此为机器翻译摘要。完整详情和 ADR 链接请参见 [English original](../LEARNING.md).

great_cto v1.2.0 添加了**双层学习循环**,自动从每个会话中提取模式并在未来会话中重用。

## 流水线

```
会话结束 → SessionEnd 钩子拍快照 + 注册项目
        → continuous-learner 代理读取 transcript + git + verdicts
        → 提取每会话 ≤3 个教训 → .great_cto/lessons.md (项目本地)
        → lessons-merge.mjs: 模式在 ≥3 个项目 → ~/.great_cto/decisions.md (跨项目)
        → 下个会话: architect, pm, senior-dev 在启动时读取两个文件
```

## 双层内存

| 文件 | 范围 | 提升标准 | 谁读取 |
|---|---|---|---|
| `.great_cto/lessons.md` | 项目本地 | continuous-learner 中的质量门 | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | 此机器上的所有项目 | 模式在 ≥3 个不同项目 | architect, pm, senior-dev |

## 捕获什么

5 种模式形态,每个都有严格的质量门:

| 形态 | 来源信号 | 例子 |
|---|---|---|
| **A. 审查员发现 X** | agent-verdicts 中的关键/高严重性发现 | "PCI-reviewer 在 3 个 fintech 项目中发现 webhook 签名缺失" |
| **B. 成本异常** | 代理调用比平均高 2x+ | "Architect 在 solo fintech 项目上贵 3x — 预分配 $8" |
| **C. 重复错误** | 同样 fix 在 ≥2 个 commit | "在 3 个组件中重构 `useEffect` cleanup" |
| **D. 发现缺失** | 架构假设在实现中被覆盖 | "假设 US-only;实际 EU-required" |
| **E. 工具/库决定** | 带可测量结果的 ADR | "为 mlops 选 Drizzle 而非 Prisma — 40% 包减少" |

continuous-learner **拒绝**不匹配这些形态的任何东西 — 沉默 > 噪音。

## 质量门

如果以下任何一个为真,候选教训被**拒绝**:
- 仅适用于一个项目的一个特定文件 (太窄)
- 捕获用户偏好,而非可转移的模式
- 重申明显的最佳实践
- 没有具体证据 (sha, file:line, 成本数字)
- 包含 PII、密钥或商业机密术语
- Pattern slug 已在 lessons.md (去重)
- 主观,没有可测量结果

## 隐私

**默认本地,选择性全局。** 学习器在你的机器上运行;lessons.md 和 decisions.md 永不离开你的硬盘。

学习器**不得**捕获 (通过 agent prompt 强制):
- API 密钥、token、密码、JWT
- 邮箱、电话、姓名
- 内部代号、商业机密术语
- 客户/用户 ID 或 `.env*` 数据
- 源代码内容 (仅 file:line 引用)

完整隐私规则见 **ADR-016**。

## 配置

```bash
# 完全禁用会话结束捕获
export GREAT_CTO_DISABLE_SESSION_LEARNING=1

# 手动触发
/learn              # 提取本会话教训
/learn cost         # 专注成本异常 (shape B)
/learn security     # 专注审查员发现 (shape A)
/learn architecture # 专注工具/库决定 (shape E)

# 检查状态
cat .great_cto/lessons.md
cat ~/.great_cto/decisions.md
ls ~/.great_cto/projects/

# 强制重新聚合
node scripts/lessons-merge.mjs
node scripts/lessons-merge.mjs --dry-run   # 预览
node scripts/lessons-merge.mjs --force      # 重新提升

# 重置
rm .great_cto/lessons.md
rm -rf ~/.great_cto/{decisions.md,projects/}
```

## 代理如何使用教训

3 个代理在会话开始时读取 lessons.md + decisions.md:
- **Architect** — 在任何架构决定前咨询过去的教训;按当前 archetype 过滤
- **PM** — 估算前对照成本异常教训校准 (shape B)
- **Senior-dev** — claim 任务前扫描已知反模式;在 commit 中引用

## Roadmap

- **v1.2.0** — continuous-learner + lessons-merge + agent integration
- **v1.3.0** — Telemetry: 跟踪代理实际引用 vs 忽略哪些教训
- **v1.4.0** — 自动提升: 高影响决定 → 可重用 skill

## 参考

- **ADR-015** — 学习循环架构
- **ADR-016** — 隐私保护
- **ADR-017** — skill 候选提升标准
- `agents/continuous-learner.md` — 代理本身
- `scripts/lessons-merge.mjs` — 跨项目提升脚本
- `commands/learn.md` — 手动触发

完整文档见 [English LEARNING.md](../LEARNING.md)。
