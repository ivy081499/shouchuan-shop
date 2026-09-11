/**
 * 資料庫連線
 * ⚠️ 凍結檔案，不可修改。
 */

import { drizzle, type AnyD1Database } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as schema from '@db/schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

/**
 * 取得資料庫連線。
 * 在 Server Component 或 server action 內呼叫。
 */
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true })
  const d1 = (env as unknown as { DB: AnyD1Database }).DB
  if (!d1) {
    throw new Error('找不到 D1 繫結 DB，請檢查 wrangler.jsonc 設定')
  }
  return drizzle(d1, { schema })
}

/** R2 公開網址前綴，用來組出商品圖完整網址 */
export async function getPublicImageBase(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true })
  const base = (env as unknown as { R2_PUBLIC_URL?: string }).R2_PUBLIC_URL
  return base ?? ''
}

/** 把 R2 key 組成完整圖片網址 */
export function imageUrl(base: string, r2Key: string | null): string | null {
  if (!r2Key) return null
  return `${base.replace(/\/$/, '')}/${r2Key.replace(/^\//, '')}`
}
