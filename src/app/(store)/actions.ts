'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq, inArray, asc } from 'drizzle-orm'
import { ok, err, zodMessage, type ActionResult } from '@/contracts/common'
import {
  cartItemSchema,
  checkoutSchema,
  reportTransferSchema,
  type CheckoutResult,
} from '@/contracts/order'
import { getDb } from '@/data/db'
import { getAvailableQtyMap } from '@/data/products'
import { generateOrderNo, reportTransfer } from '@/data/orders'
import { calcProductCost } from '@/lib/costing'
import { orders, orderItems, products, recipes, beads } from '@db/schema'
import { readCart, writeCart, buildCartView, getShippingRule, calcShippingFee } from './cart.ts'
import { getStoreSettings } from './store.ts'
import { sendOrderConfirmation } from './email.ts'

/* ────────────────────────────────────────────────────────────
   購物車
   ──────────────────────────────────────────────────────────── */

/**
 * 加入購物車。
 *
 * 同一條手串再加一次是累加數量，不是新增一列——手串是單品，
 * 客人多半是想「再買一條送人」，不是想在車裡看到兩行一樣的東西。
 */
export async function addToCartAction(
  productId: number,
  qty: number,
): Promise<ActionResult<{ count: number }>> {
  const parsed = cartItemSchema.safeParse({ productId, qty })
  if (!parsed.success) return err(zodMessage(parsed.error))

  const db = await getDb()
  const rows = await db
    .select({ id: products.id, name: products.name, status: products.status })
    .from(products)
    .where(eq(products.id, parsed.data.productId))
    .limit(1)

  const product = rows[0]
  if (!product || product.status !== 'active') {
    return err('這條手串目前買不到了。')
  }

  const cart = await readCart()
  const existing = cart.items.find((i) => i.productId === parsed.data.productId)
  const nextQty = (existing?.qty ?? 0) + parsed.data.qty

  /*
   * 【店主 2026-09-24 指示：庫存不足完全不擋】
   * 客人要買幾條就買幾條，材料夠不夠由店主自己判斷與處理。
   * 手串是做出來的不是現成的，缺料再補做就好，不該在這裡把生意擋掉。
   * 超賣的安全網改由後台負責：`availableAtOrderTime` 存下單當下的可做條數，
   * 後台訂單列表會標紅提醒（`isOversold`）。
   */

  const items = existing
    ? cart.items.map((i) => (i.productId === parsed.data.productId ? { ...i, qty: nextQty } : i))
    : [...cart.items, { productId: parsed.data.productId, qty: parsed.data.qty }]

  if (items.length > 50) return err('購物車最多放 50 項。')

  await writeCart({ items })
  revalidatePath('/cart')
  return ok({ count: items.reduce((sum, i) => sum + i.qty, 0) })
}

/** 改數量。數量改成 0 等同移除 */
export async function updateCartQtyAction(
  productId: number,
  qty: number,
): Promise<ActionResult<void>> {
  if (!Number.isInteger(productId) || productId <= 0) return err('商品有誤。')
  if (!Number.isInteger(qty) || qty < 0) return err('數量有誤。')

  if (qty === 0) return removeFromCartAction(productId)

  const parsed = cartItemSchema.safeParse({ productId, qty })
  if (!parsed.success) return err(zodMessage(parsed.error))

  /* 同 addToCartAction：庫存不足不擋，想改成幾條就幾條 */
  const cart = await readCart()
  await writeCart({
    items: cart.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
  })
  revalidatePath('/cart')
  return ok(undefined)
}

export async function removeFromCartAction(productId: number): Promise<ActionResult<void>> {
  const cart = await readCart()
  await writeCart({ items: cart.items.filter((i) => i.productId !== productId) })
  revalidatePath('/cart')
  return ok(undefined)
}

/* ────────────────────────────────────────────────────────────
   結帳
   ──────────────────────────────────────────────────────────── */

/**
 * 送出訂單。
 *
 * 【這裡不扣庫存】庫存只在店主確認收款時扣（`confirmPaymentAndDeductStock`），
 * 這是 ADR-0004 定下的不變量，不可以在這裡「順手」扣掉。
 *
 * 【成本快照不可省略】`unit_cost_cents` 是日後查毛利的唯一依據。
 * 珠子成本會隨進貨變動，不存快照的話，半年後算出來的毛利是錯的。
 *
 * 【金額一律重算】表單送上來的數字一個都不信，價格與運費全部現查資料庫。
 */
