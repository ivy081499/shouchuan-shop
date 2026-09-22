'use client'

import { useRef, useState, useTransition } from 'react'
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
  category: string | null
  imageUrl: string | null
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

export default function RecipeEditor({
  productId,
  productName,
  priceCents,
  status,
  images,
  beads,
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
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const byId = new Map(beads.map((b) => [b.id, b]))
  const used = new Set(lines.map((l) => l.beadId))

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

  /** 上傳照片。可一次選多張，檔名依商品 id 與序號自動產生。 */
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

  /**
   * 搜尋過濾。已勾選的珠子一律保留——否則搜尋時會從畫面消失，
   * 讓人以為配方被清掉了。
   */
  const q = query.trim().toLowerCase()
  const visibleBeads = q
    ? beads.filter(
        (b) =>
          used.has(b.id) ||
          b.name.toLowerCase().includes(q) ||
          (b.sizeMm !== null && String(b.sizeMm).includes(q)) ||
          (b.category ?? '').toLowerCase().includes(q),
      )
    : beads

  const categories = [...new Set(visibleBeads.map((b) => b.category ?? '未分類'))].sort()

  return (
    <>
      <div className="mb-8 border border-hairline px-5 py-4">
        <label className="block text-[11px] tracking-[0.15em] text-ink-soft">手串名稱</label>
        <input
          type="text"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：桃花手串"
          className="mt-1.5 w-full border-b border-hairline bg-transparent py-1 text-xl focus:border-accent focus:outline-none"
        />
        <div className="mt-1 text-[12px] text-ink-soft">改完按下方「儲存」才會生效。</div>
      </div>

      <div className="mb-8 border border-hairline px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.15em] text-ink-soft">商品照片</div>
            <div className="mt-1 text-[12px] text-ink-soft">
              可一次選多張，<strong>檔名不用先改</strong>——存進電腦時會自動重新命名成{' '}
              <span className="tnum">{productId}-1.jpg</span>、
              <span className="tnum">{productId}-2.jpg</span> 這樣依序排下去。
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
          <div className="mt-4 text-[13px] text-ink-soft">還沒有照片。</div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p.id} className="w-28">
                <button
                  type="button"
                  onClick={() => setZoom({ url: p.url, name: `${name}（${p.sortOrder}）` })}
                  className="block w-28 border border-hairline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-28 w-28 object-cover" />
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

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <div className="border border-hairline px-5 py-4">
          <div className="text-[11px] tracking-[0.15em] text-ink-soft">材料成本</div>
          <div className="mt-1.5 tnum text-2xl">{formatTWD(costCents, true)}</div>
          <div className="mt-1 text-[12px] text-ink-soft">{lines.length} 種珠子</div>
        </div>
        <div className="border border-hairline px-5 py-4">
          <div className="text-[11px] tracking-[0.15em] text-ink-soft">售價</div>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1.5 w-full border-b border-hairline bg-transparent tnum text-2xl focus:border-accent focus:outline-none"
          />
        </div>
        <div className="border border-hairline px-5 py-4">
          <div className="text-[11px] tracking-[0.15em] text-ink-soft">毛利</div>
          <div
            className={`mt-1.5 tnum text-2xl ${margin.profitCents < 0 ? 'text-alert' : 'text-ink'}`}
          >
            {formatTWD(margin.profitCents)}
          </div>
          <div className="mt-1 text-[12px] text-ink-soft">
            毛利率 {Math.round(margin.marginRate * 100)}%
          </div>
        </div>
        <div className="border border-hairline px-5 py-4">
          <div className="text-[11px] tracking-[0.15em] text-ink-soft">目前可做</div>
          <div className={`mt-1.5 tnum text-2xl ${buildable === 0 ? 'text-alert' : 'text-ink'}`}>
            {buildable}
          </div>
          <div className="mt-1 text-[12px] text-ink-soft">依現有庫存</div>
        </div>
      </div>

      {error && <div className="mb-5 border-l-2 border-alert bg-alert/5 px-4 py-3 text-[13px]">{error}</div>}
      {msg && <div className="mb-5 border-l-2 border-accent bg-sunk px-4 py-3 text-[13px]">{msg}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-5">
        <label className="text-[13px]">
          <span className="text-ink-soft">狀態</span>
          <select
            value={currentStatus}
            onChange={(e) => setCurrentStatus(e.target.value)}
            className="ml-2 border-b border-hairline bg-transparent py-1.5 focus:border-accent focus:outline-none"
          >
            <option value="draft">草稿</option>
            <option value="active">已上架</option>
            <option value="sold_out">已售完</option>
            <option value="archived">已下架</option>
          </select>
        </label>
        <button
          onClick={save}
          disabled={pending}
          className="bg-ink px-6 py-2.5 text-[13px] tracking-wider text-paper hover:bg-accent disabled:opacity-50"
        >
          {pending ? '儲存中…' : '儲存配方'}
        </button>
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
        {dirty && <span className="text-[12px] text-ink-soft">有未儲存的改動</span>}
      </div>

      <p className="mb-3 text-[13px] text-ink-soft">
        勾選這條手串用到的珠子，填上各用幾顆。上方成本與毛利會即時重算。
        庫存 0 的照樣可以勾——先把配方排好，缺的貨再去補。
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋珠子名稱、尺寸或分類…"
          className="w-full max-w-xs border-b border-hairline bg-transparent py-1.5 text-[13px] focus:border-accent focus:outline-none"
        />
        <span className="text-[12px] text-ink-soft">
          {q ? `符合 ${visibleBeads.length} 種` : `共 ${beads.length} 種`}
          {lines.length > 0 && `，已選 ${lines.length} 種`}
        </span>
        {q && (
          <button
            onClick={() => setQuery('')}
            className="text-[12px] text-ink-soft underline hover:text-ink"
          >
            清除搜尋
          </button>
        )}
      </div>

      {beads.length === 0 ? (
        <div className="border border-dashed border-hairline px-8 py-12 text-center text-[13px] text-ink-soft">
          還沒有珠子可選。先到「進貨」匯入淘寶訂單。
        </div>
      ) : visibleBeads.length === 0 ? (
        <div className="border border-dashed border-hairline px-8 py-12 text-center text-[13px] text-ink-soft">
          找不到符合「{query}」的珠子。
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((cat) => {
            const group = visibleBeads.filter((b) => (b.category ?? '未分類') === cat)
            if (group.length === 0) return null
            return (
              <section key={cat}>
                <h3 className="mb-2 border-b border-hairline pb-1.5 font-serif text-[15px] tracking-wider text-ink">
                  {cat}
                </h3>
                <ul className="divide-y divide-hairline">
                  {group.map((b) => {
                    const line = lines.find((l) => l.beadId === b.id)
                    const checked = used.has(b.id)
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-4 py-2.5 text-[13px]">
                        {/* 縮圖不能放在 label 內，否則點圖會變成勾選 */}
                        {b.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => setZoom({ url: b.imageUrl as string, name: b.name })}
                            title="點開看大圖"
                            className="h-9 w-9 shrink-0 overflow-hidden border border-hairline transition hover:border-accent"
                          >
                            {/* 圖片來源含外部網址（淘寶），next/image 需設定網域，故用原生 img */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.imageUrl} alt={b.name} className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <span className="h-9 w-9 shrink-0 border border-hairline bg-sunk" />
                        )}
                        <label className="flex flex-1 min-w-[200px] cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} />
                          <span>{b.name}</span>
                          {b.sizeMm && <span className="tnum text-ink-soft">{b.sizeMm}mm</span>}
                        </label>
                        <span className="tnum w-24 text-right text-ink-soft">
                          {formatTWD(b.unitCostCents, true)}
                        </span>
                        <span
                          className={`tnum w-20 text-right ${b.stockQty === 0 ? 'text-alert' : 'text-ink-soft'}`}
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
            <p className="mt-3 text-[12px] text-ink-soft">
              要換圖請到「珠子」頁面。
            </p>
          </div>
        </div>
      )}
    </>
  )
}
