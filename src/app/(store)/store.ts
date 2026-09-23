/**
 * 前台共用小工具
 *
 * 前台是「展示」不是工具：留白多、線細、顏色只從珠子照片來。
 * 版面邏輯與後台各自獨立（見 docs/05-DESIGN-SYSTEM.md）。
 */

import { getDb, getPublicImageBase } from '@/data/db'
import { settings } from '@db/schema'

/**
 * 商品圖網址。
 * 本機開發沒有 R2 公開網址，檔案實際放在 public/uploads/，要補前綴；
 * 線上則用 R2_PUBLIC_URL 組（圖片走 R2 直出，不經 Worker 轉發）。
 */
export function imageUrl(r2Key: string, base: string): string {
  return base ? `${base.replace(/\/$/, '')}/${r2Key}` : `/uploads/${r2Key}`
}

export { getPublicImageBase }

/** 店鋪設定（店名、標語、匯款資訊都存在 settings 表，不寫死） */
export type StoreSettings = Record<string, string>

export async function getStoreSettings(): Promise<StoreSettings> {
  const db = await getDb()
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
