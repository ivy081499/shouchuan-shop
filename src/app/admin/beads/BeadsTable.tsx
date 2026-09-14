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
const UNCATEGORIZED = '（未分類）'
const NO_SUPPLIER = '（無供應商）'

type SortKey = 'name' | 'category' | 'sizeMm' | 'unitCostCents' | 'stockQty' | 'reorderPoint' | 'stockValue' | 'supplierName'
type NumField = 'sizeMm' | 'unitCostCents' | 'stockQty' | 'reorderPoint'

/** 數值欄的範圍條件，空字串代表不限 */
type Range = { min: string; max: string }
const EMPTY_RANGE: Range = { min: '', max: '' }

export default function BeadsTable({
  beads,
  categories,
}: {
  beads: BeadRow[]
  categories: string[]
}) {
  const [size, setSize] = useState<'sm' | 'lg'>('sm')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)

  /* ── 各欄篩選條件，彼此以 AND 組合 ── */
  const [fName, setFName] = useState('')
  const [fCats, setFCats] = useState<Set<string>>(new Set())
  const [fSups, setFSups] = useState<Set<string>>(new Set())
  const [fSize, setFSize] = useState<Range>(EMPTY_RANGE)
  const [fCost, setFCost] = useState<Range>(EMPTY_RANGE)
  const [fStock, setFStock] = useState<Range>(EMPTY_RANGE)
  const [fReorder, setFReorder] = useState<Range>(EMPTY_RANGE)

  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)

  // localStorage 可能被停用（無痕視窗、封鎖網站資料）
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

  const supplierOptions = useMemo(
    () => [...new Set(beads.map((b) => b.supplierName ?? NO_SUPPLIER))].sort(),
    [beads],
  )
  const categoryOptions = useMemo(() => {
    const fromData = beads.map((b) => b.category ?? UNCATEGORIZED)
    return [...new Set([...categories, ...fromData])].sort()
  }, [beads, categories])

  /** 數值是否落在範圍內；欄位為 null 時只要有下限就排除 */
  function inRange(v: number | null, r: Range, scale = 1): boolean {
    const lo = r.min.trim() === '' ? null : Number.parseFloat(r.min)
    const hi = r.max.trim() === '' ? null : Number.parseFloat(r.max)
    if (lo === null && hi === null) return true
    if (v === null) return false
    const val = v / scale
    if (lo !== null && Number.isFinite(lo) && val < lo) return false
    if (hi !== null && Number.isFinite(hi) && val > hi) return false
    return true
  }

  const rows = useMemo(() => {
    const nameQ = fName.trim().toLowerCase()
    const out = beads.filter((b) => {
      if (nameQ && !b.name.toLowerCase().includes(nameQ)) return false
      if (fCats.size > 0 && !fCats.has(b.category ?? UNCATEGORIZED)) return false
      if (fSups.size > 0 && !fSups.has(b.supplierName ?? NO_SUPPLIER)) return false
      if (!inRange(b.sizeMm, fSize)) return false
      // 成本存的是「分」，篩選用「元」比較直覺
      if (!inRange(b.unitCostCents, fCost, 100)) return false
      if (!inRange(b.stockQty, fStock)) return false
      if (!inRange(b.reorderPoint, fReorder)) return false
      return true
    })

    const dir = sortAsc ? 1 : -1
    return out.sort((a, b) => {
      const pick = (x: BeadRow) =>
        sortKey === 'stockValue' ? x.stockQty * x.unitCostCents : x[sortKey]
      const va = pick(a)
      const vb = pick(b)
      // null 一律排最後，不論升降冪——否則「沒填的」會佔據第一頁
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'zh-Hant') * dir
    })
  }, [beads, fName, fCats, fSups, fSize, fCost, fStock, fReorder, sortKey, sortAsc])

  const activeCount =
    (fName.trim() ? 1 : 0) +
    (fCats.size ? 1 : 0) +
    (fSups.size ? 1 : 0) +
    [fSize, fCost, fStock, fReorder].filter((r) => r.min.trim() || r.max.trim()).length

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, totalPages)
  const pageRows = rows.slice((current - 1) * perPage, current * perPage)

  // 篩選條件變動就回第一頁，否則會停在空白頁
  useEffect(() => {
    setPage(1)
  }, [fName, fCats, fSups, fSize, fCost, fStock, fReorder, perPage])

  function toggleSet(set: Set<string>, v: string, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setter(next)
  }

  function clearAll() {
    setFName('')
    setFCats(new Set())
    setFSups(new Set())
    setFSize(EMPTY_RANGE)
    setFCost(EMPTY_RANGE)
    setFStock(EMPTY_RANGE)
    setFReorder(EMPTY_RANGE)
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  /** 可排序的表頭 */
  function SortTh({
    k,
    children,
    align = 'left',
  }: {
    k: SortKey
    children: React.ReactNode
    align?: 'left' | 'right'
  }) {
    const on = sortKey === k
    return (
      <Th align={align}>
        <button
          type="button"
          onClick={() => sortBy(k)}
          className={`${align === 'right' ? 'text-right' : 'text-left'} hover:text-ink ${on ? 'text-ink' : ''}`}
        >
          {children}
          <span className="ml-1 text-[10px]">{on ? (sortAsc ? '▲' : '▼') : '↕'}</span>
        </button>
      </Th>
    )
  }

  /** 數值範圍輸入 */
  function RangeInput({
    value,
    onChange,
    placeholder,
  }: {
    value: Range
    onChange: (r: Range) => void
    placeholder: string
  }) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
          placeholder={placeholder}
          inputMode="decimal"
          className="w-14 border-b border-hairline bg-transparent py-0.5 text-right text-[12px] tnum focus:border-accent focus:outline-none"
        />
        <span className="text-[11px] text-ink-soft">–</span>
        <input
          value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })}
          placeholder="不限"
          inputMode="decimal"
          className="w-14 border-b border-hairline bg-transparent py-0.5 text-right text-[12px] tnum focus:border-accent focus:outline-none"
        />
      </div>
    )
  }

  /** 多選籤 */
  function ChipGroup({
    options,
    selected,
    onToggle,
  }: {
    options: string[]
    selected: Set<string>
    onToggle: (v: string) => void
  }) {
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.has(o)
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`border px-2 py-0.5 text-[12px] transition ${
                on
                  ? 'border-ink bg-ink text-paper'
                  : 'border-hairline text-ink-soft hover:border-accent hover:text-ink'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {/* ── 篩選列：各欄條件同時生效 ── */}
      <div className="mb-5 border border-hairline">
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-sunk px-4 py-2.5">
          <span className="text-[13px] text-ink">篩選</span>
          <span className="text-[12px] text-ink-soft">
            {activeCount > 0 ? `${activeCount} 個條件，符合 ${rows.length} 種` : `共 ${beads.length} 種`}
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[12px] text-ink-soft underline hover:text-ink"
            >
              全部清除
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 text-[13px]">
            <span className="text-ink-soft">圖片</span>
            <div className="flex border border-hairline">
              <button
                type="button"
                onClick={() => setSize('sm')}
                aria-pressed={size === 'sm'}
                className={`px-3 py-1 transition ${
                  size === 'sm' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
                }`}
              >
                小
              </button>
              <button
                type="button"
                onClick={() => setSize('lg')}
                aria-pressed={size === 'lg'}
                className={`border-l border-hairline px-3 py-1 transition ${
                  size === 'lg' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
                }`}
              >
                大
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[12px]">
            <span className="block text-ink-soft">名稱含有</span>
            <input
              type="search"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="例：和田玉"
              className="mt-1 w-full border-b border-hairline bg-transparent py-1 text-[13px] focus:border-accent focus:outline-none"
            />
          </label>

          <div className="text-[12px] lg:col-span-2">
            <span className="block text-ink-soft">分類（可複選）</span>
            <div className="mt-1.5">
              <ChipGroup
                options={categoryOptions}
                selected={fCats}
                onToggle={(v) => toggleSet(fCats, v, setFCats)}
              />
            </div>
          </div>

          <div className="text-[12px]">
            <span className="block text-ink-soft">尺寸 mm</span>
            <div className="mt-1.5">
              <RangeInput value={fSize} onChange={setFSize} placeholder="不限" />
            </div>
          </div>

          <div className="text-[12px]">
            <span className="block text-ink-soft">單顆成本 NT$</span>
            <div className="mt-1.5">
              <RangeInput value={fCost} onChange={setFCost} placeholder="不限" />
            </div>
          </div>

          <div className="text-[12px]">
            <span className="block text-ink-soft">庫存</span>
            <div className="mt-1.5">
              <RangeInput value={fStock} onChange={setFStock} placeholder="不限" />
            </div>
          </div>

          <div className="text-[12px]">
            <span className="block text-ink-soft">安全庫存</span>
            <div className="mt-1.5">
              <RangeInput value={fReorder} onChange={setFReorder} placeholder="不限" />
            </div>
          </div>

          <div className="text-[12px] lg:col-span-2">
            <span className="block text-ink-soft">供應商（可複選）</span>
            <div className="mt-1.5">
              <ChipGroup
                options={supplierOptions}
                selected={fSups}
                onToggle={(v) => toggleSet(fSups, v, setFSups)}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="mb-3 text-[12px] text-ink-soft">
        虛線底的欄位點一下可直接改；點欄位標題可排序。
      </p>

      {rows.length === 0 ? (
        <div className="border border-dashed border-hairline px-8 py-12 text-center text-[13px] text-ink-soft">
          沒有符合這些條件的珠子。
          <button type="button" onClick={clearAll} className="ml-2 underline hover:text-ink">
            清除篩選
          </button>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>圖</Th>
              <SortTh k="name">名稱</SortTh>
              <SortTh k="category">分類</SortTh>
              <SortTh k="sizeMm" align="right">尺寸</SortTh>
              <SortTh k="unitCostCents" align="right">單顆成本</SortTh>
              <SortTh k="stockQty" align="right">庫存</SortTh>
              <SortTh k="reorderPoint" align="right">安全庫存</SortTh>
              <SortTh k="stockValue" align="right">庫存值</SortTh>
              <SortTh k="supplierName">供應商</SortTh>
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
