import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { formatTWD } from '@/lib/money'
import { getStoreSettings } from '../store.ts'
import { readCart, buildCartView } from '../cart.ts'
import CheckoutForm from '../_components/CheckoutForm.tsx'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '結帳' }

export default async function CheckoutPage() {
  const cart = await readCart()
  const [view, settings] = await Promise.all([buildCartView(cart), getStoreSettings()])

  /* 只有空車才退回購物車；庫存不足不擋（店主 2026-09-24 指示） */
  if (view.lines.length === 0) redirect('/cart')

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="mb-8 font-serif text-[20px] tracking-[0.2em] text-ink">結帳</h1>

      <div className="grid gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
        <div className="min-w-0 lg:order-2">
          {/* 寬螢幕時靠右（lg:order-2），手機則在表單上方——先確認買了什麼再填資料 */}
          <section className="border border-hairline bg-sunk px-5 py-5">
            <h2 className="mb-4 font-serif text-[14px] tracking-[0.2em] text-ink">訂購內容</h2>

            <ul className="flex flex-col gap-3 text-[13px]">
              {view.lines.map((l) => (
                <li key={l.productId} className="flex justify-between gap-4">
                  <span className="min-w-0 text-ink">
                    {l.name}
                    <span className="tnum text-ink-soft">　×{l.qty}</span>
                  </span>
                  <span className="tnum shrink-0 text-ink-soft">{formatTWD(l.lineTotalCents)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 flex flex-col gap-2 border-t border-hairline pt-4 text-[13px]">
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
              <div className="flex justify-between border-t border-hairline pt-2">
                <dt className="text-ink">合計</dt>
                <dd className="tnum text-[15px] text-ink">{formatTWD(view.totalCents)}</dd>
              </div>
            </dl>

            <Link
              href="/cart"
              className="mt-4 inline-block text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink"
            >
              回購物車修改
            </Link>
          </section>
        </div>

        <div className="min-w-0">
          <CheckoutForm notice={settings.store_notice || null} />
        </div>
      </div>
    </div>
  )
}
