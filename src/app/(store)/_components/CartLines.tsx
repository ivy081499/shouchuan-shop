'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatTWD } from '@/lib/money'
import type { CartLineView } from '@/contracts/order'
import { updateCartQtyAction, removeFromCartAction } from '../actions.ts'

/**
 * 購物車明細，可改數量、可移除。
 *
 * 數量欄位刻意不做「輸入即送出」——手指滑一下就打 API 太吵，
 * 改完按「更新」才送。
 */
export default function CartLines({
  lines,
  imageBase,
}: {
  lines: CartLineView[]
  imageBase: string
}) {
  return (
    <ul className="border-t border-hairline">
      {lines.map((line) => (
        <CartRow key={line.productId} line={line} imageBase={imageBase} />
      ))}
    </ul>
  )
}

function CartRow({ line, imageBase }: { line: CartLineView; imageBase: string }) {
  const [qty, setQty] = useState(line.qty)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const imageSrc = line.coverImageKey
    ? imageBase
      ? `${imageBase.replace(/\/$/, '')}/${line.coverImageKey}`
      : `/uploads/${line.coverImageKey}`
    : null

  function update(next: number) {
    setError(null)
    startTransition(async () => {
      const result = await updateCartQtyAction(line.productId, next)
      if (result.ok) router.refresh()
      else {
        setError(result.error)
        setQty(line.qty)
      }
    })
  }

  function remove() {
    startTransition(async () => {
      await removeFromCartAction(line.productId)
      router.refresh()
    })
  }

  const short = line.qty > line.availableQty

  return (
    <li className="flex gap-4 border-b border-hairline py-6 sm:gap-6">
      <Link href={`/p/${line.slug}`} className="shrink-0">
        <div className="h-20 w-20 overflow-hidden bg-sunk sm:h-24 sm:w-24">
          {imageSrc ? (
            <img src={imageSrc} alt={line.name} loading="lazy" className="h-full w-full object-cover" />
          ) : null}
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Link href={`/p/${line.slug}`} className="font-serif text-[15px] text-ink hover:text-accent">
            {line.name}
          </Link>
          <span className="tnum text-[13px] text-ink-soft">{formatTWD(line.priceCents)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            數量
            <input
              type="number"
              min={1}
              max={99}
              value={qty}
              disabled={pending}
              onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
              onBlur={() => qty !== line.qty && update(qty)}
              className="tnum w-16 border border-hairline bg-paper px-2 py-1 text-center text-ink"
            />
          </label>

          <span className="tnum text-[13px] text-ink">{formatTWD(line.lineTotalCents)}</span>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink disabled:opacity-50"
          >
            移除
          </button>
        </div>

        {/*
          缺貨提示只在真的買不到時出現。
          店主指示前台平常不顯示庫存數字，但結帳前擋不下來會讓客人白跑一趟，
          所以這裡是例外：只講「剩幾條」，不講完整庫存。
        */}
        {short && (
          <p className="text-[13px] text-alert">
            {line.availableQty === 0
              ? '這條已經沒有了，請先移除再結帳。'
              : `目前只剩 ${line.availableQty} 條，請調整數量。`}
          </p>
        )}

        {error && <p className="text-[13px] text-alert">{error}</p>}
      </div>
    </li>
  )
}
