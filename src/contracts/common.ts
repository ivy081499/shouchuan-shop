/**
 * 共用驗證與型別
 *
 * ⚠️ 此目錄在 Phase 0 後【凍結】。工作流可讀可用，不可修改。
 * 需要新增欄位請在 docs/tasks/BOARD.md 的「SCHEMA 變更請求」登記。
 */

import { z } from 'zod'

/* ────────────────────────────────────────────────────────────
   伺服器動作的統一回傳形狀
   所有 server action 都回傳這個，不要用 throw 當流程控制。
   error 是要直接顯示給使用者看的繁中訊息。
   ──────────────────────────────────────────────────────────── */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function err(error: string): ActionResult<never> {
  return { ok: false, error }
}

/** 把 zod 的錯誤轉成給使用者看的單一句子 */
export function zodMessage(e: z.ZodError): string {
  const first = e.issues[0]
  return first ? first.message : '輸入的資料有誤，請檢查後再試一次。'
}

/* ────────────────────────────────────────────────────────────
   共用欄位驗證
   ──────────────────────────────────────────────────────────── */

/** 金額：整數新台幣分，不可為負 */
export const centsSchema = z
  .number({ message: '金額必須是數字' })
  .int('金額必須是整數（單位：分）')
  .min(0, '金額不可為負數')

/** 顆數：正整數 */
export const qtySchema = z
  .number({ message: '數量必須是數字' })
  .int('數量必須是整數顆')
  .min(1, '數量至少為 1 顆')

/** 台灣手機號碼：09 開頭共 10 碼 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^09\d{8}$/, '請填寫正確的手機號碼，例如 0912345678')

/** 網址代稱：小寫英數與連字號 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, '網址代稱不可空白')
  .max(64, '網址代稱過長')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '網址代稱只能用小寫英文、數字與連字號')

/** 轉帳帳號末五碼 */
export const last5Schema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, '請填寫轉帳帳號的末五碼（5 位數字）')

/** 資料庫 id */
export const idSchema = z.number().int().positive()

/** 分頁 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
})
export type Pagination = z.infer<typeof paginationSchema>