export async function placeOrderAction(formData: FormData): Promise<ActionResult<CheckoutResult>> {
  const cart = await readCart()
  if (cart.items.length === 0) return err('購物車是空的。')

  const emailRaw = String(formData.get('customerEmail') ?? '').trim()

  const parsed = checkoutSchema.safeParse({
    customerName: String(formData.get('customerName') ?? ''),
    customerPhone: String(formData.get('customerPhone') ?? ''),
    customerEmail: emailRaw,
    shippingAddress: String(formData.get('shippingAddress') ?? ''),
    customerNote: String(formData.get('customerNote') ?? ''),
    items: cart.items,
  })
  if (!parsed.success) return err(zodMessage(parsed.error))
  const input = parsed.data

  const db = await getDb()
  const ids = input.items.map((i) => i.productId)

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      priceCents: products.priceCents,
      status: products.status,
    })
    .from(products)
    .where(inArray(products.id, ids))

  /*
   * 買不到的品項（下架、或商品已被刪除）直接**剔除**，不是整張退回。
   *
   * 早期版本是「有一項買不到就擋下整筆」，但那樣會把客人卡死：
   * cookie 裡若留著一個已刪除的商品 id，購物車頁面看不到它
   * （`buildCartView()` 只顯示上架中的），客人根本不知道要移除什麼，
   * 只會一直看到「有手串買不到了」然後無從處理。
   * 這裡的規則與購物車頁一致：買不到的就當它不存在。
   */
  const sellableItems = input.items.filter((i) =>
    productRows.some((p) => p.id === i.productId && p.status === 'active'),
  )
  if (sellableItems.length === 0) {
    return err('購物車裡的手串都已經買不到了，請重新挑選。')
  }

  /*
   * 可做條數只「記錄」不「阻擋」（店主 2026-09-24 指示）。
   * 存進 `availableAtOrderTime` 供後台超賣示警用，缺料由店主補做。
   * 下架商品仍然剔除——那是店主不賣了，跟缺料是兩回事。
   */
  const availability = await getAvailableQtyMap(db, ids)

  /* ── 成本快照：一次撈完所有配方，不要逐筆查 ── */
  const recipeRows = await db
    .select({ productId: recipes.productId, qty: recipes.qty, unitCostCents: beads.unitCostCents })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(inArray(recipes.productId, ids))

  const unitCostOf = (productId: number) =>
    calcProductCost(
      recipeRows
        .filter((r) => r.productId === productId)
        .map((r) => ({ beadId: 0, qty: r.qty, unitCostCents: r.unitCostCents })),
    )

  const lines = sellableItems.map((i) => {
    const p = productRows.find((r) => r.id === i.productId)!
    const unitCostCents = unitCostOf(i.productId)
    return {
      productId: p.id,
      productName: p.name,
      unitPriceCents: p.priceCents,
      unitCostCents,
      qty: i.qty,
      availableAtOrderTime: availability.get(p.id) ?? 0,
      lineTotalCents: p.priceCents * i.qty,
      lineCostCents: unitCostCents * i.qty,
    }
  })

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
  const shippingFeeCents = calcShippingFee(subtotalCents, await getShippingRule())
  const costSnapshotCents = lines.reduce((sum, l) => sum + l.lineCostCents, 0)

  /*
   * 訂單編號帶亂碼，撞號的機率極低；真的撞到（唯一索引擋下）就重產一次。
   * D1 沒有互動式交易，這裡只能靠唯一索引保證不重號。
   */
  let orderId: number | null = null
  let orderNo = ''
  for (let attempt = 0; attempt < 3 && orderId === null; attempt++) {
    orderNo = generateOrderNo()
    try {
      const inserted = await db
        .insert(orders)
        .values({
          orderNo,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail || null,
          shippingAddress: input.shippingAddress,
          customerNote: input.customerNote || null,
          subtotalCents,
          shippingFeeCents,
          totalCents: subtotalCents + shippingFeeCents,
          costSnapshotCents,
          status: 'pending_payment',
        })
        .returning({ id: orders.id })
      orderId = inserted[0]?.id ?? null
    } catch (e) {
      /* 撞號就再試一次；其他錯誤沒必要重試，直接往外拋 */
      if (!isUniqueViolation(e) || attempt === 2) throw e
    }
  }
  if (orderId === null) return err('訂單建立失敗，請再試一次。')

  await db.insert(orderItems).values(
    lines.map((l) => ({
      orderId,
      productId: l.productId,
      productName: l.productName,
      unitPriceCents: l.unitPriceCents,
      unitCostCents: l.unitCostCents,
      qty: l.qty,
      availableAtOrderTime: l.availableAtOrderTime,
    })),
  )

  await writeCart({ items: [] })

  /*
   * 寄信擺在最後，而且失敗不擋流程（C-3 明文要求）。
   * 訂單已經存好了，信寄不出去頂多是客人少收一封，店主後台照樣看得到訂單。
   */
  if (input.customerEmail) {
    const result = await sendOrderConfirmation({
      orderNo,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      lines: lines.map((l) => ({
        name: l.productName,
        qty: l.qty,
        lineTotalCents: l.lineTotalCents,
      })),
      subtotalCents,
      shippingFeeCents,
      totalCents: subtotalCents + shippingFeeCents,
      settings: await getStoreSettings(),
      orderUrl: `${await getSiteOrigin()}/order/${orderNo}`,
    })
    if (!result.sent && result.reason === 'failed') {
      console.error(`[order] 訂單 ${orderNo} 確認信寄送失敗：${result.detail ?? ''}`)
    }
  }

  revalidatePath('/cart')
  return ok({ orderNo, totalCents: subtotalCents + shippingFeeCents })
}

