'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addToCartAction } from '../actions.ts'

/**
 * 加入購物車。
 *
 * 店主指示前台不顯示任何庫存資訊（階段 B 定案），所以這裡看不到「剩幾條」；
 * 真的沒貨時由 server action 回訊息告知，而不是事先把按鈕變灰。
 */
export default function AddToCart({ productId }: { productId: number }) {
  const [qty, setQty] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setMessage(null)
    startTransition(async () => {
      const result = await addToCartAction(productId, qty)
      if (result.ok) {
        setFailed(false)
        setMessage('已經放進購物車了。')
        /* 版面右上角的件數是伺服器算的，要重新取一次才會更新 */
        router.refresh()
      } else {
        setFailed(true)
        setMessage(result.error)
      }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          數量
          <input
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="tnum w-16 border border-hairline bg-paper px-2 py-1.5 text-center text-ink"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="border border-ink bg-ink px-8 py-2.5 text-[13px] tracking-[0.2em] text-paper hover:bg-accent hover:border-accent disabled:opacity-50"
        >
          {pending ? '加入中' : '加入購物車'}
        </button>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-3 text-[13px] ${failed ? 'text-alert' : 'text-ink-soft'}`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
