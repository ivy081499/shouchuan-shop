'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/data/db'
import { settings } from '@db/schema'
import { ok, err, type ActionResult } from '@/contracts/common'
import { SETTING_FIELDS, SETTING_KEYS, type SettingKey } from './fields.ts'

/**
 * 儲存設定。
 *
 * `settings` 是 key-value 表，**新增 key 不需要改 schema**，
 * 所以聯絡方式那三個 key（seed 裡沒有）在這裡第一次儲存時才建立。
 *
 * 只接受 `SETTING_FIELDS` 列出的 key——不讓表單塞進任意 key，
 * 否則打錯字會在資料庫裡留下一個沒人讀的孤兒設定。
 */
export async function saveSettingsAction(formData: FormData): Promise<ActionResult<void>> {
  const updates: Array<{ key: SettingKey; value: string }> = []

  for (const field of SETTING_FIELDS) {
    const raw = formData.get(field.key)
    if (raw === null) continue
    const value = String(raw).trim()

    /* 金額欄位存的是「分」，這裡要把店主輸入的元換算回去 */
    if (field.kind === 'money') {
      if (value === '') {
        updates.push({ key: field.key, value: '0' })
        continue
      }
      const yuan = Number(value)
      if (!Number.isFinite(yuan) || yuan < 0) {
        return err(`「${field.label}」請填 0 或正整數的金額。`)
      }
      updates.push({ key: field.key, value: String(Math.round(yuan * 100)) })
      continue
    }

    if (field.kind === 'digits' && value !== '' && !/^\d+$/.test(value)) {
      return err(`「${field.label}」只能填數字。`)
    }

    updates.push({ key: field.key, value })
  }

  const db = await getDb()
  const now = Math.floor(Date.now() / 1000)

  for (const u of updates) {
    const field = SETTING_FIELDS.find((f) => f.key === u.key)!
    /*
     * upsert：seed 裡沒有的 key（聯絡方式）第一次存就建立。
     * label 一併寫入，之後別的地方讀 settings 也看得懂這個 key 是什麼。
     */
    await db
      .insert(settings)
      .values({ key: u.key, value: u.value, label: field.label, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: u.value, updatedAt: now },
      })
  }

  /* 前台的頁尾、結帳頁、確認信都讀這些值，全部要重新取 */
  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')
  return ok(undefined)
}

/** 讀出目前設定，沒有的 key 回空字串 */
export async function getSettingsMap(): Promise<Record<string, string>> {
  const db = await getDb()
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  for (const key of SETTING_KEYS) map[key] ??= ''
  return map
}
