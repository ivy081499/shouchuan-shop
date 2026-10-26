'use server'

import { getDb } from '@/data/db'
import { listReceiptItems, adjustStock, getBeadById } from '@/data/beads'
import { purchaseItems, purchases } from '@db/schema'
import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/**
 * 收貨確認 —— 一次送出整批勾選結果。
 *
 * 【店主 2026-10-26 定案】貨收到才算庫存：
 * 匯入只建立珠子與算成本（錢已經付了），
 * 顆數要等這裡打勾確認收到，才真正加進庫存。
 *
 * 【不變量】庫存變動一律走 adjustStock，由它同步寫庫存流水帳。
 * 這裡不自己改 stockQty。
 */

/**
 * 收貨要入庫，需要知道每一項對應哪顆珠、屬於哪張進貨單——
 * 共用的清單函式（凍結檔）沒有回傳這兩欄，所以這裡自己查。
 */
async function loadReceiptRows(db: Awaited<ReturnType<typeof getDb>>, shipmentId: number) {
  return db
    .select({
      id: purchaseItems.id,
      purchaseId: purchaseItems.purchaseId,
      beadId: purchaseItems.beadId,
      quantity: purchaseItems.quantity,
      beadsPerUnit: purchaseItems.beadsPerUnit,
      receivedAt: purchaseItems.receivedAt,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .where(eq(purchases.shipmentId, shipmentId))
}

/** 這一項收到時要加幾顆／取消時要扣幾顆 */
function qtyOf(item: { quantity: number; beadsPerUnit: number | null }) {
  return item.quantity * (item.beadsPerUnit ?? 0)
}

/**
 * 整批送出：把勾起來的標成已收到並入庫，取消勾的則退回未收到並扣回庫存。
 *
 * 只處理「狀態真的有變」的品項——
 * 已經打過勾的保留原本收貨日期，不會被這次操作覆蓋成今天，
 * 也不會重複入庫（分批到貨時按第二次不該再加一輪）。
 */
export async function saveReceiptAction(shipmentId: number, receivedIds: number[]) {
  try {
    const db = await getDb()
    const items = await loadReceiptRows(db, shipmentId)
    if (items.length === 0) return { ok: false as const, error: '這批沒有品項。' }

    const want = new Set(receivedIds)
    const toReceive = items.filter((i) => i.receivedAt === null && want.has(i.id))
    const toUndo = items.filter((i) => i.receivedAt !== null && !want.has(i.id))

    if (toReceive.length === 0 && toUndo.length === 0) {
      return { ok: true as const, received: 0, undone: 0, addedQty: 0, removedQty: 0 }
    }

    // 先擋掉「退回未收到」會把庫存扣成負數的情形，避免只做一半
    const blocked: string[] = []
    for (const it of toUndo) {
      if (it.beadId === null) continue
      const qty = qtyOf(it)
      if (qty === 0) continue
      const bead = await getBeadById(db, it.beadId)
      if (bead && bead.stockQty - qty < 0) {
        blocked.push(`${bead.name}（庫存只剩 ${bead.stockQty} 顆，不能退回 ${qty} 顆）`)
      }
    }
    if (blocked.length > 0) {
      return {
        ok: false as const,
        error: `這些珠子已經用掉一部分，不能取消收貨：${blocked.join('、')}。先調整庫存再取消。`,
      }
    }

    const now = Math.floor(Date.now() / 1000)
    let addedQty = 0
    let removedQty = 0

    for (const it of toReceive) {
      const qty = qtyOf(it)
      if (it.beadId !== null && qty > 0) {
        const res = await adjustStock(db, it.beadId, qty, 'purchase', it.purchaseId, '收貨入庫')
        if (!res.ok) return { ok: false as const, error: res.error }
        addedQty += qty
      }
      await db
        .update(purchaseItems)
        .set({ receivedAt: now, updatedAt: now })
        .where(eq(purchaseItems.id, it.id))
    }

    for (const it of toUndo) {
      const qty = qtyOf(it)
      if (it.beadId !== null && qty > 0) {
        const res = await adjustStock(db, it.beadId, -qty, 'purchase', it.purchaseId, '取消收貨，退回庫存')
        if (!res.ok) return { ok: false as const, error: res.error }
        removedQty += qty
      }
      await db
        .update(purchaseItems)
        .set({ receivedAt: null, updatedAt: now })
        .where(eq(purchaseItems.id, it.id))
    }

    revalidatePath('/admin/inventory')
    revalidatePath('/admin/shipments')
    revalidatePath('/admin')
    revalidatePath('/admin/reports/purchasing')

    return {
      ok: true as const,
      received: toReceive.length,
      undone: toUndo.length,
      addedQty,
      removedQty,
    }
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
