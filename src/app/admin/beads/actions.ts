'use server'

import { getDb } from '@/data/db'
import { setBeadImage } from '@/data/beads'
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
  revalidatePath('/admin/beads')
  return { ok: true as const, url }
}

/** 移除珠子圖片（只清資料庫欄位，檔案留著） */
export async function clearBeadImage(beadId: number) {
  const db = await getDb()
  await setBeadImage(db, beadId, null)
  revalidatePath('/admin/beads')
  return { ok: true as const }
}
