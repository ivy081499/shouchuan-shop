/**
 * 採購清單資料存取
 *
 * 與 reports.ts 的「採購需求表」互補：
 *   - 採購需求表：訂單驅動，展開未出貨訂單的配方算缺口，零客戶時空白
 *   - 採購清單：店主主動挑貨，自己決定補什麼補多少，跨 session 留存
 *
 * 【不存金額】單價一律即時從 beads.unit_cost_cents 讀取。
 * 這份清單是「還沒買」的東西，不做成本快照（訂單才需要）。
 */

import { eq, and, asc, desc, sql, lt, gt, inArray, like, or, gte, lte } from 'drizzle-orm'
import type { Db } from './db.ts'
import { purchaseLists, purchaseListItems, beads, suppliers } from '@db/schema'
import type { PurchaseListStatus, PurchaseListItemSource } from '@db/schema'

/* ────────────────────────────────────────────────────────────
   清單本身
   ──────────────────────────────────────────────────────────── */

export async function listPurchaseLists(db: Db) {
  const rows = await db
    .select({
      id: purchaseLists.id,
      name: purchaseLists.name,
      note: purchaseLists.note,
      status: purchaseLists.status,
      createdAt: purchaseLists.createdAt,
      updatedAt: purchaseLists.updatedAt,
      itemCount: sql<number>`(
        SELECT COUNT(*) FROM purchase_list_items
        WHERE purchase_list_items.list_id = ${purchaseLists.id}
      )`,
      totalQty: sql<number>`COALESCE((
        SELECT SUM(qty) FROM purchase_list_items
        WHERE purchase_list_items.list_id = ${purchaseLists.id}
      ), 0)`,
    })
    .from(purchaseLists)
    .orderBy(desc(purchaseLists.updatedAt))

  return rows
}

