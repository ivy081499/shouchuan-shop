# 任務看板

**狀態**：`[ ]` 未開始　`[~]` 進行中　`[x]` 完成

**認領規則**
1. 把 `[ ]` 改成 `[~]`，加上 `@你是誰 claimed:日期`
2. **立刻單獨 commit 這一行改動**（讓其他 session 看得到）
3. 完成後改 `[x]`，加 `done:日期 commit:SHA`
4. 做不完就改回 `[ ]`，加 `note:` 說明做到哪
5. **`[~]` 超過 3 天沒動靜，任何人都可以接手**

---

## Phase 0 — 地基（主控 session，不開 subagent）

- [x] P0-01 安裝 gh CLI（官方 binary → ~/.local/bin，未用 Homebrew）  done:2026-09-11
- [x] P0-02 建立 GitHub private repo → https://github.com/ivy081499/shouchuan-shop  done:2026-09-11
- [x] P0-03 專案骨架：Next.js 16 + OpenNext + Drizzle + Tailwind，套件鎖定確切版本  done:2026-09-11 commit:10a198a
- [x] P0-04 `db/schema.ts` 11 張表  done:2026-09-11 commit:10a198a
- [x] P0-05 `src/lib/money.ts` 金額工具（19 項測試通過）  done:2026-09-11 commit:10a198a
- [x] P0-06 `src/lib/bead-spec.ts` 淘寶規格解析（19 項測試通過）  done:2026-09-11 commit:10a198a
- [x] P0-07 `src/lib/costing.ts` 成本計算（17 項測試通過）  done:2026-09-11 commit:10a198a
- [x] P0-08 `src/contracts/**` zod 驗證與型別  done:2026-09-11 commit:1625adc
- [x] P0-09 `src/data/**` 資料存取層  done:2026-09-11 commit:f724971
- [ ] P0-10 `src/ui/**` 元件 stub（最終 props 簽名）
- [x] P0-11 migration 0000 + 種子資料（11 表建立成功、唯一索引驗證通過）  done:2026-09-11
- [ ] P0-12 `src/app/admin/_shell/nav.ts` 預先登記所有後台導覽項目
- [ ] P0-13 建立 D1 / R2 / Cloudflare Access
- [ ] P0-14 空機部署一次，驗證 OpenNext 管線通
- [ ] P0-15 `OWNER-GUIDE.md` 店主操作手冊

---

## Phase 1 — 後台基礎元件（主控 session）

- [ ] P1-01 設計 token（後台用，資訊密度優先）
- [ ] P1-02 基礎元件：表格、表單、按鈕、對話框、警示
      （原「商品頁視覺稿」已隨前台取消而移除，見 ADR-0008）
- [ ] **P1-03 後台設定頁（店主改不了店名與匯款帳號，前台上線前必須補）**
      2026-09-23 階段 B 稽核發現：**後台完全沒有寫入 `settings` 的介面。**
      目前只有 `/admin/inventory` 讀一個匯率 key，其餘全靠改 `seed.sql` 或直接下 SQL。
      店主是非工程背景，等於**店名、匯款帳號、聯絡方式全部改不了**。

      前台頁尾要顯示匯款資訊與聯絡方式，資料都讀 `settings`（沒有寫死），
      所以這個缺口會直接顯示在客人眼前：匯款欄位空著，客人不知道錢匯去哪。

      要做的事：
      1. 新增 `/admin/settings` 頁，可編輯既有的 key（`label` 欄位已經有給店主看的說明）
      2. **`settings` 表需要三個新 key**（key-value 表新增 key **不需要改 schema**）：
         `contact_email`、`contact_line`、`contact_instagram`
         前台 `(store)/layout.tsx` 已經寫好對應的顯示，三個都沒填就整區不顯示。
      3. 導覽項要加「設定」——但 `src/app/admin/_shell/nav.ts` 是**凍結檔**，
         需由主控 session 修改。

      ⚠️ 不屬於 S6（前台）的可寫路徑，前台工作流不能自己做。

---

## Phase 2A — S3 ＋ S5 並行（兩個 subagent）

