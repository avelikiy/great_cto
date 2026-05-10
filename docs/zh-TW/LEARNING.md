# 持續學習 (Continuous Learning)

> **語言:** [English](../LEARNING.md) · [Русский](../ru/LEARNING.md) · [简体中文](../zh-CN/LEARNING.md) · **繁體中文** · [日本語](../ja/LEARNING.md) · [한국어](../ko/LEARNING.md) · [Español](../es/LEARNING.md) · [Português (BR)](../pt-BR/LEARNING.md)
>
> ⚠️ 此為機器翻譯摘要。完整詳情和 ADR 連結請參見 [English original](../LEARNING.md).

great_cto v1.2.0 新增了**雙層學習迴圈**,自動從每個會話中提取模式並在未來會話中重用。

## 流水線

```
會話結束 → SessionEnd 鉤子拍快照 + 註冊專案
        → continuous-learner 代理讀取 transcript + git + verdicts
        → 提取每會話 ≤3 個課題 → .great_cto/lessons.md (專案本地)
        → lessons-merge.mjs: 模式在 ≥3 個專案 → ~/.great_cto/decisions.md (跨專案)
        → 下個會話: architect, pm, senior-dev 在啟動時讀取兩個檔案
```

## 雙層記憶體

| 檔案 | 範圍 | 提升標準 | 誰讀取 |
|---|---|---|---|
| `.great_cto/lessons.md` | 專案本地 | continuous-learner 中的品質閘門 | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | 此機器上的所有專案 | 模式在 ≥3 個不同專案 | architect, pm, senior-dev |

## 擷取什麼

5 種模式形態,每個都有嚴格的品質閘門:

| 形態 | 來源訊號 | 例子 |
|---|---|---|
| **A. 審查員發現 X** | agent-verdicts 中的關鍵/高嚴重性發現 | "PCI-reviewer 在 3 個 fintech 專案中發現 webhook 簽章遺漏" |
| **B. 成本異常** | 代理呼叫比平均高 2x+ | "Architect 在 solo fintech 專案上貴 3x — 預分配 $8" |
| **C. 重複錯誤** | 同樣 fix 在 ≥2 個 commit | "在 3 個元件中重構 `useEffect` cleanup" |
| **D. 發現缺失** | 架構假設在實作中被覆寫 | "假設 US-only;實際 EU-required" |
| **E. 工具/函式庫決定** | 帶可測量結果的 ADR | "為 mlops 選 Drizzle 而非 Prisma — 40% 套件減少" |

continuous-learner **拒絕**不匹配這些形態的任何東西 — 沉默 > 雜訊。

## 品質閘門

如果以下任何一個為真,候選課題被**拒絕**:
- 僅適用於一個專案的一個特定檔案 (太窄)
- 擷取使用者偏好,而非可轉移的模式
- 重申明顯的最佳實踐
- 沒有具體證據 (sha, file:line, 成本數字)
- 包含 PII、金鑰或商業機密術語
- Pattern slug 已在 lessons.md (去重)
- 主觀,沒有可測量結果

## 隱私

**預設本地,選擇性全域。** 學習器在你的機器上執行;lessons.md 和 decisions.md 永不離開你的硬碟。

學習器**不得**擷取 (透過 agent prompt 強制):
- API 金鑰、token、密碼、JWT
- 電子郵件、電話、姓名
- 內部代號、商業機密術語
- 客戶/使用者 ID 或 `.env*` 資料
- 原始碼內容 (僅 file:line 引用)

完整隱私規則見 **ADR-016**。

## 設定

```bash
# 完全停用會話結束擷取
export GREAT_CTO_DISABLE_SESSION_LEARNING=1

# 手動觸發
/learn              # 提取本會話課題
/learn cost         # 專注成本異常 (shape B)
/learn security     # 專注審查員發現 (shape A)
/learn architecture # 專注工具/函式庫決定 (shape E)

# 檢查狀態
cat .great_cto/lessons.md
cat ~/.great_cto/decisions.md
ls ~/.great_cto/projects/

# 強制重新聚合
node scripts/lessons-merge.mjs
node scripts/lessons-merge.mjs --dry-run   # 預覽
node scripts/lessons-merge.mjs --force      # 重新提升

# 重設
rm .great_cto/lessons.md
rm -rf ~/.great_cto/{decisions.md,projects/}
```

## 代理如何使用課題

3 個代理在會話開始時讀取 lessons.md + decisions.md:
- **Architect** — 在任何架構決定前諮詢過去的課題;按目前 archetype 過濾
- **PM** — 估算前對照成本異常課題校準 (shape B)
- **Senior-dev** — claim 任務前掃描已知反模式;在 commit 中引用

## Roadmap

- **v1.2.0** — continuous-learner + lessons-merge + agent integration
- **v1.3.0** — Telemetry: 追蹤代理實際引用 vs 忽略哪些課題
- **v1.4.0** — 自動提升: 高影響決定 → 可重用 skill

## 參考

- **ADR-015** — 學習迴圈架構
- **ADR-016** — 隱私保護
- **ADR-017** — skill 候選提升標準
- `agents/continuous-learner.md` — 代理本身
- `scripts/lessons-merge.mjs` — 跨專案提升指令碼
- `commands/learn.md` — 手動觸發

完整文件見 [English LEARNING.md](../LEARNING.md)。
