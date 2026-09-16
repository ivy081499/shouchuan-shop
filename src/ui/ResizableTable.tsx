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
      if (col?.required) return // 標為 required 的欄位不可隱藏
      setHidden((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else {
          // 擋下「全部隱藏」——表格會整個空白，看起來像壞了
          if (next.size >= columns.length - 1) return prev
          next.add(key)
        }
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
  variant = 'header',
}: {
  onDrag: (deltaX: number) => void
  onReset: () => void
  /**
   * header：表頭用，細線常駐可見。
   * cell：資料列用，平常隱形，滑鼠移到那一列才浮現
   *       —— 每列都畫線的話整張表會變成格子紙，很吵。
   */
  variant?: 'header' | 'cell'
}) {
  const startX = useRef(0)
  const [dragging, setDragging] = useState(false)
  /*
   * dragging 只用來畫顏色；判斷「正在拖」必須用 ref。
   * setState 不是同步的，同一輪事件裡 onPointerMove 讀到的還是舊值 false，
   * 會直接 return 掉，變成拖了沒反應。
   */
  const draggingRef = useRef(false)

  // 拖曳中元件若被卸載（換頁、篩選），userSelect 會卡在 none，整頁選不了字
  useEffect(() => () => {
    document.body.style.userSelect = ''
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    draggingRef.current = true
    setDragging(true)
    // 拖曳中鎖住整頁的文字選取，否則橫拖會把儲存格內容反白
    document.body.style.userSelect = 'none'
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const delta = e.clientX - startX.current
    if (delta !== 0) {
      onDrag(delta)
      startX.current = e.clientX
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    document.body.style.userSelect = ''
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }

  /** 鍵盤調整：聚焦後左右鍵每次 ±16px，按住 Shift 為 ±64px */
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onDrag(-step)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onDrag(step)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="調整欄寬"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      title="拖曳調整欄寬；雙擊還原；也可用左右方向鍵"
      // 往左多伸出 4px 比較好抓，但視覺上只顯示右側細線
      className={`absolute -right-1 top-0 z-10 h-full w-3 cursor-col-resize select-none touch-none
        after:absolute after:right-1 after:top-1 after:h-[calc(100%-0.5rem)] after:w-px after:content-['']
        focus:outline-none ${
          dragging
            ? 'after:bg-accent'
            : variant === 'cell'
              ? // 資料列：平常完全隱形，滑鼠移到該列才浮現，避免整張表都是線
                'after:bg-transparent group-hover/row:after:bg-hairline hover:after:bg-accent focus-visible:after:bg-accent'
              : 'after:bg-hairline hover:after:bg-accent focus-visible:after:bg-accent'
        }`}
    />
  )
}
