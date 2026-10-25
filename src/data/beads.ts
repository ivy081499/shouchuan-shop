/**
 * 珠子、供應商、庫存資料存取
 * ⚠️ 凍結檔案，不可修改。
 */

import { eq, and, inArray, asc, desc, sql, like, or, isNotNull } from 'drizzle-orm'
import type { Db } from './db.ts'
import { beads, suppliers, stockLedger, recipes, purchases, purchaseItems, shipments } from '@db/schema'
import type { BeadInput, SupplierInput } from '@/contracts/bead'
import { cnyToTwd } from '@/lib/money'

/* ────────────────────────────────────────────────────────────
   供應商
   ──────────────────────────────────────────────────────────── */

export async function listSuppliers(db: Db) {
  return db.select().from(suppliers).orderBy(asc(suppliers.name))
}

export async function getSupplierByName(db: Db, name: string) {
  const rows = await db.select().from(suppliers).where(eq(suppliers.name, name)).limit(1)
  return rows[0] ?? null
}

/** 匯入時用：已存在就回傳既有的，不存在才建立 */
export async function upsertSupplierByName(db: Db, name: string): Promise<number> {
  const existing = await getSupplierByName(db, name)
  if (existing) return existing.id
  const inserted = await db.insert(suppliers).values({ name }).returning({ id: suppliers.id })
  return inserted[0].id
}

export async function createSupplier(db: Db, input: SupplierInput) {
  const rows = await db.insert(suppliers).values(input).returning()
  return rows[0]
}

/* ────────────────────────────────────────────────────────────
   珠子查詢
   ──────────────────────────────────────────────────────────── */

export interface BeadFilter {
  /** 搜尋名稱或淘寶標題 */
  keyword?: string
  category?: string
  supplierId?: number
  /** 只看低於安全庫存的 */
  lowStockOnly?: boolean
  includeArchived?: boolean
}