### S3 後台：珠子與配方
- [ ] S3-01 後台外殼與導覽（`_shell`）
- [ ] S3-02 珠子列表（篩選、低庫存示警）
- [ ] S3-03 珠子新增／編輯
- [ ] S3-04 配方編輯器（勾選珠子＋設定用量＋即時成本試算）
- [ ] S3-05 商品新增／編輯／上下架
- [ ] S3-06 **配方編輯器選珠體驗**（店主 2026-09-14 明確要求，見下方「選珠需求」）
      - 搜尋框：依名稱／尺寸即時過濾
      - 分類分組可用：匯入時要填 `beads.category`，否則全擠「未分類」
      - **庫存 0 必須可選**：上架前備料是常態，不得因缺貨禁止勾選
      - 顯示珠子縮圖：需新增 `beads.image_url` 欄（schema 變更，要 migration）

### S5 報表與匯入
- [ ] S5-01 xlsx 上傳與解析
- [ ] S5-02 **逐列確認介面**（顆數、信心等級、單顆成本）— 不可略過
- [ ] S5-03 確認後寫入：建珠子、加庫存、回寫成本、寫 stock_ledger
- [ ] S5-04 採購需求表（依店鋪分組、附淘寶連結）
- [ ] S5-05 毛利表
- [ ] S5-06 R2 商品圖上傳
- [ ] S5-07 **FreeStore 訂單匯入**（待店主確認匯出格式；流程同淘寶匯入：
      上傳→解析→逐列確認→寫入。若 FreeStore 無匯出功能，改為手動建單介面）

**→ 整合 → 稽核#1 → 修正 → 稽核#2 → 修正 → 結束**

---

## Phase 2B — S4（單獨執行）

### ~~S2 前台~~ — 已取消（改用 FreeStore，見 ADR-0008）

### S4 後台：訂單
- [ ] S4-01 訂單列表（**超賣紅字警示**）
- [ ] S4-02 訂單詳情
- [ ] S4-03 確認收款 → 扣庫存（冪等）
- [ ] S4-04 出貨填物流單號
- [ ] S4-05 取消訂單 → 庫存加回
- [ ] S4-06 後台首頁儀表板

**→ 整合 → 稽核#1 → 修正 → 稽核#2 → 修正 → 結束**

---

## Phase 3 — 整合驗收

- [ ] P3-01 端對端測試：下單 → 轉帳 → 確認 → 扣庫存 → 出貨 → 報表反映
- [ ] P3-02 Cloudflare Access 驗證（無痕視窗開 /admin 應被擋）
- [ ] P3-03 手機版檢查
- [ ] P3-04 正式部署

---

## Phase 4 — 交付

- [ ] P4-01 匯入店主真實 `订单数据.xlsx`（超過 5 筆先列給店主看過）
- [ ] P4-02 D1 備份指令設定
- [ ] P4-03 店主驗收

---

## 🔧 SCHEMA 變更請求

- [x] **採購需求與低庫存要標示「已下單未到貨」** — 凍結檔例外變更
  店主 2026-10-26 核准（「C 接著處理」）。稽核漏洞 C：
  改成「貨到才入庫」之後，在路上的貨庫存是 0，
  採購需求會叫店主把已經下單的東西再買一次。

  **未改 `db/schema.ts`、未產生 migration、未裝套件。**
  改的是 `src/contracts/report.ts`（加顯示用欄位）與
  `src/data/reports.ts`（計算在途數量）。

  在途數量**不計入庫存**——計入的話缺料警示會消失。
  只在畫面上標示出來，讓店主自己判斷要不要補單。


- [x] **導覽列新增「進貨批次」** — 凍結檔 `_shell/nav.ts` 例外變更
  店主 2026-10-26 當面要求「進貨批次獨立成一個頁面」。
  **未改 schema、未改 contracts、未產生 migration**，只在 NAV 陣列加一項。
  收貨確認從 `/admin/inventory` 搬到 `/admin/shipments`。


> 需要改 `db/schema.ts` 或 `src/contracts/**` 的，寫在這裡，不要自己改。

