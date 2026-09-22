/**
 * 報表資料存取
 * ⚠️ 凍結檔案，不可修改。
 *
 * 三張報表：採購需求、毛利、庫存概況。
 * 計算一律呼叫 src/lib/costing.ts，不在這裡另寫公式。
 *
 * 例外紀錄：2026-09-22 經店主核准，`getInventoryReport()` 改為納入已棄用的珠子
 * （見 BOARD「SCHEMA 變更請求」）。棄用只代表不再拿來做手串，
 * 料還在手上、錢已經花了，庫存價值必須照列。
 * 採購需求維持排除棄用料——都棄用了不該再叫貨。
 */

import { eq, and, inArray, asc, desc, gte, lte, sql } from 'drizzle-orm'
import type { Db } from './db.ts'
import { beads, suppliers, orders, orderItems, products, recipes } from '@db/schema'
import { calcShortages, calcMargin, calcBuildableQty } from '@/lib/costing'
import type {
  PurchasingReport,
  PurchasingBySupplier,
  PurchasingLine,
  MarginReport,
  ProductMarginLine,
  InventoryReport,
  InventoryLine,
  BuildableLine,
} from '@/contracts/report'
import { listOpenOrders, expandOrderToBeadDemand } from './orders.ts'

/* ────────────────────────────────────────────────────────────
   採購需求表（店主最重要的報表）

   「依目前客戶下單的手串，我應該要有多少珠、還要叫多少貨、店家是誰」
   ──────────────────────────────────────────────────────────── */

export async function getPurchasingReport(db: Db, includeUnpaid = false): Promise<PurchasingReport> {
  // 1. 取未出貨訂單
  const openOrders = await listOpenOrders(db, includeUnpaid)
  const orderIds = openOrders.map((o) => o.id)

  // 2. 展開成珠子需求
  let demand = new Map<number, number>()
  if (orderIds.length > 0) {
    const items = await db
      .select({ productId: orderItems.productId, qty: orderItems.qty })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds))
    demand = await expandOrderToBeadDemand(db, items)
  }

  // 3. 取所有未封存的珠子（庫存低於安全庫存的也要進報表，即使沒有訂單需求）
  const beadRows = await db
    .select({
      id: beads.id,
      name: beads.name,
      sizeMm: beads.sizeMm,
      stockQty: beads.stockQty,
      reorderPoint: beads.reorderPoint,
      unitCostCents: beads.unitCostCents,
      sourceUrl: beads.sourceUrl,
      sourceSpec: beads.sourceSpec,
      supplierId: beads.supplierId,
      supplierName: suppliers.name,
    })
    .from(beads)
    .leftJoin(suppliers, eq(beads.supplierId, suppliers.id))
    .where(eq(beads.isArchived, false))

  // 4. 算缺口
  const shortages = calcShortages(
    beadRows.map((b) => ({
      beadId: b.id,
      requiredQty: demand.get(b.id) ?? 0,
      stockQty: b.stockQty,
      reorderPoint: b.reorderPoint,
    })),
  )

  // 5. 只保留真的需要採購的，依店鋪分組
  const groupMap = new Map<string, PurchasingBySupplier>()

  for (const s of shortages) {
    if (s.shortageQty <= 0) continue
    const bead = beadRows.find((b) => b.id === s.beadId)
    if (!bead) continue

    const line: PurchasingLine = {
      beadId: bead.id,
      beadName: bead.name,
      sizeMm: bead.sizeMm,
      requiredQty: s.requiredQty,
      stockQty: s.stockQty,
      reorderPoint: s.reorderPoint,
      shortageQty: s.shortageQty,
      unitCostCents: bead.unitCostCents,
      estimatedCostCents: s.shortageQty * bead.unitCostCents,
      sourceUrl: bead.sourceUrl,
      sourceSpec: bead.sourceSpec,
    }

    const key = bead.supplierId === null ? 'none' : String(bead.supplierId)
    const existing = groupMap.get(key)
    if (existing) {
      existing.lines.push(line)
      existing.subtotalCostCents += line.estimatedCostCents
    } else {
      groupMap.set(key, {
        supplierId: bead.supplierId,
        supplierName: bead.supplierName ?? '未指定店鋪',
        lines: [line],
        subtotalCostCents: line.estimatedCostCents,
      })
    }
  }

  const groups = [...groupMap.values()].sort((a, b) => b.subtotalCostCents - a.subtotalCostCents)
  for (const g of groups) {
    g.lines.sort((a, b) => b.shortageQty - a.shortageQty)
  }

  return {
    groups,
    totalEstimatedCostCents: groups.reduce((sum, g) => sum + g.subtotalCostCents, 0),
    orderCount: openOrders.length,
    includeUnpaid,
  }
}

/* ────────────────────────────────────────────────────────────
   毛利表
   成本用訂單當下的快照，不用現在的珠價。
   ──────────────────────────────────────────────────────────── */

