/**
 * 報表的型別
 * ⚠️ 凍結檔案，不可修改。
 *
 * 報表類型在此預先登記完畢，S5 不需要改動此檔即可實作。
 */

import { z } from 'zod'

export const reportTypeSchema = z.enum(['purchasing', 'margin', 'inventory'])
export type ReportType = z.infer<typeof reportTypeSchema>

export const REPORT_LABEL: Record<ReportType, string> = {
  purchasing: '採購需求',
  margin: '毛利分析',
  inventory: '庫存概況',
}

/* ────────────────────────────────────────────────────────────
   採購需求表（店主最重要的報表）

   「依目前客戶下單的手串，我應該要有多少珠、還要叫多少貨、店家是誰」
   ──────────────────────────────────────────────────────────── */

export const purchasingQuerySchema = z.object({
  /**
   * 是否把「還沒轉帳」的訂單也算進需求。
   * 預設 false —— 未付款的訂單可能會取消，先算進去容易多叫貨。
   */
  includeUnpaid: z.boolean().default(false),
})
export type PurchasingQuery = z.infer<typeof purchasingQuerySchema>

export interface PurchasingLine {
  beadId: number
  beadName: string
  sizeMm: number | null
  /** 未出貨訂單展開配方後的總需求顆數 */
  requiredQty: number
  stockQty: number
  reorderPoint: number
  /** 待採購 = 需求 + 安全庫存 − 現有庫存，最小為 0 */
  shortageQty: number
  unitCostCents: number
  /** 預估這次要花多少錢 */
  estimatedCostCents: number
  sourceUrl: string | null
  /** 淘寶原始規格，方便店主照著買同一款 */
  sourceSpec: string | null
}

/** 依店鋪分組，店主可以一家一家下單 */
export interface PurchasingBySupplier {
  supplierId: number | null
  supplierName: string
  lines: PurchasingLine[]
  subtotalCostCents: number
}

export interface PurchasingReport {
  groups: PurchasingBySupplier[]
  totalEstimatedCostCents: number
  /** 納入計算的訂單數 */
  orderCount: number
  includeUnpaid: boolean
}

/* ────────────────────────────────────────────────────────────
   毛利表
   ──────────────────────────────────────────────────────────── */

export const marginQuerySchema = z.object({
  /** Unix 秒；不填則不限 */
  from: z.number().int().nullable().optional(),
  to: z.number().int().nullable().optional(),
})
export type MarginQuery = z.infer<typeof marginQuerySchema>

export interface ProductMarginLine {
  productId: number
  productName: string
  soldQty: number
  revenueCents: number
  /** 用訂單當下的成本快照，不是現在的珠價 */
  costCents: number
  profitCents: number
  marginRate: number
}

export interface MarginReport {
  lines: ProductMarginLine[]
  totalRevenueCents: number
  totalCostCents: number
  totalProfitCents: number
  overallMarginRate: number
  orderCount: number
}

/* ────────────────────────────────────────────────────────────
   庫存概況
   ──────────────────────────────────────────────────────────── */

export interface InventoryLine {
  beadId: number
  beadName: string
  category: string | null
  sizeMm: number | null
  stockQty: number
  reorderPoint: number
  unitCostCents: number
  /** 這顆珠目前壓了多少錢的庫存 */
  stockValueCents: number
  /** 低於安全庫存 */
  isLow: boolean
  supplierName: string | null
}

export interface InventoryReport {
  lines: InventoryLine[]
  totalStockValueCents: number
  lowStockCount: number
}

/** 某條手串還能做幾條 */
export interface BuildableLine {
  productId: number
  productName: string
  buildableQty: number
  /** 卡住產量的那顆珠（木桶效應的最短板） */
  limitingBeadName: string | null
}