- [x] **新增 `shipments` 表 + `purchases.shipment_id`** — 關稅需求
  店主 2026-09-16 口頭核准，於 `feature/customs-duty` 分支執行。
  一批貨（多張淘寶訂單合併清關）收一次關稅，需要一個群組層級掛關稅金額。
  `purchase_items` 增 `duty_share_twd_cents` 記錄各列攤得的關稅。

- [x] **庫存報表納入已棄用的珠子** — 棄用料需求
  店主 2026-09-22 明確核准（「把 schema session 這件事一起處理好」），
  於 `worktree-bead-retire` 分支執行。
  **未改 `db/schema.ts`、未改 `src/contracts/**`、未產生 migration**——
  `beads.is_archived` 欄位 Phase 0 就存在，本次只改凍結檔 `src/data/reports.ts`
  中 `getInventoryReport()` 的一行查詢條件（移除 `is_archived = false`）。
  理由：棄用代表「不再拿來做手串」，但料還在手上、錢已經花了，
  庫存價值必須照列，否則總覽頁的庫存總值會短少。
  採購需求 `getPurchasingReport()` **維持排除**棄用料（都棄用了不該再叫貨）。
  毛利報表本來就沒排除（從訂單回推配方成本），不受影響。

- [ ] **新增 `customers` 表 + `orders.customer_id`** — 自建前台的會員功能
  **尚未核准，動手前要先問店主。** 見 `docs/decisions/ADR-0012`。

  ```
  customers
    id, google_sub（Google 使用者唯一 id，唯一索引）, email,
    name, picture_url, created_at, updated_at

  orders 增 customer_id（可為 null，null = 訪客下單）
  ```

  會員一律用 Google 登入、**不自建密碼**，所以不需要密碼相關欄位。
  `customer_id` 必須允許 null——訪客不註冊也能下單，這是店主定的規則。

  ⚠️ 這是**真正的 schema 變更，會產生 migration**，與上一筆（只改查詢條件）不同。
  必須另開 schema session，且確認沒有其他工作流同時進行，避免污染 D1。

  **只有前台階段 D 需要**。階段 A／B／C 都不依賴它，可以先做完再回來處理。

- [x] **新增 `purchase_lists` + `purchase_list_items` 表** — 店主主動挑貨的採購清單
  **店主 2026-10-26 指示直接做完，已執行。** migration `0005_light_titania.sql`。
  完整規格與實作落差見 `docs/14-採購清單功能.md`。

  ```
  purchase_lists
    id, name, note,
    status（draft / ordered / closed，預設 draft）,
    created_at, updated_at

  purchase_list_items
    id, list_id → purchase_lists.id ON DELETE CASCADE,
    bead_id → beads.id,
    qty（預設 0）,
    source（manual / shortage，預設 manual）,
    note, created_at, updated_at
    UNIQUE (list_id, bead_id)
  ```

  **需求背景**：現有採購需求表是訂單驅動的，零客戶階段永遠空白。
  店主的真實需求是主動挑貨——2026-10-26 盤點顯示貴珠分散在 17 種、
  其中 10 種僅 3–5 顆，擺攤目標 30 條但只能做約 19 條，需要挑出補深的品項。

  **為什麼非改 schema 不可**：勾選狀態與數量必須跨 session 留存
  （店主明確要求存檔）。`beads` 表無可用欄位，且 CLAUDE.md 禁止
  把資料塞進 note 欄位繞道。

  **執行紀錄**：migration 0005 只有 CREATE TABLE，未 ALTER 或 DROP 任何既有表。
  套用前已備份 `.data/local.sqlite`，套用後驗證 72 種珠子資料完好。
  合併前先把 `receive-then-stock`（含 0003、0004）併入，避免 migration 撞號。

  **不影響既有功能**：`src/data/reports.ts`（凍結檔）不修改，
  新功能走新檔 `src/data/purchase-lists.ts`，
  畫面在 `src/app/admin/reports/purchase-list/**`（S5 可寫路徑）。

---

## ⚠️ 已知問題（不是這次改的，但要記著）

