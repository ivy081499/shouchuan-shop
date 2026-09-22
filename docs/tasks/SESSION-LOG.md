# Session 交接筆記

**新的寫在最上面。** 每次收工追加一段，下一個 session 只需讀前 50 行。

格式：
```
## YYYY-MM-DD — 工作流 — 誰
**做了什麼**：
**沒做完**：
**下一個人要知道**：
```

---

## 2026-09-22 — 編輯手串頁版面重整 + 選料篩選 — worktree-product-name-photos

**做了什麼**
- 店主反映「版面有點亂、選料太簡陋」，重排 `RecipeEditor.tsx`：
  - 名稱／售價／狀態／照片收進同一張「基本資料」卡（原本散在三處）
  - 四格大數字改成一條「材料成本／毛利／目前可做」摘要列
  - 儲存與重設按鈕**固定在畫面底部**，不必捲回中間才能存
- 選料區補上庫存頁那套篩選：搜尋（含淘寶原文、款式、供應商）、分類多選、
  供應商多選、尺寸／成本／庫存區間、只看有庫存、只看低於安全庫存、只看已選、
  四種欄位排序。**篩選列預設收合**，按「篩選」才展開，避免把珠子列表擠出畫面。
- 已勾選的珠子不受篩選影響一律顯示（否則會以為配方被清掉），此行為有測試涵蓋。

**下一個人要知道**

1. **篩選是純前端的。** `listBeads` 一次把珠子全撈回來，再於 client 端過濾，
   與 `BeadsTable.tsx` 同樣做法。珠子種類到數千筆才需要改成後端查詢。

2. **`page.tsx` 多傳了四個欄位**給 RecipeEditor：`reorderPoint`、`supplierName`、
   `sourceTitle`、`sourceSpec`，篩選要用。`listBeads` 本來就有回傳，沒改 data 層。

3. 底部儲存列是 `fixed`，選料區用 `mb-24` 墊出空間，改版面時別把這個邊距拿掉，
   否則最後幾顆珠子會被按鈕列蓋住。

---

## 2026-09-22 — 手串名稱可編輯 + 商品照片上傳 — worktree-product-name-photos

**做了什麼**
- 手串詳情頁加「手串名稱」輸入欄，跟售價／狀態一起按「儲存」才生效，
  也納入 dirty 判斷與「重設」還原。`updateProductAction` 原本就收 name，未改 action 簽名。
- 加商品照片上傳：一次可選多張，本機寫 `public/uploads/products/`，線上寫 R2，
  機制照抄 `src/app/admin/beads/actions.ts`（`isLocalDev()` 分歧）。
- **命名規則**：`products/{商品id}-{序號}.{副檔名}`，序號自 1 起算，接在現有最大序號之後。
  同名檔案直接覆寫（店主指定行為）。
- 照片可逐張移除——**只刪資料庫紀錄，磁碟檔案留著**，與珠子圖一致，避免誤刪救不回。

**沒做完**
- 照片排序無法拖曳調整，目前固定照上傳序號。
- 移除照片後序號不回收，下次上傳仍從最大序號往後接（不會覆蓋到還在用的照片）。

**下一個人要知道**

1. **沒有改 schema。** `product_images` 表 Phase 0 就存在，`addProductImage`／`deleteProductImage`
   也早就寫好在 `src/data/products.ts`。該檔是凍結檔，**列出照片的查詢寫在 action 裡**
   （`listProductImagesAction`），不是加到 data 層——因為不能改凍結檔。

2. **本機圖片網址要補 `/uploads` 前綴。** 沒有 `.env`，`getPublicImageBase()` 回空字串，
   `imageUrl()` 會組出 `/products/2-1.png`，但檔案實際在 `public/uploads/products/`。
   詳情頁的 `toUrl()` 已處理這個分歧，之後若在別處顯示商品圖要留意同一件事。

3. **上傳後用 `window.location.reload()` 重載。** 因為新照片的 id 與網址要回頭查資料庫才拿得到。
   不算漂亮，但比自己維護一份樂觀更新狀態不容易出錯。

4. 測試用自建的 1x1 PNG 與 worktree 內複製的資料庫，**沒碰店主正式資料**，測完已清乾淨。

---

## 2026-09-11 — ⚠️ 範圍變更：前台改用 FreeStore — 主控 session

