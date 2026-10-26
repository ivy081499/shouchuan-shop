/**
 * 手串電商 — 資料庫 Schema（Drizzle / Cloudflare D1）
 *
 * ⚠️ 此檔案在 Phase 0 結束後【凍結】。
 * 任何工作流若認為需要改動，必須停手並在 docs/tasks/BOARD.md 的
 * 「SCHEMA 變更請求」區塊登記，不得自行修改或繞道。
 *
 * 【金額鐵律】所有金額欄位一律為「整數．新台幣分」(TWD cents)。
 *   例：NT$1,280.50 → 128050
 *   禁止使用浮點數存錢。顯示時才除以 100。
 *
 * 【顆數鐵律】所有珠子數量一律為整數「顆」。
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/** 共用：建立/更新時間戳（Unix 秒） */
const timestamps = {
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}

/* ────────────────────────────────────────────────────────────
   1. suppliers — 供應商（淘寶店鋪）
   來源：订单数据.xlsx 的「店铺名称」欄
   ──────────────────────────────────────────────────────────── */
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 店鋪名稱，例：八祥梦旗舰店。匯入時以此比對去重 */
    name: text('name').notNull(),
    /** 備註：出貨速度、品質印象等 */
    note: text('note'),
    ...timestamps,
  },
  (t) => [uniqueIndex('suppliers_name_uq').on(t.name)],
)

/* ────────────────────────────────────────────────────────────
   2. beads — 珠子主檔
   這是成本與採購報表的核心。一個 bead = 一種可獨立計數的珠子，
   由「淘寶商品 + 規格」唯一決定（同商品不同尺寸＝不同 bead）。
   ──────────────────────────────────────────────────────────── */
export const beads = sqliteTable(
  'beads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    /** 顯示名稱，由你自訂，例：草莓晶 6mm 冰種。前台也可能看到 */
    name: text('name').notNull(),
    /** 材質分類，例：水晶／玉石／金屬配件／線材。用於後台篩選 */
    category: text('category'),
    /** 直徑（mm）。線材類可為 null */
    sizeMm: real('size_mm'),
    /** 顏色描述，供前台「配方透視」顯示用 */
    colorHex: text('color_hex'),
    /**
     * 顏色分類（彩虹七色＋無彩色），供後台篩選「我要紅色的料」。
     * 與 colorHex 不同：colorHex 是實際色碼用於顯示，
     * 這裡是粗分類，同一色系的深淺都歸同一類。
     */
    colorFamily: text('color_family', {
      enum: ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'neutral'],
    }),

    /**
     * 珠子圖片網址。後台選珠時顯示縮圖，用來辨認「沙金桶珠 24款」這類
     * 光看名字認不出的品項（ADR-0010）。
     *
     * 兩種來源：
     *   - 淘寶商品頁的規格縮圖（匯入時自動帶入，可能為該商品共用主圖）
     *   - 店主自行上傳（存 R2，此處存完整網址或 R2 key）
     * 為 null 時介面顯示占位方塊，不影響任何計算。
     */
    imageUrl: text('image_url'),

    supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),

    /** 淘寶商品連結，採購報表直接給出可點連結 */
    sourceUrl: text('source_url'),
    /** 淘寶商品名稱原文（簡體），匯入比對用 */
    sourceTitle: text('source_title'),
    /** 淘寶規格原文，例：约6mm*5颗。匯入比對用，也是解析顆數的依據 */
    sourceSpec: text('source_spec'),

    /**
     * 目前單顆成本（TWD 分）。
     *
     * 重複進貨同一種珠子時取【移動加權平均】，不覆蓋成最新價
     * （見 calcMovingAverageCost）——覆蓋會讓庫存值偏離實際花費。
     * 歷史訂單不追溯（訂單存快照）。
     */
    unitCostCents: integer('unit_cost_cents').notNull().default(0),

    /** 現有庫存顆數 */
    stockQty: integer('stock_qty').notNull().default(0),

    /** 安全庫存：低於此值在後台示警。0 = 不提醒 */
    reorderPoint: integer('reorder_point').notNull().default(0),

    /** 是否已停用（不再進貨，但歷史配方仍需保留此筆） */
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),

    ...timestamps,
  },
  (t) => [
    index('beads_supplier_idx').on(t.supplierId),
    index('beads_category_idx').on(t.category),
    // 同一淘寶商品 + 同一規格 ⇒ 同一顆珠，避免匯入重複建檔
    uniqueIndex('beads_source_uq').on(t.sourceUrl, t.sourceSpec),
  ],
)

