'use client'

import { useState, useTransition, useRef, useCallback, useMemo } from 'react'
import { Table, Th, Td, Money } from '@/ui'
import { setQtyAction } from './actions'
import type { BeadPickerRow, SortKey } from '@/data/purchase-lists'

interface Props {
  listId: number
  rows: BeadPickerRow[]
  sort: SortKey
  dir: 'asc' | 'desc'
  /**
   * 目前的查詢字串（不含 sort/dir），用來組排序連結。
   * 傳字串而非函式——函式無法跨 server/client 邊界序列化。
   */
  baseQuery: string
}

const COLUMNS: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'name', label: '珠子' },
  { key: 'category', label: '分類' },
  { key: 'size', label: '尺寸', align: 'right' },
  { key: 'stock', label: '庫存', align: 'right' },
  { key: 'reorder', label: '安全量', align: 'right' },
  { key: 'cost', label: '單顆', align: 'right' },
  { key: 'qty', label: '要叫', align: 'right' },
  { key: 'subtotal', label: '小計', align: 'right' },
  { key: 'supplier', label: '店鋪' },
]

export default function PickerTable({ listId, rows, sort, dir, baseQuery }: Props) {
  /** 點欄位標題換排序；同一欄再點一次換方向 */
  const sortHref = useCallback(
    (key: SortKey) => {
      const p = new URLSearchParams(baseQuery)
      p.set('sort', key)
      p.set('dir', sort === key && dir === 'asc' ? 'desc' : 'asc')
      return `?${p.toString()}`
    },
    [baseQuery, sort, dir],
  )

  // 樂觀更新：輸入框立刻反映，背景再送伺服器
  const [local, setLocal] = useState<Record<number, number>>({})
  const [pending, startTransition] = useTransition()
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const qtyOf = useCallback(
    (r: BeadPickerRow) => (local[r.beadId] !== undefined ? local[r.beadId] : r.qty),
    [local],
  )

  /** 數量改變：先更新畫面，500ms 後才送出，避免每個按鍵都打 API */
  const commit = useCallback(
    (beadId: number, qty: number) => {
      setLocal((s) => ({ ...s, [beadId]: qty }))

      clearTimeout(timers.current[beadId])
      timers.current[beadId] = setTimeout(() => {
        startTransition(async () => {
          await setQtyAction(listId, beadId, qty)
        })
      }, 500)
    },
    [listId],
  )

  /** 勾選框：打勾給建議數量，取消歸零 */
  const toggle = useCallback(
    (r: BeadPickerRow) => {
      const current = qtyOf(r)
      if (current > 0) {
        commit(r.beadId, 0)
        return
      }
      // 缺貨的給補到安全庫存兩倍，其餘給 10 顆當起點
      const suggested = r.isShortage ? r.reorderPoint * 2 - r.stockQty : 10
      commit(r.beadId, Math.max(1, suggested))
    },
    [commit, qtyOf],
  )

  const totals = useMemo(() => {
    let count = 0
    let qty = 0
    let cents = 0
    for (const r of rows) {
      const q = qtyOf(r)
      if (q > 0) {
        count++
        qty += q
        cents += q * r.unitCostCents
      }
    }
    return { count, qty, cents }
  }, [rows, qtyOf])

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-ink-soft">
        <span>
          已選 <span className="tnum text-ink">{totals.count}</span> 項
        </span>
        <span>
          共 <span className="tnum text-ink">{totals.qty}</span> 顆
        </span>
        <span>
          預估 <Money cents={totals.cents} />
        </span>
        {pending && <span className="text-accent">儲存中…</span>}
      </div>

      <Table>
        <thead>
          <tr>
            <Th align="center">選</Th>
            {COLUMNS.map((c) => (
              <Th key={c.key} align={c.align}>
                <a href={sortHref(c.key)} className="hover:text-accent" title={`依${c.label}排序`}>
                  {c.label}
                  {sort === c.key && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
                </a>
              </Th>
            ))}
            <Th>淘寶規格</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const q = qtyOf(r)
            return (
              <tr key={r.beadId} className={q > 0 ? 'bg-accent/5' : undefined}>
                <Td align="center">
                  <input
                    type="checkbox"
                    checked={q > 0}
                    onChange={() => toggle(r)}
                    aria-label={`選取 ${r.name}`}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </Td>

                <Td>
                  {r.name}
                  {r.source === 'shortage' && (
                    <span
                      className="ml-2 border border-hairline px-1.5 py-0.5 text-[11px] text-ink-soft"
                      title="由「一鍵帶入缺貨」加入"
                    >
                      缺貨帶入
                    </span>
                  )}
                </Td>

                <Td>{r.category ?? '—'}</Td>

                <Td align="right" numeric>
                  {r.sizeMm ? `${r.sizeMm}mm` : '—'}
                </Td>

                <Td align="right" numeric alert={r.isShortage}>
                  {r.stockQty}
                </Td>

                <Td align="right" numeric>
                  {r.reorderPoint || '—'}
                </Td>

                <Td align="right" numeric>
                  <Money cents={r.unitCostCents} showCents />
                </Td>

                <Td align="right">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={q || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                      if (!Number.isNaN(v) && v >= 0) commit(r.beadId, v)
                    }}
                    aria-label={`${r.name} 要叫的顆數`}
                    className="tnum w-20 border border-hairline bg-transparent px-2 py-1 text-right text-ink focus:border-accent focus:outline-none"
                  />
                </Td>

                <Td align="right" numeric>
                  {q > 0 ? <Money cents={q * r.unitCostCents} /> : '—'}
                </Td>

                <Td>{r.supplierName ?? '—'}</Td>

                <Td>
                  <span className="text-ink-soft">{r.sourceSpec ?? '—'}</span>
                </Td>

                <Td>
                  {r.sourceUrl && (
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline underline-offset-2"
                    >
                      去買
                    </a>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      {rows.length === 0 && (
        <p className="py-8 text-center text-[13px] text-ink-soft">
          沒有符合條件的珠子。把篩選條件放寬一點。
        </p>
      )}
    </>
  )
}
