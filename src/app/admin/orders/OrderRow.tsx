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
    /** 店主上傳的商品照，依序號排序 */
    images: string[]
  }>
  usage: Array<{
    beadId: number
    beadName: string
    sizeMm: number | null
    imageUrl: string | null
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
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)

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
          {/* 展開區自己吃掉點擊，否則點裡面任何東西都會把整列收起來 */}
          <td
            colSpan={colSpan}
            onClick={(e) => e.stopPropagation()}
            className="border-b border-hairline bg-sunk px-4 py-4"
          >
            {loading ? (
              <div className="text-[13px] text-ink-soft">讀取中…</div>
            ) : !snap ? null : (
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] tracking-[0.15em] text-ink-soft">
                    當時的商品與成本
                  </div>
                  <ul className="mt-2 space-y-3 text-[13px]">
                    {snap.items.map((i, idx) => (
                      <li key={idx} className="flex flex-wrap items-start gap-3">
                        {/* 店主上傳的商品照，可點開看大圖 */}
                        {i.images.length > 0 ? (
                          <div className="flex gap-1.5">
                            {i.images.map((src) => (
                              <button
                                key={src}
                                type="button"
                                onClick={() => setZoom({ url: src, name: i.productName })}
                                title="點開看大圖"
                                className="h-14 w-14 shrink-0 overflow-hidden border border-hairline transition hover:border-accent"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={i.productName}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span
                            title="這條手串還沒上傳照片"
                            className="h-14 w-14 shrink-0 border border-dashed border-hairline bg-sunk"
                          />
                        )}
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-1">
                          <span className="min-w-[140px]">{i.productName}</span>
                          <span className="tnum text-ink-soft">×{i.qty}</span>
                          <span className="tnum">售 {formatTWD(i.unitPriceCents, true)}</span>
                          <span className="tnum text-ink-soft">
                            成本 {formatTWD(i.unitCostCents, true)}
                          </span>
                        </div>
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
                    <ul className="mt-2 flex flex-wrap gap-3">
                      {snap.usage.map((u) => (
                        <li
                          key={u.beadId}
                          className="flex w-[190px] items-start gap-2.5 border border-hairline bg-paper p-2"
                        >
                          {u.imageUrl ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setZoom({ url: u.imageUrl as string, name: u.beadName })
                              }}
                              title="點開看大圖"
                              className="h-12 w-12 shrink-0 overflow-hidden border border-hairline transition hover:border-accent"
                            >
                              {/* 圖片來源含外部網址（淘寶），next/image 需設定網域，故用原生 img */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={u.imageUrl}
                                alt={u.beadName}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="h-12 w-12 shrink-0 border border-hairline bg-sunk" />
                          )}
                          {/* 名稱完整顯示不截斷——料叫什麼是這裡最重要的資訊 */}
                          <div className="min-w-0 text-[12px] leading-snug">
                            <div>{u.beadName}</div>
                            <div className="tnum mt-0.5 text-ink-soft">
                              用 <span className="text-ink">{u.qty}</span> 顆
                            </div>
                          </div>
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

      {zoom && (
        <tr>
          <td>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${zoom.name} 的圖片`}
              onClick={() => setZoom(null)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
            >
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-paper p-5">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h2 className="font-serif text-lg text-ink">{zoom.name}</h2>
                  <button
                    type="button"
                    onClick={() => setZoom(null)}
                    className="text-[13px] text-ink-soft hover:text-ink"
                  >
                    關閉 ✕
                  </button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoom.url}
                  alt={zoom.name}
                  className="max-h-[65vh] w-full bg-sunk object-contain"
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
