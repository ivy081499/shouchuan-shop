/**
 * 商品與配方資料存取
 * ⚠️ 凍結檔案，不可修改。
 */

import { eq, and, inArray, asc, desc, sql, isNull, isNotNull } from 'drizzle-orm'
import type { Db } from './db.ts'
import { products, productImages, recipes, beads, orderItems } from '@db/schema'
import type { ProductInput, RecipeLineInput, ProductDetailView, ProductListItem, RecipeBeadView, ProductStatusValue } from '@/contracts/product'
import { calcProductCost, calcBuildableQty } from '@/lib/costing'

/* ────────────────────────────────────────────────────────────
   查詢
   ──────────────────────────────────────────────────────────── */

export async function getProductById(db: Db, id: number) {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function getProductBySlug(db: Db, slug: string) {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), isNull(products.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * 取得配方（含珠子資料）。
 * 後台配方編輯與成本計算都用這個。
 * （前台的「配方透視」已於 2026-09-24 依店主指示移除，不再是使用者。）
 */
export async function getRecipe(db: Db, productId: number): Promise<RecipeBeadView[]> {
  return db
    .select({
      beadId: beads.id,
      name: beads.name,
      sizeMm: beads.sizeMm,
      colorHex: beads.colorHex,
      category: beads.category,
      qty: recipes.qty,
      position: recipes.position,
    })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(and(eq(recipes.productId, productId), isNull(recipes.deletedAt)))
    .orderBy(asc(recipes.position))
}

/** 配方 + 成本 + 庫存，後台配方編輯器用 */
export async function getRecipeWithCost(db: Db, productId: number) {
  const rows = await db
    .select({
      beadId: beads.id,
      name: beads.name,
      sizeMm: beads.sizeMm,
      colorHex: beads.colorHex,
      category: beads.category,
      qty: recipes.qty,
      position: recipes.position,
      unitCostCents: beads.unitCostCents,
      stockQty: beads.stockQty,
    })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(and(eq(recipes.productId, productId), isNull(recipes.deletedAt)))
    .orderBy(asc(recipes.position))

  return {
    lines: rows,
    totalCostCents: calcProductCost(rows),
    buildableQty: calcBuildableQty(rows),
  }
}

/**
 * 商品可售數量。
 * manualStock 有值就用它；否則依配方與庫存動態計算。
 */
export async function getAvailableQty(db: Db, productId: number): Promise<number> {
  const product = await getProductById(db, productId)
  if (!product) return 0
  if (product.manualStock !== null) return product.manualStock

  const rows = await db
    .select({ qty: recipes.qty, stockQty: beads.stockQty })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(and(eq(recipes.productId, productId), isNull(recipes.deletedAt)))

  return calcBuildableQty(rows)
}

/** 一次算多個商品的可售量，避免列表頁 N+1 查詢 */
export async function getAvailableQtyMap(db: Db, productIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (productIds.length === 0) return result

  const productRows = await db
    .select({ id: products.id, manualStock: products.manualStock })
    .from(products)
    .where(inArray(products.id, productIds))

  const recipeRows = await db
    .select({ productId: recipes.productId, qty: recipes.qty, stockQty: beads.stockQty })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(and(inArray(recipes.productId, productIds), isNull(recipes.deletedAt)))

  for (const p of productRows) {
    if (p.manualStock !== null) {
      result.set(p.id, p.manualStock)
      continue
    }
    const lines = recipeRows.filter((r) => r.productId === p.id)
    result.set(p.id, calcBuildableQty(lines))
  }
  return result
}

/** 前台商品列表（只顯示已上架） */
export async function listStoreProducts(db: Db): Promise<ProductListItem[]> {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      priceCents: products.priceCents,
      status: products.status,
    })
    .from(products)
    .where(eq(products.status, 'active'))
    .orderBy(asc(products.sortOrder), asc(products.id))

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const images = await db
    .select({ productId: productImages.productId, r2Key: productImages.r2Key, sortOrder: productImages.sortOrder })
    .from(productImages)
    // 前台只顯示給客人看的圖
    .where(
      and(
        inArray(productImages.productId, ids),
        eq(productImages.audience, 'customer'),
        isNull(productImages.deletedAt),
      ),
    )
    .orderBy(asc(productImages.sortOrder))

  const availability = await getAvailableQtyMap(db, ids)

  return rows.map((r) => ({
    ...r,
    status: r.status as ProductStatusValue,
    coverImageKey: images.find((i) => i.productId === r.id)?.r2Key ?? null,
    availableQty: availability.get(r.id) ?? 0,
  }))
}

/** 後台商品列表（含草稿與下架） */
export async function listAdminProducts(db: Db) {
  const rows = await db
    .select()
    .from(products)
    .where(isNull(products.deletedAt))
    .orderBy(asc(products.sortOrder), asc(products.id))
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const availability = await getAvailableQtyMap(db, ids)

  // 一次取所有配方算成本，避免逐筆查詢
  const recipeRows = await db
    .select({ productId: recipes.productId, qty: recipes.qty, unitCostCents: beads.unitCostCents })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(and(inArray(recipes.productId, ids), isNull(recipes.deletedAt)))

  return rows.map((p) => {
    const lines = recipeRows.filter((r) => r.productId === p.id)
    return {
      ...p,
      costCents: calcProductCost(lines.map((l) => ({ beadId: 0, qty: l.qty, unitCostCents: l.unitCostCents }))),
      availableQty: availability.get(p.id) ?? 0,
    }
  })
}

