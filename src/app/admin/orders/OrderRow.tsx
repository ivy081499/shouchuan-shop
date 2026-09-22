'use client'

import { useState } from 'react'
import { getOrderSnapshot } from './actions.ts'
import { formatTWD } from '@/lib/money'

interface Snapshot {
  items: Array<{
    productName: string
    qty: number
    unitPriceCents: number
    unitCostCents: number
  }>
  usage: Array<{
    beadId: number
    beadName: string
    sizeMm: number | null
    qty: number
  }>
}

/**
 * 訂單列，點一下展開「當時的用料與成本」。
 *
 * 顯示的是下單當下的快照，不是現在重算的結果——
 * 配方之後改過、珠子成本之後變動，都不會影響這裡的數字。
 */
export default function OrderRow({
  orderId,
  stockDeducted,
  children,
  colSpan,
}: {
  orderId: number
  stockDeducted: boolean
  children: React.ReactNode
  colSpan: number
}) {
  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (snap) return
    setLoading(true)
    setSnap(await getOrderSnapshot(orderId))
    setLoading(false)
  }

  const costCents =
    snap?.items.reduce((s, i) => s + i.unitCostCents * i.qty, 0) ?? 0
  const revenueCents =
    snap?.items.reduce((s, i) => s + i.unitPriceCents * i.qty, 0) ?? 0

  return (
    <>
      <tr
        onClick={toggle}
        title="點一下看當時的用料與成本"
        className="cursor-pointer hover:bg-sunk"
      >
        {children}
      </tr>

      {open && (
        <tr>
          <td colSpan={colSpan} className="border-b border-hairline bg-sunk px-4 py-4">
            {loading ? (
              <div className="text-[13px] text-ink-soft">讀取中…</div>
            ) : !snap ? null : (
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] tracking-[0.15em] text-ink-soft">
                    當時的商品與成本
                  </div>
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {snap.items.map((i, idx) => (
                      <li key={idx} className="flex flex-wrap items-baseline gap-x-4">
                        <span className="min-w-[160px]">{i.productName}</span>
                        <span className="tnum text-ink-soft">×{i.qty}</span>
                        <span className="tnum">售 {formatTWD(i.unitPriceCents, true)}</span>
                        <span className="tnum text-ink-soft">
                          成本 {formatTWD(i.unitCostCents, true)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-x-6 text-[13px]">
                    <span>
                      <span className="text-ink-soft">營收 </span>
                      <span className="tnum">{formatTWD(revenueCents, true)}</span>
                    </span>
                    <span>
                      <span className="text-ink-soft">成本 </span>
                      <span className="tnum">{formatTWD(costCents, true)}</span>
                    </span>
                    <span>
                      <span className="text-ink-soft">毛利 </span>
                      <span className="tnum">{formatTWD(revenueCents - costCents, true)}</span>
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] tracking-[0.15em] text-ink-soft">
                    當時實際用掉的料
                  </div>
                  {snap.usage.length === 0 ? (
                    <div className="mt-2 text-[13px] text-ink-soft">
                      {stockDeducted
                        ? '這張訂單沒有扣到任何料。'
                        : '還沒確認收款，尚未扣料——確認收款後這裡才會有紀錄。'}
                    </div>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                      {snap.usage.map((u) => (
                        <li key={u.beadId}>
                          {u.beadName}
                          {u.sizeMm && <span className="text-ink-soft"> {u.sizeMm}mm</span>}
                          <span className="tnum"> ×{u.qty}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[12px] text-ink-soft">
                    這是下單當時的紀錄。之後改配方或珠子成本變動，都不會影響這裡的數字。
                  </p>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
