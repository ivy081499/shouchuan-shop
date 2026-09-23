import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDb } from '@/data/db'
import { getProductDetail } from '@/data/products'
import { formatTWD } from '@/lib/money'
import { getPublicImageBase, imageUrl } from '../../store.ts'
import Gallery from '../../_components/Gallery.tsx'
import RecipeXray from '../../_components/RecipeXray.tsx'

export const dynamic = 'force-dynamic'

/**
 * 只有已上架的看得到。
 * getProductDetail() 不篩狀態（後台預覽也用它），所以草稿與下架要在這裡擋，
 * 否則有人猜到網址就能看到還沒準備好的商品。
 */
async function loadPublished(slug: string) {
  const db = await getDb()
  const product = await getProductDetail(db, slug)
  if (!product || product.status !== 'active') return null
  return product
}

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

  const soldOut = product.availableQty <= 0
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
              <div className="flex gap-2">
                <dt>目前</dt>
                <dd className={soldOut ? 'text-ink' : 'tnum text-ink'}>
                  {soldOut ? '已售完' : `還有 ${product.availableQty} 條`}
                </dd>
              </div>
            </dl>
          </header>

          {product.description && (
            <p className="store-prose max-w-[34em] text-[14px] leading-[2.1] text-ink-soft">
              {product.description}
            </p>
          )}

          <RecipeXray recipe={product.recipe} />

          {/* 購物車是階段 C，這裡先說明怎麼買 */}
          <p className="border-t border-hairline pt-5 text-[13px] text-ink-soft">
            {soldOut
              ? '這條已經有人帶走了。同款可以再做，但天然石每批顏色不會完全一樣。'
              : '線上購買功能準備中，想要這條請先與我聯絡。'}
          </p>
        </div>
      </div>
    </article>
  )
}
