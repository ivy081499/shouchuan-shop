/**
 * 訂單、購物車的驗證與型別
 * ⚠️ 凍結檔案，不可修改。
 */

import { z } from 'zod'
import { centsSchema, idSchema, last5Schema, phoneSchema } from './common.ts'

/* ────────────────────────────────────────────────────────────
   訂單狀態
   ──────────────────────────────────────────────────────────── */

export const orderStatusSchema = z.enum([
  'pending_payment',
  'payment_reported',
  'paid',
  'shipped',
  'completed',
  'cancelled',
])
export type OrderStatusValue = z.infer<typeof orderStatusSchema>

/** 中文顯示（前後台共用） */
export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  pending_payment: '待付款',
  payment_reported: '待確認',
  paid: '已收款',
  shipped: '已出貨',
  completed: '完成',
  cancelled: '已取消',
}

/**
 * 合法的狀態轉換。
 * 【不變量】狀態不可逆向跳轉；已出貨不能回到待付款。
 * S4 的狀態機守衛必須以此為準，不要自己另寫一套。
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  pending_payment: ['payment_reported', 'paid', 'cancelled'],
  payment_reported: ['paid', 'pending_payment', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
}

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to)
}

/* ────────────────────────────────────────────────────────────
   購物車（存在 cookie，不進資料庫）
   ──────────────────────────────────────────────────────────── */

export const cartItemSchema = z.object({
  productId: idSchema,
  qty: z.number().int().min(1, '數量至少 1 件').max(99, '單項數量上限 99 件'),
})
export type CartItem = z.infer<typeof cartItemSchema>

export const cartSchema = z.object({
  items: z.array(cartItemSchema).max(50, '購物車最多 50 項'),
})
export type Cart = z.infer<typeof cartSchema>

/** cookie 名稱，S2 必須用這個，不要自己取 */
export const CART_COOKIE_NAME = 'sc_cart'

/** 購物車顯示用（加上商品資料後） */
export interface CartLineView {
  productId: number
  slug: string
  name: string
  priceCents: number
  qty: number
  coverImageKey: string | null
  /** 目前可售量，不足時前台要提示 */
  availableQty: number
  lineTotalCents: number
}

export interface CartView {
  lines: CartLineView[]
  subtotalCents: number
  shippingFeeCents: number
  totalCents: number
  /** 有任何一項庫存不足 */
  hasShortage: boolean
}

/* ────────────────────────────────────────────────────────────
   結帳
   ──────────────────────────────────────────────────────────── */

export const checkoutSchema = z.object({
  customerName: z.string().trim().min(1, '請填寫收件人姓名').max(50),
  customerPhone: phoneSchema,
  customerEmail: z.string().trim().email('請填寫正確的 Email').or(z.literal('')).nullable().optional(),
  shippingAddress: z.string().trim().min(6, '請填寫完整的收件地址').max(200),
  customerNote: z.string().trim().max(500).nullable().optional(),
  items: z.array(cartItemSchema).min(1, '購物車是空的'),
})
export type CheckoutInput = z.infer<typeof checkoutSchema>

/** 下單成功後回傳，前台導向轉帳說明頁 */
export interface CheckoutResult {
  orderNo: string
  totalCents: number
}

/* ────────────────────────────────────────────────────────────
   客戶回報轉帳
   ──────────────────────────────────────────────────────────── */

export const reportTransferSchema = z.object({
  orderNo: z.string().trim().min(1, '請填寫訂單編號'),
  transferLast5: last5Schema,
  /** 轉帳時間，Unix 秒 */
  transferredAt: z.number().int().positive('請選擇轉帳時間'),
})
export type ReportTransferInput = z.infer<typeof reportTransferSchema>

/** 訂單查詢：訂單編號 + 手機末三碼，避免單靠編號就能查到別人的訂單 */
export const orderLookupSchema = z.object({
  orderNo: z.string().trim().min(1, '請填寫訂單編號'),
  phoneLast3: z.string().trim().regex(/^\d{3}$/, '請填寫手機號碼末三碼'),
})
export type OrderLookupInput = z.infer<typeof orderLookupSchema>

/* ────────────────────────────────────────────────────────────
   後台操作
   ──────────────────────────────────────────────────────────── */

export const confirmPaymentSchema = z.object({
  orderId: idSchema,
  note: z.string().trim().max(200).optional(),
})
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>

export const shipOrderSchema = z.object({
  orderId: idSchema,
  trackingNo: z.string().trim().min(1, '請填寫物流單號').max(50),
})
export type ShipOrderInput = z.infer<typeof shipOrderSchema>

export const cancelOrderSchema = z.object({
  orderId: idSchema,
  reason: z.string().trim().min(1, '請填寫取消原因').max(200),
})
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>

/* ────────────────────────────────────────────────────────────
   後台檢視
   ──────────────────────────────────────────────────────────── */

export interface OrderListItem {
  id: number
  orderNo: string
  customerName: string
  customerPhone: string
  totalCents: number
  status: OrderStatusValue
  transferLast5: string | null
  createdAt: number
  paidAt: number | null
  /**
   * ★ 超賣警示：目前庫存已不足以完成此訂單。
   * 因為店主選擇「付款才扣庫存」，這是必要的安全網（見 ADR-0004）。
   */
  isOversold: boolean
}

export interface OrderDetailView extends OrderListItem {
  customerEmail: string | null
  shippingAddress: string
  customerNote: string | null
  adminNote: string | null
  subtotalCents: number
  shippingFeeCents: number
  costSnapshotCents: number
  transferReportedAt: number | null
  shippedAt: number | null
  trackingNo: string | null
  stockDeducted: boolean
  items: Array<{
    productId: number | null
    productName: string
    unitPriceCents: number
    unitCostCents: number
    qty: number
    /** 這一項目前是否庫存不足 */
    isShort: boolean
  }>
}

/** 轉帳資訊頁要顯示的內容 */
export interface TransferInstructions {
  orderNo: string
  totalCents: number
  bankName: string
  bankCode: string
  bankAccount: string
  bankHolder: string
  /** 店主設定的提醒文字 */
  notice: string | null
}