**做了什麼**
- 店主發現 FreeStore（freestore.com.tw）免費開店平台，查證後確認：
  0 元開店、免月費、**成交才收約 1%**、支援轉帳收款、**不強制串金流物流**。
- 決定採方案 C：**前台用 FreeStore 先開賣，後台自建**。寫入 ADR-0008。
- 取消 S1（設計系統／前台外殼）、S2（前台頁面）兩個工作流。
- 新增 S5-07：FreeStore 訂單匯入。
- 更新 CLAUDE.md、06-WORKSTREAMS、BOARD、decisions/README。
- GitHub repo 已建立：https://github.com/ivy081499/shouchuan-shop（private）

**下一個人要知道**

1. **不要再做前台。** 看到 `src/contracts/order.ts` 裡的 `cartSchema`、`CART_COOKIE_NAME`、
   `checkoutSchema` 不要以為要做購物車——那些是前台取消前寫的，**刻意保留不刪**，
   日後若要自建前台可直接用。schema 也不需要改。

2. **FreeStore 沒有公開 API。** 訂單要靠匯出檔匯入後台。
   **店主尚未確認 FreeStore 後台有沒有匯出 CSV 功能**——這決定 S5-07 怎麼做：
   - 有匯出 → 做解析器，流程同淘寶匯入
   - 沒有 → 改做手動建立訂單的介面

3. **既有程式全部保留可用。** schema 11 表、`src/lib/`、`src/data/`、大部分 contracts
   都不受影響。`orders` 表本來就能裝 FreeStore 的訂單，這是先凍結 schema 的好處。

4. `docs/05-DESIGN-SYSTEM.md` 保留但**用途改變**：只服務後台，走資訊密度優先。
   「配方透視」signature 元素隨前台一起擱置。

---

## 2026-09-11 — Phase 0 地基 — 主控 session

**做了什麼**
- 安裝 gh CLI 2.100.0。**未使用 Homebrew**（機器上沒有），改用官方 arm64 binary 放進 `~/.local/bin`（該目錄已存在且已在 PATH）。
- 建立專案骨架：Next.js 16.3.4 + React 19.3 + OpenNext 1.20.6 + Drizzle 0.45.2 + Tailwind 4.3.3。**所有版本鎖死不用 `^`**。
- 寫完並凍結 `db/schema.ts`（11 張表）。
- 寫完 `src/lib/` 三個核心模組，**測試 36 項全數通過**：
  - `money.ts` — 金額（整數分）、運費比例攤提
  - `bead-spec.ts` — 淘寶規格解析
  - `costing.ts` — 成本／毛利／可做數量／採購缺口

**沒做完**
- `src/contracts/**`、`src/data/**`、`src/ui/**` stub
- migration 0000 與種子資料
- Cloudflare 資源（D1 / R2 / Access）與首次部署
- GitHub repo：**卡在等店主跑 `gh auth login` 瀏覽器授權**

**下一個人要知道**

1. **TypeScript 故意鎖 5.9.3**，不是 npm 上的 latest 7.0.2。TS 7 是全新大版本，Next 與 Drizzle 的型別還沒對它驗證過。不要「順手升級」。

2. **npm 全域快取壞掉**（`~/.npm_local_cache` 有權限衝突的檔案）。安裝套件時要加 `--cache /Users/admin/.claude/jobs/<job>/tmp/npmcache`，否則 EEXIST/EACCES 失敗。不要去動店主的全域快取。

3. **解析器有三個等級，不是「能解析／不能解析」兩種**：
   - `parsed` 有把握、`estimated` 賣家自己說是約數（如「约60颗左右」）、`manual` 完全沒顆數資訊（如「24款」、線材按米計）。
   - 店主明確要求：**解析結果一律要他逐列確認才能寫入資料庫**。不要為了流暢度自動採用。

4. **成本已用真實資料對過**（匯率 4.5）：白水晶每顆 NT$2.01、蜜桃粉瑪瑙 NT$21.12、隔片含攤運費 NT$2.06。動到 `costing.ts` 後請重跑 `node --experimental-strip-types src/lib/costing.test.ts`。

5. **庫存是「付款確認才實扣」**，這是店主指定的，代價是可能超賣。處理方式是後台標紅警示，不是預扣。不要自作主張改掉。

6. 店主要求**整合兩個 subagent 產出後要跑兩輪稽核**（改一次、再稽核、再改一次就結束）。規則寫在 `docs/06-WORKSTREAMS.md`。