/* ────────────────────────────────────────────────────────────
   2.5 shipments — 到貨批次（一批貨 = 一次清關 = 一筆關稅）

   多張淘寶訂單集運併單、一起清關時，關稅是整批收一次，
   不是每張訂單各收一次。關稅掛在這一層，再攤到各進貨明細。
   ──────────────────────────────────────────────────────────── */
export const shipments = sqliteTable(
  'shipments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 批次名稱，例：2026-09 第一批。店主自訂，方便辨識 */
    name: text('name').notNull(),
    /** 到貨日期（Unix 秒） */
    arrivedAt: integer('arrived_at'),

    /**
     * 這批貨的關稅（新台幣分）。店主口頭告知後填入。
     * 依各進貨明細的商品金額比例攤提到每一列，與運費同一套邏輯。
     */
    dutyTwdCents: integer('duty_twd_cents').notNull().default(0),

    note: text('note'),
    ...timestamps,
  },
  (t) => [index('shipments_arrived_idx').on(t.arrivedAt)],
)

/* ────────────────────────────────────────────────────────────
   3. purchases — 進貨單（一筆淘寶訂單 = 一張進貨單）
   ──────────────────────────────────────────────────────────── */
export const purchases = sqliteTable(
  'purchases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 淘寶訂單號，例：5127421790026175046 */
    sourceOrderNo: text('source_order_no'),
    supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),

    /**
     * 所屬到貨批次。同一批（集運併單）的多張訂單共用一筆關稅。
     * null = 尚未歸批（舊資料或單獨清關）。
     */
    shipmentId: integer('shipment_id').references(() => shipments.id, { onDelete: 'set null' }),

    /** 下單日期（Unix 秒） */
    orderedAt: integer('ordered_at'),

    /**
     * 本次進貨匯率（TWD per CNY），例：4.5 存成 450（放大 100 倍的整數）。
     * 凍結於此筆進貨，日後匯率變動不追溯既有成本。
     */
    fxRateX100: integer('fx_rate_x100').notNull(),

    /** 運費（人民幣分），例：￥3.00 → 300 */
    freightCnyCents: integer('freight_cny_cents').notNull().default(0),

    /** 匯入狀態：draft=解析完待你確認／confirmed=已寫入庫存 */
    status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('draft'),

    note: text('note'),
    ...timestamps,
  },
  (t) => [
    index('purchases_supplier_idx').on(t.supplierId),
    uniqueIndex('purchases_source_no_uq').on(t.sourceOrderNo),
  ],
)

/* ────────────────────────────────────────────────────────────
   4. purchase_items — 進貨明細
   匯入 xlsx 的每一列對應一筆。保留原始欄位以便你核對。
   ──────────────────────────────────────────────────────────── */
