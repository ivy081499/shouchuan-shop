'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  saveRecipeAction,
  updateProductAction,
  uploadProductImages,
  deleteProductImageAction,
} from '../actions.ts'
import { formatTWD, yuanToCents } from '@/lib/money'
import { calcProductCost, calcMargin, calcBuildableQty } from '@/lib/costing'

export interface BeadOption {
  id: number
  name: string
  sizeMm: number | null
  unitCostCents: number
  stockQty: number
  reorderPoint: number
  category: string | null
  imageUrl: string | null
  supplierName: string | null
  sourceTitle: string | null
  sourceSpec: string | null
  /** 已棄用：不再選用。已寫進配方的仍會顯示並標示，提醒換料 */
  isArchived: boolean
}

interface Line {
  beadId: number
  qty: number
}

export interface ProductPhoto {
  id: number
  url: string
  sortOrder: number
}

/** 數值區間篩選條件 */
interface Range {
  min: string
  max: string
}

const EMPTY_RANGE: Range = { min: '', max: '' }

const UNCATEGORIZED = '未分類'
const NO_SUPPLIER = '未指定'

type SortKey = 'name' | 'sizeMm' | 'unitCostCents' | 'stockQty'

const SORT_LABEL: Record<SortKey, string> = {
  name: '名稱',
  sizeMm: '尺寸',
  unitCostCents: '單顆成本',
  stockQty: '庫存',
}

const IMG_SIZE_KEY = 'recipe.imageSize'

/**
 * 尺寸快選的級距。
 * 依實際庫存訂（目前最大 8.3mm），不是憑空分段——
 * 珠子進得更大顆時要回來調整。
 */
const SIZE_PRESETS: Array<{ label: string; range: Range }> = [
  { label: '4mm 以下', range: { min: '', max: '4' } },
  { label: '5–7mm', range: { min: '5', max: '7' } },
  { label: '8mm 以上', range: { min: '8', max: '' } },
]

/** 兩個區間條件是否相同，用來判斷快選鈕要不要呈現按下狀態 */
function sameRange(a: Range, b: Range): boolean {
  return a.min === b.min && a.max === b.max
}

/** 數值落在區間內？欄位留白代表不限 */
function inRange(value: number | null, r: Range): boolean {
  if (value === null) return !r.min.trim() && !r.max.trim()
  const min = r.min.trim() === '' ? null : Number(r.min)
  const max = r.max.trim() === '' ? null : Number(r.max)
  if (min !== null && Number.isFinite(min) && value < min) return false
  if (max !== null && Number.isFinite(max) && value > max) return false
  return true
}

