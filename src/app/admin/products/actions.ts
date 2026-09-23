'use server'

import { getDb } from '@/data/db'
import { createProduct, updateProduct, saveRecipe, addProductImage, deleteProductImage, getProductById } from '@/data/products'
import { productInputSchema, recipeLineSchema } from '@/contracts/product'
import { zodMessage } from '@/contracts/common'
import { productImages, recipes } from '@db/schema'
import { eq, asc } from 'drizzle-orm'
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

/**
 * 上架前檢查：缺東西就擋下，並說清楚缺什麼。
 *
 * 只在「要改成已上架」時檢查。草稿與下架不限制——
 * 東西還沒備齊本來就該能先存著。
 */
async function checkReadyToPublish(
  db: Awaited<ReturnType<typeof getDb>>,
  id: number,
  priceCents: number | undefined,
): Promise<string | null> {
  const missing: string[] = []

  const [imgs, lines, current] = await Promise.all([
    db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, id)).limit(1),
    db.select({ id: recipes.id }).from(recipes).where(eq(recipes.productId, id)).limit(1),
    getProductById(db, id),
  ])

  if (imgs.length === 0) missing.push('還沒有照片，客人看不到商品長怎樣')
  if (lines.length === 0) missing.push('還沒設定用哪些珠子，算不出成本')

  // 這次沒送 priceCents 就看資料庫現值
  const price = priceCents ?? current?.priceCents ?? 0
  if (price <= 0) missing.push('售價還沒填')

  if (missing.length === 0) return null
  return `還不能上架：${missing.join('；')}。`
}

export async function updateProductAction(id: number, input: unknown) {
  const parsed = productInputSchema.partial().safeParse(input)
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) }

  const db = await getDb()

  if (parsed.data.status === 'active') {
    const problem = await checkReadyToPublish(db, id, parsed.data.priceCents)
    if (problem) return { ok: false as const, error: problem }
  }

  try {
    await updateProduct(db, id, parsed.data)
  } catch {
    // slug 有唯一索引，重複時 D1 會丟錯
    return { ok: false as const, error: '網址代稱重複了，換一個試試。' }
  }

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

/* ────────────────────────────────────────────────────────────
   商品照片
   ──────────────────────────────────────────────────────────── */

/** 可接受的圖片格式與大小上限（與珠子圖一致） */
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** 與珠子圖同樣的環境分歧：本機有 fs，Workers 沒有 */
function isLocalDev(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.CF_PAGES
}

function extOf(type: string): string {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
}

/**
 * 上傳商品照片，可一次選多張。
 *
 * 命名規則：`products/{商品id}-{序號}.{副檔名}`，序號自 1 起算。
 * 新照片接在現有最大序號之後；**同檔名直接覆寫**（店主指定的行為）。
 *
 * 本機寫進 public/uploads/products/，Workers 寫進 R2。
 */
export async function uploadProductImages(productId: number, formData: FormData) {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false as const, error: '請選擇圖片檔案。' }

  // 先全部檢查過再寫檔，避免前幾張寫進去、後面才失敗
  for (const file of files) {
    if (!ALLOWED_IMAGE.has(file.type)) {
      return { ok: false as const, error: `「${file.name}」格式不支援，只接受 JPG、PNG、WebP。` }
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false as const, error: `「${file.name}」超過 ${MAX_IMAGE_BYTES / 1024 / 1024}MB。` }
    }
  }

  const db = await getDb()
  const existing = await db
    .select({ sortOrder: productImages.sortOrder })
    .from(productImages)
    .where(eq(productImages.productId, productId))
  let nextIndex = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1

  for (const file of files) {
    const ext = extOf(file.type)
    const name = `${productId}-${nextIndex}.${ext}`
    const key = `products/${name}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    if (isLocalDev()) {
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const dir = join(process.cwd(), 'public', 'uploads', 'products')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, name), bytes)
    } else {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare')
      const { env } = await getCloudflareContext({ async: true })
      type Bucket = { put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
      const bucket = (env as unknown as { IMAGES?: Bucket }).IMAGES
      if (!bucket) return { ok: false as const, error: '找不到 R2 繫結 IMAGES，請檢查 wrangler.jsonc。' }
      await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } })
    }

    await addProductImage(db, productId, key, undefined, nextIndex)
    nextIndex += 1
  }

  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${productId}`)
  return { ok: true as const, count: files.length }
}

/** 取這條手串目前的照片，依序號排序 */
export async function listProductImagesAction(productId: number) {
  const db = await getDb()
  const rows = await db
    .select({ id: productImages.id, r2Key: productImages.r2Key, sortOrder: productImages.sortOrder })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder))
  return rows
}

/**
 * 移除一張商品照片。
 * 只刪資料庫紀錄，檔案留在原處——與珠子圖一致，避免誤刪後救不回來。
 */
export async function deleteProductImageAction(productId: number, imageId: number) {
  const db = await getDb()
  await deleteProductImage(db, imageId)
  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${productId}`)
  return { ok: true as const }
}
