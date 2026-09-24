'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { OrderStatusValue } from '@/contracts/order'
import { canTransition } from '@/contracts/order'
import { confirmPaymentAction, shipOrderAction, cancelOrderAction } from './actions.ts'

/**
 * 訂單的操作按鈕：確認收款、出貨、取消。
 *
 * 顯示哪些按鈕由 `canTransition()` 決定（凍結的狀態機），
 * 這裡不自己判斷「什麼狀態能做什麼」——那套規則只有一份，在 contracts 裡。
 *
 * 【確認收款就是扣庫存的那一刻】這是整個系統唯一會扣料的操作，
 * 所以按下去之前要再問一次。
 */
export default function OrderActions({
  orderId,
  orderNo,
  status,
}: {
  orderId: number
  orderNo: string
  status: OrderStatusValue
}) {
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<null | 'confirm' | 'ship' | 'cancel'>(null)
  const [tracking, setTracking] = useState('')
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: true; data: void } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        setAsking(null)
        setTracking('')
        setReason('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const canConfirm = canTransition(status, 'paid')
  const canShip = canTransition(status, 'shipped')
  const canCancel = canTransition(status, 'cancelled')

  if (!canConfirm && !canShip && !canCancel) {
    return <span className="text-[12px] text-ink-soft">這張訂單已經結束了。</span>
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="border-l-2 border-alert bg-alert/5 px-3 py-2 text-[12px] text-ink">
          {error}
        </p>
      )}

      {/* 確認收款 —— 會扣庫存，所以要二次確認 */}
      {asking === 'confirm' ? (
        <div className="border border-hairline bg-paper px-3 py-3 text-[12px]">
          <p className="mb-2">
            確認已經收到 <span className="tnum">{orderNo}</span> 的款項？
            <br />
            <span className="text-ink-soft">按下去會把這張訂單用到的珠子從庫存扣掉。</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmPaymentAction(orderId))}
              className="bg-ink px-4 py-1.5 text-paper hover:bg-accent disabled:opacity-50"
            >
              {pending ? '處理中' : '確定，收到款了'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setAsking(null)}
              className="border border-hairline px-4 py-1.5 hover:border-accent disabled:opacity-50"
            >
              再想想
            </button>
          </div>
        </div>
      ) : asking === 'ship' ? (
        <div className="border border-hairline bg-paper px-3 py-3 text-[12px]">
          <label className="flex flex-col gap-1.5">
            <span>物流單號</span>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              maxLength={50}
              autoFocus
              className="tnum w-56 border border-hairline bg-paper px-2 py-1.5"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || tracking.trim() === ''}
              onClick={() => run(() => shipOrderAction(orderId, tracking))}
              className="bg-ink px-4 py-1.5 text-paper hover:bg-accent disabled:opacity-50"
            >
              {pending ? '處理中' : '寄出了'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setAsking(null)}
              className="border border-hairline px-4 py-1.5 hover:border-accent disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : asking === 'cancel' ? (
        <div className="border border-hairline bg-paper px-3 py-3 text-[12px]">
          <label className="flex flex-col gap-1.5">
            <span>取消原因</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="客人改變心意、聯絡不上…"
              className="w-72 border border-hairline bg-paper px-2 py-1.5"
            />
          </label>
          <p className="mt-2 text-ink-soft">
            已經扣掉的料會自動加回庫存。
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || reason.trim() === ''}
              onClick={() => run(() => cancelOrderAction(orderId, reason))}
              className="bg-alert px-4 py-1.5 text-paper hover:opacity-90 disabled:opacity-50"
            >
              {pending ? '處理中' : '確定取消這張訂單'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setAsking(null)}
              className="border border-hairline px-4 py-1.5 hover:border-accent disabled:opacity-50"
            >
              不要
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-[12px]">
          {canConfirm && (
            <button
              type="button"
              onClick={() => setAsking('confirm')}
              className="bg-ink px-4 py-1.5 text-paper hover:bg-accent"
            >
              確認收款
            </button>
          )}
          {canShip && (
            <button
              type="button"
              onClick={() => setAsking('ship')}
              className="border border-hairline px-4 py-1.5 hover:border-accent hover:text-accent"
            >
              填物流單號
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => setAsking('cancel')}
              className="border border-hairline px-4 py-1.5 text-ink-soft hover:border-alert hover:text-alert"
            >
              取消訂單
            </button>
          )}
        </div>
      )}
    </div>
  )
}