export default function RecipeEditor({
  productId,
  productName,
  priceCents,
  status,
  images,
  beads: allBeads,
  initialLines,
}: {
  productId: number
  productName: string
  priceCents: number
  status: string
  images: ProductPhoto[]
  beads: BeadOption[]
  initialLines: Line[]
}) {
  const [lines, setLines] = useState<Line[]>(initialLines)
  const [price, setPrice] = useState(String(priceCents / 100))
  const [currentStatus, setCurrentStatus] = useState(status)
  const [name, setName] = useState(productName)
  const [photos, setPhotos] = useState<ProductPhoto[]>(images)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  /**
   * 上次儲存的內容，供「重設」還原。
   * 儲存成功後要跟著更新——否則按重設會跳回剛進頁面時的狀態，而不是最後存檔的那次。
   * 第一次設定配方時 initialLines 為空陣列，重設等於清空。
   */
  const [saved, setSaved] = useState({
    lines: initialLines,
    price: String(priceCents / 100),
    status,
    name: productName,
  })

  /* ── 選料的篩選條件 ── */
  const [query, setQuery] = useState('')
  const [fCats, setFCats] = useState<Set<string>>(new Set())
  const [fSups, setFSups] = useState<Set<string>>(new Set())
  const [fSize, setFSize] = useState<Range>(EMPTY_RANGE)
  const [fCost, setFCost] = useState<Range>(EMPTY_RANGE)
  const [fStock, setFStock] = useState<Range>(EMPTY_RANGE)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  /** 細項（數字區間、供應商）預設收合；常用的快選按鈕一律攤開 */
  const [filterOpen, setFilterOpen] = useState(false)
  /**
   * 縮圖大小。不沿用庫存頁的全域 `--bead-img`，
   * 否則兩頁會互相改到對方的設定。
   */
  const [imgSize, setImgSize] = useState<'sm' | 'lg'>('sm')

  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /* 記住上次選的縮圖大小。讀不到就維持預設的小圖。 */
  useEffect(() => {
    try {
      const v = localStorage.getItem(IMG_SIZE_KEY)
      if (v === 'sm' || v === 'lg') setImgSize(v)
    } catch {
      /* 讀不到不影響本次操作 */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(IMG_SIZE_KEY, imgSize)
    } catch {
      /* 存不進去不影響本次操作 */
    }
  }, [imgSize])

  const byId = new Map(allBeads.map((b) => [b.id, b]))
  const used = new Set(lines.map((l) => l.beadId))

  /**
   * 可選的料：棄用的不出現在清單裡。
   * 例外是已經寫進這條配方的——那些要留著顯示並標「已棄用」，
   * 否則配方會看起來被清空，店主也無從得知該換料。
   */
  const beads = allBeads.filter((b) => !b.isArchived || used.has(b.id))

  const recipeForCost = lines
    .map((l) => {
      const b = byId.get(l.beadId)
      return b ? { beadId: l.beadId, qty: l.qty, unitCostCents: b.unitCostCents } : null
    })
    .filter((x): x is { beadId: number; qty: number; unitCostCents: number } => x !== null)

  const costCents = calcProductCost(recipeForCost)
  const margin = calcMargin(yuanToCents(price), costCents)
  const buildable = calcBuildableQty(
    lines
      .map((l) => {
        const b = byId.get(l.beadId)
        return b ? { qty: l.qty, stockQty: b.stockQty } : null
      })
      .filter((x): x is { qty: number; stockQty: number } => x !== null),
  )

  const totalBeadCount = lines.reduce((sum, l) => sum + l.qty, 0)

  function toggle(beadId: number) {
    setLines((ls) =>
      ls.some((l) => l.beadId === beadId)
        ? ls.filter((l) => l.beadId !== beadId)
        : [...ls, { beadId, qty: 1 }],
    )
  }

  function setQty(beadId: number, qty: number) {
    setLines((ls) => ls.map((l) => (l.beadId === beadId ? { ...l, qty: Math.max(1, qty) } : l)))
  }

  /** 還原到上次儲存的內容；沒存過就是全空 */
  function reset() {
    setLines(saved.lines)
    setPrice(saved.price)
    setCurrentStatus(saved.status)
    setName(saved.name)
    setError(null)
    setMsg(null)
    setZoom(null)
  }

  /** 有沒有未儲存的改動——沒有就不必顯示重設按鈕 */
  const dirty =
    price !== saved.price ||
    currentStatus !== saved.status ||
    name !== saved.name ||
    lines.length !== saved.lines.length ||
    lines.some((l) => {
      const s = saved.lines.find((x) => x.beadId === l.beadId)
      return !s || s.qty !== l.qty
    })

  function save() {
    setError(null)
    setMsg(null)
    if (name.trim() === '') {
      setError('請填寫手串名稱。')
      return
    }
    startTransition(async () => {
      const r1 = await saveRecipeAction(
        productId,
        lines.map((l, i) => ({ beadId: l.beadId, qty: l.qty, position: i })),
      )
      if (!r1.ok) {
        setError(r1.error)
        return
      }
      const r2 = await updateProductAction(productId, {
        name: name.trim(),
        priceCents: yuanToCents(price),
        status: currentStatus,
      })
      if (!r2.ok) {
        setError(r2.error)
        return
      }
      setSaved({ lines, price, status: currentStatus, name: name.trim() })
      setName(name.trim())
      setMsg('已儲存')
    })
  }

  /** 上傳照片。原始檔名不影響存檔，一律由後端依商品 id 與序號重新命名。 */
  function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setMsg(null)
    setUploading(true)
    const fd = new FormData()
    for (const f of Array.from(files)) fd.append('files', f)
    startTransition(async () => {
      const r = await uploadProductImages(productId, fd)
      if (!r.ok) {
        setError(r.error)
      } else {
        // 重新載入才拿得到新照片的 id 與網址
        setMsg(`已上傳 ${r.count} 張照片`)
        window.location.reload()
        return
      }
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    })
  }

  function removePhoto(imageId: number) {
    setError(null)
    setMsg(null)
    startTransition(async () => {
      const r = await deleteProductImageAction(productId, imageId)
      if (!r.ok) return
      setPhotos((ps) => ps.filter((p) => p.id !== imageId))
      setMsg('已移除照片（檔案仍留在電腦上）')
    })
  }

  /* ── 選料清單的篩選與排序 ── */

  const categoryOptions = useMemo(
    () => [...new Set(beads.map((b) => b.category ?? UNCATEGORIZED))].sort(),
    [beads],
  )
  const supplierOptions = useMemo(
    () => [...new Set(beads.map((b) => b.supplierName ?? NO_SUPPLIER))].sort(),
    [beads],
  )

  const q = query.trim().toLowerCase()

  /** 這顆珠子本身符不符合目前篩選條件（不含「已選一律顯示」的保護） */
  function matchesFilters(b: BeadOption): boolean {
    if (q) {
      const hay = [b.name, b.sourceTitle, b.sourceSpec, b.category, b.supplierName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q) && !(b.sizeMm !== null && String(b.sizeMm).includes(q))) return false
    }
    if (fCats.size > 0 && !fCats.has(b.category ?? UNCATEGORIZED)) return false
    if (fSups.size > 0 && !fSups.has(b.supplierName ?? NO_SUPPLIER)) return false
    if (!inRange(b.sizeMm, fSize)) return false
    if (!inRange(b.unitCostCents / 100, fCost)) return false
    if (!inRange(b.stockQty, fStock)) return false
    if (inStockOnly && b.stockQty <= 0) return false
    // 安全庫存為 0 代表不提醒，故要排除
    if (lowStockOnly && !(b.reorderPoint > 0 && b.stockQty <= b.reorderPoint)) return false
    return true
  }

  const visibleBeads = useMemo(() => {
    const out = beads.filter((b) => {
      if (selectedOnly) return used.has(b.id)
      /**
       * 已勾選的珠子即使不符條件也一律顯示——否則篩選時會從畫面消失，
       * 讓人以為配方被清掉了。列表上會標「已選」讓店主知道它為何在這。
       */
      if (used.has(b.id)) return true
      return matchesFilters(b)
    })

    const dir = sortAsc ? 1 : -1
    return [...out].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv, 'zh-Hant') * dir
      return ((av as number) - (bv as number)) * dir
    })
  }, [
    beads, used, q, fCats, fSups, fSize, fCost, fStock,
    inStockOnly, lowStockOnly, selectedOnly, sortKey, sortAsc,
  ])

  /** 有幾個篩選條件生效——收合時也要讓店主知道正在篩 */
  const activeFilters =
    (q ? 1 : 0) +
    fCats.size +
    fSups.size +
    [fSize, fCost, fStock].filter((r) => r.min.trim() || r.max.trim()).length +
    (inStockOnly ? 1 : 0) +
    (lowStockOnly ? 1 : 0) +
    (selectedOnly ? 1 : 0)

  function clearFilters() {
    setQuery('')
    setFCats(new Set())
    setFSups(new Set())
    setFSize(EMPTY_RANGE)
    setFCost(EMPTY_RANGE)
    setFStock(EMPTY_RANGE)
    setInStockOnly(false)
    setLowStockOnly(false)
    setSelectedOnly(false)
  }

  function toggleSet(set: Set<string>, value: string, apply: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  const categories = [...new Set(visibleBeads.map((b) => b.category ?? UNCATEGORIZED))].sort()

  /** 縮圖邊長：小 36px、大 120px（庫存頁是 44／150，這裡列高較密所以略小） */
  const thumbPx = imgSize === 'lg' ? 120 : 36
  const thumbStyle = { height: thumbPx, width: thumbPx }

  /** 數值範圍輸入 */
  function RangeInput({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
          placeholder="不限"
          inputMode="decimal"
          className="w-16 border-b border-hairline bg-transparent py-0.5 text-right text-[12px] tnum focus:border-accent focus:outline-none"
        />
        <span className="text-[11px] text-ink-soft">–</span>
        <input
          value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })}
          placeholder="不限"
          inputMode="decimal"
          className="w-16 border-b border-hairline bg-transparent py-0.5 text-right text-[12px] tnum focus:border-accent focus:outline-none"
        />
      </div>
    )
  }

  /** 快選鈕：點一下切換，按下時反白 */
  function QuickChip({
    on,
    onClick,
    children,
  }: {
    on: boolean
    onClick: () => void
    children: React.ReactNode
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={`border px-2.5 py-1 text-[12px] transition ${
          on
            ? 'border-ink bg-ink text-paper'
            : 'border-hairline text-ink-soft hover:border-accent hover:text-ink'
        }`}
      >
        {children}
      </button>
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
              aria-pressed={on}
              className={`border px-2 py-0.5 text-[12px] transition ${
                on ? 'border-ink bg-ink text-paper' : 'border-hairline text-ink-soft hover:border-accent hover:text-ink'
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
      {/* ── 基本資料：名稱、售價、狀態、照片收在同一張卡 ── */}
      <section className="mb-6 border border-hairline">
        <h2 className="border-b border-hairline px-5 py-2.5 text-[11px] tracking-[0.15em] text-ink-soft">
          基本資料
        </h2>

        <div className="grid gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[12px] lg:col-span-2">
            <span className="block text-ink-soft">手串名稱</span>
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：桃花手串"
              className="mt-1 w-full border-b border-hairline bg-transparent py-1 text-[15px] focus:border-accent focus:outline-none"
            />
          </label>

          <label className="text-[12px]">
            <span className="block text-ink-soft">售價 NT$</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full border-b border-hairline bg-transparent py-1 tnum text-[15px] focus:border-accent focus:outline-none"
            />
          </label>

          <label className="text-[12px]">
            <span className="block text-ink-soft">狀態</span>
            <select
              value={currentStatus}
              onChange={(e) => setCurrentStatus(e.target.value)}
              className="mt-1 w-full border-b border-hairline bg-transparent py-1 text-[15px] focus:border-accent focus:outline-none"
            >
              <option value="draft">草稿</option>
              <option value="active">已上架</option>
              <option value="sold_out">已售完</option>
              <option value="archived">已下架</option>
            </select>
          </label>
        </div>

        {/* ── 照片 ── */}
        <div className="border-t border-hairline px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] text-ink-soft">商品照片</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">
                可一次選多張，<strong className="text-ink">檔名不用先改</strong>——存進電腦時會自動
                重新命名成 <span className="tnum">{productId}-1.jpg</span>、
                <span className="tnum">{productId}-2.jpg</span> 依序排下去。
              </div>
            </div>
            <label className="cursor-pointer border border-hairline px-4 py-2 text-[13px] hover:border-accent">
              {uploading ? '上傳中…' : '選擇照片'}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading || pending}
                onChange={(e) => upload(e.target.files)}
                className="hidden"
              />
            </label>
          </div>

          {photos.length === 0 ? (
            <div className="mt-3 text-[13px] text-ink-soft">還沒有照片。</div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {photos.map((p) => (
                <div key={p.id} className="w-24">
                  <button
                    type="button"
                    onClick={() => setZoom({ url: p.url, name: `${name}（${p.sortOrder}）` })}
                    className="block w-24 border border-hairline transition hover:border-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="h-24 w-24 object-cover" />
                  </button>
                  <div className="mt-1 flex items-center justify-between text-[12px]">
                    <span className="tnum text-ink-soft">
                      {productId}-{p.sortOrder}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      disabled={pending}
                      className="text-ink-soft hover:text-alert"
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 成本摘要：一條橫列，不再佔四大格 ── */}
      <section className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 border border-hairline px-5 py-3">
        <div>
          <span className="text-[12px] text-ink-soft">材料成本 </span>
          <span className="tnum text-[17px]">{formatTWD(costCents, true)}</span>
          <span className="ml-1 text-[12px] text-ink-soft">
            （{lines.length} 種 / {totalBeadCount} 顆）
          </span>
        </div>
        <div>
          <span className="text-[12px] text-ink-soft">毛利 </span>
          <span className={`tnum text-[17px] ${margin.profitCents < 0 ? 'text-alert' : 'text-ink'}`}>
            {formatTWD(margin.profitCents)}
          </span>
          <span className="ml-1 text-[12px] text-ink-soft">
            （{Math.round(margin.marginRate * 100)}%）
          </span>
        </div>
        <div>
          <span className="text-[12px] text-ink-soft">目前可做 </span>
          <span className={`tnum text-[17px] ${buildable === 0 ? 'text-alert' : 'text-ink'}`}>
            {buildable}
          </span>
          <span className="ml-1 text-[12px] text-ink-soft">條（依現有庫存）</span>
        </div>
      </section>

      {error && <div className="mb-5 border-l-2 border-alert bg-alert/5 px-4 py-3 text-[13px]">{error}</div>}
      {msg && <div className="mb-5 border-l-2 border-accent bg-sunk px-4 py-3 text-[13px]">{msg}</div>}

      {/* ── 選料 ── */}
      <section className="mb-24">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-[15px] tracking-wider text-ink">選料</h2>
          <p className="text-[12px] text-ink-soft">
            勾選用到的珠子填上顆數，成本即時重算。庫存 0 也能勾，缺的再去補貨。
          </p>
        </div>

        <div className="mb-4 border border-hairline">
          {/* 搜尋 + 大小圖切換 */}
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-2.5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋名稱、淘寶原文、款式、分類、供應商…"
              className="min-w-[220px] flex-1 border-b border-hairline bg-transparent py-1 text-[13px] focus:border-accent focus:outline-none"
            />

            <div className="flex items-center text-[12px]">
              <span className="mr-2 text-ink-soft">圖片</span>
              <div className="flex border border-hairline">
                <button
                  type="button"
                  onClick={() => setImgSize('sm')}
                  aria-pressed={imgSize === 'sm'}
                  className={`px-3 py-1 transition ${
                    imgSize === 'sm' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  小
                </button>
                <button
                  type="button"
                  onClick={() => setImgSize('lg')}
                  aria-pressed={imgSize === 'lg'}
                  className={`border-l border-hairline px-3 py-1 transition ${
                    imgSize === 'lg' ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  大
                </button>
              </div>
            </div>
          </div>

          {/* 快選：常用條件點一下就好，不必自己打字 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5">
            <span className="mr-1 text-[12px] text-ink-soft">快選</span>

            <QuickChip on={selectedOnly} onClick={() => setSelectedOnly((v) => !v)}>
              已選 {lines.length}
            </QuickChip>
            <QuickChip on={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
              有庫存
            </QuickChip>
            <QuickChip on={lowStockOnly} onClick={() => setLowStockOnly((v) => !v)}>
              快沒了
            </QuickChip>

            <span className="mx-1 h-4 w-px bg-hairline" />

            {categoryOptions.map((c) => (
              <QuickChip
                key={c}
                on={fCats.has(c)}
                onClick={() => toggleSet(fCats, c, setFCats)}
              >
                {c}
              </QuickChip>
            ))}

            <span className="mx-1 h-4 w-px bg-hairline" />

            {SIZE_PRESETS.map((s) => (
              <QuickChip
                key={s.label}
                on={sameRange(fSize, s.range)}
                onClick={() => setFSize(sameRange(fSize, s.range) ? EMPTY_RANGE : s.range)}
              >
                {s.label}
              </QuickChip>
            ))}

            <div className="ml-auto flex items-center gap-3">
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[12px] text-ink-soft underline hover:text-ink"
                >
                  清除 ({activeFilters})
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
                className="text-[12px] text-ink-soft hover:text-ink"
              >
                {filterOpen ? '收起細項 ▲' : '更多條件 ▼'}
              </button>
            </div>
          </div>

          {/* 細項：要自己填數字的放這，預設收著 */}
          {filterOpen && (
            <div className="grid gap-x-6 gap-y-3 border-t border-hairline px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="text-[12px]">
                <span className="block text-ink-soft">尺寸 mm</span>
                <div className="mt-1.5">
                  <RangeInput value={fSize} onChange={setFSize} />
                </div>
              </div>

              <div className="text-[12px]">
                <span className="block text-ink-soft">單顆成本 NT$</span>
                <div className="mt-1.5">
                  <RangeInput value={fCost} onChange={setFCost} />
                </div>
              </div>

              <div className="text-[12px]">
                <span className="block text-ink-soft">庫存</span>
                <div className="mt-1.5">
                  <RangeInput value={fStock} onChange={setFStock} />
                </div>
              </div>

              <div className="text-[12px] lg:col-span-3">
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
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-soft">
          <span>
            顯示 {visibleBeads.length} 種
            {activeFilters > 0 && ` / 全部 ${beads.length} 種`}
            {lines.length > 0 && `，已選 ${lines.length} 種`}
          </span>
          <div className="flex items-center gap-2">
            <span>排序</span>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (sortKey === k) setSortAsc((v) => !v)
                  else {
                    setSortKey(k)
                    setSortAsc(true)
                  }
                }}
                className={`border px-2 py-0.5 transition ${
                  sortKey === k
                    ? 'border-ink text-ink'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {SORT_LABEL[k]}
                {sortKey === k && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
        </div>

        {beads.length === 0 ? (
          <div className="border border-dashed border-hairline px-8 py-12 text-center text-[13px] text-ink-soft">
            還沒有珠子可選。先到「庫存」匯入淘寶訂單。
          </div>
        ) : visibleBeads.length === 0 ? (
          <div className="border border-dashed border-hairline px-8 py-12 text-center text-[13px] text-ink-soft">
            找不到符合條件的珠子。
            <button onClick={clearFilters} className="ml-2 underline hover:text-ink">
              清除篩選
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((cat) => {
              const group = visibleBeads.filter((b) => (b.category ?? UNCATEGORIZED) === cat)
              if (group.length === 0) return null
              return (
                <section key={cat}>
                  <h3 className="mb-2 border-b border-hairline pb-1.5 font-serif text-[15px] tracking-wider text-ink">
                    {cat}
                    <span className="ml-2 text-[12px] tracking-normal text-ink-soft">
                      {group.length}
                    </span>
                  </h3>
                  <ul className="divide-y divide-hairline">
                    {group.map((b) => {
                      const line = lines.find((l) => l.beadId === b.id)
                      const checked = used.has(b.id)
                      const low = b.reorderPoint > 0 && b.stockQty <= b.reorderPoint
                      /** 不符目前篩選、純粹因為已選進配方才留在畫面上 */
                      const keptBecauseSelected =
                        checked && activeFilters > 0 && !selectedOnly && !matchesFilters(b)
                      return (
                        <li
                          key={b.id}
                          className={`flex flex-wrap items-center gap-4 py-2.5 text-[13px] ${
                            checked ? 'bg-sunk' : ''
                          }`}
                        >
                          {/* 縮圖不能放在 label 內，否則點圖會變成勾選 */}
                          {b.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => setZoom({ url: b.imageUrl as string, name: b.name })}
                              title="點開看大圖"
                              style={thumbStyle}
                              className="shrink-0 overflow-hidden border border-hairline transition hover:border-accent"
                            >
                              {/* 圖片來源含外部網址（淘寶），next/image 需設定網域，故用原生 img */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {/* 大圖是要看清楚料，整張顯示不裁切；小圖填滿比較整齊 */}
                              <img
                                src={b.imageUrl}
                                alt={b.name}
                                className={`h-full w-full ${
                                  imgSize === 'lg' ? 'bg-sunk object-contain' : 'object-cover'
                                }`}
                              />
                            </button>
                          ) : (
                            <span
                              style={thumbStyle}
                              className="shrink-0 border border-hairline bg-sunk"
                            />
                          )}
                          <label className="flex flex-1 min-w-[200px] cursor-pointer items-center gap-3">
                            <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} />
                            <span>{b.name}</span>
                            {b.sizeMm && <span className="tnum text-ink-soft">{b.sizeMm}mm</span>}
                            {b.isArchived && (
                              <span
                                title="這顆料已棄用，只因為還在這條配方裡才顯示。建議找時間換掉。"
                                className="border border-alert px-1.5 py-0.5 text-[11px] text-alert"
                              >
                                已棄用
                              </span>
                            )}
                            {keptBecauseSelected && !b.isArchived && (
                              <span
                                title="不符目前的篩選條件，但因為已選進配方所以保留顯示"
                                className="border border-hairline px-1.5 py-0.5 text-[11px] text-ink-soft"
                              >
                                已選
                              </span>
                            )}
                          </label>
                          <span className="tnum w-24 text-right text-ink-soft">
                            {formatTWD(b.unitCostCents, true)}
                          </span>
                          <span
                            className={`tnum w-20 text-right ${
                              b.stockQty === 0 ? 'text-alert' : low ? 'text-accent' : 'text-ink-soft'
                            }`}
                            title={low ? `低於安全庫存 ${b.reorderPoint}` : undefined}
                          >
                            庫存 {b.stockQty}
                          </span>
                          <span className="w-28 text-right">
                            {checked && (
                              <input
                                type="number"
                                min={1}
                                value={line?.qty ?? 1}
                                onChange={(e) => setQty(b.id, Number.parseInt(e.target.value, 10) || 1)}
                                className="w-16 border-b border-hairline bg-transparent py-1 text-right tnum focus:border-accent focus:outline-none"
                              />
                            )}
                          </span>
                          <span className="tnum w-24 text-right">
                            {checked && line ? formatTWD(b.unitCostCents * line.qty, true) : ''}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 儲存列固定在底部，捲到哪都能存 ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-end gap-4 px-6 py-3">
          {dirty && <span className="mr-auto text-[12px] text-accent">有未儲存的改動</span>}
          {!dirty && msg && <span className="mr-auto text-[12px] text-ink-soft">{msg}</span>}
          <button
            onClick={reset}
            disabled={pending || !dirty}
            title={
              saved.lines.length === 0
                ? '還沒存過配方，重設會清空目前的勾選'
                : '回到上次儲存的內容'
            }
            className="border border-hairline px-5 py-2.5 text-[13px] tracking-wider text-ink hover:border-accent disabled:opacity-40"
          >
            重設
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="bg-ink px-6 py-2.5 text-[13px] tracking-wider text-paper hover:bg-accent disabled:opacity-50"
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      {zoom && (
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
            <img src={zoom.url} alt={zoom.name} className="max-h-[65vh] w-full bg-sunk object-contain" />
          </div>
        </div>
      )}
    </>
  )
}
