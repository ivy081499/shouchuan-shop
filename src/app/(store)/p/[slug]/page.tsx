import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDb } from '@/data/db'
import { getProductDetail } from '@/data/products'
import { formatTWD } from '@/lib/money'
import { getPublicImageBase, imageUrl } from '../../store.ts'
import Gallery from '../../_components/Gallery.tsx'
import AddToCart from '../../_components/AddToCart.tsx'

export const dynamic = 'force-dynamic'

/**
 * 只有已上架的看得到。
 * getProductDetail() 不篩狀態（後台預覽也用它），所以草稿與下架要在這裡擋，
 * 否則有人猜到網址就能看到還沒準備好的商品。
 *
 * 包 `cache()`：generateMetadata 與頁面本體都要呼叫，
 * 沒有這層的話商品、照片、配方、可售量全部會查兩遍。
 */
const loadPublished = cache(async (slug: string) => {
  const db = await getDb()
  const product = await getProductDetail(db, slug)
  if (!product || product.status !== 'active') return null
  return product
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await loadPublished(slug)
  if (!product) return { title: '找不到這條手串' }
  return {
    title: product.name,
    description: product.description ?? undefined,
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [product, imageBase] = await Promise.all([loadPublished(slug), getPublicImageBase()])
  if (!product) notFound()

  const images = product.images.map((img) => ({
    url: imageUrl(img.r2Key, imageBase),
    alt: img.alt,
  }))

  return (
    <article>
      <Link href="/" className="mb-8 inline-block text-[13px] text-ink-soft hover:text-ink">
        ← 回所有手串
      </Link>

      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        {/* min-w-0：grid 子項預設不會收縮，裡頭的橫向捲動區會把整頁撐寬 */}
        <div className="min-w-0">
          <Gallery images={images} productName={product.name} />
        </div>

        <div className="flex min-w-0 flex-col gap-10">
          <header>
            <h1 className="font-serif text-[24px] tracking-[0.1em] text-ink">{product.name}</h1>
            <p className="tnum mt-3 text-[17px] text-ink">{formatTWD(product.priceCents)}</p>

            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1 text-[13px] text-ink-soft">
              {product.wristSizeCm !== null && (
                <div className="flex gap-2">
                  <dt>手圍</dt>
                  <dd className="tnum text-ink">{product.wristSizeCm} 公分</dd>
                </div>
              )}
            </dl>
          </header>

          {product.description && (
            <p className="store-prose max-w-[34em] text-[14px] leading-[2.1] text-ink-soft">
              {product.description}
            </p>
          )}

          {/* 原本「線上購買功能準備中」那一句的位置（docs/10-前台與上架計畫.md 階段 C） */}
          <AddToCart productId={product.id} />
        </div>
      </div>
    </article>
  )
}
