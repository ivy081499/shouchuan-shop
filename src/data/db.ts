/**
 * 資料庫連線
 * ⚠️ 凍結檔案，不可修改。
 *
 * 兩種執行環境：
 *   - Cloudflare Workers（正式）：用 D1 繫結
 *   - 本機開發：用 better-sqlite3 讀 .wrangler 底下的本機 D1 檔案
 * 呼叫端一律用 getDb()，不必關心跑在哪。
 */

import { drizzle, type AnyD1Database } from 'drizzle-orm/d1'
import * as schema from '@db/schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

let localDb: Db | null = null

/** 是否為本機開發（沒有 Cloudflare Workers 執行環境） */
function isLocalDev(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.CF_PAGES
}

/**
 * 取得資料庫連線。
 * 在 Server Component 或 server action 內呼叫。
 */
export async function getDb(): Promise<Db> {
  if (isLocalDev()) {
    if (localDb) return localDb
    const { getLocalDb } = await import('./db-local.ts')
    localDb = await getLocalDb()
    return localDb
  }

  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const d1 = (env as unknown as { DB: AnyD1Database }).DB
  if (!d1) {
    throw new Error('找不到 D1 繫結 DB，請檢查 wrangler.jsonc 設定')
  }
  return drizzle(d1, { schema })
}

/** R2 公開網址前綴，用來組出商品圖完整網址 */
export async function getPublicImageBase(): Promise<string> {
  if (isLocalDev()) return process.env.R2_PUBLIC_URL ?? ''
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  return (env as unknown as { R2_PUBLIC_URL?: string }).R2_PUBLIC_URL ?? ''
}

/** 把 R2 key 組成完整圖片網址 */
export function imageUrl(base: string, r2Key: string | null): string | null {
  if (!r2Key) return null
  return `${base.replace(/\/$/, '')}/${r2Key.replace(/^\//, '')}`
}
