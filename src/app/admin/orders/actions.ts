'use server'

import { revalidatePath } from 'next/cache'
import { getDb, getPublicImageBase } from '@/data/db'
import {
  getOrderItems,
  confirmPaymentAndDeductStock,
  shipOrder,
  cancelOrder,
} from '@/data/orders'
import { stockLedger, beads, productImages } from '@db/schema'
import { eq, and, asc, inArray } from 'drizzle-orm'
import { ok, err, zodMessage, type ActionResult } from '@/contracts/common'
import { confirmPaymentSchema, shipOrderSchema, cancelOrderSchema } from '@/contracts/order'

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

/* ────────────────────────────────────────────────────────────
   收款、出貨、取消（2026-09-24 補上，S4-03～S4-05）

   實際邏輯全部在凍結的 `src/data/orders.ts`——扣庫存、回補庫存、
   寫 stock_ledger、狀態機守衛都在那裡。這裡只驗證輸入與轉譯訊息，
   不要在這個檔案裡重新實作任何一段。
   ──────────────────────────────────────────────────────────── */

/**
 * 確認收款 → 扣庫存。
 *
 * 【冪等】重複按不會重複扣（凍結層以 `stockDeducted` 旗標處理）。
 * 庫存不足時整筆擋下並說明缺哪一顆，不會把庫存扣成負數。
 */
export async function confirmPaymentAction(
  orderId: number,
  note?: string,
): Promise<ActionResult<void>> {
  const parsed = confirmPaymentSchema.safeParse({ orderId, note: note || undefined })
  if (!parsed.success) return err(zodMessage(parsed.error))

  const db = await getDb()
  const result = await confirmPaymentAndDeductStock(db, parsed.data.orderId, parsed.data.note)
  if (!result.ok) return err(result.error)

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return ok(undefined)
}

/**
 * 出貨，填物流單號。
 * 【不變量】還沒確認收款的訂單不得出貨——凍結層會擋。
 */
export async function shipOrderAction(
  orderId: number,
  trackingNo: string,
): Promise<ActionResult<void>> {
  const parsed = shipOrderSchema.safeParse({ orderId, trackingNo })
  if (!parsed.success) return err(zodMessage(parsed.error))

  const db = await getDb()
  const result = await shipOrder(db, parsed.data.orderId, parsed.data.trackingNo)
  if (!result.ok) return err(result.error)

  revalidatePath('/admin/orders')
  return ok(undefined)
}

/**
 * 取消訂單。
 * 【不變量】已扣庫存的訂單取消時會把料加回去並寫 stock_ledger——凍結層處理。
 */
export async function cancelOrderAction(
  orderId: number,
  reason: string,
): Promise<ActionResult<void>> {
  const parsed = cancelOrderSchema.safeParse({ orderId, reason })
  if (!parsed.success) return err(zodMessage(parsed.error))

  const db = await getDb()
  const result = await cancelOrder(db, parsed.data.orderId, parsed.data.reason)
  if (!result.ok) return err(result.error)

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return ok(undefined)
}
