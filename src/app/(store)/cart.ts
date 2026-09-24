/**
 * 購物車 —— 讀寫 cookie，並組出畫面要的資料
 *
 * 購物車**不進資料庫**（ADR-0012），存在 cookie 裡。客人不必註冊就能買，
 * 而沒有登入身分就沒有地方掛購物車，只能放在客人自己的瀏覽器。
 *
 * cookie 只存 `{ productId, qty }`，名稱與價格一律現查資料庫：
 * 價格如果跟著存進 cookie，客人可以改 cookie 把價格改成 1 元。
 */

import { cookies } from 'next/headers'
import { cartSchema, CART_COOKIE_NAME, type Cart, type CartView } from '@/contracts/order'
import { getDb } from '@/data/db'
import { getAvailableQtyMap } from '@/data/products'
import { products, productImages } from '@db/schema'
import { inArray, asc } from 'drizzle-orm'
import { getStoreSettings } from './store.ts'

const EMPTY: Cart = { items: [] }

/** 購物車 cookie 存活 30 天；客人可能今天看、過幾天才下單 */
const CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * 讀購物車。
 * cookie 是客人可以隨手改的東西，解析失敗或格式不對一律當成空車，不要拋例外——
 * 一個壞掉的 cookie 不該讓整個網站打不開。
 */
export async function readCart(): Promise<Cart> {
  const raw = (await cookies()).get(CART_COOKIE_NAME)?.value
  if (!raw) return EMPTY

  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY
  } catch {
    return EMPTY
  }
}

/**
 * 寫購物車。
 * 只能在 server action 或 route handler 裡呼叫（Next.js 限制，見 cookies 文件）。
 */
export async function writeCart(cart: Cart): Promise<void> {
  const store = await cookies()
  if (cart.items.length === 0) {
    store.delete(CART_COOKIE_NAME)
    return
  }
  store.set(CART_COOKIE_NAME, JSON.stringify(cart), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CART_MAX_AGE_SECONDS,
  })
}

/** 運費規則存在 settings，店主改得動，不寫死 */
export interface ShippingRule {
  feeCents: number
  freeThresholdCents: number
}

export async function getShippingRule(): Promise<ShippingRule> {
  const s = await getStoreSettings()
  return {
    feeCents: toCents(s.shipping_fee_cents, 0),
    freeThresholdCents: toCents(s.free_shipping_threshold_cents, 0),
  }
}

/** settings 是字串表，壞值一律退回預設，不要讓一個錯字讓結帳算不出運費 */
function toCents(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

/**
 * 運費：未達免運門檻才收。
 * 門檻設為 0 代表「一律免運」（0 元的小計也 >= 0）。
 */
export function calcShippingFee(subtotalCents: number, rule: ShippingRule): number {
  if (subtotalCents <= 0) return 0
  return subtotalCents >= rule.freeThresholdCents ? 0 : rule.feeCents
}

/**
 * 把 cookie 裡的 `{productId, qty}` 組成畫面要的完整購物車。
 *
 * 下架或已刪除的商品會被**靜默丟掉**：客人加入購物車之後店主可能就把它下架了，
 * 這時候顯示一個買不到的東西只會讓人困惑。
 */
export async function buildCartView(cart: Cart): Promise<CartView> {
  const rule = await getShippingRule()

  if (cart.items.length === 0) {
    return { lines: [], subtotalCents: 0, shippingFeeCents: 0, totalCents: 0, hasShortage: false }
  }

  const db = await getDb()
  const ids = cart.items.map((i) => i.productId)

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      priceCents: products.priceCents,
      status: products.status,
    })
    .from(products)
    .where(inArray(products.id, ids))

  const sellable = rows.filter((r) => r.status === 'active')
  if (sellable.length === 0) {
    return { lines: [], subtotalCents: 0, shippingFeeCents: 0, totalCents: 0, hasShortage: false }
  }

  const sellableIds = sellable.map((r) => r.id)

  const [images, availability] = await Promise.all([
    db
      .select({ productId: productImages.productId, r2Key: productImages.r2Key })
      .from(productImages)
      .where(inArray(productImages.productId, sellableIds))
      .orderBy(asc(productImages.sortOrder)),
    getAvailableQtyMap(db, sellableIds),
  ])

  /* 依 cookie 的順序排，客人先加的先出現 */
  const lines = cart.items.flatMap((item) => {
    const p = sellable.find((r) => r.id === item.productId)
    if (!p) return []
    const availableQty = availability.get(p.id) ?? 0
    return [
      {
        productId: p.id,
        slug: p.slug,
        name: p.name,
        priceCents: p.priceCents,
        qty: item.qty,
        coverImageKey: images.find((i) => i.productId === p.id)?.r2Key ?? null,
        availableQty,
        lineTotalCents: p.priceCents * item.qty,
      },
    ]
  })

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
  const shippingFeeCents = calcShippingFee(subtotalCents, rule)

  return {
    lines,
    subtotalCents,
    shippingFeeCents,
    totalCents: subtotalCents + shippingFeeCents,
    hasShortage: lines.some((l) => l.qty > l.availableQty),
  }
}

/** 購物車件數，版面右上角的數字用 */
export function cartCount(cart: Cart): number {
  return cart.items.reduce((sum, i) => sum + i.qty, 0)
}