export async function listBeads(db: Db, filter: BeadFilter = {}) {
  const conditions = []

  if (!filter.includeArchived) {
    conditions.push(eq(beads.isArchived, false))
  }
  if (filter.category) {
    conditions.push(eq(beads.category, filter.category))
  }
  if (filter.supplierId !== undefined) {
    conditions.push(eq(beads.supplierId, filter.supplierId))
  }
  if (filter.keyword) {
    const kw = `%${filter.keyword}%`
    conditions.push(or(like(beads.name, kw), like(beads.sourceTitle, kw)))
  }
  if (filter.lowStockOnly) {
    // 安全庫存為 0 代表不提醒，故要排除
    conditions.push(sql`${beads.reorderPoint} > 0 AND ${beads.stockQty} <= ${beads.reorderPoint}`)
  }

  const rows = await db
    .select({
      id: beads.id,
      name: beads.name,
      category: beads.category,
      sizeMm: beads.sizeMm,
      colorHex: beads.colorHex,
      colorFamily: beads.colorFamily,
      imageUrl: beads.imageUrl,
      supplierId: beads.supplierId,
      supplierName: suppliers.name,
      sourceUrl: beads.sourceUrl,
      sourceTitle: beads.sourceTitle,
      sourceSpec: beads.sourceSpec,
      unitCostCents: beads.unitCostCents,
      stockQty: beads.stockQty,
      reorderPoint: beads.reorderPoint,
      isArchived: beads.isArchived,
    })
    .from(beads)
    .leftJoin(suppliers, eq(beads.supplierId, suppliers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(beads.name))

  return rows
}

export async function getBeadById(db: Db, id: number) {
  const rows = await db.select().from(beads).where(eq(beads.id, id)).limit(1)
  return rows[0] ?? null
}

/** 匯入時用：同一淘寶商品 + 同規格視為同一顆珠 */
export async function findBeadBySource(db: Db, sourceUrl: string | null, sourceSpec: string | null) {
  if (!sourceUrl) return null
  const rows = await db
    .select()
    .from(beads)
    .where(and(eq(beads.sourceUrl, sourceUrl), sourceSpec ? eq(beads.sourceSpec, sourceSpec) : sql`${beads.sourceSpec} IS NULL`))
    .limit(1)
  return rows[0] ?? null
}

export async function createBead(db: Db, input: BeadInput) {
  const rows = await db.insert(beads).values(input).returning()
  return rows[0]
}

export async function updateBead(db: Db, id: number, input: Partial<BeadInput>) {
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .update(beads)
    .set({ ...input, updatedAt: now })
    .where(eq(beads.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * 珠子是否還被任何配方使用。
 * 被使用中的珠子不可刪除（外鍵為 restrict），應改為封存。
 */
export async function isBeadInUse(db: Db, beadId: number): Promise<boolean> {
  const rows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.beadId, beadId)).limit(1)
  return rows.length > 0
}

/* ────────────────────────────────────────────────────────────
   庫存異動 —— 唯一實作
   【不變量】每次 stockQty 變動都必須同步寫 stock_ledger
   ──────────────────────────────────────────────────────────── */

export async function adjustStock(
  db: Db,
  beadId: number,
  deltaQty: number,
  reason: 'purchase' | 'manual_adjust',
  refId: number | null,
  note?: string,
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const bead = await getBeadById(db, beadId)
  if (!bead) return { ok: false, error: '找不到這顆珠子。' }

  const after = bead.stockQty + deltaQty
  if (after < 0) {
    return {
      ok: false,
      error: `庫存不足：${bead.name}目前只有 ${bead.stockQty} 顆，不能再減少 ${Math.abs(deltaQty)} 顆。`,
    }
  }

  const now = Math.floor(Date.now() / 1000)
  await db.update(beads).set({ stockQty: after, updatedAt: now }).where(eq(beads.id, beadId))
  await db.insert(stockLedger).values({
    beadId,
    deltaQty,
    balanceAfter: after,
    reason,
    refId,
    note: note ?? null,
  })

  return { ok: true, balance: after }
}

/** 某顆珠的庫存異動紀錄，最新在前 */
export async function listStockLedger(db: Db, beadId: number, limit = 50) {
  return db
    .select()
    .from(stockLedger)
    .where(eq(stockLedger.beadId, beadId))
    .orderBy(desc(stockLedger.createdAt))
    .limit(limit)
}

/** 取多顆珠的庫存，扣庫存與報表共用 */
export async function getBeadStocks(db: Db, beadIds: number[]) {
  if (beadIds.length === 0) return []
  return db
    .select({ id: beads.id, name: beads.name, stockQty: beads.stockQty, reorderPoint: beads.reorderPoint })
    .from(beads)
    .where(inArray(beads.id, beadIds))
}

/** 所有使用中的分類，供後台篩選下拉選單 */
export async function listCategories(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: beads.category })
    .from(beads)
    .where(and(eq(beads.isArchived, false), sql`${beads.category} IS NOT NULL`))
  return rows.map((r) => r.category).filter((c): c is string => c !== null).sort()
}

/**
 * 設定珠子圖片。
 * url 為 null 代表清除圖片。
 */