/** SQLite 唯一索引衝突，訊息裡會有 UNIQUE constraint */
function isUniqueViolation(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e)
  return /UNIQUE constraint/i.test(message)
}

/**
 * 站台網址，給信裡的連結用。
 * 環境變數優先；沒設定就從請求標頭推，本機開發不必額外設定。
 */
async function getSiteOrigin(): Promise<string> {
  const configured = process.env.SITE_URL
  if (configured) return configured.replace(/\/$/, '')

  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/* ────────────────────────────────────────────────────────────
   轉帳回報
   ──────────────────────────────────────────────────────────── */

/**
 * 客人回報轉帳末五碼。
 * 實際寫入交給凍結的 `reportTransfer()`，這裡只負責驗證與轉譯訊息。
 */
export async function reportTransferAction(formData: FormData): Promise<ActionResult<void>> {
  const dateRaw = String(formData.get('transferredAt') ?? '').trim()
  /* <input type="date"> 給的是當地日期，補 12:00 避免時區把日期推到前一天 */
  const transferredAt = dateRaw ? Math.floor(new Date(`${dateRaw}T12:00:00`).getTime() / 1000) : 0

  const parsed = reportTransferSchema.safeParse({
    orderNo: String(formData.get('orderNo') ?? ''),
    transferLast5: String(formData.get('transferLast5') ?? ''),
    transferredAt,
  })
  if (!parsed.success) return err(zodMessage(parsed.error))

  const db = await getDb()
  const result = await reportTransfer(
    db,
    parsed.data.orderNo,
    parsed.data.transferLast5,
    parsed.data.transferredAt,
  )
  if (!result.ok) return err(result.error)

  revalidatePath(`/order/${parsed.data.orderNo}`)
  return ok(undefined)
}

/* ────────────────────────────────────────────────────────────
   查訂單（成功頁與轉帳說明頁共用）
   ──────────────────────────────────────────────────────────── */

export interface OrderPublicView {
  orderNo: string
  customerName: string
  status: string
  subtotalCents: number
  shippingFeeCents: number
  totalCents: number
  transferLast5: string | null
  items: Array<{ name: string; qty: number; lineTotalCents: number }>
}

/**
 * 依訂單編號取訂單，給客人看的版本。
 *
 * 訂單編號本身帶 4 碼亂數（32 個字元的字集，約 100 萬種組合），猜不到別人的；
 * 這裡也刻意不回傳電話與地址，就算連結被轉貼也不會外洩個資。
 */
export async function getOrderPublicView(orderNo: string): Promise<OrderPublicView | null> {
  const db = await getDb()
  const rows = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1)
  const order = rows[0]
  if (!order) return null

  const items = await db
    .select({
      productName: orderItems.productName,
      unitPriceCents: orderItems.unitPriceCents,
      qty: orderItems.qty,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id))

  return {
    orderNo: order.orderNo,
    customerName: order.customerName,
    status: order.status,
    subtotalCents: order.subtotalCents,
    shippingFeeCents: order.shippingFeeCents,
    totalCents: order.totalCents,
    transferLast5: order.transferLast5,
    items: items.map((i) => ({
      name: i.productName,
      qty: i.qty,
      lineTotalCents: i.unitPriceCents * i.qty,
    })),
  }
}
