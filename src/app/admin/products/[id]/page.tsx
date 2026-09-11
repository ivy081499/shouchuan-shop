import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb } from '@/data/db'
import { getProductById, getRecipe } from '@/data/products'
import { listBeads } from '@/data/beads'
import { PageTitle } from '@/ui'
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

  const [recipe, beads] = await Promise.all([getRecipe(db, productId), listBeads(db)])

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
        beads={beads.map((b) => ({
          id: b.id,
          name: b.name,
          sizeMm: b.sizeMm,
          unitCostCents: b.unitCostCents,
          stockQty: b.stockQty,
          category: b.category,
        }))}
        initialLines={recipe.map((r) => ({ beadId: r.beadId, qty: r.qty }))}
      />
    </>
  )
}