export async function setBeadImage(db: Db, beadId: number, url: string | null) {
  await db
    .update(beads)
    .set({ imageUrl: url, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(beads.id, beadId))
}

/**
 * 進貨總額（已確認的進貨單）。
 *
 * 店主的認知是「我總共花了多少錢叫貨」，所以用進貨單原始金額加總，
 * 而不是「庫存顆數 × 單顆成本」——後者會隨著珠子用掉而減少，
 * 反映的是剩餘庫存價值，不是花費。
 *
 * 人民幣直接加總；台幣用各批進貨當時的匯率換算後加總，
 * 因為每批匯率可能不同（凍結於 purchases.fxRateX100）。
 *
 * 關稅另計：海關收台幣，不經匯率換算，掛在 shipments 上。
 * 回傳的 `twdCents` 是貨款（含運費）不含關稅，
 * `dutyTwdCents` 是關稅，`totalTwdCents` 才是實際總花費。
 */
export async function getPurchaseTotals(db: Db) {
  const rows = await db
    .select({
      fxRateX100: purchases.fxRateX100,
      freightCnyCents: purchases.freightCnyCents,
      goodsCnyCents: sql<number>`SUM(${purchaseItems.unitPriceCnyCents} * ${purchaseItems.quantity})`,
    })
    .from(purchases)
    .innerJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id))
    .where(eq(purchases.status, 'confirmed'))
    .groupBy(purchases.id)

  let cnyCents = 0
  let twdCents = 0
  for (const r of rows) {
    const batch = Number(r.goodsCnyCents ?? 0) + r.freightCnyCents
    cnyCents += batch
    twdCents += cnyToTwd(batch, r.fxRateX100)
  }

  // 關稅：只算有掛到已確認進貨單的批次，避免草稿批次混進來
  const dutyRows = await db
    .selectDistinct({ id: shipments.id, dutyTwdCents: shipments.dutyTwdCents })
    .from(shipments)
    .innerJoin(purchases, eq(purchases.shipmentId, shipments.id))
    .where(eq(purchases.status, 'confirmed'))

  const dutyTwdCents = dutyRows.reduce((s, r) => s + r.dutyTwdCents, 0)

  // 批次數：已確認訂單實際掛到的相異批次（與有沒有關稅無關）
  const batchRows = await db
    .selectDistinct({ shipmentId: purchases.shipmentId })
    .from(purchases)
    .where(and(eq(purchases.status, 'confirmed'), isNotNull(purchases.shipmentId)))

  return {
    cnyCents,
    twdCents,
    dutyTwdCents,
    totalTwdCents: twdCents + dutyTwdCents,
    /** 淘寶訂單數（一張淘寶訂單 = 一筆 purchases） */
    orderCount: rows.length,
    /**
     * 到貨批次數（多張訂單集運併單算一批，一批收一次關稅）。
     *
     * 取 purchases.shipmentId 的相異值，不是數有關稅的批次——
     * 曾經誤用 dutyRows.length，關稅為 0 的批次會整批消失。
     * 2026-09-26 那批關稅 0，報表就只顯示 1 批。
     */
    shipmentCount: batchRows.length,
  }
}

/* ────────────────────────────────────────────────────────────
   進貨批次（到貨確認）

   一次匯入＝一批（集運併單），關稅一批收一次。
   `arrivedAt` 有值代表店主已確認收到貨。
   ──────────────────────────────────────────────────────────── */

export interface ShipmentRow {
  id: number
  name: string
  arrivedAt: number | null
  dutyTwdCents: number
  orderCount: number
  beadCount: number
  totalQty: number
}

/** 列出所有進貨批次，新的在前 */
export async function listShipments(db: Db): Promise<ShipmentRow[]> {
  const rows = await db
    .select({
      id: shipments.id,
      name: shipments.name,
      arrivedAt: shipments.arrivedAt,
      dutyTwdCents: shipments.dutyTwdCents,
      orderCount: sql<number>`COUNT(DISTINCT ${purchases.id})`,
      beadCount: sql<number>`COUNT(DISTINCT ${purchaseItems.beadId})`,
      totalQty: sql<number>`COALESCE(SUM(${purchaseItems.quantity} * ${purchaseItems.beadsPerUnit}), 0)`,
    })
    .from(shipments)
    .leftJoin(purchases, eq(purchases.shipmentId, shipments.id))
    .leftJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id))
    .groupBy(shipments.id)
    .orderBy(desc(shipments.id))

  return rows.map((r) => ({
    ...r,
    orderCount: Number(r.orderCount ?? 0),
    beadCount: Number(r.beadCount ?? 0),
    totalQty: Number(r.totalQty ?? 0),
  }))
}

/**
 * 標記／取消「已收到貨」。
 * received 為 true 時寫入當下時間，false 清成 null。
 */
export async function setShipmentReceived(db: Db, shipmentId: number, received: boolean) {
  const now = Math.floor(Date.now() / 1000)
  await db
    .update(shipments)
    .set({ arrivedAt: received ? now : null, updatedAt: now })
    .where(eq(shipments.id, shipmentId))
}