export const purchaseItems = sqliteTable(
  'purchase_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseId: integer('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /** 確認後對應到哪顆珠。draft 階段可為 null（尚未決定新建或併入既有） */
    beadId: integer('bead_id').references(() => beads.id, { onDelete: 'set null' }),

    /* ── 以下為 xlsx 原文，唯讀保存，供你逐列核對 ── */
    rawTitle: text('raw_title').notNull(),
    rawSpec: text('raw_spec'),
    rawUrl: text('raw_url'),

    /** 商品金額（人民幣分）：xlsx「商品金額」欄，單件價 */
    unitPriceCnyCents: integer('unit_price_cny_cents').notNull(),
    /** 購買件數：xlsx「商品數量」欄 */
    quantity: integer('quantity').notNull(),

    /**
     * 每件包含幾顆珠。
     * 由 sourceSpec 解析而來，但【必須經你確認】才寫入。
     * 解析不出來時為 null，UI 強制你填寫。
     */
    beadsPerUnit: integer('beads_per_unit'),

    /** 解析器信心：parsed=有把握／estimated=約數（如「约60颗左右」）／manual=你手填 */
    countSource: text('count_source', { enum: ['parsed', 'estimated', 'manual'] })
      .notNull()
      .default('parsed'),

    /**
     * 攤得運費（人民幣分）。依本筆金額佔該進貨單總額比例分攤。
     */
    freightShareCnyCents: integer('freight_share_cny_cents').notNull().default(0),

    /**
     * 計算結果：單顆成本（TWD 分）。確認時寫入並回寫 beads.unitCostCents。
     * 公式見 src/data/costing.ts — 唯一的計算來源。
     */
    computedUnitCostCents: integer('computed_unit_cost_cents'),

    /**
     * 攤得關稅（新台幣分）。
     * 關稅掛在 shipments，依本列商品金額佔整批總額的比例分攤下來。
     * 單顆成本 = (貨款 + 攤得運費) × 匯率 + 攤得關稅，再除以總顆數。
     */
    dutyShareTwdCents: integer('duty_share_twd_cents').notNull().default(0),

    /**
     * 這一項實際收到貨的時間；null＝還沒收到。
     * 店主逐項核對包裹內容後自己打勾——同一批貨常分批到、
     * 或某幾項缺貨沒寄，整批一個勾看不出來少了什麼。
     */
    receivedAt: integer('received_at'),

    ...timestamps,
  },
  (t) => [
    index('purchase_items_purchase_idx').on(t.purchaseId),
    index('purchase_items_bead_idx').on(t.beadId),
    index('purchase_items_received_idx').on(t.receivedAt),
  ],
)

/* ────────────────────────────────────────────────────────────
   5. products — 手串商品（前台販售單位）
   ──────────────────────────────────────────────────────────── */
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 網址代稱，例：peach-blossom。前台 /p/[slug] */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** 商品故事／設計理念，前台顯示 */
    description: text('description'),

    /** 售價（TWD 分） */
    priceCents: integer('price_cents').notNull(),

    /** 手圍（cm），例：16.5 */
    wristSizeCm: real('wrist_size_cm'),

    /**
     * 可售數量。null = 依配方庫存動態計算（預設）。
     * 設數字則為手動限量。
     */
    manualStock: integer('manual_stock'),

    status: text('status', { enum: ['draft', 'active', 'sold_out', 'archived'] })
      .notNull()
      .default('draft'),

    /** 排序權重，數字越小越前面 */
    sortOrder: integer('sort_order').notNull().default(0),

    /**
     * 軟刪除時間；非 null 代表已刪除。
     * 與 status='archived'（下架）不同——下架之後可能再上架，
     * 刪除是店主想丟掉，只是留著可以復原。
     */
    deletedAt: integer('deleted_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('products_slug_uq').on(t.slug),
    index('products_status_idx').on(t.status),
    index('products_deleted_idx').on(t.deletedAt),
  ],
)

/* ────────────────────────────────────────────────────────────
   6. product_images — 商品圖（存 R2，此處只存 key）
   ──────────────────────────────────────────────────────────── */
export const productImages = sqliteTable(
  'product_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** R2 物件 key，例：products/12/main.webp。完整 URL 由 env 的公開網域組出 */
    r2Key: text('r2_key').notNull(),
    alt: text('alt'),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * 這張圖給誰看。
     * customer＝上架給客人看的成品照；internal＝店主自己的工作照
     * （材料擺拍、配色比對、製作中紀錄）。兩種都可以有多張。
     * 前台只拿 customer；後台列表的縮圖優先拿 internal 的第一張。
     */
    audience: text('audience', { enum: ['customer', 'internal'] })
      .notNull()
      .default('customer'),
    /** 軟刪除時間；非 null 代表已刪除，畫面不顯示但資料留著可復原 */
    deletedAt: integer('deleted_at'),
    ...timestamps,
  },
  (t) => [
    index('product_images_product_idx').on(t.productId),
    index('product_images_audience_idx').on(t.productId, t.audience),
  ],
)

/* ────────────────────────────────────────────────────────────
   7. recipes — 配方（手串用了哪些珠、各幾顆）
   這是「勾選使用哪些珠」的落地，也是採購報表的展開依據。
   ──────────────────────────────────────────────────────────── */
