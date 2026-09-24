import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { formatTWD } from '@/lib/money'
import { ORDER_STATUS_LABEL, type OrderStatusValue } from '@/contracts/order'
import { getStoreSettings } from '../../store.ts'
import { getOrderPublicView } from '../../actions.ts'
import TransferReportForm from '../../_components/TransferReportForm.tsx'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '訂單' }

/**
 * 下單成功頁，同時也是客人日後回來看訂單與回報匯款的地方。
 *
 * 只憑訂單編號就能開：編號帶 4 碼亂數（約 100 萬種組合）不會被猜到，
 * 而且這頁不顯示電話與地址，連結被轉貼也不會外洩個資。
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const [{ orderNo }, query] = await Promise.all([params, searchParams])
  const [order, s] = await Promise.all([getOrderPublicView(orderNo), getStoreSettings()])
  if (!order) notFound()

  const justPlaced = query.new === '1'
  const bankFilled = Boolean(s.bank_name && s.bank_account)
  const status = order.status as OrderStatusValue
  const canReport = status === 'pending_payment' || status === 'payment_reported'

  return (
    <div className="mx-auto max-w-[620px]">
      <header className="border-b border-hairline pb-8">
        <h1 className="font-serif text-[20px] tracking-[0.2em] text-ink">
          {justPlaced ? '訂單已經成立了' : '訂單明細'}
        </h1>
        {justPlaced && (
          <p className="mt-3 text-[13px] leading-[2] text-ink-soft">
            {order.customerName} 您好，謝謝您的訂購。
            請依下面的資訊完成匯款，我收到款項後就會為您寄出。
          </p>
        )}

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1 text-[13px]">
          <div className="flex gap-2">
            <dt className="text-ink-soft">訂單編號</dt>
            <dd className="tnum text-ink">{order.orderNo}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-soft">狀態</dt>
            <dd className="text-ink">{ORDER_STATUS_LABEL[status]}</dd>
          </div>
        </dl>
      </header>

      <section className="border-b border-hairline py-8">
        <h2 className="mb-4 font-serif text-[14px] tracking-[0.2em] text-ink">訂購內容</h2>
        <ul className="flex flex-col gap-3 text-[13px]">
          {order.items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="flex justify-between gap-4">
              <span className="min-w-0 text-ink">
                {item.name}
                <span className="tnum text-ink-soft">　×{item.qty}</span>
              </span>
              <span className="tnum shrink-0 text-ink-soft">{formatTWD(item.lineTotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-5 flex flex-col gap-2 border-t border-hairline pt-4 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-soft">小計</dt>
            <dd className="tnum text-ink">{formatTWD(order.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">運費</dt>
            <dd className="tnum text-ink">
              {order.shippingFeeCents === 0 ? '免運' : formatTWD(order.shippingFeeCents)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-hairline pt-2">
            <dt className="text-ink">應付金額</dt>
            <dd className="tnum text-[17px] text-ink">{formatTWD(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <section className="border-b border-hairline py-8">
        <h2 className="mb-4 font-serif text-[14px] tracking-[0.2em] text-ink">匯款資訊</h2>

        {bankFilled ? (
          <dl className="flex flex-col gap-2 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-ink-soft">銀行</dt>
              <dd className="text-ink">
                {s.bank_name}
                {s.bank_code ? `（${s.bank_code}）` : ''}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-ink-soft">帳號</dt>
              <dd className="tnum text-ink">{s.bank_account}</dd>
            </div>
            {s.bank_holder && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-ink-soft">戶名</dt>
                <dd className="text-ink">{s.bank_holder}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-ink-soft">備註填</dt>
              <dd className="tnum text-ink">{order.orderNo}</dd>
            </div>
          </dl>
        ) : (
          /* 店主還沒在後台填匯款帳號時，至少不要讓客人對著一片空白發呆 */
          <p className="text-[13px] text-ink-soft">
            匯款帳號會另外通知您，或請直接與我聯絡。
          </p>
        )}
      </section>

      {/* 已回報過就顯示回報內容，不再給第二份表單，免得重複送 */}
      {order.transferLast5 ? (
        <section className="border-b border-hairline py-8">
          <h2 className="mb-3 font-serif text-[14px] tracking-[0.2em] text-ink">已收到您的匯款回報</h2>
          <p className="text-[13px] leading-[2] text-ink-soft">
            末五碼 <span className="tnum text-ink">{order.transferLast5}</span>。
            我核對入帳後會再與您聯絡，接著就會寄出。
          </p>
        </section>
      ) : canReport ? (
        <section className="border-b border-hairline py-8">
          <h2 className="mb-3 font-serif text-[14px] tracking-[0.2em] text-ink">匯款完成後</h2>
          <p className="mb-5 text-[13px] leading-[2] text-ink-soft">
            請填寫轉帳帳號的末五碼，我才對得出是哪一筆。
          </p>
          <TransferReportForm orderNo={order.orderNo} />
        </section>
      ) : null}

      <p className="py-8 text-[13px] leading-[2] text-ink-soft">
        這個頁面的網址請留著，隨時可以回來看訂單狀態。
        {order.transferLast5 === null && '匯款後也是回到這裡回報。'}
      </p>

      <Link href="/" className="text-[13px] text-ink-soft hover:text-ink">
        ← 回所有手串
      </Link>
    </div>
  )
}
