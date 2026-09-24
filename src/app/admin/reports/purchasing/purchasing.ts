/**
 * 採購需求的實際計算
 *
 * 【為什麼不直接用 `getPurchasingReport()`】
 * 凍結的 `src/data/reports.ts` 把「所有未出貨訂單」都算成需求，
 * 包括**已經確認收款、料早就扣掉了**的那些。
 * 那會重複計算：料先從庫存扣了一次，又在需求裡被算了一次。
 *
 * 實測（2026-09-24）：庫存 12 顆、一張已扣料的訂單用了 8 顆、
 * 一張未扣料的訂單要 20 顆 → 正確答案是叫 8 顆，
 * 舊算法卻叫你買 16 顆，**足足多一倍**。
 *
 * 凍結檔不能改，所以在這裡重算。公式本身仍呼叫 `calcShortages()`，
 * 沒有另寫一套；差別只在「哪些訂單要算進需求」。
 *
 * 規則：**只有還沒扣過庫存的訂單才算需求**（`stock_deducted = 0`）。
 * 已扣過的訂單，它的料已經反映在現有庫存裡了，再算一次就是重複。
 */

import { eq, inArray } from 'drizzle-orm'
import type { Db } from '@/data/db'
import { beads, suppliers, orders, orderItems } from '@db/schema'
import { expandOrderToBeadDemand } from '@/data/orders'
import { calcShortages } from '@/lib/costing'
import type { PurchasingReport, PurchasingBySupplier, PurchasingLine } from '@/contracts/report'
import type { OrderStatusValue } from '@/contracts/order'

export async function getPurchasingReportFixed(
  db: Db,
  includeUnpaid: boolean,
): Promise<PurchasingReport> {
  /*
   * 未出貨的訂單。`includeUnpaid` 為真時連還沒轉帳的也算——
   * 店主 2026-09-24 起讓客人缺料也能下單，新訂單多半就停在這個狀態。
   */
  const statuses: OrderStatusValue[] = includeUnpaid
    ? ['pending_payment', 'payment_reported', 'paid']
    : ['payment_reported', 'paid']

  const openOrders = await db
    .select({ id: orders.id, stockDeducted: orders.stockDeducted })
    .from(orders)
    .where(inArray(orders.status, statuses))

  /* 只有「還沒扣料」的訂單才需要備料 */
  const pendingIds = openOrders.filter((o) => !o.stockDeducted).map((o) => o.id)

  let demand = new Map<number, number>()
  if (pendingIds.length > 0) {
    const items = await db
      .select({ productId: orderItems.productId, qty: orderItems.qty })
      .from(orderItems)
      .where(inArray(orderItems.orderId, pendingIds))
    demand = await expandOrderToBeadDemand(db, items)
  }

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

  /*
   * 公式照舊呼叫凍結層：缺口 = 需求 + 安全庫存 − 現有庫存。
   * 庫存為負（超賣後）時這條公式天然成立，欠的量會被加回缺口裡。
   */
  const shortages = calcShortages(
    beadRows.map((b) => ({
      beadId: b.id,
      requiredQty: demand.get(b.id) ?? 0,
      stockQty: b.stockQty,
      reorderPoint: b.reorderPoint,
    })),
  )

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

  /* 花最多錢的店鋪排前面，店主照著一家一家買 */
  const groups = [...groupMap.values()].sort((a, b) => b.subtotalCostCents - a.subtotalCostCents)
  for (const g of groups) {
    g.lines.sort((a, b) => b.shortageQty - a.shortageQty)
  }

  return {
    groups,
    totalEstimatedCostCents: groups.reduce((sum, g) => sum + g.subtotalCostCents, 0),
    /* 顯示給店主看的是「還要備料的訂單數」，不是全部未出貨訂單 */
    orderCount: pendingIds.length,
    includeUnpaid,
  }
}
