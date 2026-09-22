'use server'

import { getDb } from '@/data/db'
import { getOrderItems } from '@/data/orders'
import { stockLedger, beads } from '@db/schema'
import { eq, and, asc } from 'drizzle-orm'

/**
 * 某張訂單「當時」的用料與成本。
 *
 * 用料不是現查配方算出來的——配方之後可能被改過，重算會得到錯的答案。
 * 真正的依據是 `stock_ledger`：確認收款扣庫存時，每顆珠都留了一筆
 * `reason='order_paid'` + `refId=訂單id` 的紀錄，那就是當天實際扣掉的料。
 *
 * 商品層級的售價與成本同樣取自 `order_items` 的快照欄位，不重算。
 */
export async function getOrderSnapshot(orderId: number) {
  const db = await getDb()

  const items = await getOrderItems(db, orderId)

  const usage = await db
    .select({
      beadId: stockLedger.beadId,
      beadName: beads.name,
      sizeMm: beads.sizeMm,
      qty: stockLedger.deltaQty,
      at: stockLedger.createdAt,
    })
    .from(stockLedger)
    .innerJoin(beads, eq(stockLedger.beadId, beads.id))
    .where(and(eq(stockLedger.reason, 'order_paid'), eq(stockLedger.refId, orderId)))
    .orderBy(asc(beads.name))

  return {
    items: items.map((i) => ({
      productName: i.productName,
      qty: i.qty,
      unitPriceCents: i.unitPriceCents,
      /** 下單當下的成本快照，不隨之後的進貨或配方異動 */
      unitCostCents: i.unitCostCents,
    })),
    /** deltaQty 是負數（扣庫存），轉成正的顆數比較好讀 */
    usage: usage.map((u) => ({ ...u, qty: Math.abs(u.qty) })),
  }
}
