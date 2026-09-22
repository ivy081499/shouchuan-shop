'use server'

import { getDb, getPublicImageBase } from '@/data/db'
import { getOrderItems } from '@/data/orders'
import { stockLedger, beads, productImages } from '@db/schema'
import { eq, and, asc, inArray } from 'drizzle-orm'

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
      imageUrl: beads.imageUrl,
      qty: stockLedger.deltaQty,
      at: stockLedger.createdAt,
    })
    .from(stockLedger)
    .innerJoin(beads, eq(stockLedger.beadId, beads.id))
    .where(and(eq(stockLedger.reason, 'order_paid'), eq(stockLedger.refId, orderId)))
    .orderBy(asc(beads.name))

  /**
   * 商品照片。
   * 訂單只存商品名稱快照，照片得回頭用 productId 查——
   * 商品被刪除時 productId 為 null，那就沒有照片可顯示，不影響其他欄位。
   */
  const productIds = items
    .map((i) => i.productId)
    .filter((id): id is number => id !== null)

  const imageRows =
    productIds.length > 0
      ? await db
          .select({
            productId: productImages.productId,
            r2Key: productImages.r2Key,
            sortOrder: productImages.sortOrder,
          })
          .from(productImages)
          .where(inArray(productImages.productId, productIds))
          .orderBy(asc(productImages.sortOrder))
      : []

  const imageBase = await getPublicImageBase()
  /** 本機開發沒有 R2 公開網址，檔案在 public/uploads/ 底下，要補前綴 */
  const toUrl = (key: string) =>
    imageBase ? `${imageBase.replace(/\/$/, '')}/${key}` : `/uploads/${key}`

  const imagesByProduct = new Map<number, string[]>()
  for (const r of imageRows) {
    const list = imagesByProduct.get(r.productId) ?? []
    list.push(toUrl(r.r2Key))
    imagesByProduct.set(r.productId, list)
  }

  return {
    items: items.map((i) => ({
      productName: i.productName,
      qty: i.qty,
      unitPriceCents: i.unitPriceCents,
      /** 下單當下的成本快照，不隨之後的進貨或配方異動 */
      unitCostCents: i.unitCostCents,
      images: i.productId ? (imagesByProduct.get(i.productId) ?? []) : [],
    })),
    /** deltaQty 是負數（扣庫存），轉成正的顆數比較好讀 */
    usage: usage.map((u) => ({ ...u, qty: Math.abs(u.qty) })),
  }
}
