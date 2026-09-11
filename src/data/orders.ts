/**
 * 訂單資料存取
 * ⚠️ 凍結檔案，不可修改。
 *
 * 這裡集中實作了會影響庫存與金錢的所有動作。
 * 各工作流呼叫這些函式即可，不要自行寫 SQL 或重新實作扣庫存邏輯。
 *
 * 涉及的不變量（見 docs/02-DATA-MODEL.md）：
 *   - paidAt 為 null 不得出貨
 *   - 庫存只在轉入 paid 時扣減
 *   - stockDeducted 保證冪等，不可重複扣
 *   - 取消已扣庫存的訂單必須加回
 *   - 每次庫存變動都要寫 stock_ledger
 */

import { eq, inArray, and, desc, sql } from 'drizzle-orm'
import type { Db } from './db.ts'
import { orders, orderItems, products, recipes, beads, stockLedger } from '@db/schema'
import { canTransition, type OrderStatusValue } from '@/contracts/order'

/* ────────────────────────────────────────────────────────────
   訂單編號
   ──────────────────────────────────────────────────────────── */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉易混淆的 I O 0 1

/**
 * 產生訂單編號：SC-YYMMDD-XXXX
 * 亂碼部分避免被猜到別人的訂單編號。
 */
export function generateOrderNo(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const rand = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  return `SC-${yy}${mm}${dd}-${rand}`
}

/* ────────────────────────────────────────────────────────────
   查詢
   ──────────────────────────────────────────────────────────── */

export async function getOrderByNo(db: Db, orderNo: string) {
  const rows = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1)
  return rows[0] ?? null
}

