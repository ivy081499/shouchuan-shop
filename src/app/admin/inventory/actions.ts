'use server'

import { getDb } from '@/data/db'
import { setItemReceived, setAllItemsReceived, listReceiptItems } from '@/data/beads'
import { revalidatePath } from 'next/cache'

/**
 * 單一品項的收貨勾選。
 *
 * 只記收貨時間，不動庫存——庫存在匯入當下就已經加進去了，
 * 這裡是店主拆包裹時逐項核對用的。
 */
export async function setItemReceivedAction(itemId: number, received: boolean) {
  try {
    const db = await getDb()
    const res = await setItemReceived(db, itemId, received)
    if (!res.ok) return res
    revalidatePath('/admin/inventory')
    return { ok: true as const, changed: res.changed }
  } catch {
    return { ok: false as const, error: '存檔失敗，請再試一次。' }
  }
}

/**
 * 整批確認／取消收貨。
 *
 * 【防呆】已經打過勾的不會被覆蓋成今天的日期，
 * 只有狀態不同的那些才會被改到；回傳實際異動的筆數。
 */
export async function setAllItemsReceivedAction(shipmentId: number, received: boolean) {
  try {
    const db = await getDb()
    const res = await setAllItemsReceived(db, shipmentId, received)
    revalidatePath('/admin/inventory')
    return res
  } catch {
    return { ok: false as const, error: '存檔失敗，請再試一次。' }
  }
}

/** 取某一批的品項清單，展開收貨清單時才載入 */
export async function listReceiptItemsAction(shipmentId: number) {
  try {
    const db = await getDb()
    return { ok: true as const, items: await listReceiptItems(db, shipmentId) }
  } catch {
    return { ok: false as const, error: '讀取失敗，請再試一次。' }
  }
}
