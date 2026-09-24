/**
 * 商品與配方資料存取
 * ⚠️ 凍結檔案，不可修改。
 */

import { eq, and, inArray, asc, sql } from 'drizzle-orm'
import type { Db } from './db.ts'
import { products, productImages, recipes, beads } from '@db/schema'
import type { ProductInput, RecipeLineInput, ProductDetailView, ProductListItem, RecipeBeadView, ProductStatusValue } from '@/contracts/product'
import { calcProductCost, calcBuildableQty } from '@/lib/costing'

/* ────────────────────────────────────────────────────────────
   查詢
   ──────────────────────────────────────────────────────────── */

export async function getProductById(db: Db, id: number) {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getProductBySlug(db: Db, slug: string) {
  const rows = await db.select().from(products).where(eq(products.slug, slug)).limit(1)
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
    .where(eq(recipes.productId, productId))
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
    .where(eq(recipes.productId, productId))
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
    .where(eq(recipes.productId, productId))

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
    .where(inArray(recipes.productId, productIds))

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
    .where(inArray(productImages.productId, ids))
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
  const rows = await db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id))
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const availability = await getAvailableQtyMap(db, ids)

  // 一次取所有配方算成本，避免逐筆查詢
  const recipeRows = await db
    .select({ productId: recipes.productId, qty: recipes.qty, unitCostCents: beads.unitCostCents })
    .from(recipes)
    .innerJoin(beads, eq(recipes.beadId, beads.id))
    .where(inArray(recipes.productId, ids))

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
      .where(eq(productImages.productId, product.id))
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
  await db.delete(recipes).where(eq(recipes.productId, productId))
  if (lines.length > 0) {
    await db.insert(recipes).values(lines.map((l) => ({ ...l, productId })))
  }
}

export async function addProductImage(db: Db, productId: number, r2Key: string, alt?: string, sortOrder = 0) {
  const rows = await db.insert(productImages).values({ productId, r2Key, alt: alt ?? null, sortOrder }).returning()
  return rows[0]
}

export async function deleteProductImage(db: Db, imageId: number) {
  await db.delete(productImages).where(eq(productImages.id, imageId))
}