export async function getOrderById(db: Db, id: number) {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getOrderItems(db: Db, orderId: number) {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
}

/** 依狀態列出訂單，最新的在前 */
export async function listOrders(db: Db, statuses?: OrderStatusValue[]) {
  const q = db.select().from(orders).orderBy(desc(orders.createdAt))
  if (statuses && statuses.length > 0) {
    return q.where(inArray(orders.status, statuses))
  }
  return q
}

/**
 * 未出貨的訂單 —— 採購需求表的計算基礎。
 * @param includeUnpaid 是否納入還沒轉帳的訂單（預設不納入）
 */
export async function listOpenOrders(db: Db, includeUnpaid = false) {
  const statuses: OrderStatusValue[] = includeUnpaid
    ? ['pending_payment', 'payment_reported', 'paid']
    : ['payment_reported', 'paid']
  return db.select().from(orders).where(inArray(orders.status, statuses))
}

/* ────────────────────────────────────────────────────────────
   庫存扣減 —— 唯一實作
   ──────────────────────────────────────────────────────────── */

/**
 * 把一批訂單明細展開成「每顆珠需要幾顆」。
 * 採購需求表與扣庫存都用這個，確保兩邊算法一致。
 */
export async function expandOrderToBeadDemand(
  db: Db,
  items: Array<{ productId: number | null; qty: number }>,
): Promise<Map<number, number>> {
  const demand = new Map<number, number>()
  const productIds = items.map((i) => i.productId).filter((id): id is number => id !== null)
  if (productIds.length === 0) return demand

  const recipeRows = await db
    .select({ productId: recipes.productId, beadId: recipes.beadId, qty: recipes.qty })
    .from(recipes)
    .where(inArray(recipes.productId, productIds))

  for (const item of items) {
    if (item.productId === null) continue
    for (const r of recipeRows) {
      if (r.productId !== item.productId) continue
      demand.set(r.beadId, (demand.get(r.beadId) ?? 0) + r.qty * item.qty)
    }
  }
  return demand
}

/**
 * 確認收款 → 扣庫存。
 *
 * 【冪等】stockDeducted 已為 true 時直接返回，不重複扣。
 * 【稽核】每顆珠的異動都寫入 stock_ledger。
 *
 * 注意：D1 目前不支援互動式交易，此處以「先檢查後寫入」加上 stockDeducted
 * 旗標避免重複扣減。單人操作後台，併發風險極低。
 */
export async function confirmPaymentAndDeductStock(
  db: Db,
  orderId: number,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await getOrderById(db, orderId)
  if (!order) return { ok: false, error: '找不到這張訂單。' }

  if (!canTransition(order.status as OrderStatusValue, 'paid')) {
    return { ok: false, error: `訂單目前是「${order.status}」，不能直接改為已收款。` }
  }

  const now = Math.floor(Date.now() / 1000)

  // 已扣過就只更新狀態，不重複扣庫存
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
    const beadIds = [...demand.keys()]
    const beadRows = await db
      .select({ id: beads.id, name: beads.name, stockQty: beads.stockQty })
      .from(beads)
      .where(inArray(beads.id, beadIds))

    // 先檢查庫存是否足夠，不足就整筆擋下並說清楚缺哪一顆
    const shortages: string[] = []
    for (const b of beadRows) {
      const need = demand.get(b.id) ?? 0
      if (b.stockQty < need) {
        shortages.push(`${b.name}只剩 ${b.stockQty} 顆，這張訂單需要 ${need} 顆`)
      }
    }
    if (shortages.length > 0) {
      return {
        ok: false,
        error: `庫存不足，無法確認收款：${shortages.join('；')}。請先補足庫存，或手動調整後再試。`,
      }
    }

    // 扣減並記帳
    for (const b of beadRows) {
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
        note: `訂單 ${order.orderNo} 確認收款`,
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
 * 出貨。
 * 【不變量】paidAt 為 null 不得出貨。
 */
export async function shipOrder(
  db: Db,
  orderId: number,
  trackingNo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await getOrderById(db, orderId)
  if (!order) return { ok: false, error: '找不到這張訂單。' }

  if (order.paidAt === null) {
    return { ok: false, error: '這張訂單還沒確認收款，不能出貨。請先核對入帳並按「確認收款」。' }
  }
  if (!canTransition(order.status as OrderStatusValue, 'shipped')) {
    return { ok: false, error: `訂單目前是「${order.status}」，不能改為已出貨。` }
  }

  const now = Math.floor(Date.now() / 1000)
  await db
    .update(orders)
    .set({ status: 'shipped', shippedAt: now, trackingNo, updatedAt: now })
    .where(eq(orders.id, orderId))
  return { ok: true }
}

/**
 * 取消訂單。
 * 【不變量】已扣庫存的訂單取消時必須把庫存加回，並寫 stock_ledger。
 */
export async function cancelOrder(
  db: Db,
  orderId: number,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await getOrderById(db, orderId)
  if (!order) return { ok: false, error: '找不到這張訂單。' }

  if (!canTransition(order.status as OrderStatusValue, 'cancelled')) {
    return { ok: false, error: `訂單目前是「${order.status}」，不能取消。` }
  }

  const now = Math.floor(Date.now() / 1000)

  if (order.stockDeducted) {
    const items = await getOrderItems(db, orderId)
    const demand = await expandOrderToBeadDemand(
      db,
      items.map((i) => ({ productId: i.productId, qty: i.qty })),
    )
    if (demand.size > 0) {
      const beadRows = await db
        .select({ id: beads.id, stockQty: beads.stockQty })
        .from(beads)
        .where(inArray(beads.id, [...demand.keys()]))

      for (const b of beadRows) {
        const back = demand.get(b.id) ?? 0
        if (back <= 0) continue
        const after = b.stockQty + back
        await db.update(beads).set({ stockQty: after, updatedAt: now }).where(eq(beads.id, b.id))
        await db.insert(stockLedger).values({
          beadId: b.id,
          deltaQty: back,
          balanceAfter: after,
          reason: 'order_cancelled',
          refId: orderId,
          note: `訂單 ${order.orderNo} 取消，庫存回補`,
        })
      }
    }
  }

  await db
    .update(orders)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      stockDeducted: false,
      adminNote: reason,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId))

  return { ok: true }
}

/** 客戶回報轉帳 */
export async function reportTransfer(
  db: Db,
  orderNo: string,
  last5: string,
  transferredAt: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await getOrderByNo(db, orderNo)
  if (!order) return { ok: false, error: '找不到這個訂單編號，請確認後再試一次。' }

  if (!canTransition(order.status as OrderStatusValue, 'payment_reported')) {
    if (order.status === 'paid' || order.status === 'shipped' || order.status === 'completed') {
      return { ok: false, error: '這張訂單已經確認收款了，不需要重複回報。' }
    }
    return { ok: false, error: '這張訂單目前的狀態無法回報轉帳。' }
  }

  const now = Math.floor(Date.now() / 1000)
  await db
    .update(orders)
    .set({
      status: 'payment_reported',
      transferLast5: last5,
      transferReportedAt: transferredAt,
      updatedAt: now,
    })
    .where(eq(orders.id, order.id))
  return { ok: true }
}

/** 統計各狀態的訂單數，後台首頁用 */
export async function countOrdersByStatus(db: Db) {
  return db
    .select({ status: orders.status, count: sql<number>`count(*)` })
    .from(orders)
    .groupBy(orders.status)
}
