'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setShipmentReceivedAction } from './actions.ts'
import type { ShipmentRow } from '@/data/beads'

/**
 * 進貨批次清單，附「已收到貨」勾選。
 *
 * 一次匯入＝一批（多張淘寶訂單集運併單），關稅一批收一次。
 * 勾選只記錄到貨時間，不動庫存——庫存在匯入當下就已經加進去了，
 * 這裡純粹是給店主自己追蹤「哪一批還沒寄到」。
 */
export default function ShipmentList({ shipments }: { shipments: ShipmentRow[] }) {
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function toggle(id: number, received: boolean) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await setShipmentReceivedAction(id, received)
      setPendingId(null)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  if (shipments.length === 0) {
    return (
      <p className="border border-dashed border-hairline px-6 py-8 text-center text-[13px] text-ink-soft">
        還沒有進貨批次。到「匯入進貨」上傳淘寶訂單。
      </p>
    )
  }

  return (
    <div className="border border-hairline">
      <div className="flex items-baseline justify-between gap-3 border-b border-hairline bg-sunk/40 px-5 py-2.5">
        <h3 className="font-serif text-[14px] tracking-wider text-ink">進貨批次</h3>
        <p className="text-[12px] text-ink-soft">收到貨後勾起來，方便追哪批還沒到。</p>
      </div>

      {error && (
        <p role="alert" className="border-b border-alert bg-alert/5 px-5 py-2 text-[12px] text-ink">
          {error}
        </p>
      )}

      <ul className="divide-y divide-hairline">
        {shipments.map((s) => {
          const received = s.arrivedAt !== null
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 text-[13px]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={received}
                  disabled={pendingId === s.id}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                />
                <span className={received ? 'text-ink' : 'text-ink-soft'}>已收到貨</span>
              </label>

              <span className="font-medium">{s.name}</span>

              <span className="text-ink-soft">
                {s.orderCount} 筆訂單 · {s.beadCount} 種珠 · {s.totalQty} 顆
              </span>

              {s.dutyTwdCents > 0 && (
                <span className="tnum text-ink-soft">關稅 ${(s.dutyTwdCents / 100).toFixed(2)}</span>
              )}

              <span className="ml-auto text-[12px] text-ink-soft">
                {received
                  ? `收貨 ${new Date((s.arrivedAt as number) * 1000).toLocaleDateString('zh-TW')}`
                  : '還沒到'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
