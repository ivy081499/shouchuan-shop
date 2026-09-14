'use server'

import { getDb } from '@/data/db'
import { setBeadImage, updateBead, adjustStock, listCategories, getBeadById } from '@/data/beads'
import { beadInputSchema } from '@/contracts/bead'
import { revalidatePath } from 'next/cache'

/** 可接受的圖片格式與大小上限 */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

function isLocalDev(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.CF_PAGES
}

/**
 * 上傳珠子圖片。
 *
 * 兩種執行環境（與 src/data/db.ts 同樣的分歧）：
 *   - 本機開發：寫進 public/uploads/beads/，用 /uploads/... 當網址
 *   - Cloudflare Workers：寫進 R2，用 R2_PUBLIC_URL 組出網址
 * Workers 沒有 fs，故本機分支必須動態 import。
 */
export async function uploadBeadImage(beadId: number, formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: '請選擇圖片檔案。' }
  }
  if (!ALLOWED.has(file.type)) {
    return { ok: false as const, error: '只接受 JPG、PNG、WebP 格式。' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false as const, error: `圖片不能超過 ${MAX_BYTES / 1024 / 1024}MB。` }
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const key = `beads/${beadId}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  let url: string
  if (isLocalDev()) {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const dir = join(process.cwd(), 'public', 'uploads', 'beads')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${beadId}.${ext}`), bytes)
    // 加上時間戳讓瀏覽器不吃舊快取（同一顆珠換圖時檔名相同）
    url = `/uploads/${key}?v=${Date.now()}`
  } else {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    // 不依賴 Workers 全域型別宣告，只描述用得到的方法
    type Bucket = { put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
    const bucket = (env as unknown as { IMAGES?: Bucket }).IMAGES
    if (!bucket) return { ok: false as const, error: '找不到 R2 繫結 IMAGES，請檢查 wrangler.jsonc。' }
    await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } })
    const base = (env as unknown as { R2_PUBLIC_URL?: string }).R2_PUBLIC_URL ?? ''
    url = `${base.replace(/\/$/, '')}/${key}`
  }

  const db = await getDb()
  await setBeadImage(db, beadId, url)
  revalidatePath('/admin/inventory')
  return { ok: true as const, url }
}

/** 移除珠子圖片（只清資料庫欄位，檔案留著） */
export async function clearBeadImage(beadId: number) {
  const db = await getDb()
  await setBeadImage(db, beadId, null)
  revalidatePath('/admin/inventory')
  return { ok: true as const }
}

/* ────────────────────────────────────────────────────────────
   珠子欄位編輯
   ──────────────────────────────────────────────────────────── */

/** 店主可改的欄位。成本與庫存不在此列——成本由進貨算出，庫存要走調整才有流水帳 */
const editableSchema = beadInputSchema.pick({
  name: true,
  category: true,
  sizeMm: true,
  reorderPoint: true,
}).partial()

export type BeadPatch = {
  name?: string
  category?: string
  sizeMm?: number | null
  reorderPoint?: number
}

/** 更新珠子的可編輯欄位 */
export async function updateBeadFields(beadId: number, patch: BeadPatch) {
  const parsed = editableSchema.safeParse(patch)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? '輸入格式不正確。' }
  }
  const db = await getDb()
  const row = await updateBead(db, beadId, parsed.data)
  if (!row) return { ok: false as const, error: '找不到這顆珠子。' }
  revalidatePath('/admin/inventory')
  return { ok: true as const }
}

/**
 * 設定庫存為指定數量（盤點用）。
 *
 * 店主填的是「現在實際有幾顆」，不是「增減多少」——
 * 數完珠子直接填數字比心算差額直覺。
 * 內部仍轉成差額走 adjustStock，確保每次異動都寫 stock_ledger（資料模型不變量）。
 */
export async function setBeadStock(beadId: number, targetQty: number, note?: string) {
  if (!Number.isInteger(targetQty) || targetQty < 0) {
    return { ok: false as const, error: '庫存要填 0 或正整數。' }
  }
  const db = await getDb()
  const bead = await getBeadById(db, beadId)
  if (!bead) return { ok: false as const, error: '找不到這顆珠子。' }

  // 用資料庫當下的值算差額，不用畫面上的舊值——
  // 兩者之間庫存可能已被別處改動（例如訂單付款扣庫存）
  const delta = targetQty - bead.stockQty
  if (delta === 0) return { ok: true as const, stockQty: targetQty }

  try {
    await adjustStock(db, beadId, delta, 'manual_adjust', null, note?.trim() || '後台手動盤點')
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : '調整失敗。' }
  }
  revalidatePath('/admin/inventory')
  revalidatePath('/admin')
  return { ok: true as const, stockQty: targetQty }
}

/**
 * 封存珠子（不是刪除）。
 * 歷史配方仍需保留這筆資料，故外鍵為 restrict，只能封存。
 */
export async function archiveBead(beadId: number, archived: boolean) {
  const db = await getDb()
  // 被配方使用中的珠子照樣可封存——封存只代表不再進貨，不影響既有配方
  await updateBead(db, beadId, { isArchived: archived })
  revalidatePath('/admin/inventory')
  return { ok: true as const }
}

/** 現有分類清單，供編輯時的下拉選單 */
export async function getCategories() {
  const db = await getDb()
  return listCategories(db)
}
