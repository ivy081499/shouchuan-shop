'use client'

import { useState } from 'react'

interface Props {
  categories: string[]
  suppliers: { id: number; name: string }[]
  current: {
    keyword?: string
    categories?: string[]
    supplierIds?: number[]
    onlyShortage?: boolean
    onlySelected?: boolean
    onlyWithUrl?: boolean
    sizeMin?: number
    sizeMax?: number
  }
}

/**
 * 篩選面板。用 GET 表單送回同一頁，由伺服器端重新查。
 * 不做客戶端篩選——排序與篩選要能寫在網址裡分享與回訪。
 */
export default function Filters({ categories, suppliers, current }: Props) {
  const [open, setOpen] = useState(
    !!(
      current.keyword ||
      current.categories?.length ||
      current.supplierIds?.length ||
      current.onlyShortage ||
      current.onlySelected ||
      current.onlyWithUrl ||
      current.sizeMin != null ||
      current.sizeMax != null
    ),
  )

  const activeCount =
    (current.keyword ? 1 : 0) +
    (current.categories?.length ?? 0) +
    (current.supplierIds?.length ?? 0) +
    (current.onlyShortage ? 1 : 0) +
    (current.onlySelected ? 1 : 0) +
    (current.onlyWithUrl ? 1 : 0) +
    (current.sizeMin != null || current.sizeMax != null ? 1 : 0)

  return (
    <div className="mb-6 border border-hairline">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-[13px] text-ink hover:text-accent"
      >
        <span>
          篩選
          {activeCount > 0 && <span className="ml-2 text-accent">已套用 {activeCount} 項</span>}
        </span>
        <span className="text-ink-soft">{open ? '收起' : '展開'}</span>
      </button>

      {open && (
        <form method="get" className="space-y-5 border-t border-hairline px-4 py-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-ink-soft">關鍵字</span>
              <input
                type="text"
                name="q"
                defaultValue={current.keyword ?? ''}
                placeholder="珠名、淘寶標題或規格"
                className="w-full border border-hairline bg-transparent px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[13px] text-ink-soft">尺寸（mm）</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="sizeMin"
                  step="0.1"
                  min="0"
                  defaultValue={current.sizeMin ?? ''}
                  placeholder="最小"
                  className="tnum w-full border border-hairline bg-transparent px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
                <span className="text-ink-soft">—</span>
                <input
                  type="number"
                  name="sizeMax"
                  step="0.1"
                  min="0"
                  defaultValue={current.sizeMax ?? ''}
                  placeholder="最大"
                  className="tnum w-full border border-hairline bg-transparent px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {categories.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-[13px] text-ink-soft">分類</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {categories.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      name="cat"
                      value={c}
                      defaultChecked={current.categories?.includes(c)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {suppliers.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-[13px] text-ink-soft">店鋪</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {suppliers.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="checkbox"
                      name="sup"
                      value={s.id}
                      defaultChecked={current.supplierIds?.includes(s.id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-2 text-[13px] text-ink-soft">只看</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  name="shortage"
                  value="1"
                  defaultChecked={current.onlyShortage}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                低於安全庫存
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  name="selected"
                  value="1"
                  defaultChecked={current.onlySelected}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                已勾選的
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  name="hasurl"
                  value="1"
                  defaultChecked={current.onlyWithUrl}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                有淘寶連結
              </label>
            </div>
          </fieldset>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              className="bg-ink px-5 py-2.5 text-[13px] tracking-[0.1em] text-paper transition-colors hover:bg-accent"
            >
              套用
            </button>
            <a
              href="?"
              className="border border-hairline px-5 py-2.5 text-[13px] tracking-[0.1em] text-ink transition-colors hover:border-accent hover:text-accent"
            >
              清除
            </a>
          </div>
        </form>
      )}
    </div>
  )
}
