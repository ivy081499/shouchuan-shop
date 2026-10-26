'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreProductAction } from './actions.ts'

export interface DeletedProductRow {
  id: number
  name: string
  slug: string
  priceCents: number
  deletedAt: number | null
}

/**
 * 已刪除的手串清單與復原。
 *
 * 刪除是軟刪除——資料留在資料庫裡，只是標記成已刪除。
 * 這裡讓店主查得到、也能救回來（連同當時一起刪掉的配方與照片）。
 *
 * 預設收合：平常不該佔版面，要找才打開。
 */
export default function DeletedProducts({ rows }: { rows: DeletedProductRow[] }) {
  const [open, setOpen] = useState(false)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function restore(id: number) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await restoreProductAction(id)
      setPendingId(null)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <p className="mt-10 text-[12px] text-ink-soft">
        沒有已刪除的手串。刪掉的手串會留在這裡，隨時可以復原。
      </p>
    )
  }

  return (
    <section className="mt-10 border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline justify-between gap-3 bg-sunk/40 px-5 py-2.5 text-left"
      >
        <span className="font-serif text-[14px] tracking-wider text-ink">
          已刪除的手串
          <span className="ml-2 text-[12px] tracking-normal text-ink-soft">{rows.length} 條</span>
        </span>
        <span className="text-[12px] text-ink-soft">{open ? '收起 ▲' : '展開看看 ▼'}</span>
      </button>

      {open && (
        <>
          {error && (
            <p role="alert" className="border-b border-alert bg-alert/5 px-5 py-2 text-[12px] text-ink">
              {error}
            </p>
          )}
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 text-[13px]">
                <span className="font-medium">{r.name}</span>
                <span className="text-[12px] text-ink-soft">/p/{r.slug}</span>
                <span className="tnum text-ink-soft">
                  {r.priceCents > 0 ? `$${(r.priceCents / 100).toLocaleString()}` : '未定價'}
                </span>
                <span className="text-[12px] text-ink-soft">
                  {r.deletedAt
                    ? `刪於 ${new Date(r.deletedAt * 1000).toLocaleDateString('zh-TW')}`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={() => restore(r.id)}
                  disabled={pendingId === r.id}
                  className="ml-auto border border-hairline px-3 py-1 text-[12px] text-ink hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {pendingId === r.id ? '復原中…' : '復原'}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-hairline px-5 py-2 text-[11px] leading-relaxed text-ink-soft">
            復原會把這條手串、以及刪除當下一起收起來的配方與照片一併救回來。
          </p>
        </>
      )}
    </section>
  )
}