/** 商品詳情（前台） */
export async function getProductDetail(db: Db, slug: string): Promise<ProductDetailView | null> {
  const product = await getProductBySlug(db, slug)
  if (!product) return null

  const [images, recipe, availableQty] = await Promise.all([
    db
      .select({ r2Key: productImages.r2Key, alt: productImages.alt })
      .from(productImages)
      // 前台只顯示給客人看的圖；internal 是店主的工作照
      .where(
        and(
          eq(productImages.productId, product.id),
          eq(productImages.audience, 'customer'),
          isNull(productImages.deletedAt),
        ),
      )
      .orderBy(asc(productImages.sortOrder)),
    getRecipe(db, product.id),
    getAvailableQty(db, product.id),
  ])

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    wristSizeCm: product.wristSizeCm,
    status: product.status as ProductStatusValue,
    images,
    recipe,
    availableQty,
  }
}

/* ────────────────────────────────────────────────────────────
   寫入
   ──────────────────────────────────────────────────────────── */

export async function createProduct(db: Db, input: ProductInput) {
  const rows = await db.insert(products).values(input).returning()
  return rows[0]
}

export async function updateProduct(db: Db, id: number, input: Partial<ProductInput>) {
  const now = Math.floor(Date.now() / 1000)
  const rows = await db
    .update(products)
    .set({ ...input, updatedAt: now })
    .where(eq(products.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * 覆寫整份配方（先刪後建）。
 * 配方編輯器是整份儲存，不做逐列增刪，邏輯較單純。
 */
export async function saveRecipe(db: Db, productId: number, lines: RecipeLineInput[]) {
  const now = Math.floor(Date.now() / 1000)
  // 軟刪除：舊配方標記為已刪除而非真的刪掉，之後可查可復原
  await db
    .update(recipes)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(recipes.productId, productId), isNull(recipes.deletedAt)))
  if (lines.length > 0) {
    await db.insert(recipes).values(lines.map((l) => ({ ...l, productId })))
  }
}

export async function addProductImage(
  db: Db,
  productId: number,
  r2Key: string,
  alt?: string,
  sortOrder = 0,
  /** customer＝上架給客人看；internal＝店主自己的工作照 */
  audience: 'customer' | 'internal' = 'customer',
) {
  const rows = await db
    .insert(productImages)
    .values({ productId, r2Key, alt: alt ?? null, sortOrder, audience })
    .returning()
  return rows[0]
}

/** 軟刪除商品圖。R2 上的檔案不動，之後可復原。 */
export async function deleteProductImage(db: Db, imageId: number) {
  const now = Math.floor(Date.now() / 1000)
  await db
    .update(productImages)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(productImages.id, imageId))
}

/* ────────────────────────────────────────────────────────────
   刪除手串

   防呆分三層，由呼叫端依序處理：
   1. 已上架 → 先下架再刪（避免前台出現 404）
   2. 有訂單 → 一律不給刪（見下方 countOrderItems 的說明）
   3. 其餘 → 可刪，配方與照片由外鍵 cascade 一併移除
   ──────────────────────────────────────────────────────────── */

/**
 * 這個手串被幾筆訂單明細引用。
 *
 * > 0 時不可刪除：`order_items.product_id` 的外鍵是 ON DELETE set null，
 * 刪掉商品會讓訂單明細變成無主資料。明細雖有 product_name 與金額快照，
 * 帳面金額不會跑掉，但「這筆賣的是哪個商品」的連結會永久斷掉，
 * 之後想查某商品賣過幾條就查不到了。這類商品應該改為「已下架」。
 */
export async function countOrderItems(db: Db, productId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(orderItems)
    .where(eq(orderItems.productId, productId))
  return Number(rows[0]?.n ?? 0)
}

/**
 * 刪除手串。配方與照片靠外鍵 cascade 一起刪掉。
 * 呼叫端必須先用 countOrderItems 擋下有訂單的商品。
 *
 * 注意：R2 上的圖片檔不會被刪除，只刪資料庫紀錄。
 * 這是刻意的——誤刪時檔案還在，且孤兒檔案不影響任何功能。
 */
export async function deleteProduct(db: Db, productId: number) {
  const now = Math.floor(Date.now() / 1000)
  // 軟刪除：配方與照片一起標記，復原時才能整組回來
  await db
    .update(products)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(products.id, productId))
  await db
    .update(recipes)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(recipes.productId, productId), isNull(recipes.deletedAt)))
  await db
    .update(productImages)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(productImages.productId, productId), isNull(productImages.deletedAt)))
}

/** 列出已刪除的手串，供「已刪除」清單查詢與復原 */
export async function listDeletedProducts(db: Db) {
  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      priceCents: products.priceCents,
      deletedAt: products.deletedAt,
    })
    .from(products)
    .where(isNotNull(products.deletedAt))
    .orderBy(desc(products.deletedAt))
}

/**
 * 復原已刪除的手串，連同它的配方與照片。
 *
 * 只復原「和商品同時被刪」的配方與照片——比對 deletedAt 是否相同，
 * 否則會把更早之前單獨刪掉的舊配方一起撈回來。
 */
export async function restoreProduct(db: Db, productId: number) {
  const rows = await db
    .select({ deletedAt: products.deletedAt })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)
  const deletedAt = rows[0]?.deletedAt
  if (!deletedAt) return { ok: false as const, error: '這條手串沒有被刪除，不需要復原。' }

  const now = Math.floor(Date.now() / 1000)
  await db
    .update(products)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(products.id, productId))
  await db
    .update(recipes)
    .set({ deletedAt: null, updatedAt: now })
    .where(and(eq(recipes.productId, productId), eq(recipes.deletedAt, deletedAt)))
  await db
    .update(productImages)
    .set({ deletedAt: null, updatedAt: now })
    .where(and(eq(productImages.productId, productId), eq(productImages.deletedAt, deletedAt)))
  return { ok: true as const }
}
