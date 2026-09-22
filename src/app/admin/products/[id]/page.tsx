import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, getPublicImageBase } from '@/data/db'
import { getProductById, getRecipe } from '@/data/products'
import { listBeads } from '@/data/beads'
import { PageTitle } from '@/ui'
import { listProductImagesAction } from '../actions.ts'
import RecipeEditor from './RecipeEditor.tsx'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number.parseInt(id, 10)
  if (!Number.isFinite(productId)) notFound()

  const db = await getDb()
  const product = await getProductById(db, productId)
  if (!product) notFound()

  const [recipe, beads, images, imageBase] = await Promise.all([
    getRecipe(db, productId),
    listBeads(db),
    listProductImagesAction(productId),
    getPublicImageBase(),
  ])

  /**
   * 本機開發沒有 R2 公開網址，檔案實際放在 public/uploads/products/，
   * 所以要補上 /uploads 前綴；線上則用 R2_PUBLIC_URL 組。
   */
  const toUrl = (r2Key: string) =>
    imageBase
      ? `${imageBase.replace(/\/$/, '')}/${r2Key}`
      : `/uploads/${r2Key}`

  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-block text-[13px] text-ink-soft hover:text-ink">
        ← 回手串列表
      </Link>
      <PageTitle note="勾選這條手串用到的珠子，成本會自動算出來。">{product.name}</PageTitle>

      <RecipeEditor
        productId={product.id}
        productName={product.name}
        priceCents={product.priceCents}
        status={product.status}
        images={images.map((img) => ({ id: img.id, url: toUrl(img.r2Key), sortOrder: img.sortOrder }))}
        beads={beads.map((b) => ({
          id: b.id,
          name: b.name,
          sizeMm: b.sizeMm,
          unitCostCents: b.unitCostCents,
          stockQty: b.stockQty,
          reorderPoint: b.reorderPoint,
          category: b.category,
          imageUrl: b.imageUrl,
          supplierName: b.supplierName,
          sourceTitle: b.sourceTitle,
          sourceSpec: b.sourceSpec,
        }))}
        initialLines={recipe.map((r) => ({ beadId: r.beadId, qty: r.qty }))}
      />
    </>
  )
}
