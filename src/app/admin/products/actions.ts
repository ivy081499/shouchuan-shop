'use server'

import { getDb } from '@/data/db'
import { createProduct, updateProduct, saveRecipe, addProductImage, deleteProductImage, getProductById, countOrderItems, deleteProduct } from '@/data/products'
import { productInputSchema, recipeLineSchema, productStatusSchema } from '@/contracts/product'
import { zodMessage, slugSchema } from '@/contracts/common'
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
  } catch (e) {
    return { ok: false as const, error: describeWriteError(e) }
  }
}

/**
 * 更新商品用的 schema。
 *
 * 不能直接用 `productInputSchema.partial()`，有兩個坑：
 *
 * 1. **`.partial()` 不會移除 `.default()`**。`status` 與 `sortOrder` 帶有預設值，
 *    只想改名稱的部分更新會順手把狀態打回草稿、排序歸零（等於無聲下架）。
 * 2. **`.partial()` 不會移除 `.refine()`**。`priceCents` 的 `> 0` 檢查會讓
 *    「售價空白 + 沒照片 + 沒配方」只回報售價一項，A-4 要求的「一次講完缺什麼」跑不到。
 *
 * 所以這裡重新宣告，欄位定義與 contracts 對齊但不帶 default／refine。
 * 售價是否合理改由 `checkReadyToPublish()` 統一把關。
 */
const productUpdateSchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().trim().min(1, '請填寫手串名稱').max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priceCents: z.number().int('售價必須是整數分').min(0, '售價不能是負數').optional(),
  wristSizeCm: z.number().positive('手圍必須大於 0').max(30, '手圍看起來不合理').nullable().optional(),
  manualStock: z.number().int().min(0, '限量不能是負數').nullable().optional(),
  sortOrder: z.number().int().optional(),
  status: productStatusSchema.optional(),
})

/**
 * 把寫入時的例外翻成店主看得懂的話。
 *
 * 不可以全部當成「網址代稱重複」——連線中斷、逾時也會走到 catch，
 * 店主會去改一個根本沒重複的代稱，反覆失敗卻毫無線索。
 */
function describeWriteError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/UNIQUE constraint failed: products\.slug/i.test(msg)) {
    return '網址代稱重複了，換一個試試。'
  }
  console.error('[products] 寫入失敗:', msg)
  return '存檔失敗，請再試一次。若持續失敗請截圖這個畫面。'
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
  /** 這次要一起存的配方有沒有內容；未傳則查資料庫現值 */
  hasRecipe?: boolean,
): Promise<string | null> {
  const missing: string[] = []

  const [imgs, lines, current] = await Promise.all([
    db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, id)).limit(1),
    hasRecipe === undefined
      ? db.select({ id: recipes.id }).from(recipes).where(eq(recipes.productId, id)).limit(1)
      : Promise.resolve([]),
    getProductById(db, id),
  ])

  if (imgs.length === 0) missing.push('還沒有照片，客人看不到商品長怎樣')

  const recipeOk = hasRecipe === undefined ? lines.length > 0 : hasRecipe
  if (!recipeOk) missing.push('還沒設定用哪些珠子，算不出成本')

  // 這次沒送 priceCents 就看資料庫現值
  const price = priceCents ?? current?.priceCents ?? 0
  if (price <= 0) missing.push('售價還沒填')

  if (missing.length === 0) return null
  return `還不能上架：${missing.join('；')}。`
}

/**
 * 只更新商品欄位，不碰配方。
 *
 * ⚠️ 若同時要存配方，請用 `saveProductAction()`——
 * 分開呼叫會讓配方先落地、商品驗證失敗時無法回滾。
 */
