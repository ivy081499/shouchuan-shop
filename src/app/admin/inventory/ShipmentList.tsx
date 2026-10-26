'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  setItemReceivedAction,
  setAllItemsReceivedAction,
  listReceiptItemsAction,
} from './actions.ts'
import type { ShipmentRow, ReceiptItemRow } from '@/data/beads'

/**
 * 進貨批次與逐項收貨確認。
 *
 * 收貨是「拆包裹時一項一項核對」——同一批常分批到貨，
 * 或某幾項賣家缺貨沒寄，整批打一個勾看不出來少了什麼。
 * 所以勾選單位是品項，批次那層只顯示進度（3/21）。
 *
 * 勾選只記收貨時間，不動庫存：庫存在匯入當下就加過了。
 */
export default function ShipmentList({ shipments }: { shipments: ShipmentRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [items, setItems] = useState<ReceiptItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /** 整批操作的二次確認：'all' = 全部收到，'none' = 全部取消 */
  const [confirming, setConfirming] = useState<'all' | 'none' | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function load(shipmentId: number) {
    setLoading(true)
    setError(null)
    const res = await listReceiptItemsAction(shipmentId)
    setLoading(false)
    if (!res.ok) setError(res.error)
    else setItems(res.items)
  }

  function toggleOpen(shipmentId: number) {
    setNote(null)
    setConfirming(null)
    if (openId === shipmentId) {
      setOpenId(null)
      setItems([])
      return
    }
    setOpenId(shipmentId)
    void load(shipmentId)
  }

  function toggleItem(item: ReceiptItemRow) {
    const next = item.receivedAt === null
    setError(null)
    setNote(null)
    setBusyId(item.id)
    startTransition(async () => {
      const res = await setItemReceivedAction(item.id, next)
      setBusyId(null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (!res.changed) {
        // 重複點到同一個狀態——說清楚而不是假裝做了什麼
        setNote('這一項本來就是這個狀態，沒有變動。')
      }
      if (openId) await load(openId)
      router.refresh()
    })
  }

  function applyAll(received: boolean) {
    if (!openId) return
    setError(null)
    setNote(null)
    setConfirming(null)
    startTransition(async () => {
      const res = await setAllItemsReceivedAction(openId, received)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNote(
        res.changed === 0
          ? '沒有需要變動的品項——已經是這個狀態了。'
          : received
            ? `已勾選 ${res.changed} 項（原本就打過勾的保留原本的收貨日期）。`
            : `已取消 ${res.changed} 項。`,
      )
      await load(openId)
      router.refresh()
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
        <p className="text-[12px] text-ink-soft">展開後逐項核對包裹內容，收到哪一項就勾哪一項。</p>
      </div>

      {error && (
        <p role="alert" className="border-b border-alert bg-alert/5 px-5 py-2 text-[12px] text-ink">
          {error}
        </p>
      )}

      <ul className="divide-y divide-hairline">
        {shipments.map((s) => {
          const done = s.itemCount > 0 && s.receivedCount === s.itemCount
          const partial = s.receivedCount > 0 && !done
          const isOpen = openId === s.id
          return (
            <li key={s.id}>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 text-[13px]">
                <button
                  type="button"
                  onClick={() => toggleOpen(s.id)}
                  className="text-ink-soft hover:text-ink"
                >
                  {isOpen ? '收起 ▲' : '逐項確認 ▼'}
                </button>

                <span className="font-medium">{s.name}</span>

                <span className="text-ink-soft">
                  {s.orderCount} 筆訂單 · {s.beadCount} 種珠 · {s.totalQty} 顆
                </span>

                {s.dutyTwdCents > 0 && (
                  <span className="tnum text-ink-soft">關稅 ${(s.dutyTwdCents / 100).toFixed(2)}</span>
                )}

                <span
                  className={`ml-auto tnum text-[12px] ${
                    done ? 'text-ink' : partial ? 'text-accent' : 'text-ink-soft'
                  }`}
                >
                  收貨 {s.receivedCount}/{s.itemCount}
                  {done ? '（全部到齊）' : partial ? '（部分到貨）' : ''}
                </span>
              </div>

              {isOpen && (
                <div className="border-t border-hairline bg-sunk/20 px-5 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
                    {confirming === null ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirming('all')}
                          className="border border-hairline px-3 py-1 hover:border-accent hover:text-accent"
                        >
                          全部標成收到
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming('none')}
                          className="border border-hairline px-3 py-1 text-ink-soft hover:border-alert hover:text-alert"
                        >
                          全部取消
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-ink-soft">
                          {confirming === 'all'
                            ? '把這批所有品項都標成已收到？已打勾的會保留原本日期。'
                            : '取消這批所有品項的收貨標記？'}
                        </span>
                        <button
                          type="button"
                          onClick={() => applyAll(confirming === 'all')}
                          className={`px-3 py-1 text-paper ${
                            confirming === 'all' ? 'bg-ink hover:bg-accent' : 'bg-alert'
                          }`}
                        >
                          確定
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="text-ink-soft underline underline-offset-2 hover:text-ink"
                        >
                          取消
                        </button>
                      </>
                    )}

                    {note && <span className="text-accent">{note}</span>}
                  </div>

                  {loading ? (
                    <p className="py-4 text-center text-[12px] text-ink-soft">載入中…</p>
                  ) : items.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-ink-soft">這批沒有品項。</p>
                  ) : (
                    <ul className="divide-y divide-hairline border border-hairline bg-paper">
                      {items.map((it) => {
                        const received = it.receivedAt !== null
                        return (
                          <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                            <input
                              type="checkbox"
                              checked={received}
                              disabled={busyId === it.id}
                              onChange={() => toggleItem(it)}
                              aria-label={`${it.beadName ?? '未命名'} 已收到`}
                              className="shrink-0 cursor-pointer"
                            />
                            {it.imageUrl ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={it.imageUrl}
                                alt=""
                                className="h-9 w-9 shrink-0 border border-hairline object-cover"
                              />
                            ) : (
                              <span className="h-9 w-9 shrink-0 border border-hairline bg-sunk" />
                            )}
                            <span className="w-[180px] shrink-0 truncate" title={it.beadName ?? ''}>
                              {it.beadName ?? '（未建檔）'}
                            </span>
                            <span
                              className="w-[230px] shrink-0 truncate text-ink-soft"
                              title={it.rawSpec ?? ''}
                            >
                              {it.rawSpec ?? '—'}
                            </span>
                            <span className="tnum w-[90px] shrink-0 text-right text-ink-soft">
                              {it.quantity} 件 / {it.totalQty} 顆
                            </span>
                            <span className="ml-auto text-[12px] text-ink-soft">
                              {received
                                ? `收於 ${new Date((it.receivedAt as number) * 1000).toLocaleDateString('zh-TW')}`
                                : '還沒到'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