export const recipes = sqliteTable(
  'recipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    beadId: integer('bead_id')
      .notNull()
      .references(() => beads.id, { onDelete: 'restrict' }),
    /** 這條手串用掉幾顆此珠 */
    qty: integer('qty').notNull(),
    /** 在手串上的排列位置，供前台「配方透視」依序畫出 */
    position: integer('position').notNull().default(0),
    /** 軟刪除時間；非 null 代表已從配方移除，資料留著可復原 */
    deletedAt: integer('deleted_at'),
    ...timestamps,
  },
  (t) => [
    index('recipes_product_idx').on(t.productId),
    index('recipes_bead_idx').on(t.beadId),
    // 同一商品同一顆珠只能有一列（要用幾顆寫在 qty）
    uniqueIndex('recipes_product_bead_uq').on(t.productId, t.beadId),
  ],
)

/* ────────────────────────────────────────────────────────────
   8. orders — 訂單
   狀態機：pending_payment → payment_reported → paid → shipped → completed
                                             ↘ cancelled
   ──────────────────────────────────────────────────────────── */
export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 對外訂單編號，客戶轉帳時填備註，例：SC-260911-3F7K */
    orderNo: text('order_no').notNull(),

    /* ── 收件資訊 ── */
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),
    shippingAddress: text('shipping_address').notNull(),
    customerNote: text('customer_note'),

    /* ── 金額（TWD 分），皆為下單當下快照 ── */
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingFeeCents: integer('shipping_fee_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),

    /** 下單當下的成本合計（TWD 分），用於毛利報表，不隨日後成本變動 */
    costSnapshotCents: integer('cost_snapshot_cents').notNull().default(0),

    status: text('status', {
      enum: ['pending_payment', 'payment_reported', 'paid', 'shipped', 'completed', 'cancelled'],
    })
      .notNull()
      .default('pending_payment'),

    /** 客戶回報的轉帳帳號末五碼，供你對帳 */
    transferLast5: text('transfer_last5'),
    /** 客戶回報的轉帳時間 */
    transferReportedAt: integer('transfer_reported_at'),

    /**
     * 你人工確認收款的時間。
     * 【不變量】paidAt 為 null 時不得出貨；庫存亦在此刻才實扣。
     */
    paidAt: integer('paid_at'),

    shippedAt: integer('shipped_at'),
    /** 出貨物流單號 */
    trackingNo: text('tracking_no'),
    cancelledAt: integer('cancelled_at'),

    /** 庫存是否已扣（防止重複扣減的冪等旗標） */
    stockDeducted: integer('stock_deducted', { mode: 'boolean' }).notNull().default(false),

    adminNote: text('admin_note'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('orders_no_uq').on(t.orderNo),
    index('orders_status_idx').on(t.status),
    index('orders_created_idx').on(t.createdAt),
  ],
)

/* ────────────────────────────────────────────────────────────
   9. order_items — 訂單明細
   存下單當時的名稱與價格快照，商品日後改名改價不影響歷史訂單。
   ──────────────────────────────────────────────────────────── */
export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** 商品被刪除時保留明細，故為 set null */
    productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),

    /* ── 快照欄位 ── */
    productName: text('product_name').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),

    qty: integer('qty').notNull(),

    /**
     * 下單當下該商品的可售數量快照。
     * 用於後台超賣示警：若現在庫存已不足，列表標紅提醒你。
     */
    availableAtOrderTime: integer('available_at_order_time'),

    ...timestamps,
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_product_idx').on(t.productId)],
)

/* ────────────────────────────────────────────────────────────
   10. stock_ledger — 庫存異動流水帳
   每次庫存增減都留一筆，用於稽核「為什麼庫存是這個數字」。
   ──────────────────────────────────────────────────────────── */
