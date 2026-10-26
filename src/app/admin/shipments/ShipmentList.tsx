'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveReceiptAction, listReceiptItemsAction } from '../inventory/actions.ts'
import type { ShipmentRow, ReceiptItemRow } from '@/data/beads'

/**
 * 進貨批次與收貨確認。
 *
 * 【店主 2026-10-26 要求】勾選不即時送出：
 * 全部勾完按一次「送出收貨」才寫入，避免每勾一次整頁重載閃一下。
 *
 * 勾選單位是品項——同一批常分批到貨，或某幾項賣家缺貨沒寄，
 * 整批打一個勾看不出來少了什麼。
 *
 * 【重要】打勾確認收到，顆數才會加進庫存。匯入只建珠子與算成本。
 */
export default function ShipmentList({ shipments }: { shipments: ShipmentRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const [items, setItems] = useState<ReceiptItemRow[]>([])
  /** 畫面上的勾選狀態，按「送出」前只存在這裡，不碰資料庫 */
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()
  const router = useRouter()

  async function load(shipmentId: number) {
    setLoading(true)
    setError(null)
    const res = await listReceiptItemsAction(shipmentId)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setItems(res.items)
    setTicked(new Set(res.items.filter((i) => i.receivedAt !== null).map((i) => i.id)))
  }

  function toggleOpen(shipmentId: number) {
    setNote(null)
    setError(null)
    if (openId === shipmentId) {
      setOpenId(null)
      setItems([])
      setTicked(new Set())
      return
    }
    setOpenId(shipmentId)
    void load(shipmentId)
  }

  /** 只改畫面上的勾，不送出 */
  function toggleItem(itemId: number) {
    setNote(null)
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function tickAll(on: boolean) {
    setNote(null)
    setTicked(on ? new Set(items.map((i) => i.id)) : new Set())
  }

  /** 和資料庫目前狀態比，算出這次會新增收到幾項、取消幾項 */
  const saved = new Set(items.filter((i) => i.receivedAt !== null).map((i) => i.id))
  const willReceive = items.filter((i) => !saved.has(i.id) && ticked.has(i.id))
  const willUndo = items.filter((i) => saved.has(i.id) && !ticked.has(i.id))
  const dirty = willReceive.length > 0 || willUndo.length > 0
  const addQty = willReceive.reduce((s, i) => s + i.totalQty, 0)
  const undoQty = willUndo.reduce((s, i) => s + i.totalQty, 0)

  function submit() {
    if (!openId || !dirty) return
    setError(null)
    setNote(null)
    startTransition(async () => {
      const res = await saveReceiptAction(openId, [...ticked])
      if (!res.ok) {
        setError(res.error)
        return
      }
      const parts: string[] = []
      if (res.received > 0) parts.push(`${res.received} 項收到、入庫 ${res.addedQty} 顆`)
      if (res.undone > 0) parts.push(`${res.undone} 項取消、退回 ${res.removedQty} 顆`)
      setNote(parts.length > 0 ? `已送出：${parts.join('；')}。` : '沒有變動。')
      await load(openId)
      router.refresh()
    })
  }

  function discard() {
    setNote(null)
    setError(null)
    setTicked(new Set(items.filter((i) => i.receivedAt !== null).map((i) => i.id)))
  }

  if (shipments.length === 0) {
    return (
      <p className="border border-dashed border-hairline px-6 py-8 text-center text-[13px] text-ink-soft">
        還沒有進貨批次。到「庫存」頁的「匯入進貨」上傳淘寶訂單。
      </p>
    )
  }

  return (
    <div className="border border-hairline">
      <div className="flex items-baseline justify-between gap-3 border-b border-hairline bg-sunk/40 px-5 py-2.5">
        <h3 className="font-serif text-[14px] tracking-wider text-ink">批次清單</h3>
        <p className="text-[12px] text-ink-soft">
          展開後逐項核對包裹，勾完再按「送出收貨」。送出後顆數才進庫存。
        </p>
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
                    <button
                      type="button"
                      onClick={() => tickAll(true)}
                      disabled={saving}
                      className="border border-hairline px-3 py-1 hover:border-accent hover:text-accent disabled:opacity-40"
                    >
                      全部打勾
                    </button>
                    <button
                      type="button"
                      onClick={() => tickAll(false)}
                      disabled={saving}
                      className="border border-hairline px-3 py-1 text-ink-soft hover:border-alert hover:text-alert disabled:opacity-40"
                    >
                      全部取消
                    </button>

                    <span className="tnum text-ink-soft">
                      已勾 {ticked.size}/{items.length}
                    </span>

                    {note && <span className="text-accent">{note}</span>}
                  </div>

                  {loading ? (
                    <p className="py-4 text-center text-[12px] text-ink-soft">載入中…</p>
                  ) : items.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-ink-soft">這批沒有品項。</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-hairline border border-hairline bg-paper">
                        {items.map((it) => {
                          const on = ticked.has(it.id)
                          const wasSaved = saved.has(it.id)
                          const changed = on !== wasSaved
                          return (
                            <li
                              key={it.id}
                              className={`flex items-center gap-3 px-3 py-2 text-[13px] ${
                                changed ? 'bg-accent/5' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={saving}
                                onChange={() => toggleItem(it.id)}
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
                                {changed ? (
                                  <span className="text-accent">{on ? '要入庫' : '要退回'}</span>
                                ) : it.receivedAt !== null ? (
                                  `收於 ${new Date(it.receivedAt * 1000).toLocaleDateString('zh-TW')}`
                                ) : (
                                  '還沒到'
                                )}
                              </span>
                            </li>
                          )
                        })}
                      </ul>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
                        <button
                          type="button"
                          onClick={submit}
                          disabled={!dirty || saving}
                          className="bg-ink px-4 py-1.5 text-paper hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {saving ? '送出中…' : '送出收貨'}
                        </button>

                        {dirty && !saving && (
                          <>
                            <span className="text-ink-soft">
                              {willReceive.length > 0 && `新收到 ${willReceive.length} 項（入庫 ${addQty} 顆）`}
                              {willReceive.length > 0 && willUndo.length > 0 && '、'}
                              {willUndo.length > 0 && `取消 ${willUndo.length} 項（退回 ${undoQty} 顆）`}
                            </span>
                            <button
                              type="button"
                              onClick={discard}
                              className="text-ink-soft underline underline-offset-2 hover:text-ink"
                            >
                              還原勾選
                            </button>
                          </>
                        )}

                        {!dirty && !saving && <span className="text-ink-soft">目前沒有要送出的變動。</span>}
                      </div>
                    </>
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