export async function getPurchaseList(db: Db, id: number) {
  const rows = await db.select().from(purchaseLists).where(eq(purchaseLists.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createPurchaseList(db: Db, name: string, note?: string | null) {
  const rows = await db
    .insert(purchaseLists)
    .values({ name, note: note ?? null })
    .returning()
  return rows[0]
}

export async function updatePurchaseList(
  db: Db,
  id: number,
  patch: { name?: string; note?: string | null; status?: PurchaseListStatus },
) {
  const rows = await db
    .update(purchaseLists)
    .set({ ...patch, updatedAt: sql`(unixepoch())` })
    .where(eq(purchaseLists.id, id))
    .returning()
  return rows[0] ?? null
}

/** 刪清單。明細靠 FK ON DELETE CASCADE 一併移除 */
export async function deletePurchaseList(db: Db, id: number) {
  await db.delete(purchaseLists).where(eq(purchaseLists.id, id))
}

/**
 * 確保至少有一張可用的清單。
 * 店主第一次進頁面時不該看到「請先建立清單」這種空轉畫面。
 */
export async function ensureDefaultList(db: Db) {
  const existing = await db
    .select()
    .from(purchaseLists)
    .where(eq(purchaseLists.status, 'draft'))
    .orderBy(desc(purchaseLists.updatedAt))
    .limit(1)

  if (existing[0]) return existing[0]
  return createPurchaseList(db, '補貨清單')
}

/* ────────────────────────────────────────────────────────────
   明細：勾選與數量
   ──────────────────────────────────────────────────────────── */

/**
 * 設定某顆珠要叫多少。
 * qty <= 0 視為取消勾選，直接刪列（不留 0 的殘列）。
 */
export async function setItemQty(
  db: Db,
  listId: number,
  beadId: number,
  qty: number,
  source: PurchaseListItemSource = 'manual',
) {
  if (qty <= 0) {
    await db
      .delete(purchaseListItems)
      .where(and(eq(purchaseListItems.listId, listId), eq(purchaseListItems.beadId, beadId)))
    await touchList(db, listId)
    return null
  }

  const rows = await db
    .insert(purchaseListItems)
    .values({ listId, beadId, qty, source })
    .onConflictDoUpdate({
      target: [purchaseListItems.listId, purchaseListItems.beadId],
      set: { qty, updatedAt: sql`(unixepoch())` },
    })
    .returning()

  await touchList(db, listId)
  return rows[0]
}

export async function removeItem(db: Db, listId: number, beadId: number) {
  await db
    .delete(purchaseListItems)
    .where(and(eq(purchaseListItems.listId, listId), eq(purchaseListItems.beadId, beadId)))
  await touchList(db, listId)
}

async function touchList(db: Db, listId: number) {
  await db
    .update(purchaseLists)
    .set({ updatedAt: sql`(unixepoch())` })
    .where(eq(purchaseLists.id, listId))
}

/* ────────────────────────────────────────────────────────────
   一鍵帶入缺貨

   兩種判斷，依序採用：

   1. 有設安全庫存的珠子 → 低於安全庫存就算缺貨
      建議數量 = 安全庫存 × 2 − 現有庫存
      用兩倍而非剛好補到門檻：剛好補到的話做幾條就又低於，
      變成每個月都要下單。

   2. 一顆都沒設安全庫存時 → 改用「做不出一條手串」當門檻
      一條混珠款約用 4 顆主石（依 test 配方），
      所以主石不足 THIN_STOCK 顆就算太薄，建議補到 20 顆。

   第 2 種是必要的備援：目前 72 種珠子全都沒設 reorder_point，
   只靠第 1 種判斷的話這個按鈕按了永遠沒反應。
   ──────────────────────────────────────────────────────────── */

/** 主石低於幾顆算「做不出一條」。一條約用 4 顆，不足 8 顆連兩條都做不了 */
const THIN_STOCK = 8
/** 太薄的主石建議補到幾顆（20 顆可做 5 條） */
const THIN_TARGET = 20
/** 單顆成本多少以上算主石（分）。底珠不吃這個規則 */
const MAIN_STONE_COST_CENTS = 1000

export async function fillShortages(db: Db, listId: number) {
  const byReorderPoint = await db
    .select({
      id: beads.id,
      stockQty: beads.stockQty,
      reorderPoint: beads.reorderPoint,
    })
    .from(beads)
    .where(
      and(
        eq(beads.isArchived, false),
        gt(beads.reorderPoint, 0),
        lt(beads.stockQty, beads.reorderPoint),
      ),
    )

  let targets: { id: number; qty: number }[] = byReorderPoint
    .map((b) => ({ id: b.id, qty: b.reorderPoint * 2 - b.stockQty }))
    .filter((t) => t.qty > 0)

  // 備援：沒有任何珠子設過安全庫存時，改用「主石太薄」判斷
  if (targets.length === 0) {
    const thin = await db
      .select({ id: beads.id, stockQty: beads.stockQty })
      .from(beads)
      .where(
        and(
          eq(beads.isArchived, false),
          gte(beads.unitCostCents, MAIN_STONE_COST_CENTS),
          lt(beads.stockQty, THIN_STOCK),
        ),
      )

    targets = thin
      .map((b) => ({ id: b.id, qty: THIN_TARGET - b.stockQty }))
      .filter((t) => t.qty > 0)
  }

  let filled = 0
  for (const t of targets) {
    // upsert：已存在的列只更新數量與來源標記，不覆蓋店主寫的 note
    await db
      .insert(purchaseListItems)
      .values({ listId, beadId: t.id, qty: t.qty, source: 'shortage' })
      .onConflictDoUpdate({
        target: [purchaseListItems.listId, purchaseListItems.beadId],
        set: { qty: t.qty, source: 'shortage', updatedAt: sql`(unixepoch())` },
      })
    filled++
  }

  if (filled > 0) await touchList(db, listId)
  return { filled }
}

export interface ShortageInfo {
  count: number
  /** reorder = 依安全庫存判斷；thin = 依「主石太薄」備援判斷 */
  basis: 'reorder' | 'thin'
}

/** 目前有幾項該補，給按鈕上的說明用 */
export async function countShortages(db: Db): Promise<ShortageInfo> {
  const byReorder = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(beads)
    .where(
      and(
        eq(beads.isArchived, false),
        gt(beads.reorderPoint, 0),
        lt(beads.stockQty, beads.reorderPoint),
      ),
    )

  const n = byReorder[0]?.n ?? 0
  if (n > 0) return { count: n, basis: 'reorder' }

  const thin = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(beads)
    .where(
      and(
        eq(beads.isArchived, false),
        gte(beads.unitCostCents, MAIN_STONE_COST_CENTS),
        lt(beads.stockQty, THIN_STOCK),
      ),
    )

  return { count: thin[0]?.n ?? 0, basis: 'thin' }
}

/* ────────────────────────────────────────────────────────────
   主表格：全部珠子 + 這張清單的勾選狀態
   ──────────────────────────────────────────────────────────── */

export type SortKey =
  | 'name'
  | 'category'
  | 'size'
  | 'stock'
  | 'reorder'
  | 'cost'
  | 'qty'
  | 'subtotal'
  | 'supplier'

export interface BeadPickerFilter {
  keyword?: string
  categories?: string[]
  supplierIds?: number[]
  /** 只看低於安全庫存的 */
  onlyShortage?: boolean
  /** 只看已勾選的 */
  onlySelected?: boolean
  /** 只看有淘寶連結的 */
  onlyWithUrl?: boolean
  sizeMin?: number
  sizeMax?: number
  /** 單顆成本區間，單位：分 */
  costMin?: number
  costMax?: number
  sort?: SortKey
  dir?: 'asc' | 'desc'
}

export interface BeadPickerRow {
  beadId: number
  name: string
  category: string | null
  sizeMm: number | null
  imageUrl: string | null
  stockQty: number
  reorderPoint: number
  unitCostCents: number
  supplierId: number | null
  supplierName: string | null
  sourceUrl: string | null
  sourceSpec: string | null
  /** 這張清單裡要叫的數量，0 = 未勾選 */
  qty: number
  source: PurchaseListItemSource | null
  note: string | null
  subtotalCents: number
  isShortage: boolean
}

export async function listBeadsForPicker(
  db: Db,
  listId: number,
  filter: BeadPickerFilter = {},
): Promise<BeadPickerRow[]> {
  const conds = [eq(beads.isArchived, false)]

  if (filter.keyword) {
    const kw = `%${filter.keyword}%`
    const m = or(like(beads.name, kw), like(beads.sourceTitle, kw), like(beads.sourceSpec, kw))
    if (m) conds.push(m)
  }
  if (filter.categories?.length) conds.push(inArray(beads.category, filter.categories))
  if (filter.supplierIds?.length) conds.push(inArray(beads.supplierId, filter.supplierIds))
  if (filter.onlyShortage) {
    conds.push(gt(beads.reorderPoint, 0))
    conds.push(lt(beads.stockQty, beads.reorderPoint))
  }
  if (filter.sizeMin != null) conds.push(gte(beads.sizeMm, filter.sizeMin))
  if (filter.sizeMax != null) conds.push(lte(beads.sizeMm, filter.sizeMax))
  if (filter.costMin != null) conds.push(gte(beads.unitCostCents, filter.costMin))
  if (filter.costMax != null) conds.push(lte(beads.unitCostCents, filter.costMax))

  const rows = await db
    .select({
      beadId: beads.id,
      name: beads.name,
      category: beads.category,
      sizeMm: beads.sizeMm,
      imageUrl: beads.imageUrl,
      stockQty: beads.stockQty,
      reorderPoint: beads.reorderPoint,
      unitCostCents: beads.unitCostCents,
      supplierId: beads.supplierId,
      supplierName: suppliers.name,
      sourceUrl: beads.sourceUrl,
      sourceSpec: beads.sourceSpec,
      qty: purchaseListItems.qty,
      source: purchaseListItems.source,
      note: purchaseListItems.note,
    })
    .from(beads)
    .leftJoin(suppliers, eq(beads.supplierId, suppliers.id))
    .leftJoin(
      purchaseListItems,
      and(eq(purchaseListItems.beadId, beads.id), eq(purchaseListItems.listId, listId)),
    )
    .where(and(...conds))

  let out: BeadPickerRow[] = rows.map((r) => {
    const qty = r.qty ?? 0
    return {
      ...r,
      qty,
      subtotalCents: qty * r.unitCostCents,
      isShortage: r.reorderPoint > 0 && r.stockQty < r.reorderPoint,
    }
  })

  if (filter.onlySelected) out = out.filter((r) => r.qty > 0)
  if (filter.onlyWithUrl) out = out.filter((r) => !!r.sourceUrl)

  return sortRows(out, filter.sort ?? 'name', filter.dir ?? 'asc')
}

/**
 * 排序在記憶體做，不在 SQL。
 * 原因：qty 與 subtotal 來自 left join 後的計算欄，
 * 且珠子總數是數十到數百筆的量級，排序成本可忽略。
 */
function sortRows(rows: BeadPickerRow[], key: SortKey, dir: 'asc' | 'desc') {
  const sign = dir === 'desc' ? -1 : 1
  const num = (v: number | null) => v ?? -1

  const cmp: Record<SortKey, (a: BeadPickerRow, b: BeadPickerRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, 'zh-Hant'),
    category: (a, b) => (a.category ?? '').localeCompare(b.category ?? '', 'zh-Hant'),
    size: (a, b) => num(a.sizeMm) - num(b.sizeMm),
    stock: (a, b) => a.stockQty - b.stockQty,
    reorder: (a, b) => a.reorderPoint - b.reorderPoint,
    cost: (a, b) => a.unitCostCents - b.unitCostCents,
    qty: (a, b) => a.qty - b.qty,
    subtotal: (a, b) => a.subtotalCents - b.subtotalCents,
    supplier: (a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? '', 'zh-Hant'),
  }

  return [...rows].sort((a, b) => {
    const r = cmp[key](a, b)
    // 同值時用名稱當穩定次序，避免每次重新整理順序跳動
    return r !== 0 ? r * sign : a.name.localeCompare(b.name, 'zh-Hant')
  })
}

/* ────────────────────────────────────────────────────────────
   統計與下單清單
   ──────────────────────────────────────────────────────────── */

export interface PurchaseListTotals {
  itemCount: number
  totalQty: number
  totalCents: number
}

export async function getListTotals(db: Db, listId: number): Promise<PurchaseListTotals> {
  const rows = await db
    .select({
      itemCount: sql<number>`COUNT(*)`,
      totalQty: sql<number>`COALESCE(SUM(${purchaseListItems.qty}), 0)`,
      totalCents: sql<number>`COALESCE(SUM(${purchaseListItems.qty} * ${beads.unitCostCents}), 0)`,
    })
    .from(purchaseListItems)
    .innerJoin(beads, eq(purchaseListItems.beadId, beads.id))
    .where(eq(purchaseListItems.listId, listId))

  return rows[0] ?? { itemCount: 0, totalQty: 0, totalCents: 0 }
}

export interface OrderSheetLine {
  name: string
  qty: number
  sourceUrl: string | null
  sourceSpec: string | null
  subtotalCents: number
}

export interface OrderSheetGroup {
  supplierId: number | null
  supplierName: string
  lines: OrderSheetLine[]
  subtotalCents: number
}

/**
 * 下單清單：依店鋪分組。
 * 淘寶要一家一家下單，跨店分開才能照著買。
 */
export async function getOrderSheet(db: Db, listId: number): Promise<OrderSheetGroup[]> {
  const rows = await db
    .select({
      name: beads.name,
      qty: purchaseListItems.qty,
      unitCostCents: beads.unitCostCents,
      sourceUrl: beads.sourceUrl,
      sourceSpec: beads.sourceSpec,
      supplierId: beads.supplierId,
      supplierName: suppliers.name,
    })
    .from(purchaseListItems)
    .innerJoin(beads, eq(purchaseListItems.beadId, beads.id))
    .leftJoin(suppliers, eq(beads.supplierId, suppliers.id))
    .where(and(eq(purchaseListItems.listId, listId), gt(purchaseListItems.qty, 0)))
    .orderBy(asc(suppliers.name), asc(beads.name))

  const groups = new Map<string, OrderSheetGroup>()

  for (const r of rows) {
    const key = String(r.supplierId ?? 'none')
    if (!groups.has(key)) {
      groups.set(key, {
        supplierId: r.supplierId,
        supplierName: r.supplierName ?? '未指定店鋪',
        lines: [],
        subtotalCents: 0,
      })
    }
    const g = groups.get(key)!
    const subtotal = r.qty * r.unitCostCents
    g.lines.push({
      name: r.name,
      qty: r.qty,
      sourceUrl: r.sourceUrl,
      sourceSpec: r.sourceSpec,
      subtotalCents: subtotal,
    })
    g.subtotalCents += subtotal
  }

  return [...groups.values()]
}

/** 篩選面板用：目前有哪些分類與店鋪 */
export async function getFilterOptions(db: Db) {
  const cats = await db
    .selectDistinct({ category: beads.category })
    .from(beads)
    .where(eq(beads.isArchived, false))

  const sups = await db
    .selectDistinct({ id: suppliers.id, name: suppliers.name })
    .from(beads)
    .innerJoin(suppliers, eq(beads.supplierId, suppliers.id))
    .where(eq(beads.isArchived, false))
    .orderBy(asc(suppliers.name))

  return {
    categories: cats.map((c) => c.category).filter((c): c is string => !!c),
    suppliers: sups,
  }
}
