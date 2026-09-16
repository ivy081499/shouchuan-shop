# 手串電商系統 — AI 工作入口

**每次 session 開始，先照「開工儀式」做完再動手。這是硬規則。**

---

## 這是什麼專案

手工串珠手串生意的**後台管理系統**，單人經營（店主：非工程背景，只讀繁體中文）。

> ⚠️ **範圍變更**：前台（購物車、下單）已改用 **FreeStore** 免費開店平台，
> 本系統**不做前台**。詳見 `docs/decisions/ADR-0008`。

- **本系統做什麼**：管理散珠成本、設定每條手串的配方（用哪些珠各幾顆）、
  匯入淘寶進貨與 FreeStore 訂單、產出採購需求與毛利報表。
- **FreeStore 做什麼**：商品展示、購物車、下單、收轉帳通知。
- **付款流程**：客戶在 FreeStore 轉帳 → 店主人工確認收款 → 出貨。

技術：Next.js 16（App Router）→ Cloudflare Workers（OpenNext）／D1／R2／Access。全部在免費額度內。

---

## 開工儀式（照順序做）

1. `git log --oneline -15` — 看最近發生什麼事
2. 讀 `docs/tasks/SESSION-LOG.md` **前 50 行**（最新的在最上面）
3. 讀 `docs/tasks/BOARD.md` — 找到或認領你的任務
4. 讀 `docs/06-WORKSTREAMS.md` — 確認你這個工作流**可以改哪些檔案**
5. 讀你任務相關的文件（下表）

## 收工儀式

1. 更新 `docs/tasks/BOARD.md`（`[~]` → `[x]`，附 commit SHA）
2. 在 `docs/tasks/SESSION-LOG.md` **最上面**追加一段交接筆記
3. `git add -A && git commit`

---

## 🚫 【硬規則】進貨一律隔離處理

**店主明確要求：每次進貨都要另開分支，資料庫也要分開，完全不能影響現行資料。**

```bash
git worktree add .claude/worktrees/<批次名> -b <批次名>
cd .claude/worktrees/<批次名> && npm install
mkdir -p .data && cp ../../../.data/local.sqlite .data/local.sqlite
```

現行資料庫 `~/Desktop/手串/.data/local.sqlite`，**進貨作業絕不可直接寫它**。
驗證無誤、店主確認後才合併。詳見 `docs/decisions/ADR-0011`。

**關稅**：一批貨清關一次收一筆，掛在 `shipments` 表，
用 `calcShipmentCosts()` 跨訂單攤提（不是 `calcPurchaseCosts()`）。

---

## 🚫 三條凍結規則（違反會毀掉整個專案）

### 1. Schema 凍結
`db/schema.ts` 與 `src/contracts/**` **不可修改**，只能讀。

需要改動時：**停手**，在 `docs/tasks/BOARD.md` 的「SCHEMA 變更請求」登記，然後告訴店主：
> 「我需要修改資料庫結構，請開一個 schema session。」

不要自己改，也不要繞道（例如把資料塞進 note 欄位）。

### 2. 不可產生 migration
禁止執行 `npm run db:generate` 或 `drizzle-kit generate`。
兩個工作流各自產生 `0003_xxx.sql` 會污染 D1，且難以復原。只有主控 session 能做。

### 3. 不可安裝套件
禁止 `npm install <套件>`。需要的話在 BOARD 的「套件需求」登記。
Phase 0 已一次裝妥且**鎖定確切版本**（不用 `^`），避免各分支版本漂移。

---

## 提交前自我檢查

```bash
git status --short
```
每一個改動過的檔案，都必須在 `docs/06-WORKSTREAMS.md` 你那一流的「可寫路徑」清單內。
有檔案在清單外 → `git checkout -- <路徑>` 還原，然後去 BOARD 登記需求。

---

## 文件索引

| 你要做什麼 | 先讀 |
|---|---|
| 任何事 | `docs/00-PRODUCT.md` 業務規則 |
| 命名、寫中文文案 | `docs/01-GLOSSARY.md` 術語對照 |
| 碰資料庫 | `docs/02-DATA-MODEL.md` 表結構與**不變量** |
| 部署、環境、免費額度 | `docs/03-ARCHITECTURE.md` |
| 寫程式 | `docs/04-CONVENTIONS.md` |
| 做畫面 | `docs/05-DESIGN-SYSTEM.md` **含禁用清單** |
| 確認我能改哪些檔 | `docs/06-WORKSTREAMS.md` |
| 跑指令、遷移、備份 | `docs/07-OPERATIONS.md` |
| 前台／FreeStore 相關 | `docs/08-FREESTORE.md` |
| 「這件事為什麼這樣決定？」 | `docs/decisions/` — **不要重新討論已定案的事** |

---

## 絕對不要做的事

- ❌ 自己實作成本公式 → 一律呼叫 `src/lib/costing.ts`
- ❌ 用浮點數存金額 → 一律整數「新台幣分」，用 `src/lib/money.ts`
- ❌ 讓淘寶規格解析結果**直接寫入資料庫** → 必須經店主逐列確認（見 00-PRODUCT）
- ❌ 拿店主的真實資料做破壞性測試 → 自建測試檔，測完清乾淨
- ❌ 未設 `paidAt` 就出貨或扣庫存
- ❌ 前台出現簡體字

---

## 給店主的操作說明

在 `OWNER-GUIDE.md`（非技術語言）。改動任何會影響店主日常操作的行為時，記得同步更新它。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
