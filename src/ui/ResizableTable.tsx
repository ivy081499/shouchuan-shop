'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * 可調欄寬的表格
 *
 * 拖曳欄位邊界即可改變寬度，寬度記在瀏覽器（localStorage），下次開還在。
 * 雙擊邊界可還原該欄預設寬度。
 */

export interface Column {
  key: string
  label: string
  /** 預設寬度（px） */
  width: number
  align?: 'left' | 'right' | 'center'
  /** 最小寬度，預設 60 */
  minWidth?: number
  /** 設 true 表示此欄不可隱藏（例如要填寫的欄位） */
  required?: boolean
}

export function useColumnWidths(storageKey: string, columns: Column[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.width])),
  )

  // 讀取上次調整的寬度
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`colw:${storageKey}`)
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, number>
        setWidths((w) => ({ ...w, ...parsed }))
      }
    } catch {
      // 讀不到就用預設值，不影響使用
    }
  }, [storageKey])

  const persist = useCallback(
    (next: Record<string, number>) => {
      setWidths(next)
      try {
        localStorage.setItem(`colw:${storageKey}`, JSON.stringify(next))
      } catch {
        // 無痕模式等情況寫不進去，忽略即可
      }
    },
    [storageKey],
  )

  const reset = useCallback(
    (key: string) => {
      const def = columns.find((c) => c.key === key)?.width
      if (def) persist({ ...widths, [key]: def })
    },
    [columns, widths, persist],
  )

  return { widths, persist, reset }
}

/** 欄位顯示／隱藏，同樣記在瀏覽器 */
export function useColumnVisibility(storageKey: string, columns: Column[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`colv:${storageKey}`)
      if (saved) setHidden(new Set(JSON.parse(saved) as string[]))
    } catch {
      // 讀不到就全部顯示
    }
  }, [storageKey])

  const toggle = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key)
      if (col?.required) return // 必填欄位不可隱藏
      setHidden((prev) => {
        const next = new Set(prev)
        next.has(key) ? next.delete(key) : next.add(key)
        try {
          localStorage.setItem(`colv:${storageKey}`, JSON.stringify([...next]))
        } catch {
          // 寫不進去就只在這次有效
        }
        return next
      })
    },
    [columns, storageKey],
  )

  const visible = columns.filter((c) => !hidden.has(c.key))
  return { hidden, toggle, visible }
}

/** 欄位顯示切換面板 */
export function ColumnToggles({
  columns,
  hidden,
  onToggle,
}: {
  columns: Column[]
  hidden: Set<string>
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const hiddenCount = hidden.size

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border border-hairline px-4 py-2 text-[13px] text-ink-soft hover:border-accent hover:text-accent"
      >
        欄位{hiddenCount > 0 ? `（隱藏 ${hiddenCount}）` : ''}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="關閉"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] border border-hairline bg-paper p-3 shadow-sm">
            <ul className="space-y-1.5">
              {columns.map((c) => (
                <li key={c.key}>
                  <label
                    className={`flex items-center gap-2.5 text-[13px] ${
                      c.required ? 'text-ink-soft' : 'cursor-pointer text-ink'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      disabled={c.required}
                      onChange={() => onToggle(c.key)}
                    />
                    <span>{c.label}</span>
                    {c.required && <span className="text-[11px] text-ink-soft">必要</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

/** 欄位邊界的拖曳握把 */
export function ColumnResizer({
  onDrag,
  onReset,
}: {
  onDrag: (deltaX: number) => void
  onReset: () => void
}) {
  const startX = useRef(0)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    startX.current = e.clientX
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    const delta = e.clientX - startX.current
    if (delta !== 0) {
      onDrag(delta)
      startX.current = e.clientX
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    setDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }

  return (
    <span
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onReset}
      title="拖曳調整欄寬，雙擊還原"
      className={`absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none ${
        dragging ? 'bg-accent/40' : 'hover:bg-accent/25'
      }`}
    />
  )
}
