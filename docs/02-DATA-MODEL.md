# 資料模型與不變量

Schema 實體在 `db/schema.ts`（**凍結**）。這份文件說明「為什麼這樣設計」與**必須遵守的不變量**。

> 不變量比 schema 本身更能防止整合漂移。兩個工作流都能通過編譯，卻對「成本按顆算還是按克算」有不同假設 —— 這種錯誤只有靠明文不變量能擋下。

---

## 鐵律

| 規則 | 說明 |
|---|---|
| 💰 **金額一律整數「新台幣分」** | `NT$1,280.50` → `128050`。禁止浮點數存錢。用 `src/lib/money.ts` |
| 🔢 **珠子數量一律整數「顆」** | 不存在半顆珠 |
| 💱 **匯率存放大 100 倍的整數** | `4.5` → `450`，且**凍結於該筆進貨**，不追溯 |
| 📸 **訂單存快照** | 商品改名改價不影響歷史訂單 |
| 🧮 **成本只能由 `src/lib/costing.ts` 算** | 禁止各處自行實作公式 |

---

## 表關係

```
suppliers ──< beads ──< recipes >── products ──< product_images
                │                        │
                │                        └──< order_items >── orders
                ├──< purchase_items >── purchases
                └──< stock_ledger

settings（獨立的 key-value）
```

---

## 各表要點

### `beads` — 珠子主檔
一個 bead = **一種可獨立計數的珠子**。同商品不同尺寸算不同 bead（6mm 和 8mm 是兩筆）。

- `beads_source_uq` 唯一索引在 `(sourceUrl, sourceSpec)` 上 → 匯入時自動去重，同一商品同規格不會重複建檔。
- `unitCostCents` 是**目前**成本。重複進貨同一種珠子時取**移動加權平均**
  （`calcMovingAverageCost`），不覆蓋成最新價——覆蓋會讓庫存值偏離實際花費。
  歷史訂單不受影響（訂單存成本快照）。
- `isArchived` 用於停產的珠子：不再進貨，但歷史配方仍需保留該筆，**故不可刪除**（`recipes` 的外鍵是 `restrict`）。

### `purchases` / `purchase_items` — 進貨
一筆淘寶訂單 = 一張 `purchases`，xlsx 的每一列 = 一筆 `purchase_items`。

- `status` 為 `draft` 時代表「已解析、待店主確認」，**此時不可影響庫存與成本**。
- 按下確認才 `confirmed`，同時回寫 `beads.unitCostCents`、增加 `beads.stockQty`、寫入 `stock_ledger`。
- `rawTitle` / `rawSpec` / `rawUrl` 保留淘寶原文（簡體），供店主核對，**不要拿去當前台顯示名稱**。
- `beadsPerUnit` 解析不出時預設為 **1**（見 ADR-0006 修訂）。
  顆數的人工確認在**雲端試算表**完成，交給系統匯入的資料必須是已確認過的版本。
  `countSource = manual` 代表這個數字來自解析器猜測，未必經過確認。

### `products` / `recipes` — 手串與配方
- `manualStock` 為 null 時，可售量由配方與庫存動態計算（見 `calcBuildableQty`）。
- `recipes` 的 `(productId, beadId)` 唯一 → 同一顆珠在一條手串只會有一列，數量寫在 `qty`。
- `position` 是珠子在手串上的排列順序，前台「配方透視」依此繪製。

### `orders` / `order_items` — 訂單
- `orderNo` 對外顯示，格式 `SC-YYMMDD-XXXX`；`id` 絕不外露。
- `order_items` 存商品名稱、售價、**成本**快照。毛利報表用快照，不用現價。
- `availableAtOrderTime` 記下單當下可售量，供後台判斷是否超賣。

### `stock_ledger` — 庫存流水帳
每次庫存增減都留一筆，回答「為什麼庫存是這個數字」。
`reason` 四種：`purchase`、`order_paid`、`order_cancelled`、`manual_adjust`。

### `settings` — 可調參數
店主自行修改，程式不可寫死。預設鍵：
`bank_name`、`bank_code`、`bank_account`、`bank_holder`、`default_fx_rate_x100`、`shipping_fee_cents`、`free_shipping_threshold_cents`、`store_name`、`store_notice`。

---

## 不變量清單（實作必須遵守）

### 訂單
1. `paidAt` 為 null → **不得**出貨（`shippedAt` 不得設值）。
2. 庫存扣減**只**發生在轉入 `paid` 的那一刻。
3. `stockDeducted` 為 true 時**不得**重複扣減（冪等）。
4. 訂單取消且 `stockDeducted` 為 true → 必須把庫存加回並寫 `stock_ledger`。
5. 狀態不可逆向跳轉（`shipped` 不能回到 `pending_payment`）。

### 進貨
6. `purchases.status = 'draft'` 時，**不得**影響 `beads.stockQty` 或 `unitCostCents`。
7. `beadsPerUnit` **必須** ≥ 1；解析不出時預設 1，顆數正確性由試算表那一關把關（ADR-0006 修訂）。
8. 運費攤提各列加總**必須**等於總運費（用 `allocateProportional`）。

### 成本
9. `beads.unitCostCents` 變動**不得**回改任何 `order_items.unitCostCents`。
10. 商品成本一律 `calcProductCost(recipe)`，不得另行加總。
11. 重複進貨時 `beads.unitCostCents` 一律用 `calcMovingAverageCost`，
    且**必須在 `adjustStock` 加庫存之前**計算——否則分母會把本次進貨的顆數算兩次。

### 庫存
11. 每次 `beads.stockQty` 變動都**必須**同步寫入 `stock_ledger`。
12. `stockQty` 不得為負；扣減前必須檢查。

### 金額
13. 任何進到資料庫的金額都是整數分；由使用者輸入的元轉分一律用 `yuanToCents`。
14. 顯示才除以 100，計算過程全程用分。
