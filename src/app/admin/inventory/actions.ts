'use server'

import { getDb } from '@/data/db'
import { listReceiptItems, adjustStock, getBeadById } from '@/data/beads'
import { calcMovingAverageCost } from '@/lib/costing'
import { purchaseItems, purchases, beads } from '@db/schema'
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
      /** 這一列的單顆成本，匯入時就算好且不再變動——收貨重算平均的依據 */
      unitCostCents: purchaseItems.computedUnitCostCents,
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
 * 取消收貨後，這顆珠的平均成本該是多少。
 *
 * 【為什麼不從平均值反推】
 * 平均成本是四捨五入過的整數（分），反推要再除一次，
 * 會留下一分左右的殘差——帳目數字不該因為按錯又取消就悄悄變動。
 *
 * 改成用「還留在手上的批次」重新算一次：
 * 拿這顆珠所有【已收貨】的進貨列（排除正要取消的那幾列），
 * 用各列自己的單顆成本與顆數重算加權平均，結果與沒收過那批完全一致。
 *
 * 算不出來時（沒有任何已收貨紀錄，例如庫存全來自手動盤點）
 * 回傳 null，交給呼叫端保留原成本不動——
 * 寧可不動，也不要用猜的數字覆蓋店主的帳。
 */
async function costWithoutItems(
  db: Awaited<ReturnType<typeof getDb>>,
  beadId: number,
  excludeItemIds: number[],
): Promise<number | null> {
  const rows = await db
    .select({
      id: purchaseItems.id,
      quantity: purchaseItems.quantity,
      beadsPerUnit: purchaseItems.beadsPerUnit,
      unitCostCents: purchaseItems.computedUnitCostCents,
      receivedAt: purchaseItems.receivedAt,
    })
    .from(purchaseItems)
    .where(eq(purchaseItems.beadId, beadId))

  // 只算「已經收到、而且這次不取消」的批次——沒到手的貨不該影響成本
  const kept = rows.filter(
    (r) =>
      !excludeItemIds.includes(r.id) &&
      r.receivedAt !== null &&
      r.unitCostCents !== null &&
      qtyOf(r) > 0,
  )
  if (kept.length === 0) return null

  const totalQty = kept.reduce((sum, r) => sum + qtyOf(r), 0)
  if (totalQty <= 0) return null
  const totalValue = kept.reduce((sum, r) => sum + qtyOf(r) * (r.unitCostCents as number), 0)
  return Math.round(totalValue / totalQty)
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
    // 同一顆珠可能有好幾列同時取消，重算成本時要一次全部排除
    const undoIds = toUndo.map((i) => i.id)
    let addedQty = 0
    let removedQty = 0

    for (const it of toReceive) {
      const qty = qtyOf(it)
      if (it.beadId !== null && qty > 0) {
        /*
         * 【順序重要】先算成本再入庫。
         * 移動加權平均的分母是「這批進來之前」的庫存，
         * 先入庫會讓本批顆數被算兩次。
         */
        const bead = await getBeadById(db, it.beadId)
        if (bead && it.unitCostCents !== null) {
          const avg = calcMovingAverageCost(
            bead.stockQty,
            bead.unitCostCents,
            qty,
            it.unitCostCents * qty,
          )
          await db
            .update(beads)
            .set({ unitCostCents: avg, updatedAt: now })
            .where(eq(beads.id, it.beadId))
        }

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
        /* 取消：用剩下還在手上的批次重算成本，算不出來就保留原值不動 */
        const restored = await costWithoutItems(db, it.beadId, undoIds)
        if (restored !== null) {
          await db
            .update(beads)
            .set({ unitCostCents: restored, updatedAt: now })
            .where(eq(beads.id, it.beadId))
        }

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