- [ ] **商品設成「已售完」會從前台整個消失** — 2026-09-24 稽核發現
  `listStoreProducts()` 與詳情頁都只認 `status = 'active'`，
  後台把商品改成 `sold_out` 之後，前台列表看不到、詳情頁直接 404。
  客人點舊連結會看到「找不到」，而不是「這條賣完了」。
  **這是階段 B 原本就有的行為，不是後來改出來的。**
  店主已指示前台不顯示庫存資訊，所以要不要讓售完商品留在前台、
  以及留下來要顯示什麼，**需要店主決定**，不要自己假設。

---

## 📦 套件需求

> 需要 `npm install` 新套件的，寫在這裡，不要自己裝。

- [ ] **寄信服務 SDK（Resend 或同類）** — 自建前台階段 C
  訂單確認信。**Cloudflare Workers 沒有 SMTP**，只能用 HTTP API 寄信。
  MailChannels 2024 起對 Workers 收費，Email Routing 只能收不能發。
  Resend 免費 3,000 封／月，足夠。需先申請帳號並驗證寄件網域。
  見 `docs/decisions/ADR-0012`、`docs/10-前台與上架計畫.md`。

- [ ] **Google OAuth id_token 驗證套件** — 自建前台階段 D
  會員登入一律走 Google，不自建密碼。需要驗證 Google 回傳的 id_token 簽章。
  手刻容易出錯，建議用現成套件。階段 D 才需要，C 之前不必裝。

- [x] **圖片壓縮** — 自建前台階段 B-4 ✅ **2026-09-24 完成，最後沒有裝套件**
  採用下表「瀏覽器端 Canvas 壓縮」那條：`src/app/admin/products/[id]/compressImage.ts`。
  實測 3000×2000 / 4.33MB → 1600×1067 / 70KB webp。commit 9c4f430。
  sharp 這條已排除：Workers 不支援原生二進位模組。

  <details><summary>當時的評估（留存）</summary>
  `docs/10-前台與上架計畫.md` 的 B-4 要求「上傳時壓為 webp、長邊上限 1600px」，
  現行上傳（`src/app/admin/products/actions.ts`）原樣寫檔，沒有壓縮。
  單張上限 5MB，店主若放手機原圖，列表頁一次載十幾張會吃掉 Workers 免費額度。

  **階段 B 的其餘部分（B-1～B-3）不依賴它，已先完成。**
  店主 2026-09-23 選擇「先做看得到的，壓縮另外登記」。三個做法：

  | 做法 | 要裝套件 | 備註 |
  |---|---|---|
  | sharp 等影像套件 | 是 | 品質最好；但 Workers 執行環境未必支援原生模組，要先驗證 |
  | 瀏覽器端 Canvas 壓縮 | 否 | 上傳前在店主瀏覽器壓好再送出，要改後台上傳程式 |
  | Cloudflare Images | 否（付費服務） | 超出零成本原則 |

  **壓縮屬於上傳端（後台），不是前台顯示**，所以不擋階段 C。
  </details>


---

## 選珠需求（店主 2026-09-14 交代，不要再問一次）

配方編輯器 `/admin/products/[id]` 的珠子清單，店主明確要求四件事：

| # | 需求 | 現況 | 備註 |
|---|---|---|---|
| 1 | **搜尋框** | 無 | 51 種珠子平鋪，找不到要的 |
| 2 | **分類分組要真的能用** | 欄位有、資料空 | 匯入時沒填 `category`，全落在「未分類」 |
| 3 | **庫存 0 要能勾選** | 已可勾選 | 店主原話：「我只是上架當然要能選」。不得加任何禁用邏輯 |
| 4 | **顯示珠子圖片** | 欄位不存在 | `beads` 表無圖片欄；`product_images` 是手串成品用的，不是珠子 |

### 圖片來源

淘寶匯出的 xlsx **沒有商品圖網址**，只有商品連結（`rawUrl`）。
圖片需從淘寶商品頁取得，存入新增的 `beads.image_url`。

### 分類的填法

`beads.category` 建議值（依這批 51 種珠子歸納）：
`水晶`（白水晶、草莓晶、紫兔毛、月光石、海藍寶、黃塔晶）、
`玉石`（和田玉、瑪瑙、玉髓、曜石）、
`配件`（沙金、銀珠、包金隔片）、
`線材`（彈力線、扁絲等整捲按長度計價的；桃花線圈歸配件）。
