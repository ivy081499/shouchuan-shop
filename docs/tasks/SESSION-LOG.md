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

## 2026-09-23 — 階段 A 稽核修正（**有資料損壞風險，已修**） — worktree-storefront-plan

獨立 subagent 稽核 commit `687a19c` 後修掉三個真問題。

**🔴 配方先寫、商品後驗證 → 驗證失敗時配方已被清空**
`save()` 原本先呼叫 `saveRecipeAction()` 再 `updateProductAction()`。
`saveRecipe()` 是**先刪後建、無法回滾**，所以 slug 重複或上架檢查擋下時，
配方已經落地但畫面顯示錯誤，店主以為沒存成功——已上架商品會變成成本 0。
→ 合併成 `saveProductAction()`，**全部驗證通過才開始寫**。
D1 沒有跨陳述句交易，這是能做到的最好保證。
**新增商品編輯功能時請用它，不要再拆成兩次呼叫。**

**🔴 `.partial()` 不會移除 `.refine()` 與 `.default()`**
實測 zod 4.6.2 確認：
- `productInputSchema.partial().safeParse({ priceCents: 0 })` → **失敗**（refine 仍在）
  導致售價空白時只回報售價，A-4 要求的「一次講完缺什麼」永遠跑不到。
- `.safeParse({})` → 回傳 `{ status:'draft', sortOrder:0 }`（default 仍在）
  只改名稱的部分更新會**無聲把商品打回草稿**。
→ 改用 actions 內自行宣告的 `productUpdateSchema`（不帶 default／refine）。
**不要改回 `productInputSchema.partial()`。**

**🔴 裸 catch 把所有寫入錯誤都說成「網址代稱重複」**
連線中斷、逾時都會被誤報，店主會去改一個沒重複的代稱。
→ `describeWriteError()` 只在 `UNIQUE constraint failed: products.slug` 時回那句，
其他情況回通用訊息並 `console.error` 留線索。

**🟡 已上架商品被刪光照片不受檢查**
→ `deleteProductImageAction` 刪掉最後一張時，若商品是 active 就**自動降回草稿**
並在畫面說明。不擋下刪除（店主可能正要換照片），但不讓無圖商品掛在前台。

**驗收**：售價空白 + 無照片 + 改上架 → 一次列出兩項缺失，且配方 6 筆完好未被清空。

---

## 2026-09-22 — 階段 A 完成：後台上架補完 — worktree-storefront-plan

**做了什麼**（對照 `docs/10-前台與上架計畫.md` 的 A-1～A-4）
- **A-1** 商品編輯器補上 `description`（商品故事，2000 字上限含字數顯示）、
  `wristSizeCm`、`manualStock`、`sortOrder` 四個欄位。
- **A-2** `slug` 可修改。格式即時驗證；重複時 D1 唯一索引會擋下並回
  「網址代稱重複了」；**已上架中改 slug 會跳紅字警告舊網址失效**。
- **A-3** 商品列表加「還缺什麼」欄：缺照片／配方／售價標紅，
  只差故事顯示「可上架（沒故事）」，齊全顯示「齊全」。
- **A-4** `updateProductAction` 加上架前檢查，缺東西擋下並說明缺什麼。

**下一個人要知道**

1. **`manual_stock` 留空要存 null，不是 0。** null = 依配方庫存動態算，
   0 = 手動限量 0 條（等於永遠售完）。畫面上留空時會顯示「目前可做 N 條」提示。
   `toNullableNumber()` 處理這件事，改動時不要簡化成 `Number(x) || 0`。

2. **上架檢查只在「改成 active」時跑**，草稿與下架不限制——
   東西還沒備齊本來就該能先存著。

3. **列表頁的照片數是另外查的**，沒有改凍結檔 `src/data/products.ts`。
   一次撈回全部 `product_images` 再在記憶體分組，避免 N+1。

4. 驗收過的完整流程：缺照片 → 上架被擋 → 補照片 → 上架成功，
   資料庫狀態確實從 draft 變 active。測試資料已全數還原。

---

## 2026-09-22 — ⚠️ 範圍變更：改為自建前台（**只有規劃，未動程式**） — worktree-storefront-plan

**做了什麼**
- 店主決定**自建前台**，並指出後台上架功能殘缺、無法完整管理商品。
- 寫 `ADR-0012`（取代 ADR-0008 的前台部分）與 `docs/10-前台與上架計畫.md`。
- 更新 CLAUDE.md 的範圍說明（原本寫「本系統不做前台」，會誤導後續 session）。
- 在 BOARD 登記 schema 變更請求與套件需求，**兩者都尚未核准、尚未執行**。

**沒做完**
- **一行程式都還沒寫。** 這次只產出規劃文件。

**下一個人要知道**

1. **店主定案的前台規則**（不要自己改）：
   快速下單**不強迫註冊** → 下單成功後才問要不要加入會員 →
   會員**一律 Google 登入、不自建密碼** → 下單成功**寄訂單確認信**。

