# ADR-0005 Schema 凍結與解凍程序

**狀態**：已採用
**日期**：2026-09-11

## 背景

多個 AI 工作流並行開發時，`db/schema.ts` 與共用型別是最容易衝突的檔案。更嚴重的是 migration：
兩個工作流各自產生 `0003_xxx.sql`，D1 以檔名雜湊追蹤已套用的遷移，撞號會**污染資料庫且難以復原**。

考慮過「把 schema 拆成多檔，每流一檔」，但這無法解決問題 —— Drizzle 的關聯是跨檔的
（`orderItems` 參照 `products`），加欄位仍會產生撞號的 migration，只是把衝突從 TypeScript 移到 SQL，更難解。

## 決策

`db/schema.ts`、`src/contracts/**`、`src/data/**`、`src/lib/**`、`package.json` 在 Phase 0 後**凍結**。

- 工作流可讀、可大量 import，但**不可寫**
- **只有主控 session 能執行 `drizzle-kit generate`**
- migration 檔**只增不改**；寫錯就加一個新的來修正

**解凍程序**：工作流在 `docs/tasks/BOARD.md` 的「SCHEMA 變更請求」登記 → 累積 2~3 筆後，
主控 session 開專門的 schema session 一次改完 → 各工作流 rebase。

## 後果

**好處**
- 結構上不可能發生 migration 撞號
- 強迫在寫功能前先想清楚資料模型（這本來就是正確的工程順序）

**代價**
- 工作流遇到真的缺欄位時會被卡住，必須等解凍窗口
- Phase 0 的 schema 設計壓力很大，要盡量想全

**為什麼要有解凍程序**：沒有出口的凍結規則，一旦真的擋路就會被違反。
明確的escape hatch 反而讓規則被遵守。
