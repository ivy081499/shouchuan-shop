/**
 * 本機開發用資料庫連線
 * ⚠️ 凍結檔案，不可修改。
 *
 * 正式環境走 Cloudflare D1；本機直接開 SQLite 檔案，
 * 這樣不需要 Cloudflare 憑證就能開發與測試。
 */

import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '@db/schema'
import type { Db } from './db.ts'

const DB_DIR = '.data'
const DB_PATH = join(process.cwd(), DB_DIR, 'local.sqlite')

/**
 * 取得本機資料庫。
 * 檔案不存在時自動建立並套用 migration 與種子資料。
 */
export async function getLocalDb(): Promise<Db> {
  const isNew = !existsSync(DB_PATH)
  if (isNew) mkdirSync(join(process.cwd(), DB_DIR), { recursive: true })

  const sqlite = new Database(DB_PATH)
  sqlite.pragma('foreign_keys = ON')

  if (isNew) {
    const migration = readFileSync(join(process.cwd(), 'db/migrations/0000_init.sql'), 'utf8')
    sqlite.exec(migration)
    const seed = readFileSync(join(process.cwd(), 'db/seed/seed.sql'), 'utf8')
    sqlite.exec(seed)
  }

  // better-sqlite3 與 D1 的 drizzle 型別在呼叫端是等價的
  return drizzle(sqlite, { schema }) as unknown as Db
}
