'use server'

import { getDb } from '@/data/db'
import { createProduct, updateProduct, saveRecipe } from '@/data/products'
import { productInputSchema, recipeLineSchema } from '@/contracts/product'
import { zodMessage } from '@/contracts/common'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

export async function createProductAction(input: unknown) {
  const parsed = productInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) }

  const db = await getDb()
  try {
    const p = await createProduct(db, parsed.data)
    revalidatePath('/admin/products')
    return { ok: true as const, id: p.id }
  } catch {
    return { ok: false as const, error: '網址代稱重複了，換一個試試。' }
  }
}

export async function updateProductAction(id: number, input: unknown) {
  const parsed = productInputSchema.partial().safeParse(input)
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) }

  const db = await getDb()
  await updateProduct(db, id, parsed.data)
  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${id}`)
  return { ok: true as const }
}

export async function saveRecipeAction(productId: number, lines: unknown) {
  const parsed = z.array(recipeLineSchema).safeParse(lines)
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) }

  const seen = new Set<number>()
  for (const l of parsed.data) {
    if (seen.has(l.beadId)) {
      return { ok: false as const, error: '同一顆珠只能出現一次，要用幾顆請寫在數量欄。' }
    }
    seen.add(l.beadId)
  }

  const db = await getDb()
  await saveRecipe(db, productId, parsed.data)
  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${productId}`)
  revalidatePath('/admin/reports/purchasing')
  return { ok: true as const }
}