export async function updateProductAction(id: number, input: unknown) {
  const parsed = productUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) }

  const db = await getDb()

  if (parsed.data.status === 'active') {
    const problem = await checkReadyToPublish(db, id, parsed.data.priceCents)
    if (problem) return { ok: false as const, error: problem }
  }

  try {
    await updateProduct(db, id, parsed.data)
  } catch (e) {
    return { ok: false as const, error: describeWriteError(e) }
  }

  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${id}`)
  return { ok: true as const }
}

/**
 * 商品欄位與配方一起存。
 *
 * **必須先驗證完所有東西，才可以開始寫入。**
 * `saveRecipe()` 是先刪後建，一旦跑了就無法回滾；
 * 若讓它先跑、商品驗證後失敗（slug 重複、上架檢查擋下），
 * 配方會被清空但畫面顯示錯誤，店主以為沒存成功——這會弄壞已上架商品。
 *
 * D1 沒有跨陳述句交易可用，所以用「驗證全部通過才動手」來取代交易。
 */
export async function saveProductAction(
  productId: number,
  productInput: unknown,
  lines: unknown,
) {
  /* ── 1. 先驗證，全部通過才寫 ── */
  const parsedProduct = productUpdateSchema.safeParse(productInput)
  if (!parsedProduct.success) {
    return { ok: false as const, error: zodMessage(parsedProduct.error) }
  }

  const parsedLines = z.array(recipeLineSchema).safeParse(lines)
  if (!parsedLines.success) {
    return { ok: false as const, error: zodMessage(parsedLines.error) }
  }

  const seen = new Set<number>()
  for (const l of parsedLines.data) {
    if (seen.has(l.beadId)) {
      return { ok: false as const, error: '同一顆珠只能出現一次，要用幾顆請寫在數量欄。' }
    }
    seen.add(l.beadId)
  }

  const db = await getDb()

  // 上架檢查要用「這次要存的配方」判斷，不是資料庫現值——
  // 否則剛補上配方的同一次儲存會被誤判成「還沒設定珠子」
  if (parsedProduct.data.status === 'active') {
    const problem = await checkReadyToPublish(
      db,
      productId,
      parsedProduct.data.priceCents,
      parsedLines.data.length > 0,
    )
    if (problem) return { ok: false as const, error: problem }
  }

  /* ── 2. 驗證都過了才開始寫 ── */
  try {
    await updateProduct(db, productId, parsedProduct.data)
  } catch (e) {
    return { ok: false as const, error: describeWriteError(e) }
  }
  await saveRecipe(db, productId, parsedLines.data)

  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${productId}`)
  revalidatePath('/admin/reports/purchasing')
  return { ok: true as const }
}

/**
 * 只存配方，不碰商品欄位。
 *
 * ⚠️ 若同時要改商品欄位，請用 `saveProductAction()`——
 * `saveRecipe()` 是先刪後建無法回滾，分開呼叫有資料損壞風險。
 */
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

  /**
   * 刪掉最後一張照片時，已上架的商品要自動降回草稿。
   * 不擋下刪除——店主可能正要換照片；但也不能放著無圖商品掛在前台。
   */
  let demoted = false
  const product = await getProductById(db, productId)
  if (product?.status === 'active') {
    const left = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .limit(1)
    if (left.length === 0) {
      await updateProduct(db, productId, { status: 'draft' })
      demoted = true
    }
  }

  revalidatePath('/admin/products')
  revalidatePath(`/admin/products/${productId}`)
  revalidatePath('/admin')
  return { ok: true as const, demoted }
}

/**
 * 刪除手串。三層防呆：
 *
 * 1. **已上架** → 不給刪，請先下架。避免前台連結突然變成 404，
 *    也讓店主有一步停頓確認自己刪的是哪一條。
 * 2. **有訂單** → 不給刪，建議改「已下架」。
 *    order_items 的外鍵是 set null，刪了會讓歷史訂單對不回商品。
 * 3. 其餘才真的刪；配方與照片紀錄由外鍵 cascade 一併移除。
 *
 * 回傳 requireConfirm 讓前端做二次確認，不在這裡直接刪。
 */
export async function deleteProductAction(productId: number) {
  const db = await getDb()

  const product = await getProductById(db, productId)
  if (!product) return { ok: false as const, error: '找不到這條手串，可能已經被刪掉了。' }

  if (product.status === 'active') {
    return {
      ok: false as const,
      error: `「${product.name}」目前是已上架，不能直接刪除。請先改成「已下架」或「草稿」，再回來刪。`,
    }
  }

  const orderCount = await countOrderItems(db, productId)
  if (orderCount > 0) {
    return {
      ok: false as const,
      error:
        `「${product.name}」已經有 ${orderCount} 筆訂單賣出，不能刪除——` +
        '刪了歷史訂單就查不到這是哪個商品。請改成「已下架」，它就不會出現在前台。',
    }
  }

  await deleteProduct(db, productId)

  revalidatePath('/admin/products')
  revalidatePath('/admin')
  return { ok: true as const, name: product.name }
}
