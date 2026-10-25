'use server'

import { getDb } from '@/data/db'
import { setShipmentReceived } from '@/data/beads'
import { revalidatePath } from 'next/cache'

/** 勾選／取消「已收到貨」。只寫到貨時間，不動庫存。 */
export async function setShipmentReceivedAction(shipmentId: number, received: boolean) {
  try {
    const db = await getDb()
    await setShipmentReceived(db, shipmentId, received)
    revalidatePath('/admin/inventory')
    return { ok: true as const }
  } catch {
    return { ok: false as const, error: '存檔失敗，請再試一次。' }
  }
}