2. **先做階段 A（後台上架補完），不要先做前台。**
   `products` 表有 11 個欄位，商品編輯器只能改 3 個——
   `description`／`wrist_size_cm`／`manual_stock`／`sort_order` 全都碰不到，
   `slug` 建立後也改不了。前台做出來也沒東西可顯示。

3. **購物車與結帳不需要改 schema。** ADR-0008 當初刻意保留了
   `cartSchema`、`CART_COOKIE_NAME`、`checkoutSchema`，現在都還在。
   只有階段 D（會員）需要新增 `customers` 表與 `orders.customer_id`。

4. **Cloudflare Workers 沒有 SMTP**，寄信只能用 HTTP API。
   MailChannels 2024 起對 Workers 收費、Email Routing 只能收不能發，
   目前評估用 Resend（免費 3,000 封／月）。已登記套件需求。

5. **FreeStore 不要關掉。** 店主要並行一陣子，自建站穩定後才收。

---

## 2026-09-23 — 階段 B 前台看商品 — worktree-storefront-plan

**做了什麼**
- 自建前台的頭三件：外殼、商品列表 `/`、商品詳情 `/p/[slug]`。
  全部放在 `src/app/(store)/`，與後台完全分開。
  **未改 schema、未裝套件、未動任何凍結檔。**
- **配方透視**（`_components/RecipeXray.tsx`）——設計文件指定的 signature 元素。
  每顆珠畫成一個圓點，直徑對應真實 mm，顏色取自 `beads.colorHex`，點一顆看它是什麼。
  資料是 `getProductDetail()` 回傳的 `recipe`，本來就備好了。

**沒做完**
- **B-4 圖片壓縮沒做**，因為要裝套件（違反凍結規則）。已登記 BOARD「📦 套件需求」，
  列了三個做法給店主選。店主 2026-09-23 指示「先做看得到的」。
  壓縮屬於**上傳端（後台）**不是前台顯示，所以不擋階段 C。

**下一個人要知道**

1. **草稿商品一定要擋。** `getProductDetail()` 不篩狀態（後台預覽也用它），
   所以 `/p/[slug]` 自己擋了 `status !== 'active'` → 404。
   **不要把這段拿掉**，否則有人猜到網址就看得到還沒準備好的商品。
2. **圓點大小不是等比例畫的。** 真實尺寸多半是 4～10mm，直接等比的話
   6mm 和 6.4mm 肉眼分不出來。改成以 6mm 為基準放大差距
   （`BASE_MM`／`PX_PER_MM_DIFF`），大小的相對關係仍然忠於實際尺寸。
3. **珠名裡常常已經寫了尺寸**（「月光石 6mm 藍月光」），圖例再印一次會變成
   「月光石 6mm 藍月光 6mm」。`sizeLabel()` 會偵測並略過，別又加回去。
4. **`colorHex` 目前整個資料庫都是空的**，圓點會全部退回底色 `--color-sunk`。
   配方透視的說服力靠顏色，值得找時間補。這是資料問題不是程式問題。
5. **grid 子項要記得 `min-w-0`。** CSS grid 的 item 預設 `min-width:auto`，
   裡頭的橫向捲動區收不了，反而把整頁撐寬。詳情頁 375px 一開始就是這樣破的。
6. `src/data/` 沒有讀 settings 的函式（是凍結檔），所以 `(store)/store.ts` 自己查。
   店名、標語、匯款資訊全部讀 `settings` 表，**沒有寫死**。
7. 階段 C 動手時，詳情頁底部「線上購買功能準備中」那句要換成加入購物車。
8. 驗證方式：自建 `TEST-` 商品 + 配方 + 假圖，測完全部清除（已清乾淨）。
   測試庫原本就只有 1 筆 draft 商品，沒有動到店主任何資料。

---

## 2026-09-22 — 棄用確認框 + 訂單當時用料查詢 — worktree-bead-retire

**做了什麼**
- 店主指正「棄用這種事怎麼可以不跟我確認」。補上確認視窗，
  **並列出這顆料還在哪幾條手串的配方裡**（用幾顆也寫出來），店主自己判斷要不要繼續。
  復原不問——那是把料救回來，不是破壞性動作。
  確認框自己畫，不用瀏覽器 `confirm()`：原生對話框會凍結分頁，也塞不下說明。
- 訂單頁的列改成可展開（`OrderRow.tsx`），點一下看到**下單當時**的：
  商品售價與成本快照、營收/成本/毛利、以及實際扣掉的每一顆料。

**下一個人要知道**

1. **「當時用了哪些料」不是現查配方算的，是讀 `stock_ledger`。**
   確認收款扣庫存時，每顆珠都留了 `reason='order_paid'` + `refId=訂單id` 的紀錄，
   那才是當天真正扣掉的料。**絕對不要改成即時展開配方重算**——
   配方之後會被改，重算會得到錯的歷史。
