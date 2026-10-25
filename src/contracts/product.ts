/**
 * 手串商品與配方的驗證與型別
 * ⚠️ 凍結檔案，不可修改。
 */

import { z } from 'zod'
import { centsSchema, idSchema, qtySchema, slugSchema } from './common.ts'

export const productStatusSchema = z.enum(['draft', 'active', 'sold_out', 'archived'])
export type ProductStatusValue = z.infer<typeof productStatusSchema>

/** 狀態的中文顯示（前後台共用，不要各自寫一份） */
export const PRODUCT_STATUS_LABEL: Record<ProductStatusValue, string> = {
  draft: '草稿',
  active: '已上架',
  sold_out: '已售完',
  archived: '已下架',
}

export const productInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, '請填寫手串名稱').max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  /**
   * 售價。0 代表「還沒定價」，草稿階段允許——
   * 店主要先選完材料看到成本，才決定賣多少，不該在建立時就被擋下。
   * 上架仍必須填：`checkReadyToPublish()` 會擋下 price <= 0。
   */
  priceCents: centsSchema,
  wristSizeCm: z.number().positive('手圍必須大於 0').max(30).nullable().optional(),
  manualStock: z.number().int().min(0).nullable().optional(),
  status: productStatusSchema.default('draft'),
  sortOrder: z.number().int().default(0),
})
export type ProductInput = z.infer<typeof productInputSchema>

/* ── 配方 ── */

export const recipeLineSchema = z.object({
  beadId: idSchema,
  qty: qtySchema,
  position: z.number().int().min(0).default(0),
})
export type RecipeLineInput = z.infer<typeof recipeLineSchema>

export const recipeInputSchema = z.object({
  productId: idSchema,
  lines: z.array(recipeLineSchema),
}).refine(
  (v) => new Set(v.lines.map((l) => l.beadId)).size === v.lines.length,
  { message: '同一顆珠只能出現一次，要用幾顆請寫在數量欄' },
)
export type RecipeInput = z.infer<typeof recipeInputSchema>

/* ── 商品圖 ── */

export const productImageInputSchema = z.object({
  productId: idSchema,
  r2Key: z.string().trim().min(1),
  alt: z.string().trim().max(200).nullable().optional(),
  sortOrder: z.number().int().default(0),
})
export type ProductImageInput = z.infer<typeof productImageInputSchema>

/* ── 前台顯示用的組合型別 ── */

/** 配方透視（signature 元素）需要的單顆珠資料 */
export interface RecipeBeadView {
  beadId: number
  name: string
  sizeMm: number | null
  colorHex: string | null
  qty: number
  position: number
  category: string | null
}

/** 商品詳情頁的完整資料 */
export interface ProductDetailView {
  id: number
  slug: string
  name: string
  description: string | null
  priceCents: number
  wristSizeCm: number | null
  status: ProductStatusValue
  images: Array<{ r2Key: string; alt: string | null }>
  /** 依 position 排序，供配方透視繪製 */
  recipe: RecipeBeadView[]
  /** 目前可售數量 */
  availableQty: number
}

/** 商品列表頁的精簡資料 */
export interface ProductListItem {
  id: number
  slug: string
  name: string
  priceCents: number
  status: ProductStatusValue
  coverImageKey: string | null
  availableQty: number
}
