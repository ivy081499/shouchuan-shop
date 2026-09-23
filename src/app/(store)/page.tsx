import Link from 'next/link'
import { getDb } from '@/data/db'
import { listStoreProducts } from '@/data/products'
import { formatTWD } from '@/lib/money'
import { getPublicImageBase, imageUrl } from './store.ts'

export const dynamic = 'force-dynamic'

export default async function StoreHomePage() {
  const db = await getDb()
  const [products, imageBase] = await Promise.all([listStoreProducts(db), getPublicImageBase()])

  if (products.length === 0) {
    return (
      <p className="py-24 text-center text-[13px] text-ink-soft">
        目前沒有可購買的手串，新的做好會放上來。
      </p>
    )
  }

  return (
    /* 商品之間距離刻意拉寬，讓每條手串像展品 */
    <ul className="grid grid-cols-1 gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => {
        const soldOut = p.availableQty <= 0
        return (
          <li key={p.id}>
            <Link href={`/p/${p.slug}`} className="group block">
              <div className="relative aspect-square overflow-hidden bg-sunk">
                {p.coverImageKey ? (
                  <img
                    src={imageUrl(p.coverImageKey, imageBase)}
                    alt={p.name}
                    loading="lazy"
                    className={`h-full w-full object-cover ${soldOut ? 'opacity-45' : ''}`}
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-[11px] tracking-[0.2em] text-ink-soft">
                    準備中
                  </span>
                )}
                {soldOut && (
                  <span className="absolute bottom-0 left-0 bg-paper/90 px-3 py-1.5 text-[11px] tracking-[0.2em] text-ink-soft">
                    已售完
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-[15px] tracking-[0.06em] text-ink group-hover:text-accent">
                  {p.name}
                </h2>
                <span className="tnum shrink-0 text-[13px] text-ink-soft">
                  {formatTWD(p.priceCents)}
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
