'use server'

import { getDb } from '@/data/db'
import { upsertSupplierByName, findBeadBySource, createBead, adjustStock } from '@/data/beads'
import { calcPurchaseCosts } from '@/lib/costing'
import { parseTaobaoXlsx, type ParsedPurchaseRow } from '@/lib/xlsx-import'
import { purchases, purchaseItems, beads } from '@db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/** 解析上傳的 xlsx，回傳待確認的列（不寫入資料庫） */
export async function parseUpload(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { ok: false as const, error: '請選擇要匯入的 xlsx 檔案。' }
  }
  try {
    const rows = await parseTaobaoXlsx(await file.arrayBuffer())
    if (rows.length === 0) {
      return {
        ok: false as const,
        error: '這個檔案裡找不到商品資料。請確認是淘寶「我的訂單」匯出的 xlsx。',
      }
    }
    return { ok: true as const, rows }
  } catch {
    return { ok: false as const, error: '檔案讀不開，請確認是 .xlsx 格式且沒有損壞。' }
  }
}

export interface ConfirmRow {
  index: number
  /** 店主確認後的每件顆數；null 代表這列略過不匯入 */
  beadsPerUnit: number | null
  /** 店主填的繁體名稱 */
  beadName: string
  skip: boolean
}

/**
 * 確認匯入。
 * 【ADR-0006】只有經過這一步的資料才會寫入庫存與成本。
 */
export async function confirmImport(
  rows: ParsedPurchaseRow[],
  confirms: ConfirmRow[],
  fxRateX100: number,
) {
  const db = await getDb()

  const use = confirms
    .filter((c) => !c.skip && c.beadsPerUnit && c.beadsPerUnit > 0)
    .map((c) => ({ confirm: c, row: rows[c.index] }))
    .filter((x) => x.row)

  if (use.length === 0) {
    return { ok: false as const, error: '沒有可匯入的資料。請至少確認一列的顆數。' }
  }

  // 依淘寶訂單號分組，運費要按訂單攤提
  const byOrder = new Map<string, typeof use>()
  for (const u of use) {
    const key = u.row.sourceOrderNo || 'unknown'
    const arr = byOrder.get(key) ?? []
    arr.push(u)
    byOrder.set(key, arr)
  }

  let createdBeads = 0
  let updatedBeads = 0
  let totalQty = 0

  for (const [orderNo, group] of byOrder) {
    const first = group[0].row
    const supplierId = first.supplierName
      ? await upsertSupplierByName(db, first.supplierName)
      : null

    // 同訂單的運費只算一次
    const freight = first.freightCnyCents

    const costs = calcPurchaseCosts(
      group.map((g) => ({
        unitPriceCnyCents: g.row.unitPriceCnyCents,
        quantity: g.row.quantity,
        beadsPerUnit: g.confirm.beadsPerUnit as number,
      })),
      freight,
      fxRateX100,
    )

    const inserted = await db
      .insert(purchases)
      .values({
        sourceOrderNo: orderNo === 'unknown' ? null : orderNo,
        supplierId,
        orderedAt: first.orderedAt,
        fxRateX100,
        freightCnyCents: freight,
        status: 'confirmed',
      })
      .returning({ id: purchases.id })
    const purchaseId = inserted[0].id

    for (let i = 0; i < group.length; i++) {
      const { row, confirm } = group[i]
      const cost = costs[i]

      // 同一淘寶商品 + 同規格視為同一顆珠
      let bead = await findBeadBySource(db, row.rawUrl || null, row.rawSpec || null)
      if (!bead) {
        bead = await createBead(db, {
          name: confirm.beadName || row.rawTitle.slice(0, 40),
          sizeMm: row.sizeMm,
          supplierId,
          sourceUrl: row.rawUrl || null,
          sourceTitle: row.rawTitle,
          sourceSpec: row.rawSpec || null,
          unitCostCents: cost.unitCostCents,
          stockQty: 0,
          reorderPoint: 0,
          isArchived: false,
        })
        createdBeads++
      } else {
        // 既有珠子：更新為最新成本
        await db
          .update(beads)
          .set({ unitCostCents: cost.unitCostCents, updatedAt: Math.floor(Date.now() / 1000) })
          .where(eq(beads.id, bead.id))
        updatedBeads++
      }

      await db.insert(purchaseItems).values({
        purchaseId,
        beadId: bead.id,
        rawTitle: row.rawTitle,
        rawSpec: row.rawSpec || null,
        rawUrl: row.rawUrl || null,
        unitPriceCnyCents: row.unitPriceCnyCents,
        quantity: row.quantity,
        beadsPerUnit: confirm.beadsPerUnit,
        countSource: row.countSource,
        freightShareCnyCents: cost.freightShareCnyCents,
        computedUnitCostCents: cost.unitCostCents,
      })

      // 進貨入庫，並寫庫存流水帳
      await adjustStock(db, bead.id, cost.totalBeads, 'purchase', purchaseId, `進貨 ${orderNo}`)
      totalQty += cost.totalBeads
    }
  }

  revalidatePath('/admin/beads')
  revalidatePath('/admin')
  revalidatePath('/admin/reports/purchasing')

  return {
    ok: true as const,
    createdBeads,
    updatedBeads,
    totalQty,
    orders: byOrder.size,
  }
}
