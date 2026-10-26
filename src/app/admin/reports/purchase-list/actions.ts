'use server'

import { getDb } from '@/data/db'
import {
  createPurchaseList,
  updatePurchaseList,
  deletePurchaseList,
  setItemQty,
  fillShortages,
} from '@/data/purchase-lists'
import { revalidatePath } from 'next/cache'

const PAGE = '/admin/reports/purchase-list'

export async function createListAction(name: string, note?: string) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false as const, error: '清單要有名稱' }

  const db = await getDb()
  const list = await createPurchaseList(db, trimmed, note?.trim() || null)
  revalidatePath(PAGE)
  return { ok: true as const, listId: list.id }
}

export async function renameListAction(listId: number, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false as const, error: '清單要有名稱' }

  const db = await getDb()
  await updatePurchaseList(db, listId, { name: trimmed })
  revalidatePath(PAGE)
  return { ok: true as const }
}

/**
 * 標記已下單。
 * 標記後清單仍可編輯——店主可能分兩次下單，或下完才發現漏了。
 */
export async function markOrderedAction(listId: number) {
  const db = await getDb()
  await updatePurchaseList(db, listId, { status: 'ordered' })
  revalidatePath(PAGE)
  return { ok: true as const }
}

export async function reopenListAction(listId: number) {
  const db = await getDb()
  await updatePurchaseList(db, listId, { status: 'draft' })
  revalidatePath(PAGE)
  return { ok: true as const }
}

export async function deleteListAction(listId: number) {
  const db = await getDb()
  await deletePurchaseList(db, listId)
  revalidatePath(PAGE)
  return { ok: true as const }
}

/**
 * 改某顆珠要叫的數量。
 * qty 傳 0 等於取消勾選，資料層會把那列刪掉。
 */
export async function setQtyAction(listId: number, beadId: number, qty: number) {
  if (!Number.isInteger(qty) || qty < 0) {
    return { ok: false as const, error: '數量要是 0 或正整數' }
  }

  const db = await getDb()
  await setItemQty(db, listId, beadId, qty)
  revalidatePath(PAGE)
  return { ok: true as const }
}

export async function fillShortagesAction(listId: number) {
  const db = await getDb()
  const { filled } = await fillShortages(db, listId)
  revalidatePath(PAGE)
  return { ok: true as const, filled }
}
