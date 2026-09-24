'use server'

import { revalidatePath } from 'next/cache'
import { getDb, getPublicImageBase } from '@/data/db'
import {
  getOrderItems,
  getOrderById,
  expandOrderToBeadDemand,
  confirmPaymentAndDeductStock,
  shipOrder,
  cancelOrder,
} from '@/data/orders'
import { stockLedger, beads, productImages, orders } from '@db/schema'
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
 * 【冪等】重複按不會重複扣。
 *
 * 【店主 2026-09-24 指示：庫存不足也不擋】
 * 錢收到了就是收到了，缺料店主自己看採購需求表去叫貨，不要在這裡攔他。
 *
 * 凍結層的 `confirmPaymentAndDeductStock()` 庫存不足時會整筆拒絕，
 * 所以缺料的情況改走這裡的 `deductAllowingNegative()`：
 * **讓庫存扣成負數**。
 *
 * 為什麼是負數而不是「自動補料到剛好夠」：
 * 補料等於憑空生出店主沒買的珠子，採購需求表就看不到缺口了——
 * 那正好毀掉店主唯一用來決定叫多少貨的報表。
 * 負庫存則是誠實的帳：缺 20 顆就顯示 −20，
 * 採購需求表會把這 20 顆算進「要叫」（`calcShortages` 的公式天然成立：
 * 需求 + 安全庫存 −(−20) 會把缺口加回來）。
 *
 * 庫存充足時仍然走凍結層，行為完全不變。
 */
export async function confirmPaymentAction(
  orderId: number,
  note?: string,
): Promise<ActionResult<void>> {
  const parsed = confirmPaymentSchema.safeParse({ orderId, note: note || undefined })
  if (!parsed.success) return err(zodMessage(parsed.error))

  const db = await getDb()
  const { orderId: id, note: adminNote } = parsed.data

  const result = await confirmPaymentAndDeductStock(db, id, adminNote)

  /*
   * 凍結層只在「庫存不足」這一種情況回傳失敗訊息以「庫存不足」開頭。
   * 其他失敗（找不到訂單、狀態不對）是真的錯誤，照樣回報。
   */
  if (!result.ok) {
    if (!result.error.startsWith('庫存不足')) return err(result.error)
    const fallback = await deductAllowingNegative(db, id, adminNote)
    if (!fallback.ok) return err(fallback.error)
  }

  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  revalidatePath('/admin/reports/purchasing')
  revalidatePath('/admin/inventory')
  return ok(undefined)
}

/**
 * 庫存不足時的扣料：照扣，允許扣成負數。
 *
 * 除了「不檢查夠不夠」之外，其餘與凍結層的
 * `confirmPaymentAndDeductStock()` 完全一致——一樣寫 `stock_ledger`、
 * 一樣設 `stockDeducted` 與 `paidAt`、一樣冪等。
 * 負數的那幾顆會在 `stock_ledger` 留下 `balance_after` 為負的紀錄，
 * 對帳時看得出來是哪張訂單超賣的。
 */
async function deductAllowingNegative(
  db: Awaited<ReturnType<typeof getDb>>,
  orderId: number,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await getOrderById(db, orderId)
  if (!order) return { ok: false, error: '找不到這張訂單。' }

  const now = Math.floor(Date.now() / 1000)

  /* 已經扣過就只更新狀態，不重複扣 */
  if (order.stockDeducted) {
    await db
      .update(orders)
      .set({ status: 'paid', paidAt: order.paidAt ?? now, updatedAt: now })
      .where(eq(orders.id, orderId))
    return { ok: true }
  }

  const items = await getOrderItems(db, orderId)
  const demand = await expandOrderToBeadDemand(
    db,
    items.map((i) => ({ productId: i.productId, qty: i.qty })),
  )

  if (demand.size > 0) {
    const rows = await db
      .select({ id: beads.id, stockQty: beads.stockQty })
      .from(beads)
      .where(inArray(beads.id, [...demand.keys()]))

    for (const b of rows) {
      const need = demand.get(b.id) ?? 0
      if (need <= 0) continue
      const after = b.stockQty - need
      await db.update(beads).set({ stockQty: after, updatedAt: now }).where(eq(beads.id, b.id))
      await db.insert(stockLedger).values({
        beadId: b.id,
        deltaQty: -need,
        balanceAfter: after,
        reason: 'order_paid',
        refId: orderId,
        note:
          after < 0
            ? `訂單 ${order.orderNo} 確認收款（料不夠，庫存為負，要補貨）`
            : `訂單 ${order.orderNo} 確認收款`,
      })
    }
  }

  await db
    .update(orders)
    .set({
      status: 'paid',
      paidAt: now,
      stockDeducted: true,
      adminNote: note ?? order.adminNote,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId))

  return { ok: true }
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