export async function getMarginReport(
  db: Db,
  from?: number | null,
  to?: number | null,
): Promise<MarginReport> {
  const conditions = [inArray(orders.status, ['paid', 'shipped', 'completed'] as const)]
  if (from) conditions.push(gte(orders.createdAt, from))
  if (to) conditions.push(lte(orders.createdAt, to))

  const orderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(...conditions))

  if (orderRows.length === 0) {
    return {
      lines: [],
      totalRevenueCents: 0,
      totalCostCents: 0,
      totalProfitCents: 0,
      overallMarginRate: 0,
      orderCount: 0,
    }
  }

  const items = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      unitPriceCents: orderItems.unitPriceCents,
      unitCostCents: orderItems.unitCostCents,
      qty: orderItems.qty,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderRows.map((o) => o.id)))

  // 依商品彙總
  const byProduct = new Map<string, ProductMarginLine>()
  for (const it of items) {
    const key = it.productId === null ? `deleted:${it.productName}` : String(it.productId)
    const revenue = it.unitPriceCents * it.qty
    const cost = it.unitCostCents * it.qty
    const existing = byProduct.get(key)
    if (existing) {
      existing.soldQty += it.qty
      existing.revenueCents += revenue
      existing.costCents += cost
    } else {
      byProduct.set(key, {
        productId: it.productId ?? 0,
        productName: it.productName,
        soldQty: it.qty,
        revenueCents: revenue,
        costCents: cost,
        profitCents: 0,
        marginRate: 0,
      })
    }
  }

  const lines = [...byProduct.values()].map((l) => {
    const m = calcMargin(l.revenueCents, l.costCents)
    return { ...l, profitCents: m.profitCents, marginRate: m.marginRate }
  })
  lines.sort((a, b) => b.profitCents - a.profitCents)

  const totalRevenueCents = lines.reduce((s, l) => s + l.revenueCents, 0)
  const totalCostCents = lines.reduce((s, l) => s + l.costCents, 0)
  const overall = calcMargin(totalRevenueCents, totalCostCents)

  return {
    lines,
    totalRevenueCents,
    totalCostCents,
    totalProfitCents: overall.profitCents,
    overallMarginRate: overall.marginRate,
    orderCount: orderRows.length,
  }
}

/* ────────────────────────────────────────────────────────────
   庫存概況
   ──────────────────────────────────────────────────────────── */

export async function getInventoryReport(db: Db): Promise<InventoryReport> {
  const rows = await db
    .select({
      beadId: beads.id,
      beadName: beads.name,
      category: beads.category,
      sizeMm: beads.sizeMm,
      stockQty: beads.stockQty,
      reorderPoint: beads.reorderPoint,
      unitCostCents: beads.unitCostCents,
      supplierName: suppliers.name,
      isArchived: beads.isArchived,
    })
    .from(beads)
    .leftJoin(suppliers, eq(beads.supplierId, suppliers.id))
    // 棄用的珠子也要算——料還在手上、錢已經花了，庫存價值不能憑空消失
    .orderBy(asc(beads.name))

  const lines: InventoryLine[] = rows.map(({ isArchived, ...r }) => ({
    ...r,
    stockValueCents: r.stockQty * r.unitCostCents,
    // 棄用的不再補貨，就不該觸發補貨提醒
    isLow: !isArchived && r.reorderPoint > 0 && r.stockQty <= r.reorderPoint,
  }))

  return {
    lines,
    totalStockValueCents: lines.reduce((s, l) => s + l.stockValueCents, 0),
    lowStockCount: lines.filter((l) => l.isLow).length,
  }
}

/** 每個商品還能做幾條，以及卡住產量的是哪顆珠 */
export async function getBuildableReport(db: Db): Promise<BuildableLine[]> {
  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(inArray(products.status, ['active', 'draft'] as const))

  if (productRows.length === 0) return []

  const recipeRows = await db
    .select({
      productId: recipes.productId,
      beadName: beads.name,
      qty: recipes.qty,
      stockQty: beads.stockQty,
    })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(inArray(recipes.productId, productRows.map((p) => p.id)))

  return productRows.map((p) => {
    const lines = recipeRows.filter((r) => r.productId === p.id)
    const buildableQty = calcBuildableQty(lines)

    // 找出最短板：可做數量等於整體可做數量的那顆珠
    let limitingBeadName: string | null = null
    let minPossible = Number.POSITIVE_INFINITY
    for (const l of lines) {
      if (l.qty <= 0) continue
      const possible = Math.floor(l.stockQty / l.qty)
      if (possible < minPossible) {
        minPossible = possible
        limitingBeadName = l.beadName
      }
    }

    return { productId: p.id, productName: p.name, buildableQty, limitingBeadName }
  }).sort((a, b) => a.buildableQty - b.buildableQty)
}
