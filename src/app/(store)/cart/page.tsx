import Link from 'next/link'
import type { Metadata } from 'next'
import { formatTWD } from '@/lib/money'
import { getPublicImageBase } from '../store.ts'
import { readCart, buildCartView, getShippingRule } from '../cart.ts'
import CartLines from '../_components/CartLines.tsx'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '購物車' }

export default async function CartPage() {
  const cart = await readCart()
  const [view, imageBase, rule] = await Promise.all([
    buildCartView(cart),
    getPublicImageBase(),
    getShippingRule(),
  ])

  if (view.lines.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-[13px] text-ink-soft">購物車是空的。</p>
        <Link
          href="/"
          className="mt-6 inline-block border border-hairline px-8 py-2.5 text-[13px] tracking-[0.2em] text-ink hover:border-ink"
        >
          去看看手串
        </Link>
      </div>
    )
  }

  const awayFromFree = rule.freeThresholdCents - view.subtotalCents

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="mb-8 font-serif text-[20px] tracking-[0.2em] text-ink">購物車</h1>

      <CartLines lines={view.lines} imageBase={imageBase} />

      <dl className="mt-8 flex flex-col gap-2 text-[14px]">
        <div className="flex justify-between">
          <dt className="text-ink-soft">小計</dt>
          <dd className="tnum text-ink">{formatTWD(view.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">運費</dt>
          <dd className="tnum text-ink">
            {view.shippingFeeCents === 0 ? '免運' : formatTWD(view.shippingFeeCents)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-hairline pt-3">
          <dt className="text-ink">合計</dt>
          <dd className="tnum text-[17px] text-ink">{formatTWD(view.totalCents)}</dd>
        </div>
      </dl>

      {/* 差一點就免運的時候講一聲，這是客人自己算不出來的資訊 */}
      {view.shippingFeeCents > 0 && awayFromFree > 0 && (
        <p className="mt-3 text-[13px] text-ink-soft">
          再買 {formatTWD(awayFromFree)} 就免運費。
        </p>
      )}

      {/* 庫存不足不擋結帳（店主 2026-09-24 指示），缺料由店主補做 */}
      <Link
        href="/checkout"
        className="mt-8 block border border-ink bg-ink py-3 text-center text-[13px] tracking-[0.2em] text-paper hover:border-accent hover:bg-accent"
      >
        前往結帳
      </Link>

      <Link
        href="/"
        className="mt-4 block text-center text-[13px] text-ink-soft hover:text-ink"
      >
        繼續選購
      </Link>
    </div>
  )
}
