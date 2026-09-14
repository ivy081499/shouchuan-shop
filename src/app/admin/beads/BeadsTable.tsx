'use client'

import { useEffect, useMemo, useState } from 'react'
import { Table, Th, Td, Money } from '@/ui'
import BeadImageCell from './BeadImageCell.tsx'
import EditableCell from './EditableCell.tsx'
import StockCell from './StockCell.tsx'

export interface BeadRow {
  id: number
  name: string
  category: string | null
  sizeMm: number | null
  imageUrl: string | null
  unitCostCents: number
  stockQty: number
  reorderPoint: number
  supplierName: string | null
}

const SIZE_KEY = 'beads.imageSize'

export default function BeadsTable({
  beads,
  categories,
}: {
  beads: BeadRow[]
  categories: string[]
}) {
  const [query, setQuery] = useState('')
  const [size, setSize] = useState<'sm' | 'lg'>('sm')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  // localStorage 可能被停用（無痕視窗、封鎖網站資料），讀寫都要防守
  useEffect(() => {
    try {
      const v = localStorage.getItem(SIZE_KEY)
      if (v === 'sm' || v === 'lg') setSize(v)
    } catch {
      /* 用預設值 */
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--bead-img', size === 'lg' ? '150px' : '44px')
    try {
      localStorage.setItem(SIZE_KEY, size)
    } catch {
      /* 存不進去不影響本次操作 */
    }
  }, [size])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return beads
    return beads.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.category ?? '').toLowerCase().includes(q) ||
        (b.supplierName ?? '').toLowerCase().includes(q) ||
        (b.sizeMm !== null && String(b.sizeMm).includes(q)),
    )
  }, [beads, query])

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  // 搜尋或改每頁筆數後，原本的頁碼可能已超出範圍
  const current = Math.min(page, totalPages)
  const pageRows = rows.slice((current - 1) * perPage, current * perPage)

  // 搜尋條件變動就回到第一頁，否則會停在空白頁
  useEffect(() => {
    setPage(1)
  }, [query, perPage])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋名稱、分類、尺寸或供應商…"
          className="w-full max-w-xs border-b border-hairline bg-transparent py-1.5 text-[13px] focus:border-accent focus:outline-none"
        />
        <span className="text-[12px] text-ink-soft">
          {query ? `符合 ${rows.length} 種` : `共 ${beads.length} 種`}
        </span>
        <span className="text-[12px] text-ink-soft">
          虛線底的欄位點一下可直接改
        </span>
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-[12px] text-ink-soft underline hover:text-ink"
          >
            清除搜尋
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-[13px]">
          <span className="text-ink-soft">圖片</span>
          <div className="flex border border-hairline">
            <button
              type="button"
              onClick={() => setSize('sm')}
              aria-pressed={size === 'sm'}
              className={`px-3 py-1.5 transition ${
                size === 'sm' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
              }`}
            >
              小
            </button>
            <button
              type="button"
              onClick={() => setSize('lg')}
              aria-pressed={size === 'lg'}
              className={`border-l border-hairline px-3 py-1.5 transition ${
                size === 'lg' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
              }`}
            >
              大
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-hairline px-8 py-12 text-center text-[13px] text-ink-soft">
          找不到符合「{query}」的珠子。
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>圖</Th>
              <Th>名稱</Th>
              <Th>分類</Th>
              <Th align="right">尺寸</Th>
              <Th align="right">單顆成本</Th>
              <Th align="right">庫存</Th>
              <Th align="right">安全庫存</Th>
              <Th align="right">庫存值</Th>
              <Th>供應商</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((b) => {
              const isLow = b.reorderPoint > 0 && b.stockQty <= b.reorderPoint
              return (
                <tr key={b.id}>
                  <Td>
                    <BeadImageCell beadId={b.id} name={b.name} initialUrl={b.imageUrl} />
                  </Td>
                  <Td>
                    <EditableCell beadId={b.id} field="name" value={b.name} />
                  </Td>
                  <Td>
                    <EditableCell
                      beadId={b.id}
                      field="category"
                      value={b.category}
                      options={categories}
                      placeholder="未分類"
                    />
                  </Td>
                  <Td align="right" numeric>
                    <EditableCell beadId={b.id} field="sizeMm" value={b.sizeMm} align="right" />
                  </Td>
                  <Td align="right" numeric>
                    <Money cents={b.unitCostCents} showCents />
                  </Td>
                  <Td align="right" numeric>
                    <StockCell beadId={b.id} stockQty={b.stockQty} isLow={isLow} />
                  </Td>
                  <Td align="right" numeric>
                    <EditableCell
                      beadId={b.id}
                      field="reorderPoint"
                      value={b.reorderPoint || null}
                      align="right"
                    />
                  </Td>
                  <Td align="right" numeric>
                    <Money cents={b.stockQty * b.unitCostCents} />
                  </Td>
                  <Td>{b.supplierName ?? '—'}</Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {rows.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-4 text-[13px]">
          <span className="text-ink-soft">
            第 {(current - 1) * perPage + 1}–{Math.min(current * perPage, rows.length)} 筆，
            共 {rows.length} 筆
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 1}
                className="border border-hairline px-3 py-1.5 text-ink hover:border-accent disabled:opacity-40"
              >
                上一頁
              </button>
              <span className="px-3 tnum text-ink-soft">
                {current} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current === totalPages}
                className="border border-hairline px-3 py-1.5 text-ink hover:border-accent disabled:opacity-40"
              >
                下一頁
              </button>
            </div>
          )}

          <label className="ml-auto flex items-center gap-2 text-ink-soft">
            每頁
            <select
              value={perPage}
              onChange={(e) => setPerPage(Number.parseInt(e.target.value, 10))}
              className="border-b border-hairline bg-transparent py-1 text-ink focus:border-accent focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={9999}>全部</option>
            </select>
            筆
          </label>
        </div>
      )}
    </>
  )
}