export const stockLedger = sqliteTable(
  'stock_ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    beadId: integer('bead_id')
      .notNull()
      .references(() => beads.id, { onDelete: 'cascade' }),
    /** 正數為進貨，負數為出貨耗用 */
    deltaQty: integer('delta_qty').notNull(),
    /** 異動後結存，便於追溯 */
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason', { enum: ['purchase', 'order_paid', 'manual_adjust', 'order_cancelled'] }).notNull(),
    /** 關聯單據 id（purchase 或 order），依 reason 解讀 */
    refId: integer('ref_id'),
    note: text('note'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [index('stock_ledger_bead_idx').on(t.beadId), index('stock_ledger_created_idx').on(t.createdAt)],
)

/* ────────────────────────────────────────────────────────────
   11. settings — 你可自行修改的參數（key-value）
   預設鍵見 db/seed/seed.sql：
     bank_name / bank_code / bank_account / bank_holder
     default_fx_rate_x100 / shipping_fee_cents / free_shipping_threshold_cents
     store_name / store_notice
   ──────────────────────────────────────────────────────────── */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  /** 給你看的說明，後台設定頁顯示 */
  label: text('label'),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

/* ────────────────────────────────────────────────────────────
   12. purchase_lists — 採購清單（店主主動挑貨）

   與「採購需求表」互補：需求表由訂單驅動，零客戶時永遠空白；
   這裡是店主自己決定要補什麼、補多少，且需跨 session 留存。
   ──────────────────────────────────────────────────────────── */
export const purchaseLists = sqliteTable(
  'purchase_lists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    /** 清單名稱，例：2026-11 擺攤補貨 */
    name: text('name').notNull(),
    /** 備註 */
    note: text('note'),

    /**
     * draft   = 編輯中，還在挑
     * ordered = 已照著下單，等貨到
     * closed  = 結案（貨到並已匯入，或放棄）
     */
    status: text('status', { enum: ['draft', 'ordered', 'closed'] })
      .notNull()
      .default('draft'),

    ...timestamps,
  },
  (t) => [index('purchase_lists_status_idx').on(t.status)],
)

/* ────────────────────────────────────────────────────────────
   13. purchase_list_items — 採購清單明細

   【不存金額】單價一律即時從 beads.unit_cost_cents 讀取。
   這份清單是「還沒買」的東西，價格以下單當時為準，不做快照
   （訂單才需要快照，因為要凍結已成交的成本）。
   ──────────────────────────────────────────────────────────── */
export const purchaseListItems = sqliteTable(
  'purchase_list_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    listId: integer('list_id')
      .notNull()
      .references(() => purchaseLists.id, { onDelete: 'cascade' }),

    beadId: integer('bead_id')
      .notNull()
      .references(() => beads.id, { onDelete: 'cascade' }),

    /** 要叫的顆數。0 視為未選，API 收到 0 直接刪列 */
    qty: integer('qty').notNull().default(0),

    /**
     * manual   = 店主自己勾的
     * shortage = 用「一鍵帶入缺貨」加進來的
     * 用於介面標示來源，讓店主分得出哪幾列是系統建議的
     */
    source: text('source', { enum: ['manual', 'shortage'] })
      .notNull()
      .default('manual'),

    /** 備註，例：這次改買 8mm */
    note: text('note'),

    ...timestamps,
  },
  (t) => [
    index('purchase_list_items_list_idx').on(t.listId),
    index('purchase_list_items_bead_idx').on(t.beadId),
    // 同一清單同一顆珠只能一列，一鍵帶入用 upsert 避免重複
    uniqueIndex('purchase_list_items_uq').on(t.listId, t.beadId),
  ],
)

/* ── 型別匯出（各工作流 import 這些，勿自行重新定義） ── */
export type Supplier = typeof suppliers.$inferSelect
export type NewSupplier = typeof suppliers.$inferInsert
export type Bead = typeof beads.$inferSelect
export type NewBead = typeof beads.$inferInsert
export type Purchase = typeof purchases.$inferSelect
export type NewPurchase = typeof purchases.$inferInsert
export type PurchaseItem = typeof purchaseItems.$inferSelect
export type NewPurchaseItem = typeof purchaseItems.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductImage = typeof productImages.$inferSelect
export type NewProductImage = typeof productImages.$inferInsert
export type Recipe = typeof recipes.$inferSelect
export type NewRecipe = typeof recipes.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
export type StockLedgerEntry = typeof stockLedger.$inferSelect
export type Setting = typeof settings.$inferSelect

export type PurchaseList = typeof purchaseLists.$inferSelect
export type NewPurchaseList = typeof purchaseLists.$inferInsert
export type PurchaseListItem = typeof purchaseListItems.$inferSelect
export type NewPurchaseListItem = typeof purchaseListItems.$inferInsert

export type OrderStatus = Order['status']
export type ProductStatus = Product['status']
export type PurchaseListStatus = PurchaseList['status']
export type PurchaseListItemSource = PurchaseListItem['source']