2. 商品層級的售價與成本同樣取自 `order_items` 的快照欄位（`unit_cost_cents`），不重算。
3. **配方本身的修改歷史仍然沒有。** `saveRecipe()` 是先刪後建，改了就查不到舊版。
   店主 2026-09-22 明確表示「有留客人下單當時的配方就好」，故不做 `recipe_history` 表。
   若日後要做，那是真正的 schema 變更（要產 migration），必須另開 schema session。
4. 驗證方式：建一筆 `TEST-` 開頭的訂單（含 stock_ledger 紀錄）跑畫面，測完即刪。
   測試庫原本就沒有任何訂單資料。

---

## 2026-09-22 — 棄用料管理（含一次凍結檔例外） — worktree-bead-retire

**做了什麼**
- 店主：「有些料太糟不想再出現在選料，但成本還是要列在報表，要有地方管理」。
- **沒有新增任何欄位**——`beads.is_archived` Phase 0 就存在，`archiveBead()` 也早就寫好，
  只是**畫面上沒有任何地方可以按**。這次主要是把管理介面補上。
- 庫存頁：最右邊加「棄用」欄（`RetireCell.tsx`），篩選列加「使用中／已棄用／全部」切換，
  棄用的列淡化顯示。上方統計卡（品項、總顆數、低於安全庫存）改為只算使用中的料。
- 選料頁：棄用的料不再出現；**但已寫進該配方的照樣顯示並標紅框「已棄用」**，
  否則配方會看起來被清空，店主也無從得知該換料。
- `archiveBead()` 改為回傳 `inUse`，棄用時若該料還在配方裡，畫面上提示「配方使用中」。
  **不自動從配方移除**——那會無聲改掉既有手串的成本。

**⚠️ 動了凍結檔 `src/data/reports.ts`（店主明確核准）**

`getInventoryReport()` 移除 `is_archived = false` 條件，改為納入棄用料。
- **理由**：棄用＝不再拿來做手串，但料還在手上、錢已經花了，庫存價值必須照列，
  否則總覽頁的「庫存總值」會憑空短少。
- 同時把 `isLow` 改成 `!isArchived && ...`——棄用的不再補貨，就不該觸發補貨提醒。
- **採購需求 `getPurchasingReport()` 維持排除**棄用料（都棄用了不該再叫貨）。
- **毛利報表不受影響**：它是從訂單回推配方成本，本來就沒有排除封存料。
- 已在 BOARD「SCHEMA 變更請求」與該檔檔頭留下例外紀錄。
- **未改 `db/schema.ts`、未改 `src/contracts/**`、未產生 migration。**

**下一個人要知道**

1. **「棄用」與「封存」是同一件事的兩種說法。** 資料庫欄位叫 `is_archived`、
   舊程式碼註解寫「封存」，但**畫面上一律講「棄用」**（店主的用語）。改文案時不要混用。

2. 庫存頁與商品頁都改成 `listBeads(db, { includeArchived: true })` 撈全部，
   再於前端依情境過濾。**不要改回預設值**，否則庫存頁看不到棄用的料、
   商品頁的既有配方會缺料。

3. 驗證過的數字：棄用一顆庫存值 $6.90 的料之後，總覽「庫存總值」維持 $3,374 不變，
   但品項數從 51 → 50。這就是店主要的行為。

---

## 2026-09-22 — 選料改快選按鈕 + 大小圖切換 — worktree-product-name-photos

**做了什麼**
- 店主：「不想大部分都自己打字，要有快選」。把常用條件全部改成**點一下的按鈕**並攤開顯示：
  已選／有庫存／快沒了｜四個分類｜三段尺寸。要自己填數字的（成本、庫存、尺寸自訂區間、
  供應商）收進「更多條件」。
- 加縮圖「小／大」切換（36px／120px），選擇記在 localStorage。
  大圖用 `object-contain` 整張顯示不裁切——目的是看清楚料；小圖維持 `object-cover` 比較整齊。

**下一個人要知道**

1. **尺寸快選的級距是照實際庫存訂的**（`SIZE_PRESETS`：4mm 以下／5–7mm／8mm 以上）。
   目前最大只有 8.3mm，所以沒有「10mm 以上」。之後進了更大顆的珠子要回來調這個常數。

2. **縮圖大小沒有沿用庫存頁的 `--bead-img`。** 那是定義在 `globals.css` 的全域 CSS 變數，
   庫存頁 `BeadsTable` 會直接改它；若選料頁也用同一個，兩頁會互相蓋掉對方的設定。
   選料頁改用自己的 state + `recipe.imageSize` 這個 localStorage key。

3. 快選鈕與「更多條件」裡的欄位**共用同一份 state**，所以點「5–7mm」後展開細項，
   會看到尺寸欄already填好 5 與 7；手動改數字則快選鈕的反白會自動消失（`sameRange` 判斷）。

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
