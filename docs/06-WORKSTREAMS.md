# 工作流與檔案擁有權

**核心原則：讓衝突在結構上不可能發生，而不是靠約束力去禁止。**
兩個工作流永遠不會寫到同一個檔案，所以不需要鎖、不需要協調。

---

## 執行規則（店主指定）

1. **Phase 0 由主控 session 一人完成**，不開任何 subagent。地基必須一致。
2. **Phase 2 最多同時 2 個 subagent**，且兩者可寫路徑完全不重疊。
3. **subagent 不得自行合併**，一律由主控 session 整合。
4. **整合後必須跑兩輪稽核**（見下方）。

### 🔍 稽核循環（店主指定，不可省略）

每次整合兩個 subagent 的產出後：

```
整合 → 稽核 subagent #1 → 依報告修正 → 稽核 subagent #2 → 依報告修正 → 結束
                                                                  ↑
                                                        第二次修正後不再稽核
```

稽核 subagent 的職責：
- 檢查是否違反凍結規則（動到 schema / contracts / 產生 migration / 裝套件）
- 檢查是否自行實作成本公式而沒呼叫 `src/lib/costing.ts`
- 檢查金額是否誤用浮點數
- 檢查是否有跨越可寫路徑界線
- 檢查兩個工作流之間的假設是否一致（整合漂移）
- 檢查繁中文案是否混入簡體字

---

## 共用資產（所有工作流唯讀）

| 路徑 | 內容 | 狀態 |
|---|---|---|
| `db/schema.ts` | 資料表定義 | 🔒 凍結 |
| `db/migrations/**` | 遷移檔 | 🔒 只有主控可產生 |
| `src/contracts/**` | zod 驗證與型別 | 🔒 凍結 |
| `src/data/**` | 資料存取層 | 🔒 凍結 |
| `src/lib/**` | 金額、成本、解析工具 | 🔒 凍結 |
| `src/ui/**` | 共用元件 | S1 可寫，其他唯讀 |
| `package.json` | 相依套件 | 🔒 凍結 |

**唯讀 ≠ 不能用。** 你應該大量 import 這些東西，只是不能改。

---

## 工作流清單

### S1 — 設計系統與前台外殼
**可寫路徑**
```
src/ui/**
src/styles/**
src/app/(store)/layout.tsx
docs/05-DESIGN-SYSTEM.md
public/**            （非商品圖的靜態資源）
```
**產出**：設計 token、字體、Button/Input/Card/Table/Dialog 等基礎元件、前台頁首頁尾。

---

### S2 — 前台頁面
**可寫路徑**
```
src/app/(store)/**    （layout.tsx 除外，那是 S1 的）
src/app/api/store/**
```
**產出**：商品列表、商品詳情（含「配方透視」）、購物車、結帳表單、轉帳資訊頁、訂單查詢。

---

### S3 — 後台：珠子與配方
**可寫路徑**
```
src/app/admin/beads/**
src/app/admin/recipes/**
src/app/admin/_shell/**      （後台外殼，S3 擁有）
src/app/admin/layout.tsx
src/app/api/admin/beads/**
src/app/api/admin/recipes/**
```
**產出**：珠子 CRUD、配方編輯器（勾選珠子＋設定用量）、即時成本試算、庫存與低庫存示警。

---

### S4 — 後台：訂單與出貨
**可寫路徑**
```
src/app/admin/orders/**
src/app/api/admin/orders/**
src/lib/order-status.ts      （狀態機守衛，S4 擁有）
```
**產出**：訂單列表／詳情、確認收款、出貨填單號、超賣紅字警示、取消訂單。

---

### S5 — 報表與匯入
**可寫路徑**
```
src/app/admin/reports/**
src/app/admin/import/**
src/app/api/admin/reports/**
src/app/api/admin/import/**
src/lib/xlsx-import.ts       （S5 擁有）
src/lib/r2.ts                （S5 擁有）
```
**產出**：xlsx 匯入（含逐列確認流程）、採購需求表（依店鋪分組）、毛利表、庫存表、R2 圖片上傳。

---

## 排程

| 順序 | 同時執行 | 理由 |
|---|---|---|
| 1 | S3 ＋ S5 | 後台核心，店主最需要；兩者路徑零重疊 |
| ↓ | 整合 → 稽核×2 | |
| 2 | S2 ＋ S4 | 前台與訂單；S2 需等 S1 設計方向定案 |
| ↓ | 整合 → 稽核×2 | |

S1 由主控 session 在 Phase 1 先做，因為它決定整體視覺方向。

---

## 為什麼不需要互改檔案

Phase 0 已經**預先登記**所有跨工作流的接點，所以 S4 新增訂單頁時，S3 不需要去改導覽列：

| 預先登記的東西 | 位置 |
|---|---|
| 後台導覽列所有項目 | `src/app/admin/_shell/nav.ts` |
| 訂單狀態列舉 | `db/schema.ts` 的 `orders.status` |
| 報表類型列舉 | `src/contracts/report.ts` |
| 共用元件的 props 簽名 | `src/ui/**`（S1 只填樣式，不改簽名） |

如果你發現需要改別人的檔案 → **停手**，去 `docs/tasks/BOARD.md` 登記，不要自己動手。
