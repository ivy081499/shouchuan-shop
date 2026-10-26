/**
 * 珠子、供應商、進貨的驗證與型別
 * ⚠️ 凍結檔案，不可修改。
 */

import { z } from 'zod'
import { centsSchema, idSchema } from './common.ts'

/* ── 供應商 ── */
export const supplierInputSchema = z.object({
  name: z.string().trim().min(1, '店鋪名稱不可空白').max(100),
  note: z.string().trim().max(500).optional(),
})
export type SupplierInput = z.infer<typeof supplierInputSchema>

/* ── 珠子 ── */
export const beadInputSchema = z.object({
  name: z.string().trim().min(1, '請填寫珠子名稱').max(100),
  /** null = 未分類。清空時存 null 而非空字串，避免篩選器多出空白項 */
  category: z.string().trim().max(50).nullable().optional(),
  sizeMm: z.number().positive('尺寸必須大於 0').max(100).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '顏色請用 #RRGGBB 格式')
    .nullable()
    .optional(),
  /** 顏色分類（彩虹七色＋無彩色），供「我要紅色的料」這種篩選 */
  colorFamily: z
    .enum(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'neutral'])
    .nullable()
    .optional(),
  supplierId: idSchema.nullable().optional(),
  sourceUrl: z.string().url('請填寫正確的網址').nullable().optional(),
  sourceTitle: z.string().trim().max(300).nullable().optional(),
  sourceSpec: z.string().trim().max(200).nullable().optional(),
  unitCostCents: centsSchema.default(0),
  stockQty: z.number().int().min(0, '庫存不可為負數').default(0),
  reorderPoint: z.number().int().min(0, '安全庫存不可為負數').default(0),
  isArchived: z.boolean().default(false),
})
export type BeadInput = z.infer<typeof beadInputSchema>

/** 手動調整庫存 */
export const stockAdjustSchema = z.object({
  beadId: idSchema,
  /** 正數增加、負數減少 */
  deltaQty: z.number().int().refine((n) => n !== 0, '調整數量不可為 0'),
  note: z.string().trim().max(200).optional(),
})
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>

/* ── 進貨匯入 ── */

/** 解析後、待店主確認的一列 */
export const importRowSchema = z.object({
  rawTitle: z.string(),
  rawSpec: z.string().nullable(),
  rawUrl: z.string().nullable(),
  supplierName: z.string().nullable(),
  /** 人民幣分 */
  unitPriceCnyCents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  /** 解析建議值；判讀不出時為預設值 1（ADR-0006 修訂 2026-09-14） */
  beadsPerUnit: z.number().int().min(1),
  countSource: z.enum(['parsed', 'estimated', 'manual']),
  parseReason: z.string(),
})
export type ImportRow = z.infer<typeof importRowSchema>

/**
 * 店主確認後送出的一列。
 * beadsPerUnit 在此為【必填】且 ≥ 1。
 * 顆數的人工確認在雲端試算表完成（ADR-0006 修訂 2026-09-14）——
 * 交給這個 schema 的資料必須是店主已在試算表確認過顆數的版本。
 */
export const confirmedImportRowSchema = z.object({
  rawTitle: z.string(),
  rawSpec: z.string().nullable(),
  rawUrl: z.string().nullable(),
  supplierName: z.string().nullable(),
  unitPriceCnyCents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  beadsPerUnit: z
    .number({ message: '請填寫每件顆數' })
    .int('顆數必須是整數')
    .min(1, '每件至少 1 顆'),
  countSource: z.enum(['parsed', 'estimated', 'manual']),
  /** 對應到既有珠子；null 代表要新建 */
  beadId: idSchema.nullable(),
  /** 新建時的珠子名稱（繁體，由店主填） */
  newBeadName: z.string().trim().max(100).nullable(),
})
export type ConfirmedImportRow = z.infer<typeof confirmedImportRowSchema>

export const confirmImportSchema = z
  .object({
    sourceOrderNo: z.string().trim().nullable(),
    supplierName: z.string().trim().nullable(),
    orderedAt: z.number().int().nullable(),
    /** 匯率放大 100 倍，例：4.5 → 450 */
    fxRateX100: z.number().int().min(1, '請填寫匯率'),
    /** 運費，人民幣分 */
    freightCnyCents: z.number().int().min(0).default(0),
    rows: z.array(confirmedImportRowSchema).min(1, '至少要有一列資料'),
  })
  .refine(
    (v) => v.rows.every((r) => r.beadId !== null || (r.newBeadName && r.newBeadName.length > 0)),
    { message: '每一列都要指定對應的珠子，或填寫新珠子的名稱' },
  )
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>

/** 顏色分類的中文標籤。彩虹七色＋無彩色（白灰黑金銀透明都歸這類） */
export const COLOR_FAMILY_LABEL = {
  red: '紅',
  orange: '橙',
  yellow: '黃',
  green: '綠',
  blue: '藍',
  indigo: '靛',
  violet: '紫',
  neutral: '無彩色',
} as const

export type ColorFamily = keyof typeof COLOR_FAMILY_LABEL
